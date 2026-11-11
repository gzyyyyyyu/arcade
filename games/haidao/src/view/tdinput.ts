import type { TdScene } from './TdScene.ts';
import { type TdAction, TD2_ECON } from '../core/index.ts';
import { UNIT } from '../core/types.ts';
import { tdP } from './art.ts';
import { EASE } from './motion.ts';
import { isoRing } from './tdfx.ts';
import { put } from './ground.ts';
import { unIso } from './iso.ts';
import { sfx } from './audio/sfx.ts';
import { toast } from './ui.ts';
import { DEPTH } from './depth.ts';
import { type Act, SKILL, W } from './tdcommon.ts';
import { hintText, updateHud, ftx } from './tdhud.ts';
import { closeSheet, showSlot } from './tdsheet.ts';
import { drawSlotDiamond, slotAt } from './tdpick.ts';

// ---------------------------------------------------------------- 操作

export function act(bs: TdScene, a: Act): void {
  bs.pending.push({ ...a, t: bs.s.tick } as TdAction);
}

/** 取消：技能瞄准、英雄选中、关面板 */
export function cancelAll(bs: TdScene): void {
  if (bs.s.over) return;
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

/** 技能 1 拒马 / 2 炸药桶：进入瞄准（再点一次取消），地上画英雄身边能放的范围 */
export function pickSkill(bs: TdScene, m: 'keg' | 'barricade'): void {
  const h = bs.s.hero;
  if (h.respawn >= 0) return toast('英雄倒下了，等他复活');
  const ready = m === 'keg' ? h.kegReady : (h.barricadeReady ?? 0);
  if (bs.s.tick < ready) return sfx('error');
  bs.mode = bs.mode === m ? 'none' : m;
  closeSheet(bs);
  const tip = m === 'keg' ? '点地面扔炸药桶（黄圈里够得着）' : '点英雄身边的路放拒马（黄圈里），地面敌人要砸开才能过';
  hintText(bs, bs.mode === m ? tip : '');
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
  sfx('tap');
  setHeroSel(bs, !bs.heroSel);
}

function setHeroSel(bs: TdScene, on: boolean): void {
  bs.heroSel = on;
  bs.hintTimer?.remove();
  hintText(bs, on ? '点地面让英雄过去，再点英雄或 Esc 取消' : '');
  bs.hintTimer = on ? bs.time.delayedCall(2500, () => bs.heroSel && hintText(bs, '')) : null;
  updateHud(bs, true);
}

export function tap(bs: TdScene, wx: number, wy: number): void {
  const s = bs.s;
  if (s.over) return;
  const g = unIso(wx, wy);
  const ux = Math.round(g.gx * UNIT);
  const uy = Math.round(g.gy * UNIT);
  if (bs.mode !== 'none') {
    const h = s.hero;
    const range = bs.mode === 'keg' ? SKILL.bomb.range : SKILL.barricade.range;
    if (Math.hypot(h.x - ux, h.y - uy) > range) {
      sfx('error');
      kegTooFar(bs, wx, wy, range);
      return;
    }
    if (bs.mode === 'keg') {
      act(bs, { type: 'keg', x: ux, y: uy });
      bs.kegAim = { x: wx, y: wy };
    } else act(bs, { type: 'barricade', x: ux, y: uy });
    bs.mode = 'none';
    bs.hintTimer?.remove();
    hintText(bs, '');
    bs.hud.hint.classList.remove('bad');
    return;
  }
  bs.hoverSlot = -2;
  const foot = s.slots.findIndex((q) => ux >= q.x * UNIT && ux < (q.x + 2) * UNIT && uy >= q.y * UNIT && uy < (q.y + 2) * UNIT);
  // 点英雄：选中 / 取消（地上画他的守点迎敌范围；英雄站在木台上时木台优先，否则这块台永远点不开）
  if (foot < 0 && s.hero.respawn < 0 && Math.abs(wx - bs.hero.x) < 30 && wy > bs.hero.y - 74 && wy < bs.hero.y + 14) return toggleHero(bs);
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
  // 没选中英雄时点空地什么都不做：以前点哪英雄就往哪跑，所有者嫌乱
  if (!sel) return;
  // 沉船、木桶：英雄去打掉
  const bk = s.blocks.find((q) => !q.destroyed && ux >= q.x * UNIT && ux < (q.x + q.size) * UNIT && uy >= q.y * UNIT && uy < (q.y + q.size) * UNIT);
  if (bk) {
    act(bs, { type: 'clear', id: bk.id });
    return moveMark(bs, wx, wy);
  }
  act(bs, { type: 'move', x: ux, y: uy });
  moveMark(bs, wx, wy);
}

/** 技能点太远：点击处闪红叉，英雄脚下的范围圈闪红，底部提示条变红并写清怎么办（1.8 秒） */
export function kegTooFar(bs: TdScene, wx: number, wy: number, range: number): void {
  const x = bs.add.text(wx, wy, '✕', { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${30 * bs.r}px`, color: '#ff4a3a', stroke: '#2b1a15', strokeThickness: 5 * bs.r }).setOrigin(0.5).setScale(0.5 / bs.r).setDepth(DEPTH.cross);
  bs.tweens.add({ targets: x, scale: 1 / bs.r, duration: 160, ease: EASE.land });
  bs.tweens.add({ targets: x, alpha: 0, delay: 500, duration: 300, ease: EASE.fade, onComplete: () => x.destroy() });
  const hw = W(bs.s.hero.x, bs.s.hero.y);
  const R = isoRing(range / UNIT);
  const ring = bs.add.ellipse(hw.x, hw.y, R.w, R.h, 0xff4a3a, 0.18).setStrokeStyle(5, 0xff4a3a, 1).setDepth(DEPTH.marker);
  bs.tweens.add({ targets: ring, alpha: 0, duration: 400, ease: EASE.recoil, onComplete: () => ring.destroy() });
  hintText(bs, '太远了：英雄够不着黄圈外，先点英雄再点地面让他走近');
  bs.hud.hint.classList.add('bad');
  bs.hintTimer?.remove();
  bs.hintTimer = bs.time.delayedCall(1800, () => {
    bs.hud.hint.classList.remove('bad');
    hintText(bs, '');
  });
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
