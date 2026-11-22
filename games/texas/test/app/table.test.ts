/**
 * src/app/table.ts 与 src/app/state.ts 的流程：离桌结算（leave）、输光弹窗的时机（refresh）、补码、快进。
 * 钱包、存档、画面（弹窗、结算页、牌桌视图）全是假的；真的 Solo 和牌桌规则跑在内存存档上。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, SESSION_KEY, Solo } from '../../src/solo.ts';
import type { Table } from '../../src/core/table.ts';
import { FakeWallet, MemStore, errReply, fakeEl, fakeWindow, okReply, soloDeps } from './fakes.ts';

const m = vi.hoisted(() => ({
  dialog: vi.fn(),
  askTopUp: vi.fn(),
  soloSummary: vi.fn(async () => undefined),
  toggle: vi.fn(),
}));

vi.mock('../../src/view/dialog.ts', () => ({ dialog: m.dialog, askTopUp: m.askTopUp, closeDialog: vi.fn() }));
vi.mock('../../src/view/summary.ts', () => ({ soloSummary: m.soloSummary }));
vi.mock('../../src/view/dom.ts', () => ({ el: vi.fn(() => ({})), setText: vi.fn(), toggle: m.toggle }));
vi.mock('../../src/view/coach.ts', () => ({ closeCoach: vi.fn() }));
vi.mock('../../src/view/alert.ts', () => ({ myTurn: vi.fn(), notMyTurn: vi.fn() }));
vi.mock('../../src/view/share.ts', () => ({ soloCard: vi.fn(() => ({})) }));
vi.mock('../../src/view/reads.ts', () => ({ readLines: vi.fn(), styleTag: vi.fn() }));
vi.mock('../../src/app/shell.ts', () => ({ shareIt: vi.fn(() => null) }));

import { createTable } from '../../src/app/table.ts';
import { fastForwarding, LOGIN_NOTE, pace, waitPace, type App } from '../../src/app/state.ts';
import { RETRY_MS } from '../../src/view/timing.ts';
import { site } from '../../src/site.ts';
import { walletError } from '../../src/net/wallet.ts';

const END_CARD_MS = 3_600;

let store: MemStore;
let wallet: FakeWallet;
let c: App;
let fn: Record<string, ReturnType<typeof vi.fn>>;
let ui: ReturnType<typeof makeUi>;
let table: ReturnType<typeof createTable>;

function makeUi() {
  return {
    stage: fakeEl(),
    tableView: { setup: vi.fn(), show: vi.fn(), play: vi.fn(async () => {}), showCard: vi.fn() },
    reads: { clear: vi.fn(), observe: vi.fn(), get: vi.fn() },
    tally: { clear: vi.fn(), titles: vi.fn(() => []) },
    handNo: fakeEl(),
    topUpBtn: fakeEl(),
    sitBtn: fakeEl(),
    ffBtn: fakeEl(),
    betweenBar: fakeEl(),
    roomPause: fakeEl(),
    nextBtn: fakeEl(),
    autoBtn: fakeEl(),
    showBar: { hide: vi.fn(), draw: vi.fn() },
    bar: { update: vi.fn(() => null) },
  };
}

function build(solo: Solo | null, extra: Record<string, unknown> = {}) {
  ui = makeUi();
  fn = {};
  for (const k of ['refreshWallet', 'drawTop', 'drawLobby', 'showLobby', 'settlePending', 'guideTurn', 'guideEnd', 'pfFinish', 'openFun', 'syncFun', 'handDone', 'achHand', 'tourNotes', 'refreshTour']) fn[k] = vi.fn(async () => {});
  const deps = soloDeps(wallet, store);
  c = {
    settings: { fast: false, autoNext: false },
    reduced: false,
    skipAnim: false,
    ffSkip: -1,
    pfMode: false,
    wallet: { balance: 10_000 },
    walletNote: null,
    myName: '我',
    solo,
    tour: null,
    online: null,
    busy: false,
    asking: false,
    animating: 0,
    retryTimer: 0,
    countdown: null,
    feedSent: new Set(),
    cloud: { update: vi.fn() },
    fn,
    deps,
    tourDeps: deps,
    ui,
    ...extra,
  } as unknown as App;
  table = createTable(c);
  return table;
}

async function open(practice = false, amount = 1_000): Promise<Solo> {
  const r = await Solo.open(soloDeps(wallet, store), { userId: 'u1', stakes: 'small', size: 3, amount, practice });
  if ('error' in r) throw new Error(r.error);
  wallet.buyins.length = 0;
  return r;
}

/** 改本机这一桌的牌桌状态（测试里造"我弃牌了""我输光了"） */
const patch = (s: Solo, f: (t: Table) => Partial<Table>): void => {
  s.session.table = { ...s.session.table, ...f(s.session.table) };
};
const mePatch = (s: Solo, o: Record<string, unknown>): void => patch(s, (t) => ({ seats: t.seats.map((x, i) => (i === ME ? { ...x, ...o } : x)) as Table['seats'] }));

