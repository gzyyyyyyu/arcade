/**
 * 悬赏出海（实盘）和筹码兑换的界面（DESIGN.md 第 4 节）：海图上的入口和选档页（各游戏统一的选档卡：电脑多强★、一场多久、最多赢 / 输）、
 * 打完的结回弹窗、顶栏金币旁的"换"按钮和兑换面板。类名 hd-live-*，样式限定在 .hd-ui 下。筹码无任何现金价值，界面上写明。
 */
import { EXCHANGE_CHIPS, EXCHANGE_GOLD, EXCHANGE_PER_DAY, EXCHANGE_WOOD, LIVE_TIERS, LIVE_TIER_IDS, liveBp, liveReturn, liveSetup, type LiveTier } from '../core/live.ts';
import { TD_TREASURE } from '../content/index.ts';
import { TD_LIVE_TIERS, tdLiveBp, tdLiveOpen, tdLiveSetup } from '../core/tdlive.ts';
import type { TdResult } from '../core/tdtypes.ts';
import { escortLive, live, liveState, liveToday, mapLive, mapLiveHooks, tdLive, tdToday, walletBalance } from '../net/live.ts';
import { loggedIn } from '../net/pvp.ts';
import { app, fmt } from './app.ts';
import { iconA } from './art.ts';
import { applyAndAck, needReload } from './pvp.ts';
import { liveRunBpOnExpire, liveRunKeep, readLiveRun, writeLiveRun } from './livemore-logic.ts';
import { beijingDay } from './maprules.ts';
import { dropStars, tdVerdict } from './td-ui.ts';
import { button, confirmBox, el, img, openModal, toast, uiRoot } from './ui.ts';

