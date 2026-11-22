/**
 * src/app/lobby.ts 的流程：刷新后恢复本机的一桌（boot）、没结完的结算重试（settlePending）、开局被钱包拒、领补给（relief）、接着打（resume）。
 * 钱包 API、云存档、画面全是假的；真的 Solo 跑在内存存档上，所以存档格式、操作 id、清存档的时机都是真的。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_KEY, Solo } from '../../src/solo.ts';
import { KEYS } from '../../src/store.ts';
import { FakeWallet, MemStore, errReply, fakeWindow, okReply, soloDeps, walletView } from './fakes.ts';

const m = vi.hoisted(() => ({
  getWallet: vi.fn(),
  relief: vi.fn(),
  detectPlatform: vi.fn(),
  createCloud: vi.fn(),
  play: vi.fn(),
}));

vi.mock('arcade-kit/client', () => ({ detectPlatform: m.detectPlatform }));
vi.mock('arcade-kit/report', () => ({ reportErrors: vi.fn() }));
vi.mock('arcade-kit/social', () => ({ mountSocial: vi.fn(async () => null) }));
vi.mock('../../src/net/cloud.ts', () => ({ createCloud: m.createCloud }));
vi.mock('../../src/net/wallet.ts', async (orig) => ({ ...(await orig<typeof import('../../src/net/wallet.ts')>()), getWallet: m.getWallet, relief: m.relief }));
vi.mock('../../src/view/sound.ts', () => ({ play: m.play, unlockAudio: vi.fn() }));
vi.mock('../../src/view/alert.ts', () => ({ notMyTurn: vi.fn() }));
vi.mock('../../src/view/coach.ts', () => ({ closeCoach: vi.fn() }));
vi.mock('../../src/view/dialog.ts', () => ({ closeDialog: vi.fn() }));
vi.mock('../../src/view/dom.ts', () => ({ setText: vi.fn() }));

import { bindPage, createLobby } from '../../src/app/lobby.ts';
import { LOGIN_NOTE, PENDING_NOTE, type App } from '../../src/app/state.ts';
import { RETRY_MS } from '../../src/view/timing.ts';
import { site } from '../../src/site.ts';
import { walletError } from '../../src/net/wallet.ts';

const stage = new Set<string>();
let store: MemStore;
let wallet: FakeWallet;
let c: App;
let lobbyUpdate: ReturnType<typeof vi.fn>;
let fn: Record<string, ReturnType<typeof vi.fn>>;

function build(userId: string | null = 'u1') {
  lobbyUpdate = vi.fn();
  const cloud = { userId: () => userId, stats: () => ({}), start: vi.fn(async () => {}), onChange: vi.fn(), flush: vi.fn(), recheck: vi.fn(), onStorage: vi.fn() };
  m.createCloud.mockReturnValue(cloud);
  fn = {};
  for (const k of ['drawTop', 'drawCloud', 'drawTakeProfit', 'drawPuzzleEntry', 'presence', 'goInvite', 'joinRoom', 'closeFun', 'enterTable', 'enterTour', 'settleTour', 'stopCountdown', 'otherTab']) fn[k] = vi.fn();
  fn.savedRoom = vi.fn(() => null);
  fn.lastRoom = vi.fn(() => null);
  const deps = soloDeps(wallet, store);
  c = {
    wallet: null,
    walletNote: null,
    solo: null,
    tour: null,
    online: null,
    social: null,
    busy: false,
    retryTimer: 0,
    pfMode: false,
    myName: '我',
    ach: { got: [] },
    cloud,
    deps,
    tourDeps: { ...deps, gap: () => 0 },
    fn,
    ui: {
      stage: { classList: { contains: (k: string) => stage.has(k), add: (k: string) => stage.add(k), remove: (k: string) => stage.delete(k) } },
      home: {},
      twoNote: {},
      lobby: { update: lobbyUpdate, home: vi.fn(), showFriends: vi.fn(), ready: vi.fn(), setAch: vi.fn(), standalone: vi.fn(), nickname: () => '' },
    },
  } as unknown as App;
  return createLobby(c);
}

/** 本机存一桌：开成实盘（买入已到账），返回这一桌 */
async function seed(userId: string | null = 'u1'): Promise<Solo> {
  const r = await Solo.open(soloDeps(wallet, store), { userId, stakes: 'small', size: 3, amount: 1_000, practice: false });
  if ('error' in r) throw new Error(r.error);
  wallet.buyins.length = 0;
  return r;
}

