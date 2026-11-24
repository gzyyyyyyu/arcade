import type { TdScene } from './TdScene.ts';
import { pickHookTarget } from './tdhookfx.ts';
import { type TdAction, TD2_ECON, tdDareCan, tdSluiceCan } from '../core/index.ts';
import { UNIT } from '../core/types.ts';
import { tdP } from './art.ts';
import { put } from './ground.ts';
import { unIso } from './iso.ts';
import { sfx } from './audio/sfx.ts';
import { toast } from './ui.ts';
import { DEPTH } from './depth.ts';
import { type Act, SKILL } from './tdcommon.ts';
import { hintText, updateHud, ftx } from './tdhud.ts';
import { rallyOk } from '../core/tdcamp.ts';
import { closeSheet, showSlot } from './tdsheet.ts';
import { drawSlotDiamond, slotAt } from './tdpick.ts';
import { crateAt } from './tdworld.ts';

// ---------------------------------------------------------------- 操作

export function act(bs: TdScene, a: Act): void {
  bs.pending.push({ ...a, t: bs.s.tick } as TdAction);
}

/** 触屏（手指）：提示里不提 Esc、右键，改说按住拖 */
function touchUi(): boolean {
  return !!window.matchMedia?.('(pointer: coarse)').matches;
}

/** 取消：技能瞄准、英雄选中、走过去再放的技能、关面板 */
export function cancelAll(bs: TdScene): void {
  if (bs.s.over) return;
  bs.skillQ = null;
  if (bs.heroSel) setHeroSel(bs, false);
  if (bs.mode !== 'none') {
    bs.mode = 'none';
    bs.hintTimer?.remove();
    hintText(bs, '');
    updateHud(bs, true);
  }
  closeSheet(bs);
}

/** 鼠标悬停：指到的木台（含高塔的塔身）画金色 2×2 占地菱形 */
export function hover(bs: TdScene, wx: number, wy: number): void {
  const si = slotAt(bs, wx, wy) ?? -1;
  // 塔升级换图后外观会变，同一块台也重画一次开销很小；这里只在换台时重画
  if (si === bs.hoverSlot) return;
  bs.hoverSlot = si;
  bs.input.setDefaultCursor(si >= 0 ? 'pointer' : 'default');
  drawSlotDiamond(bs, si, false);
}

/** 按下（手机没有悬停）：先把这一下会选中的木台画出来，拖开或抬起时由 wx 为 NaN 清掉 */
export function press(bs: TdScene, wx: number, wy: number): void {
  const si = slotAt(bs, wx, wy) ?? -1;
  bs.hoverSlot = -2;
  drawSlotDiamond(bs, si, true);
}

export function callWave(bs: TdScene): void {
  if (bs.s.over) return;
  act(bs, { type: 'call' });
}

/** 战书：take 接、否则不接；和现在的状态一样就不发命令（规则核心 tdDareCan 判） */
export function pressDare(bs: TdScene, take: boolean): void {
  const can = tdDareCan(bs.s);
  if (bs.s.over || !can || (can === 'take') !== take) return;
  sfx(take ? 'coin' : 'tap');
  act(bs, { type: 'dare' });
}

/** 潮汐水闸（4）：关上 / 打开下一波的落潮路；按了没用时说清为什么（规则核心 tdSluiceCan 判，界面不自己算） */
export function pressSluice(bs: TdScene): void {
  const s = bs.s;
  if (s.over || !s.sluice) return;
  const can = tdSluiceCan(s);
  if (!can) {
    sfx('error');
    return toast(s.wave >= s.level.waves.length ? '没有下一波了' : s.sluice.left <= 0 ? '水闸的次数用完了' : '下一波不落潮，用不着关闸');
  }
  sfx('tap');
  act(bs, { type: 'sluice' });
}

/** 友军巡航船（4）：不用瞄，一按就来；冷却中或船还在海上时按了只响一声 */
export function pressFleet(bs: TdScene): void {
  const f = bs.s.fleet;
  if (bs.s.over || !f) return;
  if (f.sail || bs.s.tick < f.ready) return sfx('error');
  act(bs, { type: 'fleet' });
}

/** 吊桥（4）：切换哪座吊桥放下；冷却中按了只响一声 */
export function pressDrawbridge(bs: TdScene): void {
  const d = bs.s.drawbridge;
  if (bs.s.over || !d) return;
  if (bs.s.tick < d.ready) return sfx('error');
  sfx('tap');
  act(bs, { type: 'drawbridge' });
}

