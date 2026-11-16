import type { TdScene } from './TdScene.ts';
import { TD_HERO_LIGHT } from '../content/index.ts';
import { TD_BRANCH_MOD } from '../content/tdbranches.ts';
import { TD2_ENEMIES, TD_ENEMY_ARMOR, tdJammed, type TdEnemy } from '../core/index.ts';
import { stunned } from '../core/combat.ts';
import { wobbleAt } from './stunfx.ts';
import { UNIT, BEACH } from '../core/types.ts';
import { tdE, bTex, fxA, tdP } from './art.ts';
import { interpPos, turnStep, EASE } from './motion.ts';
import { poseEvery, STYLE, atkPhase, SKEL, LOD_MARGIN } from './rig.ts';
import { tarGroundOf } from './tarfx.ts';
import { RIG_TEX, lodOf } from './rigsprite.ts';
import { flashWhite } from './fx.ts';
import { put, ringOf } from './ground.ts';
import { depthOf, footCenter, iso } from './iso.ts';
import { Turret } from './turret.ts';
import { isTurret, type LandMat } from './aim.ts';
import { sfx } from './audio/sfx.ts';
import { DEPTH } from './depth.ts';
import { stepFog, inFog } from './tdworld.ts';
import { W, RIG_OF, ATK_MS, buildCost } from './tdcommon.ts';
import { padState, boom, drawBars } from './tdoverlay.ts';
import { wreckOf } from './tdsheet.ts';
import { ftx } from './tdhud.ts';
import { STEP_MS } from './motion.ts';

