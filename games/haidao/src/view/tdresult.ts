import type { TdScene } from './TdScene.ts';
import { TD_TREASURE } from '../content/index.ts';
import { tdResult, settleTd, tdCampaign, settleTdHome, type IsoWeek, weekLabel, tideScore, tideLine, tideBoardId } from '../core/index.ts';
import { recordTide, submitTide } from '../net/tide.ts';
import { showTdLiveResult } from './live.ts';
import { showEscortLiveResult } from './livemore.ts';
import { app, fmt } from './app.ts';
import { bTex, iconA } from './art.ts';
import { flyIcons } from './fx.ts';
import { vibrate, feelOn } from './feel.ts';
import { dayIndex } from './meta.ts';
import { tdVerdict, dropStars, HOME_ID, hardMore } from './td-ui.ts';
import { sfx } from './audio/sfx.ts';
import { playBeats } from './audio/beats.ts';
import { resultBeats, resultTimes } from './audio/result.ts';
import { openModal, el, img, button } from './ui.ts';
import { escortResultOf, settleEscort, ESCORT_LEVELS, escortUnlocked } from './escortapi.ts';
import { resultTitle, resultBig, resultLine } from './escorttext.ts';
import { ESCORT_DIFFS } from '../core/escorttypes.ts';
import { closeSheet } from './tdsheet.ts';
import { tdReason, escortReason, lostAtText, lostTreasureText } from './tdreason.ts';
import { tdEnd } from './endfx.ts';

/** 结算框里的「原因 + 关键时刻」两行（样式限定在 .hd-td-result 下） */
function reasonLines(bs: TdScene, box: HTMLElement, res: ReturnType<typeof tdResult>): void {
  const towers = bs.s.towers.map((t) => ({ kind: t.kind, branch: t.branch }));
  const r = tdReason(bs.reasonLog, res, { gold: bs.s.gold, towers, wave: bs.s.wave, unlocked: bs.s.unlocked });
  el('p', 'hd-sub hd-td-line hd-td-why', r.line, box);
  if (r.key) el('p', 'hd-sub hd-td-line hd-td-key', r.key, box);
  if (r.idle) el('p', 'hd-sub hd-td-line hd-td-idle', r.idle, box);
}

// ---------------------------------------------------------------- 结算

/** 收尾演出的时长（游戏时钟）：战役关、护航、悬赏、大潮、海盗来袭都先演收尾再弹窗（以前后四种直接弹，输的那一下和结算框同一帧） */
const END_FX_MS = 850;
/** 按每局的规则状态记（不按场景）：Phaser 的场景实例「再守一次」、换关时复用，按场景记的话第二局起结算框永远不出 */
const fxStarted = new WeakSet<object>();

/** 结束后要先演多久收尾：TdScene 把原来结束后的等待减掉这段，弹窗总时间和以前一样 */
export function endFxLead(): number {
  return feelOn() ? END_FX_MS : 0;
}

export function finish(bs: TdScene): void {
  if (bs.ui.querySelector('.hd-td-result') || fxStarted.has(bs.s)) return;
  bs.ended = true;
  closeSheet(bs);
  if (endFxLead() > 0) {
    fxStarted.add(bs.s);
    // 赢 = 礼花，输 = 镜头推到海盗定格；护航按商船到没到港算
    const win = bs.d.escort ? escortResultOf(bs.s).arrived : tdResult(bs.s).stars > 0;
    if (tdEnd(bs, win, END_FX_MS, () => settle(bs))) return;
  }
  settle(bs);
}

