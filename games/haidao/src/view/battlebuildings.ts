/** 建筑渲染与倒塌：画建筑和城墙、受损阶段与冒烟起火、迷雾、炮台与狙击线、血条、倒塌特效、护盾火花 */
import type Phaser from 'phaser';
import type { BBuilding } from '../core/types.ts';
import { sTex, wTex, fxA } from './art.ts';
import { BAR_SIZE, BarList, stackBars } from './bars.ts';
import { STAGE_LOOK, damageStage } from './motion.ts';
import { bigEvent, burst } from './fx.ts';
import { jitter, put } from './ground.ts';
import { depthOf, footCenter, iso } from './iso.ts';
import { sfx } from './audio/sfx.ts';
import { BAR_GAP, STEP_MS } from './battlecommon.ts';
import type { BSpr } from './battlecommon.ts';
import type { BattleScene } from './BattleScene.ts';
import { artTop, playFrames } from './battleevents.ts';
import { nearUnit } from './battleunits.ts';
import { DEPTH } from './depth.ts';

/** 城墙按四邻选图（和基地一致） */
export function wallMaskOf(bs: BattleScene, w: { x: number; y: number; id: number }): number {
  const has = (x: number, y: number): boolean => bs.st.buildings.some((q) => q.kind === 'wall' && q.hp > 0 && q.x === x && q.y === y);
  return (has(w.x, w.y - 1) ? 1 : 0) | (has(w.x + 1, w.y) ? 2 : 0) | (has(w.x, w.y + 1) ? 4 : 0) | (has(w.x - 1, w.y) ? 8 : 0);
}

export function drawBuildings(bs: BattleScene): void {
  for (const b of bs.st.buildings) {
    const p = b.kind === 'wall' ? wTex(b.level, wallMaskOf(bs, b)) : sTex(b.kind, b.level);
    const f = footCenter(b.x, b.y, b.size);
    const s = iso(f.gx, f.gy);
    const im = jitter(put(bs, bs.r, p, s.x, s.y), b.kind, b.id).setDepth(depthOf(f.gx, f.gy));
    if (!b.revealed) im.setVisible(false);
    bs.bsp.set(b.id, { img: im, baseX: s.x, baseY: s.y, down: false, stage: 0, nextSmoke: 0, nextFire: 0 });
  }
}

/** 海怪拍打：触手冒出来 + 震屏 + 水花 */
export function slam(bs: BattleScene, w: { x: number; y: number }): void {
  sfx('boom');
  const p = fxA('tentacle');
  const t = put(bs, bs.r, p, w.x, w.y + 6).setDepth(DEPTH.hitFx).setScale(0.3 / bs.r * bs.r);
  t.setScale(0.4 / bs.r);
  bs.tweens.add({ targets: t, scale: 1 / bs.r, duration: 160, ease: 'Back.easeOut', yoyo: true, hold: 260, onComplete: () => t.destroy() });
  bigEvent(bs, bs.hs, 'bossEnter');
  bs.pt.splash(w.x, w.y, 1.6);
}

/** 建筑倒塌：碎片四溅，金币弹出来 */
export function collapse(bs: BattleScene, x: number, y: number, size: number): void {
  playFrames(bs, 'collapse', x, y, 0.8 + size * 0.3, 8350);
  const sp = fxA('spark');
  burst(bs, bs.r, sp.key, sp.w, sp.h, x, y - 10, 10 + size * 4, 40 + size * 12);
  const c = fxA('coins');
  for (let i = 0; i < 4 + size; i++) {
    const im = bs.add.image(x, y - 10, c.key).setScale(0.55 / bs.r).setDepth(DEPTH.fxHigh);
    const dx = (i - (3 + size) / 2) * 12 + (i % 2) * 4;
    bs.tweens.add({ targets: im, x: x + dx, y: y - 44 - (i % 3) * 8, duration: 280, ease: 'Quad.easeOut', yoyo: false, onComplete: () => bs.tweens.add({ targets: im, y: y + 6, alpha: 0, duration: 380, ease: 'Bounce.easeOut', onComplete: () => im.destroy() }) });
  }
}