beforeEach(() => {
  vi.useFakeTimers();
  store = new MemStore();
  wallet = new FakeWallet();
  stage.clear();
  site.standalone = false;
  m.getWallet.mockReset().mockResolvedValue(okReply());
  m.relief.mockReset();
  m.play.mockReset();
  m.detectPlatform.mockReset().mockResolvedValue({ platform: true, user: { displayName: '阿狸' } });
  vi.stubGlobal('__TEXAS_VERSION__', '0.0.0-test');
  vi.stubGlobal('window', fakeWindow());
  vi.stubGlobal('localStorage', store);
  vi.stubGlobal('document', { addEventListener: vi.fn(), cookie: '' });
  vi.stubGlobal('location', { search: '', pathname: '/games/texas/' });
  vi.stubGlobal('history', { replaceState: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('刷新后恢复（boot）', () => {
  it('存档完好、钱包里还有这一份：接回同一桌，"接着打"可点，不带提示', async () => {
    const s = await seed();
    m.getWallet.mockResolvedValue(okReply({ stakes: [{ game: 'texas', ref: s.session.id, tier: 'small', amount: 1_000, mode: 'client', at: 0, until: 1 }] }));
    const lobby = build();
    await lobby.boot();
    expect(c.solo?.session.id).toBe(s.session.id);
    expect(c.walletNote).toBeNull();
    const last = lobbyUpdate.mock.calls.at(-1)![0];
    expect(last.resume).toMatchObject({ stakes: 'small', size: 3, practice: false, waiting: false });
    expect(last.orphan).toBeNull();
    expect(m.detectPlatform).toHaveBeenCalledTimes(1);
  });

  it('存档里是坏的 JSON：当没有存档，不抛错，大厅没有"接着打"', async () => {
    store.setItem(SESSION_KEY, '{坏了');
    const lobby = build();
    await lobby.boot();
    expect(c.solo).toBeNull();
    expect(lobbyUpdate.mock.calls.at(-1)![0].resume).toBeNull();
  });

  it('存档缺少牌桌（半截存档）：不接', async () => {
    store.setItem(SESSION_KEY, JSON.stringify({ v: 1, id: 'x', userId: 'u1', pending: null }));
    await build().boot();
    expect(c.solo).toBeNull();
  });

  it('存档是别的账号的：不接别人的桌', async () => {
    await seed('someone-else');
    await build('u1').boot();
    expect(c.solo).toBeNull();
  });

  it('钱包里已经没有这一份（放太久被退回）：清掉存档并提示"已经原样退回"', async () => {
    await seed();
    m.getWallet.mockResolvedValue(okReply({ stakes: [] }));
    await build().boot();
    expect(c.solo).toBeNull();
    expect(store.getItem(SESSION_KEY)).toBeNull();
    expect(c.walletNote).toBe(walletError('expired'));
    expect(c.walletNote).toContain('退回');
  });

  it('练习桌不看钱包：钱包里没有也照样接回', async () => {
    const r = await Solo.open(soloDeps(wallet, store), { userId: 'u1', stakes: 'small', size: 3, amount: 1_000, practice: true });
    expect('error' in r).toBe(false);
    await build().boot();
    expect(c.solo?.session.practice).toBe(true);
    expect(c.walletNote).toBeNull();
  });

  it('别的设备上有一桌（钱包有德州的一份，本机没有）：不接，大厅带出"别处的一桌"', async () => {
    const other = { game: 'texas', ref: 'phone-1', tier: 'mid', amount: 5_000, mode: 'client', at: 0, until: 1 };
    m.getWallet.mockResolvedValue(okReply({ stakes: [other as never] }));
    await build().boot();
    expect(c.solo).toBeNull();
    expect(lobbyUpdate.mock.calls.at(-1)![0].orphan).toMatchObject({ ref: 'phone-1', amount: 5_000 });
  });

  it('本机有一桌、别的设备上还有另一桌：本机这桌接回，另一桌仍算别处的', async () => {
    const s = await seed();
    const mine = { game: 'texas', ref: s.session.id, tier: 'small', amount: 1_000, mode: 'client', at: 0, until: 1 };
    const other = { game: 'texas', ref: 'phone-1', tier: 'mid', amount: 5_000, mode: 'client', at: 0, until: 1 };
    m.getWallet.mockResolvedValue(okReply({ stakes: [mine, other] as never }));
    await build().boot();
    expect(c.solo?.session.id).toBe(s.session.id);
    expect(lobbyUpdate.mock.calls.at(-1)![0].orphan).toMatchObject({ ref: 'phone-1' });
  });

  it('上次离桌的结回没办完：启动时用同一个操作 id 再结，结完存档清掉、钱包刷新', async () => {
    const s = await seed();
    wallet.cashScript.push(errReply('offline'));
    await s.leave();
    const op = wallet.cashouts[0]!.op;
    expect(s.session.pending).toMatchObject({ t: 'cashout', op });
    await build().boot();
    expect(wallet.cashouts.map((x) => x.op)).toEqual([op, op]);
    expect(c.solo).toBeNull();
    expect(store.getItem(SESSION_KEY)).toBeNull();
    expect(m.getWallet).toHaveBeenCalled();
  });

  it('启动时钱包还连不上：这一桌留着、提示稍后重试，到点自动再结一次', async () => {
    const s = await seed();
    wallet.cashScript.push(errReply('offline'), errReply('offline'));
    await s.leave();
    await build().boot();
    expect(c.solo).not.toBeNull();
    expect(c.walletNote).toBe(PENDING_NOTE);
    expect(wallet.cashouts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(wallet.cashouts).toHaveLength(3);
    expect(new Set(wallet.cashouts.map((x) => x.op)).size).toBe(1);
    expect(c.solo).toBeNull();
  });

  it('单独部署（没有平台）：不碰钱包，也不问云存档', async () => {
    m.detectPlatform.mockResolvedValue({ platform: false });
    await build().boot();
    expect(site.standalone).toBe(true);
    expect(m.getWallet).not.toHaveBeenCalled();
    expect((c.cloud.start as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('邀请链接 ?room= 直接进房间，并把地址栏的参数擦掉', async () => {
    vi.stubGlobal('location', { search: '?room=123456', pathname: '/games/texas/' });
    await build().boot();
    expect(fn.joinRoom).toHaveBeenCalledWith('123456', true);
    expect(history.replaceState).toHaveBeenCalled();
  });
});

describe('结算重试（settlePending）', () => {
  it('结回成功：存档清掉、c.solo 置空、刷新钱包，提示不变', async () => {
    const s = await seed();
    wallet.cashScript.push(errReply('offline'));
    await s.leave();
    c.solo = null;
    const lobby = build();
    c.solo = s;
    await lobby.settlePending();
    expect(wallet.cashouts).toHaveLength(2);
    expect(c.solo).toBeNull();
    expect(m.getWallet).toHaveBeenCalledTimes(1);
    expect(c.walletNote).toBeNull();
  });

  it('登录过期：提示去刷新登录，不排自动重试', async () => {
    const s = await seed();
    wallet.cashScript.push(errReply('offline'), errReply('login'));
    await s.leave();
    const lobby = build();
    c.solo = s;
    await lobby.settlePending();
    expect(c.walletNote).toBe(LOGIN_NOTE);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(wallet.cashouts).toHaveLength(2);
  });

  it('钱包明确拒了（这一份已经结过）：这一桌作废，说"已经结过了"', async () => {
    const s = await seed();
    wallet.cashScript.push(errReply('offline'), errReply('no_stake'));
    await s.leave();
    const lobby = build();
    c.solo = s;
    await lobby.settlePending();
    expect(c.solo).toBeNull();
    expect(store.getItem(SESSION_KEY)).toBeNull();
    expect(c.walletNote).toBe(walletError('no_stake'));
  });

  it('没有待办的一笔：什么都不发', async () => {
    const s = await seed();
    const lobby = build();
    c.solo = s;
    await lobby.settlePending();
    expect(wallet.cashouts).toHaveLength(0);
    expect(m.getWallet).not.toHaveBeenCalled();
  });
});

describe('开局被钱包拒（start）', () => {
  it('钱包不够：不开桌，提示"钱包不够"', async () => {
    wallet.buyScript.push(errReply('no_funds'));
    const lobby = build();
    await lobby.start('small', 3, 1_000, false);
    expect(c.solo).toBeNull();
    expect(c.walletNote).toBe(walletError('no_funds'));
    expect(c.walletNote).toContain('钱包不够');
    expect(c.busy).toBe(false);
    expect(fn.enterTable).not.toHaveBeenCalled();
  });

  it('买入回话丢了：这一桌留在本机，提示稍后重试，到点用同一个操作 id 重发', async () => {
    wallet.buyScript.push(errReply('offline'), errReply('offline'));
    const lobby = build();
    await lobby.start('small', 3, 1_000, false);
    expect(c.solo?.session.pending).toMatchObject({ t: 'buyin' });
    expect(c.walletNote).toBe(PENDING_NOTE);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(wallet.buyins).toHaveLength(3);
    expect(new Set(wallet.buyins.map((x) => x.op)).size).toBe(1);
    expect(c.solo?.session.pending).toBeNull();
  });

  it('连点开局：第二下被忙标记挡掉，只买入一次', async () => {
    const lobby = build();
    await Promise.all([lobby.start('small', 3, 1_000, false), lobby.start('small', 3, 1_000, false)]);
    expect(wallet.buyins).toHaveLength(1);
    expect(fn.enterTable).toHaveBeenCalledTimes(1);
  });
});

describe('领补给（relief）', () => {
  it('成功：换上新钱包、响一声筹码、忙标记放开、清掉旧提示', async () => {
    m.relief.mockResolvedValue(okReply({ balance: 10_000, canRelief: false }));
    const lobby = build();
    await lobby.relief();
    expect(m.relief).toHaveBeenCalledTimes(1);
    expect(c.wallet?.balance).toBe(10_000);
    expect(m.play).toHaveBeenCalledWith('chip');
    expect(c.busy).toBe(false);
    expect(lobbyUpdate.mock.calls.at(0)![0].busy).toBe(true);
    expect(lobbyUpdate.mock.calls.at(-1)![0]).toMatchObject({ busy: false, wallet: { balance: 10_000 } });
  });

  it.each([
    ['relief_used', undefined, '今天的补给已经领过了'],
    ['relief_not_needed', undefined, '筹码还够用'],
    ['login', undefined, '登录过期'],
    ['offline', undefined, '钱包连不上，筹码没动'],
    ['rate_limited', 600, '10 分钟后'],
    ['busy', undefined, '先只能看、不能改'],
  ])('失败 %s：显示对应的话，钱包不变、不响', async (error, retryAfter, text) => {
    m.relief.mockResolvedValue(errReply(error, retryAfter));
    const lobby = build();
    c.wallet = walletView({ balance: 3 });
    await lobby.relief();
    expect(c.walletNote).toContain(text);
    expect(c.walletNote).not.toMatch(/频繁|太快/);
    expect(c.wallet?.balance).toBe(3);
    expect(m.play).not.toHaveBeenCalled();
    expect(c.busy).toBe(false);
  });

  it('重复点击：第一笔没回来前再点无效，只调一次接口；回来后可以再点', async () => {
    let done!: (r: unknown) => void;
    m.relief.mockReturnValueOnce(new Promise((ok) => (done = ok)));
    const lobby = build();
    const first = lobby.relief();
    await lobby.relief();
    await lobby.relief();
    expect(m.relief).toHaveBeenCalledTimes(1);
    expect(c.busy).toBe(true);
    done(okReply({ balance: 10_000 }));
    await first;
    expect(c.busy).toBe(false);
    m.relief.mockResolvedValueOnce(errReply('relief_used'));
    await lobby.relief();
    expect(m.relief).toHaveBeenCalledTimes(2);
    expect(c.walletNote).toContain('已经领过');
  });

  it('成功领到后，再点一次被平台拒（今天领过）：新的提示盖上去，钱包仍是领到的那份', async () => {
    m.relief.mockResolvedValueOnce(okReply({ balance: 10_000 })).mockResolvedValueOnce(errReply('relief_used'));
    const lobby = build();
    await lobby.relief();
    await lobby.relief();
    expect(c.wallet?.balance).toBe(10_000);
    expect(c.walletNote).toBe(walletError('relief_used', undefined, 'api'));
  });
});

describe('接着打（resume）', () => {
  it('没有待办：直接进牌桌', async () => {
    const s = await seed();
    const lobby = build();
    c.solo = s;
    await lobby.resume();
    expect(fn.enterTable).toHaveBeenCalledTimes(1);
    expect(c.busy).toBe(false);
  });

  it('结回那一笔办成了：这一桌就没了，回大厅，不进牌桌', async () => {
    const s = await seed();
    wallet.cashScript.push(errReply('offline'));
    await s.leave();
    const lobby = build();
    c.solo = s;
    await lobby.resume();
    expect(c.solo).toBeNull();
    expect(fn.enterTable).not.toHaveBeenCalled();
  });

  it('钱包还连不上：留在大厅、不进牌桌，忙标记放开', async () => {
    const s = await seed();
    wallet.cashScript.push(errReply('offline'), errReply('offline'));
    await s.leave();
    const lobby = build();
    c.solo = s;
    await lobby.resume();
    expect(fn.enterTable).not.toHaveBeenCalled();
    expect(c.solo).not.toBeNull();
    expect(c.busy).toBe(false);
  });

  it('正忙时（比如已经点过一次）不重复处理', async () => {
    const s = await seed();
    const lobby = build();
    c.solo = s;
    c.busy = true;
    await lobby.resume();
    expect(fn.enterTable).not.toHaveBeenCalled();
  });

  it('只有锦标赛存档：先结没办完的一笔再进锦标赛', async () => {
    const lobby = build();
    c.tour = { session: { id: 't1', stakes: 'small', practice: false, level: 0, pending: { t: 'buyin' }, state: { table: { seats: [], level: 0 } } } } as never;
    fn.settleTour!.mockImplementation(async () => {
      (c.tour as { session: { pending: unknown } }).session.pending = null;
    });
    await lobby.resume();
    expect(fn.settleTour).toHaveBeenCalledTimes(1);
    expect(fn.enterTour).toHaveBeenCalledTimes(1);
  });
});

describe('别的标签页动了存档（otherTab）与切后台', () => {
  it('在牌桌上：停下回大厅并说明；按存档重读', async () => {
    const s = await seed();
    const lobby = build();
    c.solo = new Solo(s.session, c.deps);
    stage.add('at-table');
    lobby.otherTab();
    expect(fn.stopCountdown).toHaveBeenCalled();
    expect(c.walletNote).toContain('在另一个页面打开');
    expect(stage.has('at-table')).toBe(false);
    expect(c.solo?.session.id).toBe(s.session.id);
  });

  it('另一个页面已经把这桌结掉（存档没了）：重读后没有接着打', async () => {
    const s = await seed();
    const lobby = build();
    c.solo = new Solo(s.session, c.deps);
    store.removeItem(SESSION_KEY);
    lobby.otherTab();
    expect(c.solo).toBeNull();
  });

  it('切后台：补传云存档，结回还没回话的用 keepalive 再发一次', async () => {
    const s = await seed();
    wallet.cashScript.push(errReply('offline'));
    await s.leave();
    build();
    c.solo = s;
    const handlers: Record<string, () => void> = {};
    vi.stubGlobal('window', { ...fakeWindow(), addEventListener: (t: string, h: () => void) => (handlers[t] = h) });
    bindPage(c);
    handlers.pagehide!();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.cloud.flush).toHaveBeenCalled();
    expect(wallet.cashouts.at(-1)).toMatchObject({ keepalive: true });
    expect(KEYS.session).toBe(SESSION_KEY);
  });
});