export const NO_CASH = '筹码只在游戏里用，无任何现金价值，不能买、不能转让。';
const ERR: Record<string, string> = {
  no_funds: '筹码不够一份，换低一档试试',
  limit: '今天的次数用完了，明天再来',
  live_daily: '今天的实盘悬赏打完了，可以打娱乐悬赏',
  pending: '上一场还没结完，稍等再试',
  no_wallet: '这个版本没有实盘，单机照常玩',
  login: '登录后才能玩实盘',
  offline: '网络断了，稍后再试',
};
export const errText = (e: string): string => ERR[e] ?? '钱包暂时连不上，稍后再试';
const TITLES = ['这次没成功', '拿下了！', '漂亮！', '大获全胜！'];

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  const st = el('style');
  st.textContent = `
.hd-ui .hd-live-mapbtn { position:absolute; top:170px; right:6px; z-index:31; }
.hd-ui .hd-live { width:min(100%,440px); max-height:88%; overflow:auto; }
/* 选档页：头和脚固定；四张卡按一屏放得下排（卡片区的 overflow 只是保底，五个尺寸都不该出滚动） */
.hd-ui .hd-live.hd-live-tiers { display:flex; flex-direction:column; overflow:hidden; padding:12px 14px; }
.hd-ui .hd-live-tiers .hd-live-scroll { flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; margin:0 -4px; padding:0 4px; }
.hd-ui .hd-live-tiers .hd-live-foot { flex:none; }
.hd-ui .hd-live-tiers h2 { margin:0 0 2px; }
.hd-ui .hd-live-tiers .hd-live-note { margin:2px 0 4px; }
.hd-ui .hd-live-tiers .hd-live-bal { margin:0 0 2px; }
.hd-ui .hd-live-tiers .hd-btn-wide { margin-top:8px; }
.hd-ui .hd-live-card .hd-live-info div { white-space:nowrap; }
.hd-ui .hd-live-card .hd-live-info b { white-space:nowrap; }
.hd-ui .hd-live-card .hd-live-info .hd-live-wl { white-space:normal; }
.hd-ui .hd-live-card .hd-live-wl span { white-space:nowrap; }
.hd-ui .hd-live h2 { margin:0 0 6px; font-size:20px; font-weight:900; text-align:center; }
.hd-ui .hd-live-note { font-size:12px; opacity:.75; text-align:center; margin:4px 0 10px; }
.hd-ui .hd-live-bal { text-align:center; font-weight:800; margin:0 0 8px; }
.hd-ui .hd-live-cards { display:flex; flex-direction:column; gap:8px; }
.hd-ui .hd-live-card { background:rgba(255,255,255,.55); border-radius:12px; padding:4px 10px; display:flex; align-items:center; gap:10px; }
.hd-ui .hd-live-card .hd-live-info { flex:1; min-width:0; font-size:14px; line-height:1.45; }
/* 出海 / 娱乐两个钮横排：竖叠时一张卡要两个钮的高度，四张卡在电脑、手机横屏、360 竖屏都放不下（得在卡片区里滚） */
.hd-ui .hd-live-col { display:flex; flex-direction:row; gap:8px; flex:none; }
.hd-ui .hd-live-card b { font-size:16px; }
.hd-ui .hd-live-card .hd-btn { min-height:44px; min-width:72px; }
.hd-ui .hd-live-star { color:#c98a00; letter-spacing:1px; }
.hd-ui .hd-live-xbtn { min-height:44px; min-width:44px; padding:0 10px; margin-left:4px; pointer-events:auto; }
.hd-ui .hd-live .hd-btn-wide { width:100%; min-height:44px; margin-top:8px; }
.hd-ui .hd-live-row { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:8px 0; }
/* 选档页放得下：屏高 94%，窄屏（手机竖屏）卡片收紧 */
.hd-ui .hd-live.hd-live-tiers { max-height:94%; }
@media (max-width:420px) {
  .hd-ui .hd-live.hd-live-tiers { padding:8px 10px; }
  .hd-ui .hd-live-tiers .hd-live-cards { gap:8px; }
  .hd-ui .hd-live-card { padding:3px 8px; gap:6px; }
  .hd-ui .hd-live-card .hd-live-info { font-size:12px; line-height:1.25; }
  .hd-ui .hd-live-card b { font-size:14px; }
  .hd-ui .hd-live-card .hd-btn { min-width:48px; padding:0 6px; }
  .hd-ui .hd-live-col { gap:8px; }
  .hd-ui .hd-live-tiers .hd-live-note { font-size:12px; margin:1px 0 2px; }
  .hd-ui .hd-live-tiers h2 { font-size:16px; }
}
/* 手机横屏：选档四张卡排两列，兑换和结算收紧，一屏放下不滚 */
@media (orientation:landscape) and (max-height:500px) {
  .hd-ui .hd-live { max-height:96%; padding:8px 14px; }
  .hd-ui .hd-live.hd-live-tiers { width:min(100%,740px); padding:8px 14px; }
  .hd-ui .hd-live-tiers .hd-live-cards { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .hd-ui .hd-live-card { padding:4px 8px; gap:6px; }
  .hd-ui .hd-live-card .hd-live-info { font-size:12px; line-height:1.3; }
  .hd-ui .hd-live-card b { font-size:14px; }
  .hd-ui .hd-live-card .hd-btn { min-width:60px; }
  .hd-ui .hd-live h2 { margin:0 0 2px; font-size:16px; }
  .hd-ui .hd-live-note { margin:2px 0 4px; }
  .hd-ui .hd-live-bal { margin:0 0 2px; }
  .hd-ui .hd-live .hd-btn-wide { margin-top:8px; }
  .hd-ui .hd-live-tiers .hd-live-foot { display:flex; align-items:center; gap:10px; }
  .hd-ui .hd-live-tiers .hd-live-foot .hd-live-note { flex:1; text-align:left; margin:0; }
  .hd-ui .hd-live-tiers .hd-live-foot .hd-btn-wide { width:auto; min-width:140px; margin:0; }
}
`;
  document.head.appendChild(st);
}

/** closable 默认 true（Esc 和点遮罩关）；结算页传 false 并用 onEsc 指向主按钮 */
export function dialog(opts: { tiers?: boolean; closable?: boolean; onEsc?: () => void } = {}): { mask: HTMLElement; box: HTMLElement } {
  style();
  const mask = openModal({ closable: opts.closable ?? true, onEsc: opts.onEsc });
  const box = el('div', `hd-dialog hd-live${opts.tiers ? ' hd-live-tiers' : ''}`, undefined, mask);
  return { mask, box };
}