/** 岸防老炮（4）：和炸药桶一样先进入瞄准、再点地面；全岛都够得着，不画范围圈 */
export function pickBattery(bs: TdScene): void {
  const b = bs.s.battery;
  if (bs.s.over || !b) return;
  if (bs.s.tick < b.ready) return sfx('error');
  if (bs.heroSel) setHeroSel(bs, false);
  bs.mode = bs.mode === 'battery' ? 'none' : 'battery';
  closeSheet(bs);
  hintText(bs, bs.mode === 'battery' ? '点地面，老炮 1 秒后落一发（打不到飞的）' : '');
  bs.hud.hint.classList.remove('bad');
  bs.hintTimer?.remove();
  bs.hintTimer = bs.mode !== 'none' ? bs.time.delayedCall(2500, () => bs.mode !== 'none' && hintText(bs, '')) : null;
  updateHud(bs, true);
}

/** 进入瞄准的提示：船长 1 拒马 / 2 炸药桶 / 锚钩，航海士 1 急射旗 / 2 重赏 */
const AIM_TIP: Record<'keg' | 'barricade' | 'hook' | 'flag' | 'reward', string> = {
  keg: '点地面扔炸药桶（黄圈外的话英雄先走过去）',
  hook: '点黄圈里金圈标着的敌人，把它钩回来定住（首领和船钩不动）',
  barricade: '点路面放拒马（黄圈外的话英雄先走过去），地面敌人要砸开才能过',
  flag: '点地面插急射旗（黄圈外的话英雄先走过去），旗边的塔打得快一倍',
  reward: '点地面画重赏圈（黄圈外的话英雄先走过去），倒在圈里的海盗金币翻倍',
};

/** 英雄技能：进入瞄准（再点一次取消），地上画英雄身边能放的范围 */
export function pickSkill(bs: TdScene, m: 'keg' | 'barricade' | 'hook' | 'flag' | 'reward'): void {
  const h = bs.s.hero;
  if (h.respawn >= 0) return toast('英雄倒下了，等他复活');
  // 技能二（炸药桶 / 重赏）走 kegReady，技能一（拒马 / 急射旗）走 barricadeReady（core/tdnav.ts）
  const ready = m === 'keg' || m === 'reward' ? h.kegReady : m === 'hook' ? (h.hookReady ?? 0) : (h.barricadeReady ?? 0);
  if (bs.s.tick < ready) return sfx('error');
  bs.mode = bs.mode === m ? 'none' : m;
  bs.skillQ = null;
  closeSheet(bs);
  hintText(bs, bs.mode === m ? AIM_TIP[m] : '');
  bs.hud.hint.classList.remove('bad');
  // 提示只挂 2.5 秒：之后靠地上的黄圈提示范围，不一直占着屏幕
  bs.hintTimer?.remove();
  bs.hintTimer = bs.mode !== 'none' ? bs.time.delayedCall(2500, () => bs.mode !== 'none' && hintText(bs, '')) : null;
  updateHud(bs, true);
}

/** 选中 / 取消选中英雄：选中后下一次点地面让他过去（像《王国保卫战》），没选中时点地面什么都不做 */
export function toggleHero(bs: TdScene): void {
  if (bs.s.over) return;
  if (bs.s.hero.respawn >= 0) return toast('英雄倒下了，等他复活');
  if (bs.mode !== 'none') {
    bs.mode = 'none';
    bs.hud.hint.classList.remove('bad');
  }
  closeSheet(bs);
  bs.skillQ = null;
  sfx('tap');
  setHeroSel(bs, !bs.heroSel);
}

function setHeroSel(bs: TdScene, on: boolean): void {
  bs.heroSel = on;
  bs.hintTimer?.remove();
  const tip = touchUi() ? '点地面让英雄过去，再点英雄取消；也能按住英雄直接拖过去' : '点地面让英雄过去，Esc 取消；不选中时右键地面也能直接指挥';
  hintText(bs, on ? tip : '');
  bs.hintTimer = on ? bs.time.delayedCall(2500, () => bs.heroSel && hintText(bs, '')) : null;
  updateHud(bs, true);
}