/** 倒塌的建筑冒烟 */
export function smokeTick(bs: BattleScene): void {
  const p = fxA('smoke');
  for (const id of bs.ruined.slice(-14)) {
    const sp = bs.bsp.get(id);
    if (!sp) continue;
    const im = bs.add.image(sp.img.x + (Math.random() - 0.5) * 16, sp.img.y - 8, p.key).setScale(0.45 / bs.r).setAlpha(0.4).setDepth(DEPTH.marker);
    bs.tweens.add({ targets: im, y: im.y - 26, scale: im.scale * 1.6, alpha: 0, duration: 1500, onComplete: () => im.destroy() });
  }
}

/** 受损阶段：血量 <66% 冒烟、<33% 着火、<15% 半塌（压低、歪一点）；烟火走对象池，数量按池子余量限 */
export function damageLook(bs: BattleScene, b: BBuilding, sp: BSpr, time: number): void {
  const stage = damageStage(b.hp, b.maxHp);
  if (stage !== sp.stage) {
    sp.stage = stage;
    const L = STAGE_LOOK[stage];
    const base = 1 / bs.r;
    sp.img.setScale(base, base * L.sy).setRotation(L.tilt * (b.id % 2 ? 1 : -1));
  }
  if (stage === 0 || bs.pt.live > 100) return;
  const L = STAGE_LOOK[stage];
  const hgt = 16 * (b.size || 1);
  const x = sp.img.x;
  const y = sp.img.y - hgt;
  const d = sp.img.depth + 0.6;
  if (L.smokeMs > 0 && time >= sp.nextSmoke) {
    sp.nextSmoke = time + L.smokeMs + (b.id % 4) * 40;
    bs.pt.emit('puff', x + ((b.id * 7 + time / 97) % 9) - 4, y - 4, { vx: 5, vy: -24, life: 1100, s0: 0.5, s1: 1.5, a0: 0.7, tint: stage === 1 ? 0xb4b6be : 0x56565e, depth: d });
  }
  if (L.fireMs > 0 && time >= sp.nextFire) {
    sp.nextFire = time + L.fireMs;
    bs.pt.bloom.flash(x, y + 4, 16, 0xff7a1f, 260, 0.3);
    bs.pt.emit('ember', x + ((b.id * 5 + time / 61) % 15) - 7, y + 6, { vx: 4, vy: -46, g: -30, life: 460, s0: 1.1, s1: 0.3, a0: 0.95, tint: (time >> 6) % 2 ? 0xff7a1f : 0xffc23f, depth: d + 0.1 });
  }
}

/**
 * 雾塔：没暴露（revealed=false）的建筑不画真身，原地只有一团雾（也不显示血条）；
 * 兵走近、revealed 变 true 时，雾散开，建筑淡入。
 */