/** 选档卡里的"最多赢 / 最多输"：一行写完，数字不截断（≥ 1 万的写"万"放不下时靠整行不换行 + 字号） */
/** 最多赢 / 最多输两段各自不折行，放不下时在中间的点处换行（手机竖屏豪华档一行放不下，不能被按钮盖住） */
export function winLose(parent: HTMLElement, stake: number, bp3: number): void {
  const d = el('div', 'hd-live-wl', undefined, parent);
  el('span', '', `最多赢 ${fmt(liveReturn(stake, bp3) - stake)}`, d);
  d.append(' · ');
  el('span', '', `最多输 ${fmt(stake)}`, d);
}

/** 进游戏时：上次没结完的一份先收尾（中途离开按输结） */
export function resumeLive(): void {
  if (!loggedIn()) return;
  void live.resume();
  void tdLive.resume();
  void escortLive.resume();
  void resumeMapLive();
}

/**
 * 航线实盘：进度还在、还是同一天就留着（resume 不按输结，从出海面板的实盘入口接着跑）；
 * 跨天了这趟作废，按当时已拿的宝分收航结回；进度丢了才按输结。要先设好 keep 再 resume。
 */
async function resumeMapLive(): Promise<void> {
  mapLiveHooks.keep = (r) => liveRunKeep(readLiveRun(), beijingDay(), r.tier);
  const rec = mapLive.record;
  if (rec?.step === 'playing' && !mapLiveHooks.keep(rec)) {
    const run = readLiveRun();
    if (run) {
      await mapLive.settle(liveRunBpOnExpire(run, rec.tier));
      writeLiveRun(null);
      return;
    }
  }
  await mapLive.resume();
  if (!mapLive.busy) writeLiveRun(null);
}

/** 选关页要不要显示"悬赏守岛（实盘）"：登录了、也没被 501 关掉 */
export const liveEntryReady = (): boolean => !liveState.off && loggedIn();

/** 海图上的"悬赏出海（实盘）"按钮；没登录、单独部署时不显示 */
export function liveMapButton(onOpen: () => void): () => void {
  if (liveState.off || !loggedIn()) return () => undefined;
  style();
  const b = button('悬赏出海（实盘）', 'hd-btn-gold hd-live-mapbtn', onOpen, uiRoot());
  return () => b.remove();
}

/** 选档页 */
export function openLive(onClose: () => void): void {
  const { mask, box } = dialog({ tiers: true, onEsc: () => { mask.remove(); onClose(); } });
  el('h2', '', '悬赏出海（实盘）', box);
  el('p', 'hd-live-note', '带一份筹码打悬赏岛：星越多结回越多，最多输掉这一份。', box);
  const bal = el('p', 'hd-live-bal', '筹码 …', box);
  void walletBalance().then((v) => (bal.textContent = v === null ? '筹码余额暂时看不到' : `筹码 ${fmt(v)}`));
  const quota = el('p', 'hd-live-note', '', box);
  const scroll = el('div', 'hd-live-scroll', undefined, box);
  const cards = el('div', 'hd-live-cards', undefined, scroll);
  const goBtns: HTMLButtonElement[] = [];
  // 每天场次上限（Worker 的 vars 可调）：打完了灰掉实盘，改成不带筹码的娱乐悬赏
  void liveToday().then((d) => {
    if (!d) return;
    if (d.live.left > 0) {
      quota.textContent = `今天还能打 ${d.live.left} 场实盘（每天 ${d.live.max} 场）`;
      return;
    }
    quota.textContent = `今天的实盘悬赏打完了（每天 ${d.live.max} 场），可以打娱乐悬赏`;
    for (const b of goBtns) b.disabled = true;
  });
  for (const id of LIVE_TIER_IDS) {
    const t = LIVE_TIERS[id];
    const c = el('div', 'hd-live-card', undefined, cards);
    const info = el('div', 'hd-live-info', undefined, c);
    el('b', '', `${t.name}档 · 一份 ${fmt(t.stake)}`, info);
    el('div', '', '', info).append('电脑 ', el('span', 'hd-live-star', '★'.repeat(t.power) + '☆'.repeat(4 - t.power)), ' · 约 2–3 分钟');
    winLose(info, t.stake, t.bp[3]);
    const col = el('div', 'hd-live-col', undefined, c);
    // 出海是花筹码的操作：先弹一次确认（写清带入多少、最多赢输多少），点了"确定"才 buyin
    goBtns.push(button('出海', 'hd-btn-gold', () => {
      confirmBox(`带入 ${fmt(t.stake)} 筹码出海。最多赢 ${fmt(liveReturn(t.stake, t.bp[3]) - t.stake)}，最多输 ${fmt(t.stake)}（就是带进去的这一份）。确定出海？`, '确定出海', () => {
        mask.remove();
        void start(id, onClose);
      }, '再想想');
    }, col));
    button('娱乐', 'hd-btn-plain', () => {
      mask.remove();
      practice(id);
    }, col);
  }
  const foot = el('div', 'hd-live-foot', undefined, box);
  el('p', 'hd-live-note', `"娱乐"打同一座岛，不带筹码、不算场次。${NO_CASH}`, foot);
  button('回岛', 'hd-btn-wood hd-btn-wide', () => {
    mask.remove();
    onClose();
  }, foot);
}

