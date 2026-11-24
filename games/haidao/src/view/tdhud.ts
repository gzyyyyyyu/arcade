import type { TdScene } from './TdScene.ts';
import { trainTdRefresh } from './trainplay.ts';
import { TD_TREASURE } from '../content/index.ts';
import { TD_VET_LOSE_AT } from '../core/tddeep.ts';
import { TD2_BATTERY, TD2_DRAWBRIDGE, TD2_ENEMIES, TD2_FLEET, TD2_HERO_SKILL } from '../content/td2units.ts';
import { heroCd, hookEnabled, tdPreview, tdRoutes, tdCallBonus, tdDareCan, tdNextTide, tdSluiceCan, type WavePreview } from '../core/index.ts';
import { TD2_EVENT } from '../content/td2units.ts';
import { TICKS_PER_SEC } from '../core/types.ts';
import { app, fmt } from './app.ts';
import { iconA, tdE, tdP } from './art.ts';
import { keyBadge } from './inputs.ts';
import { floatText } from './fx.ts';
import { MERGE_MS, pickMerge } from './fxlayout.ts';
import { laneName, planCard, callBonusText, nextStep, openerLeft, stepKey, stepLine, waveEnemies } from './td-ui.ts';
import { injectTdCss } from './tdcss.ts';
import { FOE_KEY, MECH_HINT, MECH_KEY, foeText, isEventMech, mechsOf, navSecs, newFoes, pickHint, type HintItem } from './tdhint.ts';
import { hintCard, readSeen, takeNew } from './hintcard.ts';
import { screen, hallButton, el, img, button, confirmBox, toast } from './ui.ts';
import { EscortView } from './escortview.ts';
import { injectEscortCss } from './escortcss.ts';
import { act, pickSkill, callWave, toggleHero, pressSluice, pickBattery, pressFleet, pressDare, pressDrawbridge } from './tdinput.ts';
import { closeSheet, showBest } from './tdsheet.ts';
import { SKILL } from './tdcommon.ts';
import { finish } from './tdresult.ts';
import { panToGoal, syncGarrisonTags, syncGoalMark, syncPadGuide, twoSteps } from './tdpadguide.ts';
import { syncDrawbridge, syncSluice } from './tdworld.ts';
import { bossOf } from './tdboss.ts';

// ---------------------------------------------------------------- 界面