function settle(bs: TdScene): void {
  if (bs.ui.querySelector('.hd-td-result')) return;
  const res = tdResult(bs.s);
  if (bs.d.escort) {
    finishEscort(bs, res);
    return;
  }
  if (bs.d.live) {
    // 悬赏局：只结筹码，不动自己的存档（没有守岛收入、不记星数）
    playBeats(resultBeats({ kind: 'td', stars: res.stars, win: res.stars > 0, roll: false }), () => bs.ui.isConnected);
    vibrate(res.stars > 0 ? 'win' : 'lose');
    app.api.scene = 'result';
    void showTdLiveResult(bs.d.live.tier, res);
    return;
  }
  if (bs.d.tide) {
    finishTide(bs, res, bs.d.tide.week);
    return;
  }
  if (bs.d.home) {
    finishHome(bs, res);
    return;
  }
  const r = settleTd(app.profile, bs.d.levelId, res, dayIndex());
  const before = { ...app.profile.res };
  if (r.ok) app.commit(r.value.profile);
  const rw = r.ok ? r.value.reward : null;
  const win = res.stars > 0;
  const tm = resultTimes('td', res.stars, win);
  playBeats(resultBeats({ kind: 'td', stars: res.stars, win, roll: false }), () => bs.ui.isConnected);
  vibrate(win ? 'win' : 'lose');
  let main: HTMLButtonElement | undefined;
  const mask = openModal({ cls: res.stars >= 3 ? 'hd-s3' : '', closable: false, onEsc: () => main?.click(), parent: bs.ui });
  const box = el('div', `hd-dialog hd-td-result${res.stars === 0 ? ' hd-lose' : ''}`, undefined, mask);
  // 入场节奏同登陆战（样式在 skin.ts，时间点和声音共用 audio/result.ts）：星星落完淡入战利品，飞进仓库之后按钮淡入
  box.style.setProperty('--sd', `${tm.sd}ms`);
  box.style.setProperty('--fin', `${tm.fin}ms`);
  el('h2', '', tdVerdict(res.stars, res.lost), box);
  dropStars(box, res.stars, 44, tm.starAt);
  const kept = el('div', 'hd-td-kept', undefined, box);
  kept.appendChild(img(bTex('treasure', 1), 36));
  if (res.stars === 0) {
    el('span', '', lostTreasureText(res.lost), kept);
    el('p', 'hd-sub hd-td-line', lostAtText(bs.s.wave), box);
  } else {
    const kn = el('span', '', '守住宝藏 ', kept);
    el('b', 'hd-n', `${TD_TREASURE - res.lost}/${TD_TREASURE}`, kn);
    el('p', 'hd-sub hd-td-line', `撑过 ${res.waves}/${res.total} 波`, box);
  }
  reasonLines(bs, box, res);
  if (rw) {
    loot(bs, mask, box, before, { gold: rw.gold, wood: rw.wood }, { gold: rw.bonusGold, wood: rw.bonusWood }, tm.flyAt);
    if (rw.newStars > 0) bonusLine(bs, box, rw.bonusGold, rw.bonusWood);
    capNotes(box, rw, '今天的守岛收入已满，这局只拿星');
    // 第四章全部过关：送纪念装饰（在收藏里摆到岛上）
    if (rw.wheel) el('p', 'hd-sub hd-td-line hd-pos', '远洋通关！得到装饰「海盗王的舵轮」，在收藏里摆到岛上', box);
    if (rw.unlocked) {
      const nm = tdCampaign().find((l) => l.id === rw.unlocked)?.name ?? '';
      el('p', 'hd-sub hd-td-line', `新解锁：${nm}`, box);
    }
  }
  const btns = el('div', 'hd-td-btns', undefined, box);
  button('回岛', 'hd-btn-plain', () => app.goBase(), btns);
  main = button('再守一次', 'hd-btn-gold', () => app.startTdLevel(bs.d.levelId), btns);
  const camp = tdCampaign();
  const idx = camp.findIndex((l) => l.id === bs.d.levelId);
  const nx = idx >= 0 ? camp[idx + 1] : undefined;
  // 这一局宝藏被抢光（0 星）不给"下一关"：只有这局守住了才往下走（以前的星数不算）
  if (nx && r.ok && res.stars >= 1 && (r.value.profile.td?.stars[bs.d.levelId] ?? 0) >= 1) button('下一关', 'hd-btn-gold', () => app.startTdLevel(nx.id), btns);
  app.api.scene = 'result';
}

/** 结算里"首次拿星奖励"一行：数字右对齐等宽，增量标绿 */
export function bonusLine(_bs: TdScene, box: HTMLElement, gold: number, wood: number): void {
  const p = el('p', 'hd-sub hd-td-line', '首次拿星奖励：金币 ', box);
  el('b', 'hd-n hd-pos', `+${fmt(gold)}`, p);
  p.append('  木材 ');
  el('b', 'hd-n hd-pos', `+${fmt(wood)}`, p);
  p.append('（不占每日上限）');
}

