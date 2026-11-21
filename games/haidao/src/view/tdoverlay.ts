import type { TdScene } from './TdScene.ts';
import type Phaser from 'phaser';
import { TD2_HERO_SKILL, tdTowerRange, tdBuildRange, TD_HERO_GUARD } from '../core/index.ts';
import { UNIT } from '../core/types.ts';
import { tdP } from './art.ts';
import { BAR_SIZE, crowdBars, stackBars } from './bars.ts';
import { feelOn } from './feel.ts';
import { isoRing, RANGE_RING, forEachEllipseDash, forEachDash, flashLook } from './tdfx.ts';
import { iso } from './iso.ts';
import type { Turret } from './turret.ts';
import { DEPTH } from './depth.ts';
import { tdBarList, W, SKILL, HATCH } from './tdcommon.ts';
import { foeTier, type FoeTier } from './tdboss.ts';
import { drawHookAim, drawHooks } from './tdhookfx.ts';
import { drawNav, drawNavAim } from './tdnavfx.ts';

export function drawBars(bs: TdScene): void {
  const g = bs.bars;
  const f = bs.fxG;
  g.clear();
  f.clear();
  const z = bs.followT ? bs.followT.z : bs.cc.z;
  const now = bs.time.now;
  const bt = bs.bt;
  bt.begin();
  // 满血不显示，掉血后显示约 3 秒再淡出；挨得近的上下错开（bars.ts）。条的大小在屏幕上恒定：兵小而细，墙稍大
  const list = tdBarList;
  list.begin();
  const add = (key: number, x: number, y: number, hp: number, maxHp: number, col: number, big: boolean, tier: FoeTier = 0): void => {
    // 首领、精英的条一直显示（满血也显示，看得出它是谁），不进扎堆裁剪
    const a = tier > 0 ? 1 : bt.alpha(key, hp, maxHp, now);
    if (a <= 0) return;
    const w = tier === 2 ? BAR_SIZE.boss[0] : tier === 1 ? BAR_SIZE.elite[0] : big ? BAR_SIZE.building[0] : BAR_SIZE.unit[0];
    list.push(x, y, w / z, hp / maxHp, col, a, big || tier > 0, tier);
  };
  // 键是数字：敌人用自己的编号，英雄 -1，墙 -(编号 + 2)，拒马 -(编号 + 1e6)，免得每帧给每个对象拼字符串
  for (const e of bs.s.enemies) {
    if (e.mode !== 'in' && e.mode !== 'out') continue;
    const sp = bs.esp.get(e.id);
    if (!sp) continue;
    const tier = foeTier(e.kind);
    add(e.id, sp.rig.x, sp.rig.topY - (tier ? 8 : 4), e.hp, e.maxHp, 0xd93b32, false, tier);
  }
  const h = bs.s.hero;
  if (h.respawn < 0) add(-1, bs.hero.x, bs.hero.topY - 4, h.hp, h.maxHp, 0x3fae52, false);
  for (const w of bs.s.walls) {
    if (w.destroyed) continue;
    const sp = bs.walls.get(w.id);
    if (sp) add(-(w.id + 2), sp.img.x, sp.img.y - 30, w.hp, w.maxHp, 0xf8c630, true);
  }
  for (const b of bs.s.barricades ?? []) {
    // 场上的拒马存的是格子
    const w = iso(b.x + 0.5, b.y + 0.5);
    add(-(b.id + 1e6), w.x, w.y - 34, b.hp, b.maxHp, 0xc89a5c, true);
  }
  const items = list.items;
  bt.sweep();
  // 扎堆时每 48 像素见方最多留 2 条小条（残血的先留），再错开
  crowdBars(items, 48 / z, 2);
  stackBars(items, (BAR_SIZE.building[1] + 2) / z);
  for (const it of items) {
    const sz = it.mark === 2 ? BAR_SIZE.boss : it.mark === 1 ? BAR_SIZE.elite : it.big ? BAR_SIZE.building : BAR_SIZE.unit;
    const bw = it.w;
    const bh = sz[1] / z;
    const o = (it.big ? 1.2 : 0.8) / z;
    g.fillStyle(0x2b1a15, it.a).fillRect(it.x - bw / 2 - o, it.y - o, bw + 2 * o, bh + 2 * o);
    g.fillStyle(it.col, it.a).fillRect(it.x - bw / 2, it.y, bw * Math.max(0, Math.min(1, it.f)), bh);
    if (it.mark) barMark(g, it.x - bw / 2 - 1 / z, it.y + bh / 2, it.mark, it.a, z);
  }
  // 号令（船长的被动）：英雄身边一圈淡金色的光，圈里的塔脚下也亮一圈（它们打得更快）；航海士没有号令，画急射旗和重赏圈
  drawNav(bs, f, now, z);
  if (h.respawn < 0 && !h.kind) {
    const hw = { x: bs.hero.x, y: bs.hero.y };
    const rr = TD2_HERO_SKILL.rally.r;
    const R = isoRing(rr / UNIT);
    const pulse = 0.5 + 0.5 * Math.sin(now / 520);
    f.lineStyle(2, 0xffe885, 0.25 + 0.2 * pulse).strokeEllipse(hw.x, hw.y, R.w, R.h);
    for (const t of bs.s.towers) {
      const cx = (t.x + t.size / 2) * UNIT;
      const cy = (t.y + t.size / 2) * UNIT;
      if ((cx - h.x) ** 2 + (cy - h.y) ** 2 > rr * rr) continue;
      const w = W(cx, cy);
      f.lineStyle(3, 0xffe885, 0.45 + 0.35 * pulse).strokeEllipse(w.x, w.y + 8, 66, 33);
    }
  }
  drawAim(bs, f, now, z);
  drawHooks(bs, f, z);
  if (bs.mode === 'hook') drawHookAim(bs, f, now);
  if (bs.mode === 'flag' || bs.mode === 'reward') drawNavAim(bs, f, now);
  // 技能瞄准：英雄身边能放的范围（拒马、炸药桶）；老炮全岛都够得着，不画
  if (bs.mode === 'keg' || bs.mode === 'barricade') {
    const w = W(h.x, h.y);
    const R = isoRing((bs.mode === 'keg' ? SKILL.bomb.range : SKILL.barricade.range) / UNIT);
    f.lineStyle(3, 0xffe885, 0.85).strokeEllipse(w.x, w.y, R.w, R.h);
    f.fillStyle(0xffe885, 0.12).fillEllipse(w.x, w.y, R.w, R.h);
  }
}

