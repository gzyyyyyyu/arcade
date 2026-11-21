/**
 * 悬赏出海（实盘）和筹码兑换的界面（DESIGN.md 第 4 节）：海图上的入口和选档页（各游戏统一的选档卡：电脑多强★、一场多久、最多赢 / 输）、
 * 打完的结回弹窗、顶栏金币旁的"换"按钮和兑换面板。类名 hd-live-*，样式限定在 .hd-ui 下。筹码无任何现金价值，界面上写明。
 */
import { EXCHANGE_CHIPS, EXCHANGE_GOLD, EXCHANGE_PER_DAY, EXCHANGE_WOOD, LIVE_TIER_IDS, STREAK_ISLANDS, liveBp, liveReturn, liveSetup, liveTopBp, shopGrant, streakBp, streakPassed, streakSetup, type LiveTier } from '../core/live.ts';
import { TD_TREASURE } from '../content/index.ts';
import { tdLiveBp, tdLiveOpen, tdLiveSetup } from '../core/tdlive.ts';
import { CHIP_SHOP, INGOT_CHIPS, LIVE_STAKE, LIVE_TABLE, STREAK_LADDER, STREAK_PASS, TIER_NAME } from '../content/livetable.ts';
import { ingotBalance, refundIngot, spendIngot } from '../core/ingot.ts';
import type { TdResult } from '../core/tdtypes.ts';
import { escortLive, ingotX, live, liveState, liveToday, mapLive, mapLiveHooks, shopX, tdLive, tdToday, walletBalance, type IngotRecord, type ShopRecord } from '../net/live.ts';
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
  exchange_cap: '今天的兑换额度用完了，明天再换',
  no_change: '筹码余额到上限了，先花掉一些',
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
.hd-ui .hd-live-h3 { font-size:16px; margin:10px 0 4px; text-align:center; }
.hd-ui .hd-live-bal .hd-img { vertical-align:middle; }
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
.hd-ui .hd-live-tiers .hd-live-mode { margin:4px 0; }
/* 电脑：选档四张卡排两列（一列四张在 1280×720 放不下） */
@media (min-width:900px) and (min-height:501px) {
  .hd-ui .hd-live.hd-live-tiers { width:min(100%,740px); }
  .hd-ui .hd-live-tiers .hd-live-cards { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
}
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
  .hd-ui .hd-live-h3 { margin:6px 0 2px; }
  .hd-ui .hd-live-note { margin:2px 0 6px; }
  .hd-ui .hd-live-row { margin:4px 0; }
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
  /* 余额、今天几场、单场 / 连闯并成一行 */
  .hd-ui .hd-live-tiers .hd-live-bar { display:flex; align-items:center; justify-content:center; gap:12px; }
  .hd-ui .hd-live-tiers .hd-live-bar > p { margin:0; }
  .hd-ui .hd-live-tiers .hd-live-mode { margin:2px 0; flex-wrap:nowrap; }
  /* 兑换：金银锭和筹码换资源两栏并排 */
  .hd-ui .hd-live.hd-live-x { width:min(100%,740px); }
  .hd-ui .hd-live-xcols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .hd-ui .hd-live-xcols .hd-live-h3 { margin:2px 0; }
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
  const rec = ingotX.pending();
  if (rec) void finishIngot(rec);
  const buy = shopX.pending();
  if (buy) void finishShop(buy);
}

/** 筹码买装饰的一笔发出去之后：扣成了（含重发回 dup）才把收藏加进存档；钱包拒了就作罢，连不上留着下次重发 */
async function finishShop(rec: ShopRecord): Promise<boolean | null> {
  const r = await shopX.send(rec);
  if (!r.ok && r.why !== 'reject') return null;
  shopX.done();
  if (!r.ok) {
    toast(errText(r.error));
    return false;
  }
  app.commit(shopGrant(app.profile, rec.item));
  return true;
}

/** 收藏页里「用筹码买」：价目表里还没有的，写价钱、点了先确认再扣（纯外观，只扣不返） */
export function shopSection(body: HTMLElement, name: (id: string) => string, art: (id: string) => HTMLElement | null, refresh: () => void): HTMLElement[] {
  if (liveState.off || !loggedIn()) return [];
  const own = new Set(app.profile.cosmetics);
  const rows: HTMLElement[] = [el('b', '', '用筹码买（纯外观，不加属性，买了不退）', body)];
  for (const [id, price] of Object.entries(CHIP_SHOP)) {
    if (own.has(id)) continue;
    const row = el('div', 'hd-ach', undefined, body);
    const pic = art(id);
    if (pic) row.appendChild(pic);
    const t = el('div', 'hd-at', undefined, row);
    el('b', '', name(id), t);
    el('small', '', `${fmt(price)} 筹码`, t);
    button('买', 'hd-btn-gold', () => {
      confirmBox(`花 ${fmt(price)} 筹码买「${name(id)}」？纯外观，买了不退。`, '买', () => {
        void finishShop(shopX.begin({ item: id })).then((ok) => {
          if (ok === null) toast('网络断了，下次打开会接着买');
          else if (ok) toast(`买到了：${name(id)}`);
          refresh();
        });
      }, '再想想');
    }, row);
    rows.push(row);
  }
  if (rows.length > 1) return rows;
  rows[0]!.remove();
  return [];
}