export function buildUi(bs: TdScene): void {
  injectTdCss();
  bs.ui = screen('hd-td');
  if (bs.d.escort) {
    injectEscortCss();
    bs.esc = new EscortView({ scene: bs, r: bs.r, ui: bs.ui, cc: bs.cc, fit: () => bs.fit, state: () => bs.s, act: (a) => act(bs, a), float: (x, y, t, c, z) => ftx(bs, x, y, t, c, z) });
  }
  hallButton(() => app.leave(), bs.ui);
  const bar = el('div', 'hd-td-bar', undefined, bs.ui);
  const tp = el('div', 'hd-pill', undefined, bar);
  // 宝藏用宝箱图标，不和造塔的金币混（手机上「宝藏」两个字藏起来，只剩图标和 20/20）
  tp.appendChild(img(iconA('treasure'), 22));
  const treasure = el('b', '', '', tp);
  tp.title = '宝藏';
  // 老兵局输的线更低，挂在宝藏旁边，别让人按普通局的线算
  if (bs.s.deep?.vet) {
    el('small', 'hd-td-vetline', `老兵 · 丢 ${TD_VET_LOSE_AT} 枚输`, tp);
    tp.title = `宝藏（老兵局：丢 ${TD_VET_LOSE_AT} 枚就输）`;
  }
  if (bs.esc) tp.style.display = 'none';
  const wp = el('div', 'hd-pill', undefined, bar);
  wp.appendChild(img(iconA('sword'), 22));
  const wave = el('b', '', '', wp);
  bs.esc?.buildBar(bar);
  const bar2 = el('div', 'hd-td-bar2', undefined, bs.ui);
  const gp = el('div', 'hd-pill', undefined, bar2);
  // 局内金币用金币图标，和按钮上「+51 金」、标价一个叫法（只在这一局里用，打完不进仓库）
  gp.appendChild(img(iconA('gold'), 22));
  const gold = el('b', '', '', gp);
  gp.title = '局内金币（造塔用，这一局里有效）';
  const cp = el('div', 'hd-pill', undefined, bar2);
  const count = el('b', '', '', cp);
  const spacer = el('span', '', undefined, bar2);
  spacer.style.flex = '1';
  const flip = (): void => {
    bs.speed = bs.speed >= 4 ? 1 : bs.speed * 2;
    speed.textContent = speedTop.textContent = `${bs.speed}×`;
  };
  // 暂停（P）：守岛压力大时停下来想一想；实盘也能停（服务端只收浏览器报的倍数、不按墙钟卡时限，见 docs/tools-haidao.md 后端一节）
  const pause = button('暂停', 'hd-btn-wood hd-td-pause', () => togglePause(bs), bar2);
  pause.title = '暂停 / 继续（P）';
  const speed = button(`${bs.speed}×`, 'hd-btn-wood hd-td-speed', flip, bar2);
  // 矮竖屏（360×640 一类）底栏一行装不下三个技能钮 + 叫波 + 金币牌 + 加速 + 撤退，加速挪到顶栏的空位（layout.ts），别的尺寸这个钮不显示
  const speedTop = button(`${bs.speed}×`, 'hd-btn-wood hd-td-speedtop', flip, bar);
  // 手机竖屏第二行的木钮都收起（layout.ts），暂停同加速一样在顶栏留一个
  const pauseTop = button('暂停', 'hd-btn-wood hd-td-pausetop', () => togglePause(bs), bar);
  pauseTop.title = '暂停 / 继续（P）';
  // 矮竖屏、平板竖屏护航：预告卡只剩一行、只看不点，图鉴从这颗钮进（layout.ts）；别的尺寸点预告卡进，这颗钮不显示
  const bestBtn = button('图鉴', 'hd-btn-wood hd-best-btn', () => (bs.bestOpen ? closeSheet(bs) : showBest(bs)), bar);
  bestBtn.title = '敌人图鉴和克制表（C）';
  button('撤退', 'hd-btn-red', () => askEnd(bs), bar2);
  const hint = el('div', 'hd-hint', '', bs.ui);
  hint.style.display = 'none';
  // 预告卡：倒数里显示下两波（点开是敌人图鉴和克制表，图鉴开着时暂停）
  bs.edges = el('div', 'hd-td-edges', undefined, bs.ui);
  // 首领粗血条：顶栏下面居中，首领在场才出现（名字 + 粗条；tdboss.ts 挑跟谁）
  const boss = el('div', 'hd-td-boss', undefined, bs.ui);
  boss.setAttribute('aria-hidden', 'true');
  const bossName = el('b', '', '', boss);
  const bossFill = el('i', '', undefined, el('span', 'hd-td-boss-bar', undefined, boss));
  bs.bossUi = { root: boss, name: bossName, fill: bossFill, id: -1, pct: -1 };
  const plan = el('div', 'hd-td-plan', undefined, bs.ui);
  plan.title = '下两波的预告：点开看每一路的敌人和克制表（C）';
  plan.addEventListener('click', () => {
    if (bs.bestOpen) closeSheet(bs);
    else showBest(bs);
  });
  const paused = el('div', 'hd-td-paused', '已暂停 · 关掉面板继续', bs.ui);
  // 战书：下一波有战书时，倒数里浮出一张小卷轴，「接」「不接」两颗钮（默认不接），开打就收起
  let dare: HTMLElement | null = null;
  if (bs.s.happen?.at.some((a) => a.kind === 'dare')) {
    dare = el('div', 'hd-td-dare', undefined, bs.ui);
    dare.appendChild(img(iconA('dare'), 28));
    const tx = el('span', 'hd-td-dare-tx', undefined, dare);
    el('b', '', '战书', tx);
    el('small', '', `敌人多 ${TD2_EVENT.dare.morePct}% · 金币×${TD2_EVENT.dare.goldMul}`, tx);
    button('接', 'hd-btn-gold hd-td-dare-yes', () => pressDare(bs, true), dare);
    button('不接', 'hd-btn-wood hd-td-dare-no', () => pressDare(bs, false), dare);
  }
  const flashEl = el('div', 'hd-td-flash', undefined, bs.ui);
  const bottom = el('div', 'hd-td-bottom', undefined, bs.ui);
  // 英雄钮：先选中英雄，再点地面才走过去（点空地不再直接叫他走，免得到处乱跑）；右键、拖英雄是捷径（tdinput.ts）；快捷键 H，不占数字键
  const heroBtn = button('', 'hd-td-skill hd-btn-wood hd-td-herobtn', () => toggleHero(bs), bottom);
  heroBtn.appendChild(img(iconA('sword'), 28));
  el('b', '', '英雄', heroBtn);
  el('kbd', 'hd-key', 'H', heroBtn);
  heroBtn.title = '指挥英雄：选中后点地面让他过去，再点一次或 Esc 取消（H）；也可以直接右键地面';
  const mkSkill = (label: string, icon: 'barrage' | 'shield' | 'hook' | 'rushFlag' | 'reward', tip: string, f: () => void, n: number): HTMLButtonElement => {
    const b = button('', 'hd-td-skill hd-btn-wood', f, bottom);
    el('span', 'hd-cd', undefined, b);
    b.appendChild(img(iconA(icon), 28));
    el('b', '', label, b);
    keyBadge(b, n);
    b.title = `${tip}（${n}）`;
    return b;
  };
  // 航海士占同样两个位置、同样的快捷键 1、2，冷却也是同两个字段（core/tdnav.ts）
  const nav = !!bs.s.hero.kind;
  const barBtn = nav
    ? mkSkill('急射旗', 'rushFlag', `急射旗：在英雄身边插一面旗，${navSecs('flag')} 秒里旗边的塔打得快一倍`, () => pickSkill(bs, 'flag'), 1)
    : mkSkill('拒马', 'shield', '拒马：在英雄身边的路上放一道栅栏，挡住地面敌人几秒', () => pickSkill(bs, 'barricade'), 1);
  const keg = nav
    ? mkSkill('重赏', 'reward', `重赏：在英雄身边画一个圈，${navSecs('reward')} 秒里倒在圈里的海盗金币翻倍`, () => pickSkill(bs, 'reward'), 2)
    : mkSkill('炸药桶', 'barrage', '炸药桶：扔到英雄身边，炸一小群', () => pickSkill(bs, 'keg'), 2);
  const call = button('', 'hd-btn-gold hd-td-call', () => callWave(bs), bottom);
  call.title = '叫下一波：提前开打，拿金币、技能冷却变短（空格 / 3）';
  keyBadge(call, 3);
  // 章末机制的钮（tdmech.ts）：排在叫波后面、快捷键 4，1–3 的老习惯不变；手机竖屏挤进同一行（layout.ts 的 .hd-td-hasmech）
  let mech: HTMLButtonElement | null = null;
  if (bs.s.sluice) {
    mech = button('', 'hd-td-skill hd-btn-wood hd-td-mech', () => pressSluice(bs), bottom);
    mech.appendChild(img(iconA('sluice'), 28));
    el('b', '', '水闸', mech);
    el('i', 'hd-td-left', '', mech);
    keyBadge(mech, 4);
    mech.title = '潮汐水闸：下一波落潮路要开时关上它，那条路的敌人改走主路；关上后再点一下打开、次数退回（4）';
  }
  if (bs.s.battery) {
    mech = button('', 'hd-td-skill hd-btn-wood hd-td-mech', () => pickBattery(bs), bottom);
    el('span', 'hd-cd', undefined, mech);
    mech.appendChild(img(iconA('battery'), 28));
    el('b', '', '老炮', mech);
    keyBadge(mech, 4);
    mech.title = '岸防老炮：点了再点地面，1 秒后落一发大炸弹，全岛都打得到；打不到飞的（4）';
  }
  if (bs.s.fleet) {
    mech = button('', 'hd-td-skill hd-btn-wood hd-td-mech', () => pressFleet(bs), bottom);
    el('span', 'hd-cd', undefined, mech);
    mech.appendChild(img(iconA('ship'), 28));
    el('b', '', '援船', mech);
    keyBadge(mech, 4);
    mech.title = '友军巡航船：叫一艘船沿着岸边开半圈，朝身边的敌人开炮，海上的炮艇也打得到；60 秒一次（4）';
  }
  if (bs.s.drawbridge) {
    mech = button('', 'hd-td-skill hd-btn-wood hd-td-mech', () => pressDrawbridge(bs), bottom);
    el('span', 'hd-cd', undefined, mech);
    mech.appendChild(img(iconA('drawbridge'), 28));
    el('b', '', '吊桥', mech);
    keyBadge(mech, 4);
    mech.title = '吊桥：切换哪座吊桥放下（另一座收起），冷却 20 秒，桥上的人照走完（4）';
  }
  // 锚钩（英雄 8 级起、只在战役和海盗来袭，core/tdhook.ts）：排在最后，快捷键按 DOM 顺序（有机制钮是 5，没有是 4）；
  // 横屏右下角板里和章末机制钮一样排在炸药桶旁边；手机竖屏那一行没地方了，浮在行尾正上方（layout.ts 的 .hd-td-hashook）
  // 英雄不够级时（战役、海盗来袭里）钮照样摆出来但锁着，写明几级解锁，玩家知道有这个东西可盼
  let hook: HTMLButtonElement | null = null;
  const hookLocked = bs.s.hero.hookReady === undefined;
  // 航海士没有锚钩，也不显示「8 级解锁」的灰钮
  if (!nav && (!hookLocked || hookEnabled(bs.d.setup, TD2_HERO_SKILL.hook.level))) {
    const tip = hookLocked ? `锚钩：英雄 ${TD2_HERO_SKILL.hook.level} 级解锁（军械所升英雄）` : '锚钩：把黄圈里一个敌人钩回来、定住一会儿，正往船上跑的也能钩回来；首领和船钩不动';
    hook = mkSkill('锚钩', 'hook', tip, () => (hookLocked ? toast(tip) : pickSkill(bs, 'hook')), mech ? 5 : 4);
    hook.classList.add('hd-td-mech', 'hd-td-hookbtn');
    if (hookLocked) {
      hook.classList.add('off', 'hd-td-hooklock');
      hook.querySelector('b')!.textContent = `${TD2_HERO_SKILL.hook.level}级`;
    }
  }
  if (mech) bs.ui.classList.add('hd-td-hasmech');
  if (hook) bs.ui.classList.add('hd-td-hashook');
  bs.esc?.buildCtl();
  bs.hud = { treasure, tpill: tp, wave, count, gold, speed, call, keg, bar: barBtn, hero: heroBtn, mech, hook, hint, flash: flashEl, plan, paused, dare };
  updateHud(bs, true);
}

