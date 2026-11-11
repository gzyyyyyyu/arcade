/** 大厅"最近玩过"的合并、排序、时间文字和坏数据容忍（src/features/recent/recent-logic.ts） */
import { describe, expect, it } from 'vitest';
import { GAMES } from '../shared/games';
import { gameOfHref, mergeRecent, parseLocal, pushLocal, relativeTime } from '../src/features/recent/recent-logic';

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 27, 12);
const playable = GAMES.filter((g) => g.status === 'playable').map((g) => g.id);

describe('mergeRecent', () => {
  it('流水、桌上筹码、本地三个来源合并，每个游戏取最晚，新的在前', () => {
    const [a, b, c] = playable;
    const r = mergeRecent(
      GAMES,
      [{ at: 10, g: a }, { at: 50, g: a }, { at: 5, t: 'x' } as { at: number; g?: string }],
      [{ game: b!, at: 30 }],
      [{ id: c!, at: 40 }, { id: b!, at: 20 }],
    );
    expect(r).toEqual([{ id: a, at: 50 }, { id: c, at: 40 }, { id: b, at: 30 }]);
  });
  it('最多 4 个', () => {
    const r = mergeRecent(GAMES, [], [], playable.map((id, i) => ({ id, at: i + 1 })));
    expect(r).toHaveLength(Math.min(4, playable.length));
    expect(r[0]!.at).toBeGreaterThan(r[1]!.at);
  });
  it('不认识的和不能玩的 id 丢掉', () => {
    const coming = GAMES.filter((g) => g.status !== 'playable').map((g) => g.id);
    const r = mergeRecent(GAMES, [{ at: 9, g: 'nope' }], [{ game: 'zzz', at: 9 }], [...coming.map((id) => ({ id, at: 9 })), { id: playable[0]!, at: 1 }]);
    expect(r).toEqual([{ id: playable[0], at: 1 }]);
  });
  it('没有数据返回空', () => {
    expect(mergeRecent(GAMES, [], [], [])).toEqual([]);
  });
});

describe('本地记录', () => {
  it('坏 JSON、不是数组、字段不对都当没有或跳过', () => {
    expect(parseLocal(null)).toEqual([]);
    expect(parseLocal('{oops')).toEqual([]);
    expect(parseLocal('{"id":"a"}')).toEqual([]);
    expect(parseLocal('[1,null,{"id":3,"at":1},{"id":"a","at":"x"},{"id":"kaipan","at":5}]')).toEqual([{ id: 'kaipan', at: 5 }]);
  });
  it('pushLocal 去重置顶，最多 6 条', () => {
    let l = parseLocal(null);
    for (let i = 0; i < 8; i++) l = pushLocal(l, `g${i}`, i);
    expect(l).toHaveLength(6);
    expect(l[0]).toEqual({ id: 'g7', at: 7 });
    l = pushLocal(l, 'g5', 99);
    expect(l[0]).toEqual({ id: 'g5', at: 99 });
    expect(l.filter((e) => e.id === 'g5')).toHaveLength(1);
  });
});

describe('relativeTime', () => {
  it('各档文字', () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe('刚刚');
    expect(relativeTime(NOW + 5 * H, NOW)).toBe('刚刚');
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('5 分钟前');
    expect(relativeTime(NOW - 3 * H, NOW)).toBe('3 小时前');
    expect(relativeTime(NOW - 30 * H, NOW)).toBe('昨天');
    expect(relativeTime(NOW - 5 * 24 * H, NOW)).toBe('5 天前');
  });
});

describe('gameOfHref', () => {
  it('认 /games/<id>/ 的链接，别的不认', () => {
    const base = 'https://game.test/';
    expect(gameOfHref(GAMES, '/games/kaipan/', base)?.id).toBe('kaipan');
    expect(gameOfHref(GAMES, '/games/kaipan/?room=ab', base)?.id).toBe('kaipan');
    expect(gameOfHref(GAMES, '/wallet', base)).toBeNull();
    expect(gameOfHref(GAMES, 'https://evil.test/games/kaipan/', base)).toBeNull();
  });
});