/** 把规则状态画出来：敌人、塔、英雄、地上的宝藏、火药桶、障碍、血条、弹道 */
export function sync(bs: TdScene, dt: number): void {
  const s = bs.s;
  const now = bs.time.now;
  if (bs.mist.length > 0) stepFog(bs, now);
  syncJam(bs);
  // 敌人
  const alive = bs.aliveBuf;
  alive.clear();
  const cam = bs.cameras.main;
  const every = poseEvery(bs.fullRigs);
  let full = 0;
  bs.frameN++;
  const tk = s.tick + bs.acc / STEP_MS;
  bs.occ.begin();
  bs.stunMarks.begin();
  const tg = tarGroundOf(bs);
  tg.begin();
  for (const e of s.enemies) {
    if (e.mode !== 'in' && e.mode !== 'out') continue;
    alive.add(e.id);
    let sp = bs.esp.get(e.id);
    const w = W(e.x, e.y);
    if (!sp) {
      const rk = RIG_OF[e.kind];
      const kind = e.kind;
      const rig = bs.pool.get(rk, RIG_TEX, (an) => tdE(kind, an === 'attack' ? 'attack' : 'walk'), now);
      rig.c.setPosition(w.x, w.y);
      sp = { rig, kind: e.kind, px: e.x, py: e.y, still: 0, carry: null, phase: e.id * 37, lastDmg: 0, fx: e.x, fy: e.y, tx: e.x, ty: e.y, tick: s.tick, face: e.face < 0 ? -1 : 1, dist: e.id * 7, lx: w.x, ly: w.y };
      bs.esp.set(e.id, sp);
    }
    // 位置：上一拍到这一拍之间按帧内比例插（20 拍 / 秒的逻辑拍不再一格一跳）；一拍跳 > 4 格（传送）直接到位
    if (sp.tick !== s.tick) {
      const moved = Math.abs(e.x - sp.tx) + Math.abs(e.y - sp.ty);
      sp.still = moved < 1 ? sp.still + STEP_MS : 0;
      sp.fx = sp.tx;
      sp.fy = sp.ty;
      sp.tx = e.x;
      sp.ty = e.y;
      sp.tick = s.tick;
    }
    const ip = interpPos(bs.ipt, sp.fx, sp.fy, sp.tx, sp.ty, bs.acc / STEP_MS, 4 * UNIT);
    const iw = W(ip.x, ip.y);
    const step = Math.hypot(iw.x - sp.lx, iw.y - sp.ly);
    if (step < 40) sp.dist += step;
    sp.lx = iw.x;
    sp.ly = iw.y;
    // 攻击：站住不动在砍（墙、英雄、宝藏），出手按规则的出手拍 e.cd 对齐
    const stun = stunned(e, s.tick);
    const attacking = sp.still > 150 && !stun;
    let atk = -1;
    const rk = RIG_OF[e.kind];
    if (attacking) {
      const reload = TD2_ENEMIES[e.kind].reload * STEP_MS;
      const clip = rk ? STYLE[rk].attack : null;
      const ms = Math.min(clip?.ms ?? ATK_MS, reload * 0.95);
      const tn = (e.cd - tk) * STEP_MS;
      atk = atkPhase(tn, reload - tn, ms, clip?.hit ?? 0.42);
      // 旧存档的 cd 可能没对上（一直等不到出手），退回按时间循环
      if (atk < 0 && tn < -reload) atk = (((now + sp.phase) % ms) + ms) % ms / ms;
    }
    // 转向：朝向连续变，经过 0 时压扁，不瞬切
    sp.face = turnStep(sp.face, e.face < 0 ? -1 : 1, dt);
    const flying = TD_ENEMY_ARMOR[e.kind] === 'air';
    const hgt = rk ? -SKEL[rk].top * SKEL[rk].s : 60;
    const lod = lodOf(cam, bs.r, iw.x, iw.y, hgt, LOD_MARGIN);
    if (lod === 0 && rk) full++;
    let a = 1;
    if ((e.kind === 'fog' || inFog(bs, e.x, e.y)) && !lit(bs, e)) a = 0.3;
    const edep = depthOf(ip.x / UNIT, ip.y / UNIT) + 0.2 + (flying ? 100 : 0);
    // 被震晕：站住不动（待机姿势）、整个人晃，头顶转星
    sp.rig.update({ x: iw.x, y: iw.y, depth: edep, face: sp.face, mode: stun ? 'idle' : attacking ? 'attack' : 'walk', dist: sp.dist, atk, oy: 0, sq: 0, alpha: a, lod, full: every === 1 || (bs.frameN + e.id) % every === 0, wob: stun ? wobbleAt(now, e.id) : 0, gx: e.gx, gy: e.gy, gdown: stun }, now);
    if (stun && lod !== 2) bs.stunMarks.mark(iw.x, sp.rig.topY - 4, now, edep, ((e.stunUntil ?? 0) - tk) * STEP_MS);
    if (lod === 0 && !flying && a === 1) bs.occ.check(sp.rig, sp.rig.c.depth, now);
    const slowed = s.tick < e.slowUntil;
    sp.rig.setSlow(slowed);
    // 减速（焦油、命中减速）：脚下一摊粘油（身上黑点在 Rig 里），近景才画（屏外和远景的小点看不清，省着画）
    if (slowed && lod === 0) {
      if (lod === 0) tg.feet(iw.x, iw.y, e.id, now);
    }
    if (e.carry > 0) {
      if (!sp.carry) sp.carry = bs.add.text(0, 0, '', { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${14 * bs.r}px`, color: '#ffe885', stroke: '#2b1a15', strokeThickness: 3.5 * bs.r }).setOrigin(0.5).setScale(1 / bs.r).setDepth(DEPTH.slowMark);
      sp.carry.setText(`+${e.carry}`).setPosition(iw.x, sp.rig.topY - 8);
    } else if (sp.carry) {
      sp.carry.destroy();
      sp.carry = null;
    }
  }
  bs.fullRigs = full;
  tg.end(now);
  bs.stunMarks.end();
  bs.occ.end();
  for (const [id, sp] of bs.esp) {
    if (!alive.has(id)) {
      sp.carry?.destroy();
      bs.pool.put(sp.rig);
      bs.esp.delete(id);
    }
  }
  // 临时塔（常驻塔的图在开局就画好了）
  for (const t of s.towers) {
    if (t.slot < 0) continue;
    const p = bTex(t.kind, t.level);
    let sp = bs.tsp.get(t.id);
    const f = footCenter(t.x, t.y, 2);
    const w = iso(f.gx, f.gy);
    if (!sp) {
      const im = put(bs, bs.r, p, w.x, w.y).setDepth(depthOf(f.gx, f.gy));
      sp = { img: im, key: p.key, baseX: w.x, baseY: w.y, br: t.branch.join(','), slot: t.slot };
      if (isTurret(t.kind)) sp.tu = new Turret(bs, bs.r, bs.pt, t.kind, t.level, t.id, im, w.x, w.y);
      bs.tsp.set(t.id, sp);
      bs.occ.add(t.id, im);
      bs.pt.ringBurst(w.x, w.y + 2, 2);
      padState(bs, t.slot, true);
    } else if (sp.key !== p.key || sp.br !== t.branch.join(',')) {
      // 升级 / 选路线：换图的同时白闪、放大后回弹（back 曲线 260ms）、脚下一圈光
      sp.key = p.key;
      sp.br = t.branch.join(',');
      bs.tweens.killTweensOf(sp.img);
      sp.img.setTexture(p.key).setOrigin(p.ax / p.w, p.ay / p.h).setPosition(sp.baseX, sp.baseY);
      sp.tu?.setLevel(t.level, p.key);
      bs.occ.add(t.id, sp.img);
      bs.pt.ringBurst(w.x, w.y + 2, 2);
      flashWhite(bs, sp.img);
      sp.img.setScale(1.3 / bs.r);
      bs.tweens.add({ targets: sp.img, scale: 1 / bs.r, duration: 260, ease: EASE.land });
    }
  }
  // 卖掉的塔：拆掉图和炮台，木台换回空的
  if (bs.tsp.size > s.towers.length) {
    const have = new Set(s.towers.map((t) => t.id));
    for (const [id, sp] of bs.tsp) {
      if (have.has(id) || sp.slot < 0) continue;
      bs.tweens.killTweensOf(sp.img);
      sp.tu?.destroy();
      bs.pt.splinters(sp.baseX, sp.baseY - 10, 8);
      sp.img.destroy();
      bs.occ.remove(id);
      bs.jamFx.get(id)?.destroy();
      bs.jamFx.delete(id);
      bs.tsp.delete(id);
      padState(bs, sp.slot, false);
    }
  }
  // 空木台上的"+"：够钱造最便宜的那种才亮；压着沉船的不显示
  let cheapest = Infinity;
  for (const k of s.unlocked) cheapest = Math.min(cheapest, buildCost(k));
  for (let i = 0; i < bs.pads.length; i++) {
    const sl = s.slots[i];
    if (sl) bs.pads[i]!.plus.setAlpha(sl.tower < 0 && !wreckOf(bs, sl) ? (s.gold >= cheapest ? 1 : 0.55) : 0);
  }
  bs.plan.update(dt, s.enemies.some((e) => e.mode === 'in'));
  bs.plan.barricades(s.barricades ?? [], s.tick);
  // 英雄
  const h = s.hero;
  if (bs.heroTick !== s.tick) {
    if (bs.heroTick < 0) {
      bs.heroTo.x = h.x;
      bs.heroTo.y = h.y;
    }
    bs.heroFrom.x = bs.heroTo.x;
    bs.heroFrom.y = bs.heroTo.y;
    bs.heroTo.x = h.x;
    bs.heroTo.y = h.y;
    bs.heroTick = s.tick;
  }
  // 英雄位置也按拍间插值
  const hp = interpPos(bs.ipt, bs.heroFrom.x, bs.heroFrom.y, bs.heroTo.x, bs.heroTo.y, bs.acc / STEP_MS, 4 * UNIT);
  const hw = W(hp.x, hp.y);
  const hdx = hw.x - bs.heroPx;
  const moving = Math.abs(hdx) + Math.abs(hw.y - bs.heroPy) > 0.15;
  bs.heroDist += Math.abs(hdx) + Math.abs(hw.y - bs.heroPy);
  const sinceShot = bs.time.now - bs.heroShotAt;
  const atk = (!moving && heroAttacking(bs)) || sinceShot < ATK_MS;
  const atkPh = sinceShot < ATK_MS ? sinceShot / ATK_MS : (bs.time.now % ATK_MS) / ATK_MS;
  // 转向过渡：有目标就朝目标转身，否则朝走的方向
  const hes = h.respawn < 0 && h.aim >= 0 ? bs.esp.get(h.aim) : undefined;
  if (hes && Math.abs(hes.rig.x - hw.x) > 4) bs.heroWant = hes.rig.x < hw.x ? -1 : 1;
  else if (Math.abs(hdx) > 0.12) bs.heroWant = hdx < 0 ? -1 : 1;
  bs.heroTurn = turnStep(bs.heroTurn, bs.heroWant, dt);
  bs.heroPx = hw.x;
  bs.heroPy = hw.y;
  const hd = depthOf(hp.x / UNIT, hp.y / UNIT) + 0.3;
  if (h.respawn >= 0) {
    // 倒地等复活：跪倒后停在地上半透明
    if (bs.heroDownAt < 0) bs.heroDownAt = now;
    bs.hero.c.setPosition(hw.x, hw.y).setDepth(hd).setAlpha(Math.max(0.3, 1 - (now - bs.heroDownAt) / 900));
    bs.hero.downed((now - bs.heroDownAt) / 1100);
  } else {
    if (bs.heroDownAt >= 0) {
      bs.heroDownAt = -1;
      bs.hero.revive();
    }
    bs.hero.update({ x: hw.x, y: hw.y, depth: hd, face: bs.heroTurn * 1.1, mode: atk ? 'attack' : moving ? 'walk' : 'idle', dist: bs.heroDist, atk: atk ? atkPh : -1, oy: 0, sq: 0, alpha: 1, lod: 0, full: true }, now);
  }
  bs.heroRing.setPosition(hw.x, hw.y + 1).setDepth(depthOf(hp.x / UNIT, hp.y / UNIT) + 0.25).setVisible(h.respawn < 0);
  // 火药桶、障碍
  for (const kg of s.kegs) {
    const im = bs.kegs.get(kg.id);
    if (im && !kg.alive) {
      boom(bs, im.x, im.y, 1.3);
      im.destroy();
      bs.kegs.delete(kg.id);
    }
  }
  for (const b of s.blocks) {
    const im = bs.blocks.get(b.id);
    if (im && b.destroyed) {
      bs.pt.splinters(im.x, im.y - 6, 8);
      ftx(bs, im.x, im.y - 20, `+${b.gold}`, '#ffe885', 15);
      sfx('coin');
      im.destroy();
      bs.blocks.delete(b.id);
    }
  }
  // 地上的宝藏
  const sig = s.piles.map((p) => `${p.x},${p.y},${p.n}`).join(';');
  if (sig !== bs.pileSig) {
    bs.pileSig = sig;
    for (const o of bs.pileObjs) o.destroy();
    bs.pileObjs = [];
    for (const p of s.piles) {
      const w = W(p.x, p.y);
      const c = fxA('coins');
      const im = put(bs, bs.r, c, w.x, w.y).setDepth(depthOf(p.x / UNIT, p.y / UNIT) + 0.1).setScale(1.1 / bs.r);
      const tx = bs.add.text(w.x, w.y - 22, `${p.n}`, { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${14 * bs.r}px`, color: '#ffe885', stroke: '#2b1a15', strokeThickness: 3.5 * bs.r }).setOrigin(0.5).setScale(1 / bs.r).setDepth(DEPTH.slowMark);
      bs.tweens.add({ targets: [im, tx], y: '-=4', duration: 500, yoyo: true, repeat: -1 });
      bs.pileObjs.push(im, tx);
    }
  }
  // 宝藏箱空了就暗一点
  for (const c of bs.chests) c.setAlpha(s.vault > 0 ? 1 : 0.6);
  // 炮台转向、弹道（visual time = 上一个处理过的拍 + 帧内比例）
  syncTurrets(bs, now, dt);
  renderSnipe(bs, now);
  bs.shots.update(s.tick - 1 + bs.acc / STEP_MS, bs.hs.active ? 0 : dt);
  drawBars(bs);
}