async function start(tier: LiveTier, onClose: () => void): Promise<void> {
  const r = await live.buyin(tier);
  if (!r.ok) {
    if (r.error === 'need_reload') needReload();
    else toast(errText(r.error));
    onClose();
    return;
  }
  const rec = r.rec;
  app.startPvp(liveSetup(tier, rec.seed), {
    onFinish: (_log, _end, local) => {
      const bp = liveBp(tier, local);
      void showResult(tier, local.stars, local.destroyedPct, bp);
    },
  });
}

/** 娱乐悬赏：同一座岛，不碰钱包 */
function practice(tier: LiveTier): void {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  app.startPvp(liveSetup(tier, (b[0]! & 0x3fffffff) | 1), {
    onFinish: (_log, _end, local) => {
      let main: HTMLButtonElement | undefined;
      const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
      el('h2', '', TITLES[local.stars] ?? '', box);
      el('p', 'hd-live-bal', `摧毁 ${local.destroyedPct}% · 实盘的话拿回带入的 ${Math.round(liveBp(tier, local) / 100)}%`, box);
      el('p', 'hd-live-note', '（娱乐悬赏，不带筹码）', box);
      main = button('回家', 'hd-btn-gold hd-btn-wide', () => {
        mask.remove();
        app.goBase();
      }, box);
    },
  });
}

async function showResult(tier: LiveTier, stars: number, pct: number, bp: number): Promise<void> {
  let main: HTMLButtonElement | undefined;
  const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
  el('h2', '', '结算中…', box);
  const res = await live.settle(bp);
  box.textContent = '';
  el('h2', '', TITLES[stars] ?? '', box);
  const st = el('div', 'hd-live-row', undefined, box);
  for (let i = 0; i < 3; i++) st.appendChild(img(iconA(i < stars ? 'star' : 'starEmpty'), 40));
  el('p', 'hd-live-bal', `摧毁 ${pct}% · 拿回带入的 ${Math.round(bp / 100)}%`, box);
  const stake = LIVE_TIERS[tier].stake;
  if (res.ok) {
    const credited = live.record?.credited ?? liveReturn(stake, bp);
    const net = credited - stake;
    el('p', `hd-live-bal ${net >= 0 ? 'hd-pos' : 'hd-neg'}`, `这局筹码 ${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}`, box);
    if ((live.record?.capped ?? 0) > 0) el('p', 'hd-live-note', '今天这个游戏的进账到顶了，多出来的没进钱包。', box);
  } else if (res.why === 'offline' || res.why === 'login') {
    el('p', 'hd-live-note', '结果记下了，连上网后会自动结回。', box);
  } else el('p', 'hd-live-note', errText(res.error), box);
  el('p', 'hd-live-note', NO_CASH, box);
  main = button('回家', 'hd-btn-gold hd-btn-wide', () => {
    mask.remove();
    app.goBase();
  }, box);
}