/**
 * 金银锭换筹码的一笔发出去之后：钱包入了多少就扣多少锭（只入了一部分、被拒了的退回存档），
 * 连不上就留着，下次打开用同一个 ref 重发。存档里的锭在发之前已经扣了（spendIngot）。
 */
async function finishIngot(rec: IngotRecord): Promise<number | null> {
  const r = await ingotX.send(rec);
  if (!r.ok && r.why !== 'reject') return null;
  const credited = r.ok ? (typeof r.body.credited === 'number' ? r.body.credited : rec.n * INGOT_CHIPS) : 0;
  const used = Math.min(rec.n, Math.ceil(credited / INGOT_CHIPS));
  if (used < rec.n) app.commit(refundIngot(app.profile, rec.n - used));
  ingotX.done();
  if (!r.ok) toast(errText(r.error));
  return credited;
}

/** 兑换面板里「金银锭换筹码」一块：手里几锭、今天还能换多少，换 1 / 5 / 全部 */
function ingotSection(box: HTMLElement): void {
  el('h3', 'hd-live-h3', `金银锭换筹码（1 锭 = ${INGOT_CHIPS}）`, box);
  const info = el('p', 'hd-live-bal', '', box);
  const row = el('div', 'hd-live-row', undefined, box);
  let left = Number.POSITIVE_INFINITY;
  const draw = (): void => {
    const have = ingotBalance(app.profile);
    const can = Math.min(have, Math.floor(left / INGOT_CHIPS));
    info.replaceChildren(img(iconA('ingot'), 20), ` 手里 ${fmt(have)} 锭${Number.isFinite(left) ? ` · 今天还能换 ${fmt(left)} 筹码` : ''}`);
    row.replaceChildren();
    for (const n of [...new Set([1, 5, can])].filter((k) => k >= 1)) {
      const b = button(n === can && n > 5 ? `全换（${fmt(n)} 锭）` : `换 ${n} 锭`, 'hd-btn-gold', () => void go(n), row);
      b.disabled = n > can;
    }
    if (can < 1) el('span', 'hd-live-note', have < 1 ? '还没有金银锭：三星、训练营、成就、每日悬赏都给' : '今天的兑换额度用完了', row);
  };
  const go = async (n: number): Promise<void> => {
    const sp = spendIngot(app.profile, n);
    if (!sp.ok) return;
    for (const b of row.querySelectorAll('button')) b.disabled = true;
    app.commit(sp.value);
    const got = await finishIngot(ingotX.begin({ n }));
    if (got === null) toast('网络断了，下次打开会接着换');
    else if (got > 0) {
      toast(`换到 ${fmt(got)} 筹码`);
      left = Math.max(0, left - got);
    }
    draw();
  };
  draw();
  void liveToday().then((d) => {
    if (d?.ingot) left = d.ingot.left;
    draw();
  });
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
  // 单场的说明和连闯的说明共用一行（切模式时换字），一屏放得下
  const how = el('p', 'hd-live-note', '', box);
  const bar = el('div', 'hd-live-bar', undefined, box);
  const bal = el('p', 'hd-live-bal', '筹码 …', bar);
  void walletBalance().then((v) => (bal.textContent = v === null ? '筹码余额暂时看不到' : `筹码 ${fmt(v)}`));
  const quota = el('p', 'hd-live-note', '', bar);
  // 单场 / 连闯三座：连闯一份打三座，每座之间可以收手（DESIGN 4.6）
  let streak = false;
  const modes = el('div', 'hd-live-row hd-live-mode', undefined, bar);
  const scroll = el('div', 'hd-live-scroll', undefined, box);
  const cards = el('div', 'hd-live-cards', undefined, scroll);
  const goBtns: HTMLButtonElement[] = [];
  const redraws: Array<() => void> = [];
  const setMode = (v: boolean): void => {
    streak = v;
    single.className = `hd-btn ${v ? 'hd-btn-plain' : 'hd-btn-gold'}`;
    multi.className = `hd-btn ${v ? 'hd-btn-gold' : 'hd-btn-plain'}`;
    how.textContent = v ? `一份连打 ${STREAK_ISLANDS} 座，${STREAK_PASS} 星以上算过；过一座可以收手，再闯没过就按保底结` : '带一份筹码打悬赏岛：星越多结回越多，最多输掉这一份。';
    for (const f of redraws) f();
  };
  const single = button('单场', 'hd-btn-gold', () => setMode(false), modes);
  const multi = button(`连闯 ${STREAK_ISLANDS} 座`, 'hd-btn-plain', () => setMode(true), modes);
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
    const t = { name: TIER_NAME[id], stake: LIVE_STAKE[id], power: LIVE_TABLE.live[id].power, top: liveTopBp('live', id) };
    const c = el('div', 'hd-live-card', undefined, cards);
    const info = el('div', 'hd-live-info', undefined, c);
    el('b', '', `${t.name}档 · 一份 ${fmt(t.stake)}`, info);
    el('div', '', '', info).append('电脑 ', el('span', 'hd-live-star', '★'.repeat(t.power) + '☆'.repeat(4 - t.power)), ' · 约 2–3 分钟');
    const top = (): number => (streak ? STREAK_LADDER[id].win[2] : t.top);
    const wl = el('div', '', undefined, info);
    redraws.push(() => {
      wl.replaceChildren();
      winLose(wl, t.stake, top());
    });
    const col = el('div', 'hd-live-col', undefined, c);
    // 出海是花筹码的操作：先弹一次确认（写清带入多少、最多赢输多少），点了"确定"才 buyin
    goBtns.push(button('出海', 'hd-btn-gold', () => {
      const what = streak ? `连闯 ${STREAK_ISLANDS} 座` : '出海';
      confirmBox(`带入 ${fmt(t.stake)} 筹码${what}。最多赢 ${fmt(liveReturn(t.stake, top()) - t.stake)}，最多输 ${fmt(t.stake)}（就是带进去的这一份）。确定${what}？`, '确定', () => {
        mask.remove();
        void (streak ? startStreak(id, onClose) : start(id, onClose));
      }, '再想想');
    }, col));
    button('娱乐', 'hd-btn-plain', () => {
      mask.remove();
      practice(id);
    }, col);
  }
  setMode(false);
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
      const bp = liveBp(tier, rec.seed, local);
      void showResult(tier, local.stars, `摧毁 ${local.destroyedPct}%`, bp);
    },
  });
}