/** 暂停 / 继续：只改画面层要不要往前推（TdScene.update），按钮字跟着换 */
export function togglePause(bs: TdScene): void {
  if (bs.s.over || bs.ended) return;
  bs.userPaused = !bs.userPaused;
  for (const b of bs.ui.querySelectorAll<HTMLElement>('.hd-td-pause, .hd-td-pausetop')) {
    b.textContent = bs.userPaused ? '继续' : '暂停';
    b.classList.toggle('on', bs.userPaused);
  }
}

export function canCall(bs: TdScene): boolean {
  const s = bs.s;
  return (!!s.level.endless || s.wave < s.level.waves.length) && s.next >= 0 && !s.over;
}

/** 登陆路下标 → 北路 / 西路…（落潮路下标 = lanes.length） */
export function laneTitle(bs: TdScene, lane: number): string {
  const lv = bs.s.level;
  const at = lane === lv.lanes.length ? lv.tide?.lane : lv.lanes[lane];
  return at ? laneName(at) : '那条路';
}

export function waveTitle(bs: TdScene, w: number): string {
  return bs.s.level.endless ? `第 ${w + 1} 波` : `第 ${w + 1}/${bs.s.level.waves.length} 波`;
}

/** 预告和路线：开新的一波、墙破了或修好时重算（tdPreview、tdRoutes 都要跑找路，不每帧算） */
function refreshPlan(bs: TdScene, force = false): void {
  const s = bs.s;
  const walls = s.walls.reduce((n, w, i) => (w.destroyed ? n + (i + 1) * 7 : n), 0);
  // 水闸关上 / 打开下一波会改路线和预告
  // 接 / 退战书改下一波的敌人个数
  // 造、卖、升了塔，卡上的下一步要重挑（木台上的塔进签名；翻波不重挑，见 nextStep）
  const sig = `${s.wave}|${walls}|${s.over}|${s.sluice?.shut.length ?? ''}|${s.drawbridge?.down ?? ''}|${s.happen?.dare.length ?? ''}|${stepKey(s)}`;
  if (!force && sig === bs.planSig) return;
  const newWave = !bs.planSig.startsWith(`${s.wave}|`);
  const fresh = bs.planSig !== '' && newWave;
  bs.planSig = sig;
  bs.pv = s.over ? [] : tdPreview(s, 2);
  bs.next = nextStep(bs.next, s, bs.pv);
  if (newWave) foeHint(bs, !fresh);
  bs.plan.set(s, bs.pv, s.over ? [] : tdRoutes(s));
  bs.hudSig = '';
  // 新的一波预告：卡片弹一下，提示"现在该看下一波了"
  if (fresh && bs.hud) {
    bs.hud.plan.classList.remove('fresh');
    void bs.hud.plan.offsetWidth;
    bs.hud.plan.classList.add('fresh');
  }
}