export function tap(bs: TdScene, wx: number, wy: number): void {
  const s = bs.s;
  if (s.over) return;
  const g = unIso(wx, wy);
  const ux = Math.round(g.gx * UNIT);
  const uy = Math.round(g.gy * UNIT);
  if (bs.mode === 'battery') {
    act(bs, { type: 'battery', x: ux, y: uy });
    bs.mode = 'none';
    bs.hintTimer?.remove();
    hintText(bs, '');
    return;
  }
  if (bs.mode === 'hook') return tapHook(bs, wx, wy, ux, uy);
  if (bs.mode === 'muster') {
    bs.mode = 'none';
    hintText(bs, '');
    if (!rallyOk(s, bs.musterSlot, ux, uy)) {
      sfx('error');
      return ftx(bs, wx, wy, '集结点要在营 3 格内的路面上', '#ff9a8a', 15);
    }
    act(bs, { type: 'muster', slot: bs.musterSlot, x: ux, y: uy });
    return moveMark(bs, wx, wy);
  }
  if (bs.mode !== 'none') {
    const m = bs.mode;
    bs.mode = 'none';
    bs.hintTimer?.remove();
    hintText(bs, '');
    bs.hud.hint.classList.remove('bad');
    // 瞄着技能点到了木台：当成想造塔，退出瞄准、开面板（不然会被当成落点吞掉；敌人走路面，不会站在木台的占地格上）
    // 急射旗本来就是往塔堆里插，点到木台照样插旗
    const pad = m === 'flag' ? -1 : slotFoot(bs, ux, uy);
    if (pad >= 0) {
      updateHud(bs, true);
      return showSlot(bs, pad);
    }
    const h = s.hero;
    const range = m === 'keg' ? SKILL.bomb.range : m === 'reward' ? SKILL.reward.range : m === 'flag' ? SKILL.flag.range : SKILL.barricade.range;
    if (Math.hypot(h.x - ux, h.y - uy) <= range) return castSkill(bs, m, ux, uy, wx, wy);
    queueSkill(bs, m, ux, uy, wx, wy, range);
    return;
  }
  // 补给箱：点它就叫英雄去捡（不用先选中英雄），捡完英雄自己回守点
  const box = crateAt(bs, ux, uy);
  if (box >= 0 && s.hero.respawn < 0) {
    if (bs.heroSel) setHeroSel(bs, false);
    act(bs, { type: 'pickup', id: box });
    return moveMark(bs, wx, wy);
  }
  bs.hoverSlot = -2;
  // 点英雄：选中 / 取消（地上画他的守点迎敌范围）。点在上半身算英雄；点在脚边而脚下是木台时木台优先，否则这块台永远点不开
  const hh = heroHit(bs, wx, wy);
  if (hh === 'body' || (hh === 'feet' && slotFoot(bs, ux, uy) < 0)) return toggleHero(bs);
  const sel = bs.heroSel;
  if (sel) setHeroSel(bs, false);
  // 木台：占地格 → 塔身像素 → 同点连点循环（高塔盖住后面的台时，再点一次选到被压住的）
  const si = slotAt(bs, wx, wy, bs.slotCycle) ?? -1;
  // 木台（压着沉船的也一样打开面板：花钱清掉或者让英雄去打）
  if (si >= 0) return showSlot(bs, si);
  closeSheet(bs);
  // 受损或被炸的墙：修
  const wl = s.walls.find((q) => q.x === Math.floor(ux / UNIT) && q.y === Math.floor(uy / UNIT) && q.hp < q.maxHp);
  if (wl) {
    if (s.gold < TD2_ECON.repairGold) {
      sfx('error');
      return ftx(bs, wx, wy, `修墙要 ${TD2_ECON.repairGold} 金币`, '#ff9a8a', 15);
    }
    act(bs, { type: 'repair', id: wl.id });
    return;
  }
  // 没选中英雄时点空地什么都不做：点哪英雄就往哪跑太乱
  if (!sel) return;
  heroGo(bs, ux, uy, wx, wy);
}

/** 叫英雄去 (ux, uy)：落点是沉船、木桶就去打掉，否则走过去（点选、拖英雄、右键共用） */
function heroGo(bs: TdScene, ux: number, uy: number, wx: number, wy: number): void {
  const s = bs.s;
  if (s.over || s.hero.respawn >= 0) return;
  bs.skillQ = null;
  const bk = s.blocks.find((q) => !q.destroyed && ux >= q.x * UNIT && ux < (q.x + q.size) * UNIT && uy >= q.y * UNIT && uy < (q.y + q.size) * UNIT);
  if (bk) act(bs, { type: 'clear', id: bk.id });
  else act(bs, { type: 'move', x: ux, y: uy });
  moveMark(bs, wx, wy);
}