// ---- 悬赏守岛（实盘，DESIGN.md 10.5）：流程同悬赏出海，岛是固定模板（src/core/tdlive.ts），打的是塔防

const TD_ERR: Record<string, string> = { ...ERR, live_daily: '今天的悬赏守岛打完了，明天再来' };
const tdErrText = (e: string): string => TD_ERR[e] ?? '钱包暂时连不上，稍后再试';

/** 选档页：四档，一份多少、电脑多强、今天还剩几场、最多赢 / 最多输 */
export function openTdLive(onClose: () => void): void {
  const { mask, box } = dialog({ tiers: true, onEsc: () => { mask.remove(); onClose(); } });
  el('h2', '', '悬赏守岛（实盘）', box);
  el('p', 'hd-live-note', '带一份筹码替悬赏岛守宝藏：守得越好结回越多，最多输掉这一份。岛是固定的。', box);
  const bal = el('p', 'hd-live-bal', '筹码 …', box);
  void walletBalance().then((v) => (bal.textContent = v === null ? '筹码余额暂时看不到' : `筹码 ${fmt(v)}`));
  const quota = el('p', 'hd-live-note', '', box);
  const scroll = el('div', 'hd-live-scroll', undefined, box);
  const cards = el('div', 'hd-live-cards', undefined, scroll);
  const goBtns: HTMLButtonElement[] = [];
  void tdToday().then((d) => {
    if (!d) return;
    if (d.left > 0) {
      quota.textContent = `今天还能守 ${d.left} 场（每天 ${d.max} 场）`;
      return;
    }
    quota.textContent = `今天的悬赏守岛打完了（每天 ${d.max} 场），明天再来`;
    for (const b of goBtns) b.disabled = true;
  });
  for (const id of LIVE_TIER_IDS) {
    const t = TD_LIVE_TIERS[id];
    const c = el('div', 'hd-live-card', undefined, cards);
    const info = el('div', 'hd-live-info', undefined, c);
    el('b', '', `${t.name}档 · 一份 ${fmt(t.stake)}`, info);
    el('div', '', '', info).append('电脑 ', el('span', 'hd-live-star', '★'.repeat(t.power) + '☆'.repeat(4 - t.power)), ' · 约 3–4 分钟');
    if (!tdLiveOpen(id)) {
      el('div', '', '配平中，先玩小档', info);
      const off = button('配平中', '', () => undefined, c);
      off.disabled = true;
      off.dataset.tier = id;
      continue;
    }
    winLose(info, t.stake, t.bp[3]);
    const btn = button('开守', 'hd-btn-gold', () => {
      confirmBox(`带入 ${fmt(t.stake)} 筹码开守。最多赢 ${fmt(liveReturn(t.stake, t.bp[3]) - t.stake)}，最多输 ${fmt(t.stake)}（就是带进去的这一份）。确定开守？`, '确定开守', () => {
        mask.remove();
        void startTdLive(id, onClose);
      }, '再想想');
    }, c);
    btn.dataset.tier = id;
    goBtns.push(btn);
  }
  const foot = el('div', 'hd-live-foot', undefined, box);
  el('p', 'hd-live-note', NO_CASH, foot);
  button('回岛', 'hd-btn-wood hd-btn-wide', () => {
    mask.remove();
    onClose();
  }, foot);
}

async function startTdLive(tier: LiveTier, onClose: () => void): Promise<void> {
  const r = await tdLive.buyin(tier);
  if (!r.ok) {
    if (r.error === 'need_reload') needReload();
    else toast(tdErrText(r.error));
    onClose();
    return;
  }
  app.startTdLive(tdLiveSetup(tier, r.rec.seed), tier);
}