/**
 * 第一次见到的东西弹一张不挡操作的小卡（头像、会干什么、怎么打），每样只讲一次，一次只讲一条（pickHint 排队）：
 * 关内事件提前一波讲（预告里「再下一波」有它时），开局讲这一关的章末机制和航海士，再是这一波第一次来的敌人。
 * 战书那一波倒数里浮着卷轴，卡让开，排到下一波。训练营不弹
 */
function foeHint(bs: TdScene, start: boolean): void {
  const s = bs.s;
  const [p, q] = bs.pv;
  // 训练营有自己的分步横幅，小卡会压住它；这些敌人第一次在战役里遇到时再讲
  if (!p || bs.d.train) return;
  const events = [q?.event, p.event].filter((k): k is NonNullable<WavePreview['event']> => !!k);
  const want: HintItem[] = [
    ...events.map((k) => ({ t: 'm' as const, k })),
    ...(start ? mechsOf(s).filter((k) => !isEventMech(k)) : []).map((k) => ({ t: 'm' as const, k })),
    ...newFoes(waveEnemies(p).map((e) => e.kind), new Set()).map((k) => ({ t: 'f' as const, k })),
  ];
  const r = pickHint(want, bs.hintQ, { m: readSeen(MECH_KEY), f: readSeen(FOE_KEY) }, !!s.happen && tdDareCan(s) !== null);
  bs.hintQ = r.queue;
  const it = r.show;
  if (!it) return;
  takeNew(it.t === 'm' ? MECH_KEY : FOE_KEY, () => [it.k]);
  if (it.t === 'm') {
    const k = it.k;
    const icon = img(k === 'crate' ? tdP('crate') : k === 'cliff' ? tdP('pad') : k === 'fleet' ? iconA('ship') : k === 'nav' ? iconA('rushFlag') : iconA(k), 40);
    hintCard(bs, bs.ui, [{ icon, ...MECH_HINT[k] }], '新玩法');
  } else {
    const f = tdE(it.k, 'walk')[0];
    if (f) hintCard(bs, bs.ui, [{ icon: img(f, 40), name: TD2_ENEMIES[it.k].name, text: foeText(it.k, s.unlocked) }], '新敌人');
  }
  placeHint(bs);
}