/**
 * 悬赏连闯（DESIGN 4.6）：带入一份，第 i 座打完没过按 fail 结；过了三座按 win[2] 结；过了 1、2 座时弹框选收手或再闯。
 * 每一步先把"这时离开按多少结"记进 haidao.live（setFloor），关页面也按它结。
 */
async function startStreak(tier: LiveTier, onClose: () => void): Promise<void> {
  const r = await live.buyin(tier);
  if (!r.ok) {
    if (r.error === 'need_reload') needReload();
    else toast(errText(r.error));
    onClose();
    return;
  }
  const seed = r.rec.seed;
  const done = (passed: number, stop: boolean): void => void showResult(tier, passed, `连闯过了 ${passed}/${STREAK_ISLANDS} 座`, streakBp(tier, passed, stop));
  const island = (i: number): void => {
    live.setFloor(streakBp(tier, i, false));
    app.startPvp(streakSetup(tier, seed, i), {
      onFinish: (_log, _end, local) => {
        if (!streakPassed(local)) return done(i, false);
        if (i + 1 === STREAK_ISLANDS) return done(STREAK_ISLANDS, true);
        live.setFloor(streakBp(tier, i + 1, true));
        streakChoice(tier, i + 1, () => done(i + 1, true), () => island(i + 1));
      },
    });
  };
  island(0);
}

/** 过了 passed 座：收手拿多少，再闯过了拿多少、没过拿多少 */
function streakChoice(tier: LiveTier, passed: number, stop: () => void, more: () => void): void {
  const { mask, box } = dialog({ closable: false });
  const pct = (bp: number): string => `${Math.round(bp / 100)}%`;
  el('h2', '', `过了第 ${passed} 座！`, box);
  const st = el('div', 'hd-live-row', undefined, box);
  for (let i = 0; i < STREAK_ISLANDS; i++) st.appendChild(img(iconA(i < passed ? 'star' : 'starEmpty'), 40));
  el('p', 'hd-live-bal', `收手：拿回带入的 ${pct(streakBp(tier, passed, true))}`, box);
  el('p', 'hd-live-bal', `再闯一座：过了 ${pct(streakBp(tier, passed + 1, true))}，没过 ${pct(streakBp(tier, passed, false))}`, box);
  el('p', 'hd-live-note', `${STREAK_PASS} 星以上算过。`, box);
  const row = el('div', 'hd-live-row', undefined, box);
  button('收手', 'hd-btn-wood', () => {
    mask.remove();
    stop();
  }, row);
  button('再闯', 'hd-btn-gold', () => {
    mask.remove();
    more();
  }, row);
}