/** 血条左端的徽记（屏幕上恒定大小）：精英一颗金菱形，首领一顶三尖金王冠，都带深褐描边 */
function barMark(g: Phaser.GameObjects.Graphics, x: number, y: number, mark: number, a: number, z: number): void {
  const u = 1 / z;
  g.lineStyle(1.6 * u, 0x2b1a15, a);
  if (mark === 1) {
    const r = 5 * u;
    g.fillStyle(0xf8c630, a).fillTriangle(x - r, y, x, y - r, x + r * 0.9, y).fillTriangle(x - r, y, x, y + r, x + r * 0.9, y);
    g.strokeTriangle(x - r, y, x, y - r, x + r * 0.9, y).strokeTriangle(x - r, y, x, y + r, x + r * 0.9, y);
    return;
  }
  // 王冠：一条底座加三个尖（三角形画，不每帧建点数组）
  const w = 7 * u;
  const b = y + 4 * u;
  const m = y - 0.5 * u;
  g.fillStyle(0xf8c630, a).fillRect(x - w, m, 1.5 * w, b - m).strokeRect(x - w, m, 1.5 * w, b - m);
  for (const [l, r, t] of [[x - w, x - w / 2, y - 4.5 * u], [x - w / 2, x, y - 6.5 * u], [x, x + w / 2, y - 4.5 * u]] as const) {
    g.fillTriangle(l, m, r, m, (l + r) / 2, t).strokeTriangle(l, m, r, m, (l + r) / 2, t);
  }
}

/** 射程圈：外圈淡金半透明填充加虚线边，臼炮这类有死区的把内圈压暗加斜线和虚线边；半径直接用核心给的数 */
function rangeRing(_bs: TdScene, f: Phaser.GameObjects.Graphics, x: number, y: number, range: number, minRange: number, a: number, u: number, now: number, calm: boolean): void {
  const K = RANGE_RING;
  const flow = calm ? 0 : now * K.flow;
  const R = isoRing(range / UNIT);
  f.fillStyle(K.fillColor, K.fillAlpha * a).fillEllipse(x, y, R.w, R.h);
  f.lineStyle(K.lineW * u, K.lineColor, K.lineAlpha * a);
  forEachEllipseDash(x, y, R.w, R.h, K.dash * u, K.gap * u, flow, (ax, ay, bx, by) => f.lineBetween(ax, ay, bx, by));
  if (minRange <= 0) return;
  const r = isoRing(minRange / UNIT);
  f.fillStyle(K.deadFillColor, K.deadFillAlpha * a).fillEllipse(x, y, r.w, r.h);
  f.lineStyle(1.6 * u, K.deadLineColor, 0.6 * a);
  for (const h of HATCH) f.lineBetween(x + h[0]! * r.w / 2, y + h[1]! * r.h / 2, x + h[2]! * r.w / 2, y + h[3]! * r.h / 2);
  f.lineStyle(K.deadLineW * u, K.deadLineColor, K.deadLineAlpha * a);
  forEachEllipseDash(x, y, r.w, r.h, K.deadDash * u, K.deadGap * u, -flow, (ax, ay, bx, by) => f.lineBetween(ax, ay, bx, by));
}