/** 右边至少空出这么宽才往右挪（再窄就得折成好几行，不如放到卡下面） */
const HINT_MIN_W = 240;

/**
 * 首次提示卡（顶部居中）躲开预告卡：手机横屏卡片写「差 N」时变宽，提示卡压住它的右端。
 * 卡右边到右侧那一列钮（横屏技能栏、「全景」）之间放得下就挪到右边（不压岛的中间），放不下就挪到卡下面。
 * 提示卡弹出时在播缩放动画（从 0.2 倍起），按布局尺寸（offset*，不含变换）量；预告卡「差 N」变了再量一次
 */
function placeHint(bs: TdScene): void {
  const c = bs.ui.querySelector<HTMLElement>(':scope > .hd-defhint');
  const plan = bs.hud.plan;
  if (!c) return;
  c.style.left = c.style.top = c.style.maxWidth = c.style.transform = '';
  const box = c.offsetParent;
  if (!box || !plan.offsetParent) return;
  const ui = bs.ui.getBoundingClientRect();
  const o = box.getBoundingClientRect();
  // 样式里是 left:50% + translateX(-50%)
  const l = o.left + c.offsetLeft - c.offsetWidth / 2;
  const r = { left: l, right: l + c.offsetWidth, top: o.top + c.offsetTop, bottom: o.top + c.offsetTop + c.offsetHeight };
  const q = plan.getBoundingClientRect();
  if (!(q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top)) return;
  let end = ui.right - 8;
  for (const e of [bs.ui.querySelector<HTMLElement>('.hd-fitbtn'), bs.ui.querySelector<HTMLElement>('.hd-td-bottom')]) {
    const b = e?.offsetParent ? e.getBoundingClientRect() : null;
    if (b && b.left > q.right && b.top < r.bottom && b.bottom > r.top) end = Math.min(end, b.left - 8);
  }
  const w = end - (q.right + 8);
  if (w >= HINT_MIN_W) {
    c.style.left = `${Math.round(q.right + 8 - o.left)}px`;
    c.style.maxWidth = `${Math.floor(w)}px`;
    c.style.transform = 'none';
  } else c.style.top = `${Math.round(q.bottom + 6 - o.top)}px`;
}

export function hintText(bs: TdScene, t: string): void {
  bs.hud.hint.textContent = t;
  bs.hud.hint.style.display = t ? '' : 'none';
}

/** 首领粗血条每拍跟一次：换了首领换名字，血量按整数百分比才改样式 */
function syncBossBar(bs: TdScene): void {
  const B = bs.bossUi;
  if (!B) return;
  const e = bossOf(bs.s.enemies);
  if (!e) {
    if (B.id !== -1) B.root.classList.remove('on');
    B.id = -1;
    return;
  }
  if (e.id !== B.id) {
    B.id = e.id;
    B.pct = -1;
    B.name.textContent = TD2_ENEMIES[e.kind].name;
    B.root.classList.add('on');
  }
  const pct = Math.max(0, Math.ceil((e.hp / e.maxHp) * 100));
  if (pct !== B.pct) {
    B.pct = pct;
    B.fill.style.width = `${pct}%`;
  }
}