export function fogOf(bs: BattleScene, b: BBuilding, sp: BSpr): void {
  const fogged = !b.revealed && !b.destroyed;
  const f = bs.fogSpr.get(b.id);
  if (fogged && !f) {
    const p = fxA('fog');
    const im = put(bs, bs.r, p, sp.img.x, sp.img.y - 10).setDepth(sp.img.depth + 0.3).setAlpha(0.92);
    im.setScale((0.8 + b.size * 0.5) / bs.r);
    bs.fogSpr.set(b.id, im);
    sp.img.setVisible(false);
    bs.tweens.add({ targets: im, x: im.x + 5, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  } else if (!fogged && f) {
    bs.fogSpr.delete(b.id);
    bs.tweens.killTweensOf(f);
    // 散雾和淡入跟着战斗速度走：它由规则的「暴露」拍触发，4 倍速时兵已经走过去了，雾还按真实时间慢慢散就和逻辑错开。
    // 命中停顿不用在这里管：场景每帧把 bs.tweens 的总时钟压到 0.05（BattleScene.update），Tween 自己的 timeScale 会和它相乘。
    // 1 倍速时 timeScale = 1，终点和时长都不变。雾的左右飘（上面那条）是环境动画，不绑速度；其余特效补间（倒塌金币、烟）也按真实时间，和 playFrames、粒子一致
    const clearFog = bs.tweens.add({ targets: f, alpha: 0, scale: f.scale * 1.7, duration: 800, onComplete: () => f.destroy() });
    clearFog.timeScale = bs.speed;
    sp.img.setVisible(true).setAlpha(0);
    bs.tweens.add({ targets: sp.img, alpha: 1, duration: 700 }).timeScale = bs.speed;
  }
}

/** 炮台每帧：瞄规则正瞄着的兵；没瞄着但有兵快进射程（1.35 倍内）就先转过去，开火时已经对准 */
export function renderTurrets(bs: BattleScene, frac: number, time: number, dt: number): void {
  if (bs.tur.size === 0) return;
  const s = bs.st;
  const vt = s.tick - 1 + frac;
  const o = bs.tin;
  for (const [id, tu] of bs.tur) {
    const b = bs.bbyId.get(id);
    if (!b || b.destroyed) continue;
    o.now = time;
    o.dt = dt;
    o.has = false;
    o.aiming = b.aim >= 0;
    o.until = Infinity;
    let u = b.aim >= 0 ? bs.ubyId.get(b.aim) : undefined;
    // 狙击塔预警中：炮管跟着被锁定的那个兵，离开火的时间按 fireAt 算
    const sa = b.kind === 'sniper' ? bs.snipe.of(id) : null;
    if (sa && !sa.hero) {
      u = bs.ubyId.get(sa.target) ?? u;
      o.aiming = true;
      o.until = (sa.fireAt - vt) * STEP_MS;
    } else if (u) o.until = (Math.max(b.cd, s.tick) - vt) * STEP_MS;
    else u = nearUnit(bs, b);
    const sp = u && bs.usp.get(u.id);
    if (sp && !sp.fading) {
      o.has = true;
      o.tx = sp.rig.x;
      o.ty = sp.rig.y;
    }
    tu.update(o);
  }
}

/** 狙击预警每帧重画：炮口（炮台当前朝向）到目标胸口一条线，目标脚下一个准星；目标倒下 / 逃走就收掉 */
export function renderSnipe(bs: BattleScene, frac: number, time: number): void {
  if (bs.snipe.live === 0) {
    bs.snipe.draw(0, time, () => false);
    return;
  }
  const vt = bs.st.tick - 1 + frac;
  bs.snipe.draw(vt, time, (a, e) => {
    const tu = bs.tur.get(a.tower);
    const b = bs.bbyId.get(a.tower);
    if (!tu || !b || b.destroyed) return false;
    let tx: number;
    let ty: number;
    let top: number;
    if (a.hero) {
      if (!bs.heroImg || !bs.st.hero || bs.st.hero.mode === 'dead') return false;
      tx = bs.heroImg.x;
      ty = bs.heroImg.y;
      top = bs.heroImg.topY;
    } else {
      const sp = bs.usp.get(a.target);
      if (!sp || sp.fading) return false;
      tx = sp.rig.x;
      ty = sp.rig.y;
      top = sp.rig.topY;
    }
    const m = tu.muzzle(bs.snipeEnds);
    e.mx = m.x;
    e.my = m.y;
    e.tx = tx;
    e.ty = (ty + top) / 2 + 6;
    e.fx = tx;
    e.fy = ty;
    return true;
  });
}

/** 盾上火星：金属火花几粒 + 一点木屑 + 一闪（对象池，粒子吃紧时减量） */
export function guardFx(bs: BattleScene, x: number, y: number, depth: number): void {
  const pt = bs.pt;
  pt.bloom.flash(x, y, 16, 0xffe9a8, 140, 0.6);
  const n = pt.live > 100 ? 2 : 6;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.55 + (i % 2 ? 0.2 : -0.2);
    pt.emit('ember', x, y, { vx: Math.cos(a) * (70 + (i % 3) * 30), vy: Math.sin(a) * (80 + (i % 2) * 40), g: 220, life: 260 + (i % 3) * 60, s0: 0.8, s1: 0.2, a0: 1, tint: i % 2 ? 0xfff2a0 : 0xffc23f, depth: depth + 1 });
  }
  if (pt.live < 100) pt.splinters(x, y, 2);
}

/** 血条清单：整个画面层同一时间只有一个登陆战场景，帧内同步用完，复用对象不每帧新建 */
const barList = new BarList();

export function renderBars(bs: BattleScene): void {
  const g = bs.bars;
  g.clear();
  // 录屏跟随时镜头被拉近，条按实际缩放算，免得一条横过半个画面
  const z = bs.followT ? bs.followT.z : bs.cc.z;
  const now = bs.nowT;
  const bt = bs.bt;
  bt.begin();
  const topY = (im: Phaser.GameObjects.Image): number => artTop(im);
  // 满血不显示，掉血后显示约 3 秒再淡出；挨得近的上下错开（bars.ts）。条的大小在屏幕上恒定
  const list = barList;
  list.begin();
  const add = (key: number, x: number, top: number, hp: number, maxHp: number, col: number, big: boolean): void => {
    const a = bt.alpha(key, hp, maxHp, now);
    if (a <= 0) return;
    const sz = big ? BAR_SIZE.building : BAR_SIZE.unit;
    list.push(x, top - (sz[1] + 3) / z, sz[0] / z, hp / maxHp, col, a, big);
  };
  // 键是数字：兵用自己的编号，寨里建筑用 -(编号 + 2)，英雄 -1，免得每帧给每个兵拼一个字符串
  for (const u of bs.st.units) {
    const sp = bs.usp.get(u.id);
    if (!sp || sp.fading) continue;
    add(u.id, sp.rig.x, sp.rig.topY, u.hp, u.maxHp, 0x3fae52, false);
  }
  const hh = bs.st.hero;
  if (hh && bs.heroImg && hh.mode !== 'dead') add(-1, bs.heroImg.x, bs.heroImg.topY, hh.hp, hh.maxHp, 0x3fae52, false);
  for (const b of bs.st.buildings as BBuilding[]) {
    const sp = bs.bsp.get(b.id);
    if (!sp || b.destroyed || b.maxHp <= 0 || !b.revealed) continue;
    add(-(b.id + 2), sp.img.x, topY(sp.img), b.hp, b.maxHp, 0xd93b32, true);
  }
  bt.sweep();
  const items = list.items;
  stackBars(items, (BAR_SIZE.building[1] + BAR_GAP) / z);
  for (const it of items) {
    const sz = it.big ? BAR_SIZE.building : BAR_SIZE.unit;
    const w = sz[0] / z;
    const h = sz[1] / z;
    const o = (it.big ? 1.2 : 0.8) / z;
    g.fillStyle(0x2b1a15, 0.95 * it.a).fillRect(it.x - w / 2 - o, it.y - o, w + 2 * o, h + 2 * o);
    g.fillStyle(it.col, it.a).fillRect(it.x - w / 2, it.y, w * Math.max(0, Math.min(1, it.f)), h);
  }
  // 分叉徽记：塔顶上 1-2 颗小圆点（3 级橙、6 级蓝），一眼看出这座塔选过分叉
  const sh = BAR_SIZE.building[1] / z;
  for (const b of bs.st.buildings as BBuilding[]) {
    const sp = bs.bsp.get(b.id);
    if (!sp || b.destroyed || !b.revealed || !b.branch?.length) continue;
    const by = topY(sp.img) - sh - 9 / z;
    b.branch.forEach((_, i) => {
      const bx = sp.img.x + (i - (b.branch!.length - 1) / 2) * 9 / z;
      g.fillStyle(0x2b1a15, 0.95).fillCircle(bx, by, 4.4 / z);
      g.fillStyle(i === 0 ? 0xff9a3c : 0x4fb3ff, 1).fillCircle(bx, by, 3.2 / z);
    });
  }
}