/** (ux, uy) 落在哪块木台的 2×2 占地格上，没有为 -1 */
function slotFoot(bs: TdScene, ux: number, uy: number): number {
  return bs.s.slots.findIndex((q) => ux >= q.x * UNIT && ux < (q.x + 2) * UNIT && uy >= q.y * UNIT && uy < (q.y + 2) * UNIT);
}

/** 点在英雄身上吗：上半身（帽子到腰）算 body，腰以下到脚边算 feet；英雄倒下时都不算 */
function heroHit(bs: TdScene, wx: number, wy: number): 'body' | 'feet' | null {
  if (bs.s.hero.respawn >= 0 || Math.abs(wx - bs.hero.x) >= 30) return null;
  if (wy > bs.hero.y - 74 && wy <= bs.hero.y - 24) return 'body';
  if (wy > bs.hero.y - 24 && wy < bs.hero.y + 14) return 'feet';
  return null;
}

/**
 * 瞄着锚钩点了一下：点中黄圈里能钩的敌人就放；点中钩不了的（太远、首领、船）提示原因、接着瞄；点到木台当成想造塔（和别的技能一样）；
 * 点空地接着瞄（敌人在跑，点偏是常事，不让一下点空就得重新按钮）
 */
function tapHook(bs: TdScene, wx: number, wy: number, ux: number, uy: number): void {
  const pick = pickHookTarget(bs, wx, wy);
  if (pick && 'e' in pick) {
    bs.mode = 'none';
    bs.hintTimer?.remove();
    hintText(bs, '');
    act(bs, { type: 'hook', id: pick.e.id });
    updateHud(bs, true);
    return;
  }
  if (!pick) {
    const pad = slotFoot(bs, ux, uy);
    if (pad >= 0) {
      bs.mode = 'none';
      hintText(bs, '');
      updateHud(bs, true);
      return showSlot(bs, pad);
    }
  }
  sfx('error');
  hintText(bs, pick ? (pick.boss ? '首领和船钩不动' : '太远了，只能钩黄圈里的') : '点一个敌人');
  bs.hud.hint.classList.toggle('bad', !!pick);
  bs.hintTimer?.remove();
  bs.hintTimer = bs.time.delayedCall(1800, () => bs.mode === 'hook' && hintText(bs, ''));
}

/** 在够得着的地方放技能 */
function castSkill(bs: TdScene, m: 'keg' | 'barricade' | 'reward' | 'flag', ux: number, uy: number, wx: number, wy: number): void {
  if (m === 'keg') {
    act(bs, { type: 'keg', x: ux, y: uy });
    bs.kegAim = { x: wx, y: wy };
  } else if (m === 'reward' || m === 'flag') act(bs, { type: m, x: ux, y: uy });
  else act(bs, { type: 'barricade', x: ux, y: uy });
  updateHud(bs, true);
}

/** 走过去再放最多等这么多拍（10 秒）：路被挡、英雄绕不过去时别一直挂着 */
const SKILL_WALK_TICKS = 200;

/**
 * 落点在黄圈外：英雄先朝落点走到够得着的地方，到了自动放（像《王国保卫战》）。
 * 走和放都是普通操作（move、keg / barricade），按拍记进操作序列，回放照样一致；规则核心不用改。
 */
function queueSkill(bs: TdScene, m: 'keg' | 'barricade' | 'reward' | 'flag', ux: number, uy: number, wx: number, wy: number, range: number): void {
  const h = bs.s.hero;
  if (h.respawn >= 0) return;
  const d = Math.hypot(ux - h.x, uy - h.y);
  const k = (d - range * 0.8) / d;
  act(bs, { type: 'move', x: Math.round(h.x + (ux - h.x) * k), y: Math.round(h.y + (uy - h.y) * k) });
  bs.skillQ = { m, ux, uy, wx, wy, range, until: bs.s.tick + SKILL_WALK_TICKS };
  moveMark(bs, wx, wy);
  hintText(bs, m === 'keg' ? '英雄走过去再扔' : m === 'reward' ? '英雄走过去再画重赏圈' : m === 'flag' ? '英雄走过去再插旗' : '英雄走过去再放拒马');
  bs.hintTimer?.remove();
  bs.hintTimer = bs.time.delayedCall(1800, () => hintText(bs, ''));
  updateHud(bs, true);
}