/** 狙击预警每帧重画：炮口（炮台当前朝向）到敌人胸口一条线，脚下一个准星；敌人倒下 / 逃走就收掉 */
export function renderSnipe(bs: TdScene, now: number): void {
  const vt = bs.s.tick - 1 + bs.acc / STEP_MS;
  if (bs.snipe.live === 0) {
    bs.snipe.draw(vt, now, () => false);
    return;
  }
  bs.snipe.draw(vt, now, (a, e) => {
    const sp = bs.tsp.get(a.tower);
    const es = bs.esp.get(a.target);
    if (!sp?.tu || !es) return false;
    const m = sp.tu.muzzle(bs.snipeEnds);
    e.mx = m.x;
    e.my = m.y;
    e.tx = es.rig.x;
    e.ty = (es.rig.y + es.rig.topY) / 2 + 6;
    e.fx = es.rig.x;
    e.fy = es.rig.y;
    return true;
  });
}

/** 炮台每帧：炮口只跟规则的 t.aim（不自己挑目标，免得追着打不到的敌人转）；没有目标就不动 */
export function syncTurrets(bs: TdScene, now: number, dt: number): void {
  const s = bs.s;
  const vt = s.tick - 1 + bs.acc / STEP_MS;
  const o = bs.tin;
  for (const t of s.towers) {
    const sp = bs.tsp.get(t.id);
    if (!sp?.tu) continue;
    o.now = now;
    o.dt = bs.hs.active ? 0 : dt;
    o.has = false;
    o.aiming = t.aim >= 0;
    o.until = Infinity;
    // 狙击塔预警中：炮管跟着被锁定的敌人，离开火的时间按 fireAt 算
    const sa = t.kind === 'sniper' ? bs.snipe.of(t.id) : null;
    const es = sa ? bs.esp.get(sa.target) ?? (t.aim >= 0 ? bs.esp.get(t.aim) : undefined) : t.aim >= 0 ? bs.esp.get(t.aim) : undefined;
    if (sa && es) {
      o.aiming = true;
      o.until = (sa.fireAt - vt) * STEP_MS;
    } else if (es) o.until = (Math.max(t.cd, s.tick) - vt) * STEP_MS;
    if (es) {
      o.has = true;
      o.tx = es.rig.x;
      o.ty = es.rig.y;
    }
    sp.tu.update(o);
  }
}