/** 娱乐悬赏：同一座岛，不碰钱包 */
function practice(tier: LiveTier): void {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  const seed = (b[0]! & 0x3fffffff) | 1;
  app.startPvp(liveSetup(tier, seed), {
    onFinish: (_log, _end, local) => {
      let main: HTMLButtonElement | undefined;
      const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
      el('h2', '', TITLES[local.stars] ?? '', box);
      el('p', 'hd-live-bal', `摧毁 ${local.destroyedPct}% · 实盘的话拿回带入的 ${Math.round(liveBp(tier, seed, local) / 100)}%`, box);
      el('p', 'hd-live-note', '（娱乐悬赏，不带筹码）', box);
      main = button('回家', 'hd-btn-gold hd-btn-wide', () => {
        mask.remove();
        app.goBase();
      }, box);
    },
  });
}

async function showResult(tier: LiveTier, stars: number, what: string, bp: number): Promise<void> {
  let main: HTMLButtonElement | undefined;
  const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
  el('h2', '', '结算中…', box);
  const res = await live.settle(bp);
  box.textContent = '';
  el('h2', '', TITLES[stars] ?? '', box);
  const st = el('div', 'hd-live-row', undefined, box);
  for (let i = 0; i < 3; i++) st.appendChild(img(iconA(i < stars ? 'star' : 'starEmpty'), 40));
  el('p', 'hd-live-bal', `${what} · 拿回带入的 ${Math.round(bp / 100)}%`, box);
  const stake = LIVE_STAKE[tier];
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
    const t = { name: TIER_NAME[id], stake: LIVE_STAKE[id], power: LIVE_TABLE.td[id].power, top: liveTopBp('td', id) };
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
    winLose(info, t.stake, t.top);
    const btn = button('开守', 'hd-btn-gold', () => {
      confirmBox(`带入 ${fmt(t.stake)} 筹码开守。最多赢 ${fmt(liveReturn(t.stake, t.top) - t.stake)}，最多输 ${fmt(t.stake)}（就是带进去的这一份）。确定开守？`, '确定开守', () => {
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
export async function showTdLiveResult(tier: LiveTier, seed: number, res: Pick<TdResult, 'stars' | 'waves' | 'total' | 'lost'>): Promise<void> {
  const bp = tdLiveBp(tier, seed, res);
  let main: HTMLButtonElement | undefined;
  const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
  el('h2', '', '结算中…', box);
  const r = await tdLive.settle(bp);
  box.textContent = '';
  el('h2', '', tdVerdict(res.stars, res.lost), box);
  dropStars(box, res.stars, 40);
  el('p', 'hd-live-bal', `守住宝藏 ${TD_TREASURE - res.lost}/${TD_TREASURE} · 撑过 ${res.waves}/${res.total} 波`, box);
  el('p', 'hd-live-bal', `拿回带入的 ${Math.round(bp / 100)}%`, box);
  const stake = LIVE_STAKE[tier];
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
  box.classList.add('hd-live-x');
  el('h2', '', '兑换', box);
  const cols = el('div', 'hd-live-xcols', undefined, box);
  ingotSection(el('div', '', undefined, cols));
  const chips = el('div', '', undefined, cols);
  el('h3', 'hd-live-h3', '筹码换资源', chips);
  const bal = el('p', 'hd-live-bal', '筹码 …', chips);
  void walletBalance().then((v) => (bal.textContent = v === null ? '筹码余额暂时看不到' : `筹码 ${fmt(v)}`));
  el('p', 'hd-live-note', `每次 ${fmt(EXCHANGE_CHIPS)} 筹码，每天最多 ${EXCHANGE_PER_DAY} 次。金币、木材换不回筹码。`, chips);
  // 失败重发用同一个 ref：钱包按它只扣一次
  let ref = live.newExchangeRef();
  const row = el('div', 'hd-live-row', undefined, chips);
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
  el('p', 'hd-live-note', `仓库放不下的部分会丢掉。${NO_CASH}`, chips);
  button('不换了', 'hd-btn-plain hd-btn-wide', () => mask.remove(), box);
}