const lastSummary = () => (m.soloSummary.mock.calls.at(-1) as unknown as [unknown, Record<string, unknown>])[1];

beforeEach(() => {
  vi.useFakeTimers();
  store = new MemStore();
  wallet = new FakeWallet();
  site.standalone = false;
  m.dialog.mockReset().mockResolvedValue('yes');
  m.askTopUp.mockReset();
  m.soloSummary.mockClear();
  m.toggle.mockClear();
  vi.stubGlobal('window', fakeWindow());
  vi.stubGlobal('localStorage', store);
  vi.stubGlobal('document', { createElement: () => ({}), addEventListener: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('离桌结算（leave）', () => {
  it('确认离桌：只结回一次，存档清掉，结算页的数字对得上，回大厅', async () => {
    const s = await open();
    build(s);
    const ok = await table.leave();
    expect(ok).toBe(true);
    expect(wallet.cashouts).toEqual([{ op: expect.any(String), session: s.session.id, amount: 1_000, keepalive: false }]);
    expect(store.getItem(SESSION_KEY)).toBeNull();
    expect(c.solo).toBeNull();
    expect(fn.showLobby).toHaveBeenCalledTimes(1);
    expect(fn.refreshWallet).toHaveBeenCalledTimes(1);
    expect(lastSummary()).toMatchObject({ practice: false, buyin: 1_000, left: 1_000, out: 1_000, capped: 0, busted: false, hands: 0 });
    expect(lastSummary().refused).toBeUndefined();
    expect(lastSummary().pending).toBeUndefined();
    expect(c.walletNote).toBeNull();
  });

  it('离桌前先确认；选"接着打"就什么都不做', async () => {
    const s = await open();
    build(s);
    m.dialog.mockResolvedValue('no');
    expect(await table.leave()).toBe(false);
    expect(wallet.cashouts).toHaveLength(0);
    expect(c.solo).toBe(s);
    expect(m.soloSummary).not.toHaveBeenCalled();
    expect(m.dialog.mock.calls[0]![1]).toBe('离桌');
    expect(m.dialog.mock.calls[0]![2]).toContain('带回钱包');
  });

  it('离桌后再点一次（c.solo 已空）：不再结算，也不再弹窗', async () => {
    const s = await open();
    build(s);
    await table.leave();
    m.dialog.mockClear();
    expect(await table.leave()).toBe(true);
    expect(wallet.cashouts).toHaveLength(1);
    expect(m.dialog).not.toHaveBeenCalled();
    expect(fn.showLobby).toHaveBeenCalledTimes(1);
  });

  it('止盈自动走（auto）：不问，直接结', async () => {
    const s = await open();
    build(s);
    await table.leave(true);
    expect(m.dialog).not.toHaveBeenCalled();
    expect(wallet.cashouts).toHaveLength(1);
  });

  it('今天进账到顶：结算页上 out 只算进了钱包的，capped 单独列', async () => {
    const s = await open();
    build(s);
    wallet.cashScript.push(okReply({}, { credited: 700, capped: 300 }));
    await table.leave();
    expect(lastSummary()).toMatchObject({ left: 1_000, out: 700, capped: 300 });
  });

  it('钱包连不上：结算页写"待结"（out 为空），提示稍后自动结，到点用同一个操作 id 重发', async () => {
    const s = await open();
    build(s);
    wallet.cashScript.push(errReply('offline'));
    await table.leave();
    expect(lastSummary().out).toBeNull();
    expect(c.solo).toBe(s);
    expect(c.walletNote).toContain('稍后会自动结回钱包');
    expect(store.getItem(SESSION_KEY)).not.toBeNull();
    expect(fn.settlePending).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(fn.settlePending).toHaveBeenCalledTimes(1);
    expect(fn.drawLobby).toHaveBeenCalled();
  });

  it('登录过期：结算页写"登录后自动结回"，提示刷新登录，不排自动重试', async () => {
    const s = await open();
    build(s);
    wallet.cashScript.push(errReply('login'));
    await table.leave();
    expect(lastSummary()).toMatchObject({ pending: '登录后自动结回', out: null });
    expect(c.walletNote).toBe(LOGIN_NOTE);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(fn.settlePending).not.toHaveBeenCalled();
  });

  it('钱包明确拒了（"这一份已经结过了"）：结算页带 refused 文案，这一桌作废', async () => {
    const s = await open();
    build(s);
    wallet.cashScript.push(errReply('no_stake'));
    await table.leave();
    expect(lastSummary().refused).toBe(walletError('no_stake'));
    expect(lastSummary().out).toBeNull();
    expect(c.solo).toBeNull();
    expect(store.getItem(SESSION_KEY)).toBeNull();
    expect(c.walletNote).toBeNull();
  });

  it('练习桌：不碰钱包，结算页标练习', async () => {
    const s = await open(true);
    build(s);
    await table.leave();
    expect(wallet.cashouts).toHaveLength(0);
    expect(lastSummary()).toMatchObject({ practice: true, buyin: 1_000 });
    expect(c.solo).toBeNull();
  });

  it('补码还在路上（钱包可能已经扣了）：先不走，弹"先等补码"，不发结回', async () => {
    const s = await open();
    build(s);
    mePatch(s, { status: 'out', stack: 0 });
    wallet.buyScript.push(errReply('offline'), errReply('offline'));
    const err = await s.topUp(500);
    expect(err).toBe('offline');
    expect(s.toppingUp).toBe(true);
    m.dialog.mockClear();
    expect(await table.leave()).toBe(false);
    expect(m.dialog.mock.calls.at(-1)![1]).toBe('先等补码');
    expect(m.dialog.mock.calls.at(-1)![2]).toContain('补码还在路上');
    expect(wallet.cashouts).toHaveLength(0);
    expect(m.soloSummary).not.toHaveBeenCalled();
  });

  it('输光了离桌：不问确认，结算页标 busted', async () => {
    const s = await open();
    build(s);
    mePatch(s, { status: 'out', stack: 0 });
    await table.leave();
    expect(m.dialog).not.toHaveBeenCalled();
    expect(lastSummary()).toMatchObject({ busted: true });
  });
});

describe('输光弹窗的时机（refresh）', () => {
  /** 一桌打过一手、我输光了停在两手之间 */
  async function busted(handNo = 5): Promise<Solo> {
    const s = await open();
    patch(s, () => ({ handNo }));
    mePatch(s, { status: 'out', stack: 0 });
    expect(s.busted).toBe(true);
    return s;
  }
  const atTable = () => ui.stage.cls.add('at-table');

  it('END_CARD_MS（按节奏档）之后才弹补码，之前不弹；弹出时不重复排', async () => {
    const s = await busted();
    build(s, { ffSkip: 5 });
    atTable();
    m.askTopUp.mockResolvedValue(null);
    table.refresh();
    table.refresh();
    await vi.advanceTimersByTimeAsync(END_CARD_MS - 1);
    expect(m.askTopUp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(m.askTopUp).toHaveBeenCalledTimes(1);
    expect(m.askTopUp.mock.calls[0]![1]).toMatchObject({ busted: true, min: 400, max: 2_000 });
  });

  it('还在快进（节奏 0.55）时缩短到 0.55 倍', async () => {
    const s = await busted();
    build(s);
    atTable();
    m.askTopUp.mockResolvedValue(null);
    expect(pace(c)).toBe(0.55);
    table.refresh();
    await vi.advanceTimersByTimeAsync(END_CARD_MS * 0.55 - 1);
    expect(m.askTopUp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(m.askTopUp).toHaveBeenCalledTimes(1);
  });

  it('画面还在播（animating>0）或正在问人时不排弹窗', async () => {
    const s = await busted();
    build(s, { animating: 1 });
    atTable();
    table.refresh();
    c.asking = true;
    c.animating = 0;
    table.refresh();
    await vi.advanceTimersByTimeAsync(END_CARD_MS * 2);
    expect(m.askTopUp).not.toHaveBeenCalled();
  });

  it('等的时候已经离桌（c.solo 换了）：到点不弹', async () => {
    const s = await busted();
    build(s);
    atTable();
    table.refresh();
    c.solo = null;
    await vi.advanceTimersByTimeAsync(END_CARD_MS * 2);
    expect(m.askTopUp).not.toHaveBeenCalled();
  });

  it('不在牌桌页（stage 没有 at-table）：refresh 什么都不做', async () => {
    const s = await busted();
    build(s);
    table.refresh();
    await vi.advanceTimersByTimeAsync(END_CARD_MS * 2);
    expect(m.askTopUp).not.toHaveBeenCalled();
  });

  it('全下局不走这个弹窗', async () => {
    const s = await busted();
    build(s, { pfMode: true });
    atTable();
    table.refresh();
    await vi.advanceTimersByTimeAsync(END_CARD_MS * 2);
    expect(m.askTopUp).not.toHaveBeenCalled();
  });
});

describe('补码（offerTopUp）', () => {
  it('钱包里连最小一份都不够、又输光了：直接结这一场，不弹补码', async () => {
    const s = await open();
    patch(s, () => ({ handNo: 5 }));
    mePatch(s, { status: 'out', stack: 0 });
    build(s, { wallet: { balance: 1 } });
    await table.offerTopUp(true);
    expect(m.askTopUp).not.toHaveBeenCalled();
    expect(wallet.cashouts).toHaveLength(1);
    expect(c.solo).toBeNull();
  });

  it('补码被钱包明确拒了：弹"没补上"并说明原因', async () => {
    const s = await open();
    patch(s, () => ({ handNo: 5 }));
    mePatch(s, { status: 'out', stack: 0 });
    build(s);
    m.askTopUp.mockResolvedValue(500);
    wallet.buyScript.push(errReply('no_funds'));
    await table.offerTopUp(true);
    expect(m.dialog).toHaveBeenCalledWith(ui.stage, '没补上', walletError('no_funds'), expect.any(Array));
    expect(wallet.buyins).toHaveLength(1);
  });

  it('输光后选"不补"：离桌结算；不是输光时选"不补"只是回牌桌', async () => {
    const s = await open();
    patch(s, () => ({ handNo: 5 }));
    mePatch(s, { status: 'out', stack: 0 });
    build(s);
    m.askTopUp.mockResolvedValue(null);
    await table.offerTopUp(true);
    expect(wallet.cashouts).toHaveLength(1);
    const s2 = await open();
    build(s2);
    await table.offerTopUp(false);
    expect(wallet.cashouts).toHaveLength(1);
    expect(c.solo).toBe(s2);
  });

  it('弹窗开着时（asking）重复调用无效', async () => {
    const s = await open();
    patch(s, () => ({ handNo: 5 }));
    mePatch(s, { status: 'out', stack: 0 });
    build(s);
    let pick!: (n: number | null) => void;
    m.askTopUp.mockReturnValue(new Promise((ok) => (pick = ok)));
    const first = table.offerTopUp(true);
    await table.offerTopUp(true);
    expect(m.askTopUp).toHaveBeenCalledTimes(1);
    pick(null);
    await first;
  });
});

describe('快进', () => {
  const folded = async (): Promise<Solo> => {
    const s = await open();
    patch(s, () => ({ handNo: 3 }));
    mePatch(s, { status: 'folded' });
    return s;
  };

  it('单机、我已经弃牌：进入快进，节奏 0.55', async () => {
    const s = await folded();
    build(s);
    expect(fastForwarding(c)).toBe(true);
    expect(pace(c)).toBe(0.55);
  });

  it('我没弃牌（还在这一手里）：不快进，动画正常档 0.8、等待 1', async () => {
    const s = await open();
    patch(s, () => ({ handNo: 3 }));
    mePatch(s, { status: 'active' });
    build(s);
    expect(fastForwarding(c)).toBe(false);
    expect(pace(c)).toBe(0.8);
    expect(waitPace(c)).toBe(1);
  });

  it('好友房、锦标赛、没有单机桌：都不快进', async () => {
    const s = await folded();
    build(s, { online: {} });
    expect(fastForwarding(c)).toBe(false);
    build(s, { tour: {} });
    expect(fastForwarding(c)).toBe(false);
    build(null);
    expect(fastForwarding(c)).toBe(false);
  });

  it('全下局（pushFold）和还没发过牌（handNo 0）：不快进', async () => {
    const s = await folded();
    patch(s, () => ({ pushFold: true }));
    build(s);
    expect(fastForwarding(c)).toBe(false);
    patch(s, () => ({ pushFold: false, handNo: 0 }));
    expect(fastForwarding(c)).toBe(false);
  });

  it('点了"看完这手"：这一手恢复正常节奏，下一手再弃牌重新快进', async () => {
    const s = await folded();
    build(s);
    ui.ffBtn.click();
    expect(c.ffSkip).toBe(3);
    expect(fastForwarding(c)).toBe(false);
    expect(pace(c)).toBe(0.8);
    expect(waitPace(c)).toBe(1);
    patch(s, () => ({ handNo: 4 }));
    expect(fastForwarding(c)).toBe(true);
  });

  it('"看完这手"按钮：快进且这一手没打完才显示', async () => {
    const s = await folded();
    build(s);
    ui.stage.cls.add('at-table');
    patch(s, () => ({ phase: 'flop' as Table['phase'] }));
    table.refresh();
    const hiddenArgs = () => m.toggle.mock.calls.filter((x) => x[0] === ui.ffBtn && x[1] === 'hidden').map((x) => x[2]);
    expect(hiddenArgs().at(-1)).toBe(false);
    patch(s, () => ({ phase: 'idle' as Table['phase'] }));
    table.refresh();
    expect(hiddenArgs().at(-1)).toBe(true);
    c.online = {} as never;
    patch(s, () => ({ phase: 'flop' as Table['phase'] }));
    table.refresh();
    expect(hiddenArgs().at(-1)).toBe(true);
  });

  it('减少动画比快进更慢：0.3；好友房追状态 skipAnim：0', async () => {
    const s = await folded();
    build(s, { reduced: true });
    expect(pace(c)).toBe(0.3);
    c.skipAnim = true;
    expect(pace(c)).toBe(0);
  });
});