/** 落点的材质：海里出水花，砸在墙上出木屑 / 石屑，其余是地面尘土 */
export function matAt(bs: TdScene, x: number, y: number): LandMat {
  const gx = Math.floor(x / UNIT);
  const gy = Math.floor(y / UNIT);
  if (ringOf(gx, gy) > BEACH) return 'water';
  for (const w of bs.s.walls) if (!w.destroyed && w.x === gx && w.y === gy) return (bs.wallLevel.get(w.id) ?? 1) <= 2 ? 'wood' : 'stone';
  return 'ground';
}

/** 被炸哑的塔：塔身发灰、头上冒烟；恢复了就去掉 */
export function syncJam(bs: TdScene): void {
  const s = bs.s;
  // 顺着塔列表走、按编号取画面对象（原来对每个画面对象在塔列表里再找一遍）
  for (const t of s.towers) {
    const id = t.id;
    const sp = bs.tsp.get(id);
    if (!sp) continue;
    const jam = tdJammed(s, id);
    const fx = bs.jamFx.get(id);
    if (jam) {
      sp.img.setTint(0x8c94a4);
      if (!fx) {
        const f = footCenter(t.x, t.y, 2);
        const w = iso(f.gx, f.gy);
        const im = put(bs, bs.r, tdP('jam'), w.x, w.y - 40).setDepth(DEPTH.jam);
        bs.jamFx.set(id, im);
        bs.tweens.add({ targets: im, y: im.y - 8, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    } else if (fx) {
      bs.tweens.killTweensOf(fx);
      fx.destroy();
      bs.jamFx.delete(id);
      sp.img.clearTint();
    }
  }
}

export function heroAttacking(bs: TdScene): boolean {
  const h = bs.s.hero;
  return h.aim >= 0 && h.respawn < 0;
}

/** 雾船有没有被照到（英雄、灯塔分叉）：只用来决定画得多淡 */
export function lit(bs: TdScene, e: TdEnemy): boolean {
  return litAt(bs, e.x, e.y);
}

export function litAt(bs: TdScene, x: number, y: number): boolean {
  const s = bs.s;
  const h = s.hero;
  if (h.respawn < 0 && Math.hypot(h.x - x, h.y - y) <= TD_HERO_LIGHT) return true;
  if (bs.lightsTick !== s.tick) {
    bs.lightsTick = s.tick;
    bs.lampList.length = 0;
    for (const t of s.towers) {
      const light = t.branch.reduce((m, id) => Math.max(m, TD_BRANCH_MOD.get(id)?.light ?? 0), 0);
      if (light > 0) bs.lampList.push({ x: (t.x + t.size / 2) * UNIT, y: (t.y + t.size / 2) * UNIT, r: light });
    }
  }
  for (const l of bs.lampList) if (Math.hypot(l.x - x, l.y - y) <= l.r) return true;
  return false;
}
