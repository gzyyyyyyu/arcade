/**
 * 护航实盘、寻宝航线实盘的界面（DESIGN.md 12.1、11.1）：选档页（样式复用悬赏守岛的 hd-live-*）、带入、护航结算框。
 * 流程照悬赏守岛（live.ts 的 openTdLive / startTdLive / showTdLiveResult）；钱的一份在 net/live.ts，
 * 航线实盘怎么跑在 maproute.ts 的 openLiveRoute，结算框在 mapend.ts。
 */
import { escortLiveBp, escortLiveSetup } from '../core/escortlive.ts';
import { LIVE_STAKE, LIVE_TABLE, TIER_NAME } from '../content/livetable.ts';
import type { EscortResult } from '../core/escorttypes.ts';
import { LIVE_TIER_IDS, livePick, liveReturn, liveTopBp, type LiveTier } from '../core/live.ts';
import { escortLive, escortToday, mapLive, mapToday, walletBalance } from '../net/live.ts';
import { app, fmt } from './app.ts';
import { dropStars } from './td-ui.ts';
import { resultTitle } from './escorttext.ts';
import { NO_CASH, dialog, errText, winLose } from './live.ts';
import { MAP_TIER_NOTE, escortLiveLine, netText, quotaText, readLiveRun, returnPctText } from './livemore-logic.ts';
import { openLiveRoute } from './maproute.ts';
import { beijingDay } from './maprules.ts';
import { needReload } from './pvp.ts';
import { button, confirmBox, el, toast } from './ui.ts';

const ESCORT_ERR: Record<string, string> = { live_daily: '今天的护航实盘打完了，明天再来' };
const MAP_ERR: Record<string, string> = { live_daily: '今天的航线实盘打完了，明天再来' };
const escortErr = (e: string): string => ESCORT_ERR[e] ?? errText(e);
const mapErr = (e: string): string => MAP_ERR[e] ?? errText(e);

/** 选档页的公共骨架：标题、说明、筹码余额、今天还剩几场、卡片区、脚（回岛） */
function tierPage(title: string, note: string, onClose: () => void): { mask: HTMLElement; box: HTMLElement; quota: HTMLElement; cards: HTMLElement } {
  const { mask, box } = dialog({ tiers: true, onEsc: () => { mask.remove(); onClose(); } });
  el('h2', '', title, box);
  el('p', 'hd-live-note', note, box);
  const bal = el('p', 'hd-live-bal', '筹码 …', box);
  void walletBalance().then((v) => (bal.textContent = v === null ? '筹码余额暂时看不到' : `筹码 ${fmt(v)}`));
  const quota = el('p', 'hd-live-note', '', box);
  const scroll = el('div', 'hd-live-scroll', undefined, box);
  const cards = el('div', 'hd-live-cards', undefined, scroll);
  return { mask, box, quota, cards };
}

function tierFoot(mask: HTMLElement, box: HTMLElement, onClose: () => void): void {
  const foot = el('div', 'hd-live-foot', undefined, box);
  el('p', 'hd-live-note', NO_CASH, foot);
  button('回岛', 'hd-btn-wood hd-btn-wide', () => {
    mask.remove();
    onClose();
  }, foot);
}

// ---------------------------------------------------------------- 护航

/** 护航实盘选档页：四档，每档固定一关，电脑多强、约几分钟、最多赢 / 最多输、今天还剩几场 */
export function openEscortLive(onClose: () => void): void {
  const { mask, box, quota, cards } = tierPage('护航（实盘）', '带一份筹码护一趟商船：到港时船越完整结回越多，没到港按走过的路折算，最多输掉这一份。每档的关是固定的。', onClose);
  const goBtns: HTMLButtonElement[] = [];
  void escortToday().then((d) => {
    if (!d) return;
    const q = quotaText('escort', d.left, d.max);
    quota.textContent = q.text;
    if (q.full) for (const b of goBtns) b.disabled = true;
  });
  for (const id of LIVE_TIER_IDS) {
    const t = { name: TIER_NAME[id], stake: LIVE_STAKE[id], power: LIVE_TABLE.escort[id].power, top: liveTopBp('escort', id) };
    const c = el('div', 'hd-live-card', undefined, cards);
    const info = el('div', 'hd-live-info', undefined, c);
    el('b', '', `${t.name}档 · 一份 ${fmt(t.stake)}`, info);
    el('div', '', '', info).append('电脑 ', el('span', 'hd-live-star', '★'.repeat(t.power) + '☆'.repeat(4 - t.power)), ' · 约 3–5 分钟');
    winLose(info, t.stake, t.top);
    const btn = button('开护', 'hd-btn-gold', () => {
      confirmBox(`带入 ${fmt(t.stake)} 筹码护航。最多赢 ${fmt(liveReturn(t.stake, t.top) - t.stake)}，最多输 ${fmt(t.stake)}（就是带进去的这一份）。确定开护？`, '确定开护', () => {
        mask.remove();
        void startEscortLive(id, onClose);
      }, '再想想');
    }, c);
    btn.dataset.tier = id;
    goBtns.push(btn);
  }
  tierFoot(mask, box, onClose);
}