/**
 * 结算的战利品：一行金币木材（got），extra 是不占上限另给的（首次拿星），flyAt 时一起飞进顶上的仓库条、数字跟着涨。
 * before 是结算前仓库里的数。
 */
export function loot(_bs: TdScene, mask: HTMLElement, box: HTMLElement, before: { gold: number; wood: number }, got: { gold: number; wood: number }, extra: { gold: number; wood: number }, flyAt: number): void {
  const row = el('div', 'hd-loot', undefined, box);
  const mk = (k: 'gold' | 'wood', n: number): HTMLElement | null => {
    if (n <= 0) return null;
    const sp = el('span', '', undefined, row);
    sp.style.cssText = 'display:inline-flex;align-items:center;gap:4px';
    sp.appendChild(img(iconA(k), 26));
    el('b', 'hd-n hd-pos', `+${fmt(n)}`, sp);
    return sp;
  };
  const g = mk('gold', got.gold);
  const w = mk('wood', got.wood);
  const store = el('div', 'hd-td-store', undefined, mask);
  const tot = { gold: before.gold, wood: before.wood };
  const sg = el('span', '', undefined, store);
  sg.appendChild(img(iconA('gold'), 20));
  const sgn = el('b', 'hd-n', fmt(tot.gold), sg);
  const sw = el('span', '', undefined, store);
  sw.appendChild(img(iconA('wood'), 20));
  const swn = el('b', 'hd-n', fmt(tot.wood), sw);
  const land = (k: 'gold' | 'wood', n: number, from: HTMLElement): void => {
    if (n <= 0) return;
    const rc = from.getBoundingClientRect();
    const to = k === 'gold' ? sg : sw;
    flyIcons(mask, { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 }, to, () => img(iconA(k), 22), 5, () => {
      tot[k] += n;
      (k === 'gold' ? sgn : swn).textContent = fmt(tot[k]);
      store.classList.remove('bump');
      void store.offsetWidth;
      store.classList.add('bump');
      sfx('coin');
    });
  };
  setTimeout(() => {
    land('gold', got.gold + extra.gold, g ?? row);
    land('wood', got.wood + extra.wood, w ?? row);
  }, flyAt);
}

/**
 * 护航的结算：复用守岛的结算演出（星星、战利品飞进仓库条），标题到港 / 沉没 / 误了潮，大数字是船剩的血量百分比，
 * 下面一行"X 星 · 走了 N 格 · 修了 M 次"；奖励由 settleEscort 按每日上限截过。
 */