/** 脚下准星：小椭圆加四道短刻线 */
function reticle(_bs: TdScene, f: Phaser.GameObjects.Graphics, x: number, y: number, sc: number, a: number, col: number, u: number): void {
  const w = 26 * sc;
  const h = 13 * sc;
  f.lineStyle(2.4 * u, 0x2b1a15, a * 0.8).strokeEllipse(x, y, w + 2 * u, h + u);
  f.lineStyle(1.8 * u, col, a).strokeEllipse(x, y, w, h);
  f.lineStyle(2 * u, col, a);
  f.lineBetween(x - w * 0.7, y, x - w * 0.3, y).lineBetween(x + w * 0.3, y, x + w * 0.7, y);
  f.lineBetween(x, y - h * 0.8, x, y - h * 0.35).lineBetween(x, y + h * 0.35, x, y + h * 0.8);
}

/** 看懂谁在打谁、打多远：射程圈、目标虚线和准星、开火闪、英雄守点和旗子（全画在每帧清空的一张 Graphics 上） */
function drawAim(bs: TdScene, f: Phaser.GameObjects.Graphics, now: number, z: number): void {
  const s = bs.s;
  const u = 1 / Math.max(0.6, z);
  const calm = !feelOn();
  // 打开的木台：塔的真实射程；空台悬停 / 压着塔卡时预览那座塔 1 阶的射程
  const sl = s.slots[bs.openSlot];
  if (sl) {
    const t = s.towers.find((q) => q.id === sl.tower);
    if (t) {
      const c = W((t.x + t.size / 2) * UNIT, (t.y + t.size / 2) * UNIT);
      const rg = tdTowerRange(s, t);
      rangeRing(bs, f, c.x, c.y, rg.range, rg.minRange, 1, u, now, calm);
      const es = t.aim >= 0 ? bs.esp.get(t.aim) : undefined;
      if (es) {
        const sp = bs.tsp.get(t.id);
        const m = bs.mz;
        if (sp?.tu) sp.tu.muzzle(m as Parameters<Turret['muzzle']>[0]);
        else {
          m.x = c.x;
          m.y = c.y - 30;
        }
        f.lineStyle(2 * u, 0xff6a4a, 0.9);
        forEachDash(m.x, m.y, es.rig.x, es.rig.y - 14, 7 * u, 5 * u, calm ? 0 : now / 40, (ax, ay, bx, by) => f.lineBetween(ax, ay, bx, by));
        reticle(bs, f, es.rig.x, es.rig.y, 1, 1, 0xff6a4a, u);
      }
    } else if (bs.previewKind) {
      const c = W((sl.x + 1) * UNIT, (sl.y + 1) * UNIT);
      const rg = tdBuildRange(bs.previewKind, 1, !!sl.high);
      rangeRing(bs, f, c.x, c.y, rg.range, rg.minRange, 1, u, now, calm);
    }
  }
  // 开火：打的那个敌人脚下一闪（减少动效时不缩放不渐隐，整段原样显示）
  bs.flash.each(now, (id, age) => {
    const es = bs.esp.get(id);
    const lk = flashLook(age, calm);
    if (es && lk) reticle(bs, f, es.rig.x, es.rig.y, lk.scale, lk.alpha, 0xffd34a, u);
  });
  // 英雄：在打的敌人脚下一个小标记；守点插一面旗，选中时画迎敌范围
  const h = s.hero;
  if (h.respawn < 0 && h.aim >= 0) {
    const es = bs.esp.get(h.aim);
    if (es) reticle(bs, f, es.rig.x, es.rig.y, 0.8, 0.9, 0x7ad7ff, u);
  }
  const post = h.post;
  if (post && h.respawn < 0) {
    const p = W(post.x, post.y);
    if (bs.heroSel) {
      const R = isoRing(TD_HERO_GUARD / UNIT);
      f.fillStyle(0x7ad7ff, 0.08).fillEllipse(p.x, p.y, R.w, R.h);
      f.lineStyle(3 * u, 0x7ad7ff, 0.8).strokeEllipse(p.x, p.y, R.w, R.h);
    }
    f.lineStyle(2 * u, 0x2b1a15, 1).lineBetween(p.x, p.y, p.x, p.y - 26);
    f.fillStyle(0x7ad7ff, 1).fillTriangle(p.x, p.y - 26, p.x + 14, p.y - 21, p.x, p.y - 16);
    f.lineStyle(1.4 * u, 0x2b1a15, 0.9).strokeTriangle(p.x, p.y - 26, p.x + 14, p.y - 21, p.x, p.y - 16);
    f.fillStyle(0x2b1a15, 0.45).fillEllipse(p.x, p.y, 10, 5);
  }
}

export function padState(bs: TdScene, slot: number, built: boolean): void {
  const pd = bs.pads[slot];
  if (!pd) return;
  const p = tdP(built ? 'padBuilt' : 'pad');
  pd.img.setTexture(p.key);
}

// ---------------------------------------------------------------- 事件

/** 爆炸：6 帧序列帧（和登陆战同一套对象池，framefx.ts）加火星粒子 */
export function boom(bs: TdScene, x: number, y: number, size: number): void {
  bs.frames.play('boom', x, y - 6, Math.max(0.8, size), bs.time.now, DEPTH.hitFx);
  bs.pt.explosion(x, y, size);
}