/** 每拍推进前调：走过去再放的技能，英雄够得着了就放；倒下、超时或技能还在冷却就作罢 */
export function stepSkillQ(bs: TdScene): void {
  const q = bs.skillQ;
  if (!q) return;
  const s = bs.s;
  const h = s.hero;
  if (s.over || h.respawn >= 0 || s.tick > q.until) {
    bs.skillQ = null;
    return;
  }
  if (Math.hypot(h.x - q.ux, h.y - q.uy) > q.range - 10) return;
  bs.skillQ = null;
  castSkill(bs, q.m, q.ux, q.uy, q.wx, q.wy);
}

/** 右键：有东西可取消（技能瞄准、选中的英雄、面板）就取消；什么都没有时右键地面直接让英雄过去 */
export function rightClick(bs: TdScene, wx: number, wy: number): void {
  if (bs.s.over) return;
  if (bs.mode !== 'none' || bs.sheet || bs.heroSel || bs.skillQ) return cancelAll(bs);
  const g = unIso(wx, wy);
  heroGo(bs, Math.round(g.gx * UNIT), Math.round(g.gy * UNIT), wx, wy);
}

/**
 * 按住英雄拖出落点（手指和鼠标都行），松手英雄走过去；没拖开就当点了一下英雄（选中 / 取消）。
 * 接在 CamCtl 的 drag 上：按下点在英雄身上才接管，否则照常拖镜头。
 */
export function heroDrag(bs: TdScene): { start(wx: number, wy: number): boolean; move(wx: number, wy: number): void; end(): void } {
  let d: { x: number; y: number; moved: boolean } | null = null;
  const g = bs.add.graphics().setDepth(DEPTH.marker);
  const draw = (): void => {
    g.clear();
    if (!d?.moved) return;
    g.lineStyle(4, 0xffe885, 0.9).lineBetween(bs.hero.x, bs.hero.y, d.x, d.y);
    g.lineStyle(3, 0xffe885, 1).strokeEllipse(d.x, d.y, 34, 17);
  };
  return {
    start: (wx, wy) => {
      if (bs.s.over || bs.mode !== 'none') return false;
      const hh = heroHit(bs, wx, wy);
      const g0 = unIso(wx, wy);
      if (!hh || (hh === 'feet' && slotFoot(bs, Math.round(g0.gx * UNIT), Math.round(g0.gy * UNIT)) >= 0)) return false;
      d = { x: wx, y: wy, moved: false };
      return true;
    },
    move: (wx, wy) => {
      if (!d) return;
      if (!d.moved && Math.hypot(wx - bs.hero.x, wy - (bs.hero.y - 30)) > 40) d.moved = true;
      d.x = wx;
      d.y = wy;
      draw();
    },
    end: () => {
      const e = d;
      d = null;
      g.clear();
      if (!e) return;
      if (!e.moved) return toggleHero(bs);
      if (bs.heroSel) setHeroSel(bs, false);
      const p = unIso(e.x, e.y);
      heroGo(bs, Math.round(p.gx * UNIT), Math.round(p.gy * UNIT), e.x, e.y);
    },
  };
}

/** 火药桶从英雄手里飞向落点：抛物线 + 旋转（约 0.3 秒，跟核心的引信同长），落点一圈震波 */
export function throwKeg(bs: TdScene, to: { x: number; y: number }): void {
  const from = { x: bs.hero.x, y: bs.hero.y - 30 };
  const im = put(bs, bs.r, tdP('keg'), from.x, from.y).setDepth(DEPTH.fxHigh);
  const prog = { u: 0 };
  const dur = Math.max(120, 300 / bs.speed);
  bs.tweens.add({
    targets: prog,
    u: 1,
    duration: dur,
    ease: 'Sine.easeOut',
    onUpdate: () => {
      im.setPosition(from.x + (to.x - from.x) * prog.u, from.y + (to.y - from.y) * prog.u - Math.sin(prog.u * Math.PI) * 54);
      im.setAngle(prog.u * 540);
    },
    onComplete: () => {
      im.destroy();
      const ring = bs.add.ellipse(to.x, to.y, 20, 10).setStrokeStyle(3, 0xffe885, 1).setDepth(DEPTH.marker);
      bs.tweens.add({ targets: ring, scaleX: 2.6, scaleY: 2.6, alpha: 0, duration: 220, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    },
  });
}

export function moveMark(bs: TdScene, wx: number, wy: number): void {
  sfx('tap');
  const e = bs.add.ellipse(wx, wy, 14, 7).setStrokeStyle(3, 0xffe885, 1).setDepth(DEPTH.marker);
  bs.tweens.add({ targets: e, scaleX: 3, scaleY: 3, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => e.destroy() });
}