export function finishEscort(bs: TdScene, res: ReturnType<typeof tdResult>): void {
  const er = { ...escortResultOf(bs.s), retreated: bs.retreated };
  if (bs.d.escortLive) {
    // 护航实盘：只结筹码，不动自己的存档（没有金币木材、不记星数）；撤退 / 误了潮按走过的格数折算
    const win = er.arrived && er.stars > 0;
    playBeats(resultBeats({ kind: 'td', stars: er.stars, win, roll: false }), () => bs.ui.isConnected);
    vibrate(win ? 'win' : 'lose');
    app.api.scene = 'result';
    void showEscortLiveResult(bs.d.escortLive.tier, er);
    return;
  }
  const r = settleEscort(app.profile, bs.d.levelId, res, dayIndex());
  const before = { ...app.profile.res };
  if (r.ok) app.commit(r.value.profile);
  const rw = r.ok ? r.value.reward : null;
  const win = er.arrived && er.stars > 0;
  const tm = resultTimes('td', er.stars, win);
  playBeats(resultBeats({ kind: 'td', stars: er.stars, win, roll: false }), () => bs.ui.isConnected);
  vibrate(win ? 'win' : 'lose');
  let main: HTMLButtonElement | undefined;
  const mask = openModal({ cls: er.stars >= 3 ? 'hd-s3' : '', closable: false, onEsc: () => main?.click(), parent: bs.ui });
  const box = el('div', `hd-dialog hd-td-result hd-esc-result${win ? '' : ' hd-lose'}`, undefined, mask);
  box.style.setProperty('--sd', `${tm.sd}ms`);
  box.style.setProperty('--fin', `${tm.fin}ms`);
  el('h2', '', resultTitle(er), box);
  el('p', 'hd-esc-big', resultBig(er.hullPct), box);
  el('p', 'hd-esc-bigsub', '商船剩余血量', box);
  dropStars(box, er.stars, 44, tm.starAt);
  el('p', 'hd-sub hd-td-line', resultLine(er), box);
  const why = escortReason(er, bs.reasonLog.bites, bs.s.escort?.def.hull ?? 0);
  el('p', 'hd-sub hd-td-line hd-td-why', why.line, box);
  if (why.key) el('p', 'hd-sub hd-td-line hd-td-key', why.key, box);
  if (rw) {
    loot(bs, mask, box, before, { gold: rw.gold, wood: rw.wood }, { gold: rw.bonusGold, wood: rw.bonusWood }, tm.flyAt);
    if (rw.newStars > 0) bonusLine(bs, box, rw.bonusGold, rw.bonusWood);
    capNotes(box, rw, '今天的守岛收入已满，这局只拿星');
  }
  const btns = el('div', 'hd-td-btns', undefined, box);
  button('回岛', 'hd-btn-plain', () => app.goBase(), btns);
  main = button('再护一次', 'hd-btn-gold', () => app.startTdLevel(bs.d.levelId), btns);
  // 到港了且下一档难度解锁了，给一个"试试高一档"
  const cur = ESCORT_LEVELS.find((l) => l.id === bs.d.levelId);
  const nd = cur ? ESCORT_DIFFS[ESCORT_DIFFS.indexOf(cur.diff) + 1] : undefined;
  const nx = cur && nd ? ESCORT_LEVELS.find((l) => l.map === cur.map && l.diff === nd) : undefined;
  if (nx && r.ok && er.arrived && escortUnlocked(r.value.profile, nx.id)) button('试试高一档', 'hd-btn-gold', () => app.startTdLevel(nx.id), btns);
  app.api.scene = 'result';
}

/**
 * 海盗来袭的结算：不算星，按撑住的波数给金币木材（settleTdHome 按每日上限截过，和关卡共用上限），
 * 演出用大潮那一套（没星星；撑过 5 波算"守得不错"，不到 5 波是失败的灰蓝横幅）。
 */
export function finishHome(bs: TdScene, res: ReturnType<typeof tdResult>): void {
  const before = { ...app.profile.res };
  const r = settleTdHome(app.profile, res, dayIndex(), bs.d.setup.home);
  if (r.ok) app.commit(r.value.profile);
  const rw = r.ok ? r.value.reward : null;
  const waves = rw?.waves ?? res.waves;
  const win = waves >= 5;
  const tm = resultTimes('td', 0, win);
  playBeats(resultBeats({ kind: 'td', stars: 0, win, roll: false }), () => bs.ui.isConnected);
  vibrate(win ? 'win' : 'lose');
  let main: HTMLButtonElement | undefined;
  const mask = openModal({ closable: false, onEsc: () => main?.click(), parent: bs.ui });
  const box = el('div', `hd-dialog hd-td-result hd-home-result${win ? '' : ' hd-lose'}`, undefined, mask);
  box.style.setProperty('--sd', `${tm.sd}ms`);
  box.style.setProperty('--fin', `${tm.fin}ms`);
  const hard = rw?.hard ?? bs.d.setup.home?.hard === true;
  const h2 = el('h2', '', `撑住 ${waves} 波`, box);
  if (hard) el('span', 'hd-home-hardtag', '加难', h2);
  if (bs.s.wave > waves) el('p', 'hd-sub hd-td-line', `打到第 ${bs.s.wave} 波时结束，守住了前 ${waves} 波`, box);
  el('p', 'hd-td-kept', `击退 ${res.kills ?? 0} 个海盗`, box);
  reasonLines(bs, box, res);
  if (rw && rw.gold + rw.wood > 0) loot(bs, mask, box, before, { gold: rw.gold, wood: rw.wood }, { gold: 0, wood: 0 }, tm.flyAt);
  if (rw && (rw.capped || rw.full)) capNotes(box, rw, '今天的守岛收入已满，这局不发金币木材');
  else if (rw && rw.gold + rw.wood === 0) el('p', 'hd-sub hd-td-line', '一波都没撑住，没有奖励', box);
  el('p', 'hd-sub hd-td-line', hard ? `加难档：每撑住一波的奖励多 ${hardMore()} 成，照样算进今日守岛收入` : '海盗来袭不算星：撑得越久，奖励越多', box);
  const btns = el('div', 'hd-td-btns', undefined, box);
  button('回岛', 'hd-btn-plain', () => app.goBase(), btns);
  main = button('再守一次', 'hd-btn-gold', () => app.startTdLevel(HOME_ID), btns);
  app.api.scene = 'result';
}