export function updateHud(bs: TdScene, force = false): void {
  const s = bs.s;
  // HUD 的内容都由规则状态算出来，状态每拍（50 毫秒）才变一次；一拍里的多个画面帧不用重算签名
  if (!force && s.tick === bs.hudTick && bs.mode === bs.hudMode) return;
  bs.hudTick = s.tick;
  bs.hudMode = bs.mode;
  const h = s.hero;
  syncBossBar(bs);
  refreshPlan(bs);
  syncPadGuide(bs);
  syncGarrisonTags(bs);
  syncGoalMark(bs);
  trainTdRefresh(bs);
  bs.esc?.refresh(bs.pv);
  const total = s.level.waves.length;
  const endless = !!s.level.endless;
  const left = s.next >= 0 ? Math.max(0, Math.ceil((s.next - s.tick) / TICKS_PER_SEC)) : -1;
  const canCallNow = canCall(bs);
  // 叫波的奖励（金币、技能冷却抵扣）由规则核心算，界面只显示
  const cb = canCallNow ? tdCallBonus(s) : { gold: 0, cdCut: 0 };
  const kegCd = Math.max(0, h.kegReady - s.tick);
  const barCd = Math.max(0, (h.barricadeReady ?? 0) - s.tick);
  const hookCd = h.hookReady === undefined ? 0 : Math.max(0, h.hookReady - s.tick);
  // 英雄倒下时两个技能钮写复活倒数（只有一闪而过的横幅的话，锁着的钮看不出为什么、要等多久）
  const downS = h.respawn >= 0 ? Math.max(0, Math.ceil((h.respawn - s.tick) / TICKS_PER_SEC)) : -1;
  const nextTide = tdNextTide(s);
  const nowTide = s.level.tideOpen ? bs.tideOn : null;
  const sluice = s.sluice ? tdSluiceCan(s) : null;
  const dare = s.happen ? tdDareCan(s) : null;
  const batCd = s.battery ? Math.max(0, s.battery.ready - s.tick) : 0;
  const fleetCd = s.fleet ? Math.max(0, s.fleet.ready - s.tick) : 0;
  const fleetOut = !!s.fleet?.sail;
  const dbCd = s.drawbridge ? Math.max(0, s.drawbridge.ready - s.tick) : 0;
  const dbDown = s.drawbridge?.down ?? -1;
  const sig = `${nextTide}|${nowTide}|${sluice}|${dare}|${s.sluice?.left}|${batCd >> 2}|${fleetCd >> 2}|${fleetOut}|${dbCd >> 2}|${dbDown}|${TD_TREASURE - s.lost}|${s.vault}|${s.wave}|${left}|${s.gold}|${cb.gold}|${cb.cdCut >> 4}|${kegCd >> 2}|${barCd >> 2}|${hookCd >> 2}|${downS}|${bs.mode}|${bs.planSig}|${bs.esc?.planSig(bs.pv) ?? ''}`;
  if (!force && sig === bs.hudSig) return;
  bs.hudSig = sig;
  const H = bs.hud;
  // 预告卡：潮水的变化写进第二行
  const ln = s.level.tide ? laneName(s.level.tide.lane) : '那条路';
  const shut = sluice === 'open';
  const tide = shut
    ? `水闸关了：${ln}的敌人改走${laneName(s.level.lanes[0] ?? s.level.tide!.lane)}`
    : nextTide !== null && nowTide !== null ? (nextTide === nowTide ? '' : nextTide ? `落潮：${ln}开通` : `涨潮：${ln}关上`) : '';
  // 预告卡只在预告、倒数秒数、潮水变了时重排（金币、冷却这些每拍在变的不牵动它）
  const after = twoSteps(bs);
  const lit = s.towers.some((t) => t.branch.includes('gunTower.lighthouse'));
  const planKey = `${bs.planSig}|${canCallNow ? left : -1}|${tide}|${after ? 2 : 1}|${lit}|${bs.esc?.planSig(bs.pv) ?? ''}`;
  if (force || planKey !== bs.planKey) {
    bs.planKey = planKey;
    planCard(H.plan, bs.pv, { title: (w) => waveTitle(bs, w), left: canCallNow ? left : -1, tide, laneTitle: (l) => laneTitle(bs, l), opener: openerLeft(s), next: bs.next?.step, after, gold: s.gold, lit, onGoal: () => panToGoal(bs) });
    bs.esc?.decoratePlan(H.plan, bs.pv);
    placeHint(bs);
  }
  // 「差 N」和开头跟着钱每拍变：只改这一格的字，不重排整张卡
  const lead = bs.next?.step && H.plan.querySelector('.hd-plan-lead');
  if (lead) {
    const ln = stepLine(bs.next!.step!, s.gold);
    const short = H.plan.querySelector('.hd-plan-short')!;
    if (lead.textContent !== ln.lead) lead.textContent = ln.lead;
    if (short.textContent !== ln.short) {
      short.textContent = ln.short;
      placeHint(bs);
    }
  }
  // 手机上顶栏放不下"宝藏"两个字（.hd-tw 在窄屏隐藏），只留图标和数字
  H.treasure.textContent = '';
  el('span', 'hd-tw', '宝藏 ', H.treasure);
  H.treasure.append(`${TD_TREASURE - s.lost}/${TD_TREASURE}`);
  // 大潮无尽、海盗来袭：波数没有尽头，顶栏写"打到第几波"（已经开打的最后一波），结算再写"撑过几波"（打完的）
  const waveKey = endless ? (s.wave > 0 ? `打到第 ${s.wave} 波` : '第 1 波待开') : `${s.wave}/${total} 波`;
  if (H.wave.dataset.k !== waveKey) {
    H.wave.dataset.k = waveKey;
    H.wave.textContent = '';
    if (!endless) {
      // 手机上「已来」收起（td-ui.ts 的 .hd-wave-pre）：牌宽不够时最后一个字会被右邻牌盖住
      el('span', 'hd-wave-pre', '已来 ', H.wave);
    }
    H.wave.append(waveKey);
  }
  H.gold.textContent = fmt(s.gold);
  H.count.textContent = !endless && s.wave >= total ? '最后一波' : left >= 0 ? `下一波 ${left}秒` : '';
  H.call.disabled = !canCallNow;
  const lab = H.call.querySelector('span') ?? el('span', '', '', H.call);
  lab.textContent = canCallNow ? (s.wave === 0 ? '叫第 1 波' : '叫下一波') : s.over ? '这局结束了' : '没有更多波次';
  let sub = H.call.querySelector('small');
  if (canCallNow) {
    sub ??= el('small', '', '', H.call);
    const bonus = callBonusText(cb.gold, cb.cdCut);
    const text = s.wave === 0 ? (bonus ? `先造塔 · ${bonus}` : '先造塔，再开打') : bonus || '倒数到了自动来';
    // 副文字单行：「技能快 N 秒」那段单独包起来，窄按钮（手机横屏右下角那块板）上收起，整句放 title
    if (sub.dataset.t !== text) {
      sub.dataset.t = text;
      sub.textContent = '';
      const i = text.indexOf(' · 技能快');
      if (i < 0) sub.textContent = text;
      else {
        sub.append(text.slice(0, i));
        el('span', 'hd-call-cd', text.slice(i), sub);
      }
      H.call.title = `叫下一波：提前开打，拿金币、技能冷却变短（空格 / 3）。${text}`;
    }
  } else sub?.remove();
  const ring = (b: HTMLElement, cd: number, total: number, label: string): void => {
    const t = b.querySelector('b')!;
    b.style.setProperty('--cd', `${Math.round((Math.min(cd, total) / total) * 360)}deg`);
    b.classList.toggle('cool', cd > 0 && downS < 0);
    b.classList.toggle('off', downS >= 0);
    t.textContent = downS >= 0 ? `复活 ${downS}秒` : cd > 0 ? `${Math.ceil(cd / TICKS_PER_SEC)}秒` : label;
  };
  // 冷却扫光的总长按这一局的冷却算（大潮英雄周减半）
  if (h.kind) {
    ring(H.bar, barCd, heroCd(s, SKILL.flag.cd), '急射旗');
    ring(H.keg, kegCd, heroCd(s, SKILL.reward.cd), '重赏');
  } else {
    ring(H.bar, barCd, heroCd(s, SKILL.barricade.cd), '拒马');
    ring(H.keg, kegCd, heroCd(s, SKILL.bomb.cd), '炸药桶');
  }
  H.hero.classList.toggle('sel', bs.heroSel);
  H.hero.classList.toggle('off', downS >= 0);
  H.keg.classList.toggle('sel', bs.mode === 'keg' || bs.mode === 'reward');
  H.bar.classList.toggle('sel', bs.mode === 'barricade' || bs.mode === 'flag');
  if (H.hook && h.hookReady !== undefined) {
    ring(H.hook, hookCd, heroCd(s, SKILL.hook.cd), '锚钩');
    H.hook.classList.toggle('sel', bs.mode === 'hook');
  }
  if (H.dare) {
    H.dare.classList.toggle('on', dare !== null && s.next >= 0);
    H.dare.classList.toggle('taken', dare === 'drop');
  }
  if (H.mech && s.sluice) {
    // 已经关上下一波：钮亮起写「已关闸」（再点打开）；这一波按了没用（不落潮、用完了）就灰掉
    H.mech.classList.toggle('sel', shut);
    H.mech.classList.toggle('off', sluice === null);
    H.mech.querySelector('b')!.textContent = shut ? '已关闸' : '水闸';
    H.mech.querySelector('.hd-td-left')!.textContent = String(s.sluice.left);
    syncSluice(bs, shut);
  }
  if (H.mech && s.battery) {
    // 老炮和英雄技能同一套冷却扫光，但不跟英雄倒下（炮台不是英雄扔的）
    H.mech.style.setProperty('--cd', `${Math.round((Math.min(batCd, TD2_BATTERY.cd) / TD2_BATTERY.cd) * 360)}deg`);
    H.mech.classList.toggle('cool', batCd > 0);
    H.mech.classList.toggle('sel', bs.mode === 'battery');
    H.mech.querySelector('b')!.textContent = batCd > 0 ? `${Math.ceil(batCd / TICKS_PER_SEC)}秒` : '老炮';
  }
  if (H.mech && s.fleet) {
    // 船在海上时钮亮着写「出海中」，回航后才转冷却扫光
    H.mech.style.setProperty('--cd', `${Math.round((Math.min(fleetCd, TD2_FLEET.cd) / TD2_FLEET.cd) * 360)}deg`);
    H.mech.classList.toggle('cool', fleetCd > 0 && !fleetOut);
    H.mech.classList.toggle('sel', fleetOut);
    H.mech.querySelector('b')!.textContent = fleetOut ? '出海中' : fleetCd > 0 ? `${Math.ceil(fleetCd / TICKS_PER_SEC)}秒` : '援船';
  }
  if (H.mech && s.drawbridge) {
    H.mech.style.setProperty('--cd', `${Math.round((Math.min(dbCd, TD2_DRAWBRIDGE.cd) / TD2_DRAWBRIDGE.cd) * 360)}deg`);
    H.mech.classList.toggle('cool', dbCd > 0);
    H.mech.classList.toggle('sel', s.drawbridge.down === 1);
    H.mech.querySelector('b')!.textContent = dbCd > 0 ? `${Math.ceil(dbCd / TICKS_PER_SEC)}秒` : '吊桥';
    syncDrawbridge(bs);
  }
}