async function startEscortLive(tier: LiveTier, onClose: () => void): Promise<void> {
  const r = await escortLive.buyin(tier);
  if (!r.ok) {
    if (r.error === 'need_reload') needReload();
    else toast(escortErr(r.error));
    onClose();
    return;
  }
  app.startEscortLive(livePick('escort', tier, r.rec.seed).level, escortLiveSetup(tier, r.rec.seed), tier);
}

/**
 * 一趟护航结束（到港、沉没、误了潮、撤退都走这里）：按 escortLiveBp 结回、弹结算框。
 * 不碰自己的存档：没有金币木材、不记护航星数。撤退按走过的格数折算，所以到这里的结果一定有 cells / total。
 */
export async function showEscortLiveResult(tier: LiveTier, seed: number, er: EscortResult & { retreated?: boolean }): Promise<void> {
  const bp = escortLiveBp(tier, seed, er);
  let main: HTMLButtonElement | undefined;
  const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
  el('h2', '', '结算中…', box);
  const r = await escortLive.settle(bp);
  box.textContent = '';
  el('h2', '', resultTitle(er), box);
  dropStars(box, er.stars, 40);
  el('p', 'hd-live-bal', escortLiveLine(er), box);
  el('p', 'hd-live-bal', returnPctText(bp), box);
  const stake = LIVE_STAKE[tier];
  if (r.ok) {
    const credited = escortLive.record?.credited ?? liveReturn(stake, bp);
    el('p', `hd-live-bal hd-live-net ${credited >= stake ? 'hd-pos' : 'hd-neg'}`, netText(credited, stake), box);
    el('p', 'hd-live-note', `结回 ${fmt(credited)} 筹码（带入 ${fmt(stake)}）`, box);
    if ((escortLive.record?.capped ?? 0) > 0) el('p', 'hd-live-note', '今天这个游戏的进账到顶了，多出来的没进钱包。', box);
  } else if (r.why === 'offline' || r.why === 'login') {
    el('p', 'hd-live-note', '结果记下了，连上网后会自动结回。', box);
  } else el('p', 'hd-live-note', escortErr(r.error), box);
  el('p', 'hd-live-note', NO_CASH, box);
  main = button('回家', 'hd-btn-gold hd-btn-wide', () => {
    mask.remove();
    app.goBase();
  }, box);
}

// ---------------------------------------------------------------- 寻宝航线

/** 航线实盘选档页：四档同一条航线，只换结回倍数；每天 1 趟；有没跑完的就先给"接着跑" */
export function openMapLive(onClose: () => void): void {
  const { mask, box, quota, cards } = tierPage('今日航线（实盘）', '带一份筹码跑今天的航线：同一条航线、同样的难度，拿的星越多结回越多，最多输掉这一份。', onClose);
  const goBtns: HTMLButtonElement[] = [];
  const rec = mapLive.record;
  const run = readLiveRun();
  if (rec?.step === 'playing' && run?.state && run.day === beijingDay()) {
    // 上次没跑完：直接接着跑，不再带入
    quota.textContent = '有一趟实盘航线还没跑完';
    button(`接着跑（${TIER_NAME[run.tier]}档）`, 'hd-btn-gold hd-btn-wide', () => {
      mask.remove();
      onClose();
      openLiveRoute(run.tier, false);
    }, cards);
  } else {
    void mapToday().then((d) => {
      if (!d) return;
      const q = quotaText('map', d.left, d.max);
      quota.textContent = q.text;
      if (q.full) for (const b of goBtns) b.disabled = true;
    });
  }
  for (const id of LIVE_TIER_IDS) {
    const t = { name: TIER_NAME[id], stake: LIVE_STAKE[id], top: liveTopBp('map', id) };
    const c = el('div', 'hd-live-card', undefined, cards);
    const info = el('div', 'hd-live-info', undefined, c);
    el('b', '', `${t.name}档 · 一份 ${fmt(t.stake)}`, info);
    el('div', '', MAP_TIER_NOTE, info);
    winLose(info, t.stake, t.top);
    const btn = button('出航', 'hd-btn-gold', () => {
      confirmBox(`带入 ${fmt(t.stake)} 筹码出航。最多赢 ${fmt(liveReturn(t.stake, t.top) - t.stake)}，最多输 ${fmt(t.stake)}（就是带进去的这一份）。今天只有这一趟，确定出航？`, '确定出航', () => {
        mask.remove();
        void startMapLive(id, onClose);
      }, '再想想');
    }, c);
    btn.dataset.tier = id;
    if (rec?.step === 'playing' && run?.state) btn.disabled = true;
    goBtns.push(btn);
  }
  tierFoot(mask, box, onClose);
}

async function startMapLive(tier: LiveTier, onClose: () => void): Promise<void> {
  const r = await mapLive.buyin(tier);
  if (!r.ok) {
    if (r.error === 'need_reload') needReload();
    else toast(mapErr(r.error));
    onClose();
    return;
  }
  onClose();
  openLiveRoute(tier, true);
}