/**
 * 大潮无尽的结算：不发金币木材、不记星数，只记本机本周最好并往平台每周榜交一次分。
 * 周按开局那一周算（跨周一 0 点结束的局也交开局那周，平台一天内还收上周）。finish 有"已有结算框就不再进"的闸，所以只交一次。
 */
export function finishTide(bs: TdScene, res: ReturnType<typeof tdResult>, week: IsoWeek): void {
  const label = weekLabel(week);
  const score = tideScore(res.waves, res.kills ?? 0);
  const rec = recordTide(label, score);
  const win = res.waves >= 5;
  const tm = resultTimes('td', 0, win);
  playBeats(resultBeats({ kind: 'td', stars: 0, win, roll: false }), () => bs.ui.isConnected);
  vibrate(win ? 'win' : 'lose');
  let main: HTMLButtonElement | undefined;
  const mask = openModal({ closable: false, onEsc: () => main?.click(), parent: bs.ui });
  const box = el('div', `hd-dialog hd-td-result hd-tide-result${win ? '' : ' hd-lose'}`, undefined, mask);
  box.style.setProperty('--sd', `${tm.sd}ms`);
  box.style.setProperty('--fin', `${tm.fin}ms`);
  el('h2', '', `撑过 ${res.waves} 波`, box);
  // 顶栏写的是"打到第几波"（最后开打的那波，已经开打但没守完），这里补一句，两个数字就对得上
  if (bs.s.wave > res.waves) el('p', 'hd-sub hd-td-line', `打到第 ${bs.s.wave} 波时结束，守住了前 ${res.waves} 波`, box);
  el('p', 'hd-td-kept', `击退 ${res.kills ?? 0} 个敌人`, box);
  reasonLines(bs, box, res);
  el('p', 'hd-sub hd-td-line', `本周最好：${tideLine(rec.best)}`, box);
  const note = el('p', 'hd-sub hd-td-line hd-tide-note', '', box);
  note.dataset.state = 'pending';
  void submitTide(tideBoardId(week), score).then((r) => {
    if (r.state === 'ok') {
      note.dataset.state = r.improved ? 'new' : 'ok';
      note.textContent = r.improved ? '新纪录！已上榜' : `已交分，榜上你最好是${tideLine(r.best)}`;
      if (r.improved) sfx('star');
    } else if (r.state === 'busy') {
      note.dataset.state = 'busy';
      note.textContent = '榜单忙，成绩没交上';
      note.classList.add('cap');
    } else {
      note.dataset.state = 'skip';
      note.textContent = rec.improved ? '本周新纪录！（登录后能上周榜）' : '';
    }
  });
  el('p', 'hd-sub hd-td-line', '大潮不发金币木材，只上周榜', box);
  const btns = el('div', 'hd-td-btns', undefined, box);
  button('回岛', 'hd-btn-plain', () => app.goBase(), btns);
  main = button('再守一次', 'hd-btn-gold', () => app.startTdTide(), btns);
  app.api.scene = 'result';
}

/** 少发了的原因：今天的守岛收入到顶（allCapped 是一点没发时的说法），或者仓库装不下 */
function capNotes(box: HTMLElement, rw: { gold: number; wood: number; capped: boolean; full: boolean }, allCapped: string): void {
  if (rw.capped) el('p', 'hd-sub hd-td-line cap', rw.gold + rw.wood === 0 ? allCapped : '到今天的守岛收入上限了，多出的部分没有发放', box);
  else if (rw.full) el('p', 'hd-sub hd-td-line cap', '仓库满了，装不下的没有发放（升级金库、木料仓能装更多）', box);
}