/** 顶栏下面正中的"被带走了 -N"：1.2 秒内的累加成一条，过后淡出 */
export function stolenNote(bs: TdScene, n: number): void {
  bs.stolen += n;
  if (!bs.stolenEl?.isConnected) bs.stolenEl = el('span', 'hd-td-stolen', undefined, bs.ui);
  bs.stolenEl.textContent = `被带走了 -${bs.stolen}`;
  bs.stolenEl.classList.remove('off');
  bs.stolenTimer?.remove();
  bs.stolenTimer = bs.time.delayedCall(1200, () => {
    bs.stolen = 0;
    bs.stolenEl?.classList.add('off');
  });
}

export function ftx(bs: TdScene, wx: number, wy: number, str: string, color = '#ffe885', size = 18): void {
  const W = bs.scale.width / bs.r;
  const H = bs.scale.height / bs.r;
  const sp = bs.cc.toScreen(wx, wy);
  const z = bs.cc.z;
  const padX = Math.min(70, W * 0.12);
  const top = 130 + 8;
  const bot = H - 160;
  const sx = Math.min(W - padX, Math.max(padX, sp.x));
  const sy = Math.min(bot, Math.max(top, sp.y));
  const x = wx + (sx - sp.x) / z;
  const y = wy + (sy - sp.y) / z;
  const m = /^(.*?)(-?\d+)$/.exec(str);
  const now = performance.now();
  const rec = bs.ftRecent;
  // 过期的、字已经飘完的先清掉（最多十几个，线性扫）
  for (let i = rec.length - 1; i >= 0; i--) if (now - rec[i]!.t >= MERGE_MS || !rec[i]!.txt.active) rec.splice(i, 1);
  const key = m ? m[1] + '|' + color : '';
  if (m) {
    const i = pickMerge(rec, key, x, y, now, z);
    if (i >= 0) {
      const old = rec[i]!;
      old.n += Number(m[2]);
      old.txt.setText(`${m[1]}${old.n}`);
      old.t = now;
      return;
    }
  }
  // 不同类的字在同处：按已有数量往上错开
  let near = 0;
  for (const o of rec) if (Math.hypot(o.x - x, o.y - y) * z < 40) near++;
  const yy = y - near * 16 / z;
  const t = floatText(bs, bs.r, z, x, yy, str, color, size);
  if (m) rec.push({ key, t: now, x, y: yy, n: Number(m[2]), txt: t });
}

