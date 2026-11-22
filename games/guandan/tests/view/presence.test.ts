/**
 * 报位置的时机（0.40.2）：位置变了才报、11 秒后补报一次（平台同一人 10 秒内只记第一次，刚进房那次常被挤掉）。
 * kit 的 social 和平台探测换成假的，只数 presenceNow(true) 调了几次
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reported: number[] = [];
vi.mock('arcade-kit/social', () => ({
  mountSocial: async () => ({ presenceNow: () => reported.push(Date.now()), pollNow() {}, stop() {}, openInvite() {} }),
  fetchFriends: async () => [],
}));
vi.mock('../../src/view/common/platform.ts', () => ({ platformInfo: () => ({ platform: true, user: { id: 'u1' } }) }));

const room = (humans: number) => ({ code: '123456', status: 'open', room: { status: 'waiting', seats: Array.from({ length: 4 }, (_, i) => ({ kind: i < humans ? 'human' : 'empty' })) } });

describe('报位置的时机', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2030-01-01T00:00:00Z') });
    reported.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('进房报一次、11 秒后补一次；没变不报；人数变了再报，补报从最后一次变化算', async () => {
    const { mountSocialOnce, presenceNow, PRESENCE_RETRY_MS } = await import('../../src/view/common/social.ts');
    let now: ReturnType<typeof room> | null = room(1);
    await mountSocialOnce(() => now as never);
    presenceNow();
    presenceNow();
    expect(reported).toHaveLength(1);
    vi.advanceTimersByTime(PRESENCE_RETRY_MS);
    expect(reported).toHaveLength(2);
    // 有人坐下：马上报；5 秒后又一人（平台会丢这次），补报在它 11 秒后
    now = room(2);
    presenceNow();
    vi.advanceTimersByTime(5_000);
    now = room(3);
    presenceNow();
    expect(reported).toHaveLength(4);
    vi.advanceTimersByTime(PRESENCE_RETRY_MS - 1);
    expect(reported).toHaveLength(4);
    vi.advanceTimersByTime(1);
    expect(reported).toHaveLength(5);
    // 离开房间（不在房间里）也是变化
    now = null;
    presenceNow();
    expect(reported).toHaveLength(6);
    expect(PRESENCE_RETRY_MS).toBeGreaterThan(10_000);
  });
});

describe('好友在打（好友房面板那一行）', () => {
  it('只列在线、在牌馆好友房里的；同一桌并成一行、人多的在前；最多两桌；没人在打是空的', async () => {
    const { friendTables, FRIEND_TABLES_MAX } = await import('../../src/view/common/social.ts');
    const f = (name: string, online: boolean, where?: object) => ({ id: name, name, online, ...(where ? { where } : {}) }) as never;
    const room = (r: string, seats: string) => ({ place: 'room', game: 'guandan', room: r, seats });
    expect(friendTables([f('甲', true, { place: 'game', game: 'guandan' }), f('乙', false, room('111111', '2/4')), f('丙', true, { place: 'room', game: 'texas', room: '222222', seats: '2/6' })])).toEqual([]);
    const list = friendTables([f('甲', true, room('111111', '1/4')), f('乙', true, room('333333', '2/4')), f('丙', true, room('333333', '2/4')), f('丁', true, room('444444', '1/3'))]);
    expect(FRIEND_TABLES_MAX).toBe(2);
    expect(list).toEqual([
      { names: ['乙', '丙'], room: '333333', seats: '2/4' },
      { names: ['甲'], room: '111111', seats: '1/4' },
    ]);
  });
});

describe('启动时没问出平台', () => {
  it('platform 是 unknown：挂社交前再问一次（给足时间），问出来就挂上；还是问不出就不挂', async () => {
    for (const again of [{ platform: true, user: { id: 'u1' } }, { platform: 'unknown' }] as const) {
      vi.resetModules();
      const asked: number[] = [];
      vi.doMock('../../src/view/common/platform.ts', () => ({ platformInfo: () => ({ platform: 'unknown' }) }));
      vi.doMock('arcade-kit/client', () => ({
        detectPlatform: async (o: { timeoutMs: number }) => {
          asked.push(o.timeoutMs);
          return again;
        },
      }));
      const { mountSocialOnce, presenceNow } = await import('../../src/view/common/social.ts');
      await mountSocialOnce(() => null);
      expect(asked).toHaveLength(1);
      expect(asked[0]).toBeGreaterThan(2_500);
      // 挂上了才报得出位置
      reported.length = 0;
      presenceNow();
      expect(reported).toHaveLength(again.platform === true ? 1 : 0);
    }
    vi.doUnmock('../../src/view/common/platform.ts');
    vi.doUnmock('arcade-kit/client');
  });
});