/** 一局守完：按星数和撑过的波数算倍数结回，弹结算页（TdScene 的 finish 调） */
export async function showTdLiveResult(tier: LiveTier, res: Pick<TdResult, 'stars' | 'waves' | 'total' | 'lost'>): Promise<void> {
  const bp = tdLiveBp(tier, res);
  let main: HTMLButtonElement | undefined;
  const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
  el('h2', '', '结算中…', box);
  const r = await tdLive.settle(bp);
  box.textContent = '';
  el('h2', '', tdVerdict(res.stars, res.lost), box);
  dropStars(box, res.stars, 40);
  el('p', 'hd-live-bal', `守住宝藏 ${TD_TREASURE - res.lost}/${TD_TREASURE} · 撑过 ${res.waves}/${res.total} 波`, box);
  el('p', 'hd-live-bal', `拿回带入的 ${Math.round(bp / 100)}%`, box);
  const stake = TD_LIVE_TIERS[tier].stake;
  if (r.ok) {
    const credited = tdLive.record?.credited ?? liveReturn(stake, bp);
    const net = credited - stake;
    el('p', `hd-live-bal hd-live-net ${net >= 0 ? 'hd-pos' : 'hd-neg'}`, `这局筹码 ${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}`, box);
    el('p', 'hd-live-note', `结回 ${fmt(credited)} 筹码（带入 ${fmt(stake)}）`, box);
    if ((tdLive.record?.capped ?? 0) > 0) el('p', 'hd-live-note', '今天这个游戏的进账到顶了，多出来的没进钱包。', box);
  } else if (r.why === 'offline' || r.why === 'login') {
    el('p', 'hd-live-note', '结果记下了，连上网后会自动结回。', box);
  } else el('p', 'hd-live-note', tdErrText(r.error), box);
  el('p', 'hd-live-note', NO_CASH, box);
  main = button('回家', 'hd-btn-gold hd-btn-wide', () => {
    mask.remove();
    app.goBase();
  }, box);
}

/** 顶栏金币旁的"换"按钮（BaseScene 的顶栏调）；没登录不显示 */
export function exchangeButton(parent: HTMLElement): void {
  if (liveState.off || !loggedIn()) return;
  style();
  button('换', 'hd-btn-wood hd-live-xbtn', openExchange, parent);
}

/** 兑换面板：一次一份小档的筹码，换金币或木材；单向，换不回筹码 */
function openExchange(): void {
  const { mask, box } = dialog();
  el('h2', '', '筹码换资源', box);
  const bal = el('p', 'hd-live-bal', '筹码 …', box);
  void walletBalance().then((v) => (bal.textContent = v === null ? '筹码余额暂时看不到' : `筹码 ${fmt(v)}`));
  el('p', 'hd-live-note', `每次 ${fmt(EXCHANGE_CHIPS)} 筹码，每天最多 ${EXCHANGE_PER_DAY} 次。金币、木材换不回筹码。`, box);
  // 失败重发用同一个 ref：钱包按它只扣一次
  let ref = live.newExchangeRef();
  const row = el('div', 'hd-live-row', undefined, box);
  const go = (into: 'gold' | 'wood'): void => {
    for (const b of row.querySelectorAll('button')) b.disabled = true;
    void live.exchange(ref, into).then(async (r) => {
      for (const b of row.querySelectorAll('button')) b.disabled = false;
      if (!r.ok) {
        if (r.why === 'reject') ref = live.newExchangeRef();
        return toast(errText(r.error));
      }
      const p = r.body.pending as { raidId: string; gold: number; wood: number } | undefined;
      if (p) await applyAndAck([p]);
      toast(into === 'gold' ? `换到 ${fmt(EXCHANGE_GOLD)} 金币` : `换到 ${fmt(EXCHANGE_WOOD)} 木材`);
      mask.remove();
    });
  };
  button(`换 ${fmt(EXCHANGE_GOLD)} 金币`, 'hd-btn-gold', () => go('gold'), row);
  button(`换 ${fmt(EXCHANGE_WOOD)} 木材`, 'hd-btn-gold', () => go('wood'), row);
  el('p', 'hd-live-note', `仓库放不下的部分会丢掉。${NO_CASH}`, box);
  button('不换了', 'hd-btn-plain hd-btn-wide', () => mask.remove(), box);
}