export function banner(bs: TdScene, title: string, sub = '', boss = false): void {
  const b = el('div', `hd-td-banner${boss ? ' boss' : ''}`, undefined, bs.ui);
  el('span', '', title, b);
  if (sub) el('small', '', sub, b);
  setTimeout(() => b.remove(), 950);
}

export function askEnd(bs: TdScene): void {
  if (bs.ended) return;
  const msg = bs.d.escortLive
    ? '现在撤退？商船到不了港，按已经走过的路带回筹码。'
    : bs.d.escort
    ? '现在撤退？商船到不了港，不拿奖励。'
    : bs.d.live
    ? '现在撤退？这局算宝藏被抢光，按撑过的波数带回筹码。'
    : bs.d.tide
      ? '现在撤退？这局到此为止，按撑过的波数记成绩。'
      : bs.d.home
        ? '现在撤退？这局到此为止，按撑住的波数给奖励。'
        : '现在撤退？这局算宝藏被抢光，不拿奖励。';
  bs.askingEnd = true;
  confirmBox(msg, '撤退', () => {
    bs.askingEnd = false;
    bs.retreated = true;
    bs.s.lost = TD_TREASURE;
    bs.s.over = true;
    finish(bs);
  }, '继续守', () => {
    bs.askingEnd = false;
  });
}

/**
 * 「已暂停」横幅躲开预告卡和「全景」钮：和谁叠着就挪到它下面（手机竖屏「全景」钮在右上，横幅原来的位置正压住它的下半截；
 * 预告卡行数跟着敌人和护甲变，写死的位置总有压住的时候）。只在暂停时、每 300 毫秒量一次
 */
export function placePaused(bs: TdScene): void {
  const p = bs.hud.paused;
  p.style.top = '';
  p.style.right = '';
  const ui = bs.ui.getBoundingClientRect();
  const r = p.getBoundingClientRect();
  let top = r.top;
  // 电脑上塔面板摆在右上、竖屏「新敌人」卡在右上，都会盖住横幅：一起让开
  const blocks = [bs.hud.plan, ...bs.ui.querySelectorAll<HTMLElement>('.hd-fitbtn, .hd-td-sheet, .hd-defhint')].filter((e): e is HTMLElement => !!e?.offsetParent).map((e) => e.getBoundingClientRect());
  // 挪到一个下面后可能又碰上另一个：最多再查两轮
  for (let k = 0; k < 3; k++) {
    for (const q of blocks) if (q.left < r.right && q.right > r.left && q.top < top + r.height && q.bottom > top) top = q.bottom + 6;
  }
  if (top + r.height <= ui.bottom - 8) {
    if (top !== r.top) p.style.top = `${Math.round(top - ui.top)}px`;
    return;
  }
  // 下面没地方（电脑上塔面板几乎占满右侧整列）：高度不动，挪到挡住它的东西左边
  const edge = Math.min(...blocks.filter((q) => q.top < r.bottom && q.bottom > r.top && q.left < r.right && q.right > r.left).map((q) => q.left));
  if (Number.isFinite(edge)) p.style.right = `${Math.round(ui.right - edge + 8)}px`;
}

