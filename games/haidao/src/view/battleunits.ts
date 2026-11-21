/** 单位渲染：兵和驻岛英雄的精灵同步、插值、动画与死亡、弹道、地面材质 */
import { BUILDINGS, TROOPS } from '../content/index.ts';
import { BEACH, ISLAND, UNIT, type BBuilding, type BUnit, type TroopKind } from '../core/types.ts';
import { app } from './app.ts';
import { troopF } from './art.ts';
import { EASE, STAGE_LOOK, interpPos, turnStep } from './motion.ts';
import { approach, crowdOffsets, CROWD_D, CROWD_MAX, type CrowdItem } from './crowd.ts';
import { GROUP_R, biggestCluster, frameFocus, type FPt } from './camguide.ts';
import type { Director } from './camfit.ts';
import { LOD_MARGIN, SKEL, STYLE, atkPhase, deathStyleFor, poseEvery, type RigKind } from './rig.ts';
import { trackOf } from './dmgkind.ts';
import { tarGroundOf } from './tarfx.ts';
import { RIG_TEX, lodOf, rigTex, type FrameSrc, type Rig } from './rigsprite.ts';
import type { Turret } from './turret.ts';
import type { LandKind, ShotFx } from './shots.ts';
import { arcHeight, type LandMat } from './aim.ts';
import { stunned } from '../core/combat.ts';
import { slowUntil } from '../core/battle.ts';
import { wobbleAt } from './stunfx.ts';
import { depthOf } from './iso.ts';
import { SPREAD_R, HERO_ATK_MS, PROJ_FX, AIMED, AREA, CELL_RX } from './battlecommon.ts';
import type { USpr } from './battlecommon.ts';
import type { BattleScene } from './BattleScene.ts';
import { damageLook, fogOf } from './battlebuildings.ts';
import { isWater } from './battleevents.ts';
import { DEPTH } from './depth.ts';
import { landShift } from './landfx.ts';
import { STEP_MS } from './motion.ts';

/** 兵种 → 骨架键（`t.<兵种>`），拼好存着，每帧每个兵不再拼字符串 */
const RIG_KEYS = new Map<TroopKind, RigKind>();
function rigKey(kind: TroopKind): RigKind {
  let k = RIG_KEYS.get(kind);
  if (!k) RIG_KEYS.set(kind, (k = `t.${kind}`));
  return k;
}

export function syncUnits(bs: BattleScene): void {
  bs.ubyId.clear();
  for (const u of bs.st.units) {
    bs.ubyId.set(u.id, u as BUnit);
    let sp = bs.usp.get(u.id);
    const w = bs.W(u.x, u.y);
    if (!sp) {
      const rig = newRig(bs, u.kind, w.x, w.y);
      sp = { rig, px: u.x, py: u.y, cx: u.x, cy: u.y, kind: u.kind, fading: false, born: -1, face: u.face, dist: u.id * 7, lx: w.x, ly: w.y, lastDmg: 0, maxHp: u.maxHp, ox: 0, oy: 0 };
      bs.usp.set(u.id, sp);
    }
    sp.cx = u.x;
    sp.cy = u.y;
    if (u.mode === 'dead' && !sp.fading) fade(bs, sp, u.id);
  }
}

/** 从对象池取一个兵的骨架（装了皮肤且皮肤图集烘好了就用皮肤的） */
function newRig(bs: BattleScene, kind: TroopKind, x: number, y: number): Rig {
  const skin = app.profile.skins?.[kind];
  const rk: RigKind = `t.${kind}`;
  const frames: FrameSrc = (an) => safeFrames(bs, kind, an, skin);
  const rig = bs.pool.get(rk, rigTex(rk, skin, bs.textures), frames, bs.nowT);
  rig.c.setPosition(x, y);
  return rig;
}

/** 倒下：炸飞 / 中弹倒地 / 烧焦 / 软倒 / 跪倒（按伤害类型和最后一下的伤害选，炸药兵炸完是飞出去）、帽子飞出去、淡出；演完放回对象池（anim.ts 的 DyingList 每帧推进，不新建补间） */
export function fade(bs: BattleScene, sp: USpr, id: number): void {
  sp.fading = true;
  // 怎么倒：伤害类型从最近的开火 / 爆炸事件推（dmgkind.ts），晕着死的软倒，推不出来按伤害数
  const u = bs.ubyId.get(id);
  const style = deathStyleFor(trackOf(bs).take(id), sp.lastDmg, sp.maxHp, sp.kind === 'bomber', !!u && stunned(u, bs.st.tick));
  bs.dying.addRig(sp.rig, sp.face, style, (r) => bs.pool.put(r), bs.pt);
}

/** 兵倒下的位置离哪种防御最近（射程内），记一笔，结算页据此说原因 */
export function tallyDeath(bs: BattleScene, ux: number, uy: number): void {
  let best: string | null = null;
  let bd = 1e9;
  for (const b of bs.st.buildings) {
    if (b.destroyed || BUILDINGS[b.kind].category !== 'defense' || b.kind === 'mine' || b.kind === 'tar') continue;
    const d = Math.hypot((b.x + b.size / 2) * UNIT - ux, (b.y + b.size / 2) * UNIT - uy) / UNIT;
    const range = (BUILDINGS[b.kind].levels[b.level - 1]?.range ?? 6) + 2;
    if (d <= range && d < bd) {
      bd = d;
      best = b.kind;
    }
  }
  if (best) bs.deathBy.set(best, (bs.deathBy.get(best) ?? 0) + 1);
}

/** 大个子按显示宽度占位（半径，逻辑单位）：壮汉、炮手这类身板宽的；其余用默认（CROWD_D 的一半） */
const BIG_KINDS: ReadonlySet<TroopKind> = new Set<TroopKind>(['brute', 'cannoneer']);
function crowdRadius(k: TroopKind): number {
  return BIG_KINDS.has(k) ? 38 : CROWD_D / 2;
}

/** 偏移后的位置在建筑占地里（没倒的）或出了登陆区外缘（海里）就算挡住 */
function crowdBlocked(bs: BattleScene, x: number, y: number): boolean {
  const e = BEACH + bs.st.ext;
  const lim = (ISLAND + e) * UNIT - 20;
  if (x < -e * UNIT + 20 || y < -e * UNIT + 20 || x > lim || y > lim) return true;
  for (const b of bs.st.buildings) {
    if (b.destroyed || b.kind === 'mine' || b.kind === 'tar') continue;
    if (x > b.x * UNIT + 10 && x < (b.x + b.size) * UNIT - 10 && y > b.y * UNIT + 10 && y < (b.y + b.size) * UNIT - 10) return true;
  }
  return false;
}

const crowdItems: CrowdItem[] = [];
const crowdSp: USpr[] = [];
let crowdOx = new Float64Array(64);
let crowdOy = new Float64Array(64);

export function renderUnits(bs: BattleScene, frac: number, time: number, dt: number): void {
  const tg = tarGroundOf(bs);
  tg.begin();
  const o = bs.ipt;
  const cam = bs.cameras.main;
  const every = poseEvery(bs.fullRigs);
  let full = 0;
  bs.rigCap.begin();
  const vc = cam.worldView;
  const tk = bs.st.tick + frac;
  const occ = bs.occ;
  occ.begin();
  bs.stunMarks.begin();
  // 挤开（crowd.ts）：先算每个兵的显示位置，把挤在一起的互相推开，当前偏移按时间平滑追目标，只影响显示
  crowdItems.length = 0;
  crowdSp.length = 0;
  for (const [id, sp] of bs.usp) {
    if (sp.fading || !bs.ubyId.get(id)) continue;
    interpPos(o, sp.px, sp.py, sp.cx, sp.cy, frac, 4 * UNIT);
    const sa = id * 2.39996;
    const sr = SPREAD_R + (id % 3) * 8;
    crowdItems.push({ id, x: o.x + Math.cos(sa) * sr, y: o.y + Math.sin(sa) * sr, r: crowdRadius(sp.kind) });
    crowdSp.push(sp);
  }
  if (crowdOx.length < crowdItems.length) {
    crowdOx = new Float64Array(crowdItems.length * 2);
    crowdOy = new Float64Array(crowdItems.length * 2);
  }
  crowdOffsets(crowdItems, crowdOx, crowdOy, CROWD_D, CROWD_MAX, 5, (x, y) => crowdBlocked(bs, x, y));
  for (let i = 0; i < crowdSp.length; i++) {
    const sp = crowdSp[i]!;
    sp.ox = approach(sp.ox, crowdOx[i]!, dt);
    sp.oy = approach(sp.oy, crowdOy[i]!, dt);
  }
  let ci = -1;
  for (const [id, sp] of bs.usp) {
    if (sp.fading) continue;
    const u = bs.ubyId.get(id);
    if (!u) continue;
    ci++;
    // 位置：上一拍到这一拍之间按帧内比例插，不跳格（传送一类一拍跳 > 4 格的直接到位）
    // 画面的站位散开：规则里同一船的兵站得很近（小道偏移最多 ±24），精灵比这宽，看着像叠成一个；按 id 绕一小圈各让开一点，再按挤开的偏移推开
    o.x = crowdItems[ci]!.x + sp.ox;
    o.y = crowdItems[ci]!.y + sp.oy;
    const w = bs.W(o.x, o.y);
    // 走过的距离：走路循环按距离推进（一拍跳太远的不算）
    const step = Math.hypot(w.x - sp.lx, w.y - sp.ly);
    sp.lx = w.x;
    sp.ly = w.y;
    if (step < 40) sp.dist += step;
    // 攻击：按规则的出手拍对齐（下一次出手 u.cd，上一次 = cd - 装填），出手那一帧就是动作的出手点，远程就是子弹飞出去那一拍
    let atk = -1;
    if (u.mode === 'attack') {
      const reload = TROOPS[u.kind].levels[u.level - 1]?.reload ?? 20;
      const clip = STYLE[rigKey(u.kind)].attack;
      const tn = (u.cd - tk) * STEP_MS;
      atk = atkPhase(tn, reload * STEP_MS - tn, Math.min(clip.ms ?? 600, reload * STEP_MS * 0.95), clip.hit ?? 0.42);
    }
    // 兵从船上跳下来：320 毫秒一个小弹跳（上去 ease-out，落地压扁一下），只动画面
    if (sp.born < 0) sp.born = time;
    const hk = (time - sp.born) / 320;
    let oy = 0;
    let squash = 0;
    if (hk < 1) {
      oy -= Math.sin(Math.PI * Math.min(1, hk * 1.1)) * 11;
      squash = hk > 0.75 ? Math.sin(((hk - 0.75) / 0.25) * Math.PI) * 0.14 : 0;
    }
    // 下船位移（landfx.ts）：登陆后约 1 秒内，兵先坐在木筏上、再跳下涉水上岸；显示位置收敛到规则位置，规则不变
    const ld = landShift(bs, id, w, time);
    if (ld) {
      if (ld.hold && step < 40) sp.dist -= step;
      oy = ld.oy;
      squash = ld.sq;
    }
    // 转向：朝向连续变（经过 0 时压扁），不瞬切
    sp.face = turnStep(sp.face, u.face, dt);
    const sk = SKEL[rigKey(u.kind)];
    let lod = lodOf(cam, bs.r, w.x, w.y, -sk.top * sk.s, LOD_MARGIN);
    // 屏内完整骨架太多时，远的、小的换整张图（rigcap.ts）
    if (lod === 0 && !bs.rigCap.want(u.id, ((w.x - vc.centerX) ** 2 + (w.y - vc.centerY) ** 2) * cam.zoom * cam.zoom, (-sk.top * sk.s * cam.zoom) / bs.r)) lod = 1;
    if (lod === 0) full++;
    // 被震晕：站住不动、整个人晃、头顶转星
    const stun = stunned(u, bs.st.tick);
    const udep = depthOf(o.x / UNIT, o.y / UNIT) + 0.4;
    sp.rig.update({ x: w.x, y: w.y, depth: udep, face: sp.face, mode: stun ? 'idle' : u.mode === 'attack' ? 'attack' : u.mode === 'move' ? 'walk' : 'idle', dist: sp.dist, atk: stun ? -1 : atk, oy, sq: squash, alpha: 1, lod, full: every === 1 || (bs.frameN + id) % every === 0, wob: stun ? wobbleAt(time, id) : 0, gx: bs.devDir ? bs.devDir.gx : u.gx, gy: bs.devDir ? bs.devDir.gy : u.gy, gdown: stun }, time);
    if (stun && lod !== 2) bs.stunMarks.mark(w.x, sp.rig.topY - 4, time, udep, ((u.stunUntil ?? 0) - tk) * STEP_MS);
    if (lod === 0) occ.check(sp.rig, sp.rig.c.depth, time);
    // 焦油（和命中减速）：还在减速期内就画兵身上的黑点、颜色发暗；减速到哪一拍只从核心读，画面不自己算
    const slowed = tk < slowUntil(bs.st, u.id);
    sp.rig.setSlow(slowed);
    if (slowed) {
      // 脚下一摊粘稠的黑油（在地面层，兵站在上面）+ 身上的黑点和往下淌的油滴
      if (lod === 0) tg.feet(w.x, w.y, id, time);
    }
  }
  bs.fullRigs = full;
  bs.rigCap.end();
  tg.end(time);
  renderHero(bs, frac, time, dt);
  bs.stunMarks.end();
  occ.end();
  for (const b of bs.st.buildings) {
    const sp = bs.bsp.get(b.id);
    if (!sp) continue;
    if (b.kind === 'mine' || b.kind === 'tar') sp.img.setVisible(b.revealed && !(b.kind === 'tar' && sp.down));
    else if (!sp.down) fogOf(bs, b, sp);
    else if (bs.fogSpr.has(b.id)) fogOf(bs, b, sp);
    if (!sp.down && b.revealed && b.maxHp > 0 && b.kind !== 'mine' && b.kind !== 'tar') damageLook(bs, b, sp, time);
  }
}

/** 塔开火的后坐：朝反方向顶几个像素、微微鼓一下，EASE.recoil 回位（补间在塔身上，同一座塔重开火时重来） */
export function recoil(bs: BattleScene, id: number, pr: { x0: number; y0: number; x1: number; y1: number } | undefined): void {
  const sp = bs.bsp.get(id);
  if (!sp || sp.down || !pr) return;
  const a = bs.W(pr.x0, pr.y0);
  const c = bs.W(pr.x1, pr.y1);
  const dl = Math.hypot(c.x - a.x, c.y - a.y) || 1;
  const L = STAGE_LOOK[sp.stage];
  bs.tweens.killTweensOf(sp.img);
  const base = 1 / bs.r;
  sp.img.setScale(base * 1.05, base * L.sy * 1.05).setPosition(sp.baseX - ((c.x - a.x) / dl) * 3, sp.baseY - ((c.y - a.y) / dl) * 1.5);
  bs.tweens.add({ targets: sp.img, scaleX: base, scaleY: base * L.sy, x: sp.baseX, y: sp.baseY, duration: 200, ease: EASE.recoil });
}

/** 驻岛英雄、地火、号令光：和守岛（TdScene）里的英雄同一套画法 */
function renderHero(bs: BattleScene, frac: number, time: number, dt: number): void {
  const s = bs.st;
  const h = s.hero;
  const fg = bs.fireG;
  fg.clear();
  for (const f of s.fires ?? []) {
    if (s.tick >= f.until) continue;
    const w = bs.W(f.x, f.y);
    const R = f.r / UNIT;
    const fl = 0.85 + 0.15 * Math.sin(time / 90 + f.x);
    fg.fillStyle(0xff7a1f, 0.28 * fl).fillEllipse(w.x, w.y, R * 90, R * 45);
    fg.fillStyle(0xffc23f, 0.22 * fl).fillEllipse(w.x, w.y, R * 55, R * 28);
    fg.lineStyle(2, 0xff5a1f, 0.5).strokeEllipse(w.x, w.y, R * 90, R * 45);
  }
  // 号令：被罩的塔泛一层金光
  const on = new Set<number>(h && s.tick < h.rallyUntil ? h.rallyIds : []);
  for (const id of on) if (!bs.rallied.has(id)) bs.bsp.get(id)?.img.setTint(0xfff0a0);
  for (const id of bs.rallied) if (!on.has(id)) bs.bsp.get(id)?.img.clearTint();
  bs.rallied = on;
  if (!h) return;
  if (!bs.heroImg) {
    const w0 = bs.W(h.x, h.y);
    bs.heroRing = bs.add.ellipse(w0.x, w0.y, 30, 15).setStrokeStyle(3, 0xffe885, 1).setDepth(DEPTH.heroRing);
    bs.heroImg = bs.pool.get('t.captain', RIG_TEX, (an) => safeFrames(bs, 'captain', an), time);
    bs.heroImg.c.setPosition(w0.x, w0.y);
    bs.heroPx = w0.x;
    bs.heroPy = w0.y;
    bs.heroFrom.x = bs.heroTo.x = h.x;
    bs.heroFrom.y = bs.heroTo.y = h.y;
    bs.heroFace = 1;
  }
  const rig = bs.heroImg;
  // 位置按拍间插值（和兵一样），不再一拍一跳
  const ip = interpPos(bs.ipt, bs.heroFrom.x, bs.heroFrom.y, bs.heroTo.x, bs.heroTo.y, frac, 4 * UNIT);
  const hw = bs.W(ip.x, ip.y);
  const dead = h.mode === 'dead';
  const dx = hw.x - bs.heroPx;
  const moved = Math.hypot(dx, hw.y - bs.heroPy);
  const moving = h.mode === 'move' || moved > 0.15;
  if (moved < 40) bs.heroDist += moved;
  // 转向过渡：朝移动方向（没动时看攻击朝向）
  const want = Math.abs(dx) > 0.12 ? (dx < 0 ? -1 : 1) : h.mode === 'attack' ? (h.face === -1 ? -1 : 1) : bs.heroFace;
  bs.heroFace = want;
  bs.heroTurn = turnStep(bs.heroTurn, want, dt);
  bs.heroPx = hw.x;
  bs.heroPy = hw.y;
  const d = depthOf(ip.x / UNIT, ip.y / UNIT);
  bs.heroMarks.begin();
  if (dead) {
    // 倒地：跪倒后停在地上半透明（不消失）
    if (bs.heroDownAt < 0) bs.heroDownAt = time;
    rig.c.setPosition(hw.x, hw.y).setDepth(d + 0.3).setAlpha(Math.max(0.35, 1 - (time - bs.heroDownAt) / 900));
    rig.downed((time - bs.heroDownAt) / 1100);
  } else {
    if (bs.heroDownAt >= 0) {
      bs.heroDownAt = -1;
      rig.revive();
    }
    const atk = h.mode === 'attack' ? (time % HERO_ATK_MS) / HERO_ATK_MS : -1;
    const hstun = stunned(h as { stunUntil?: number }, bs.st.tick);
    rig.update({ x: hw.x, y: hw.y, depth: d + 0.3, face: bs.heroTurn * 1.1, mode: hstun ? 'idle' : h.mode === 'attack' ? 'attack' : moving ? 'walk' : 'idle', dist: bs.heroDist, atk: hstun ? -1 : atk, oy: 0, sq: 0, alpha: 1, lod: 0, full: true, wob: hstun ? wobbleAt(time, 7) : 0 }, time);
    if (hstun) bs.heroMarks.mark(hw.x, rig.topY - 4, time, d + 0.3, (((h as { stunUntil?: number }).stunUntil ?? 0) - bs.st.tick) * STEP_MS);
    bs.occ.check(rig, d + 0.3, time);
  }
  bs.heroMarks.end();
  bs.heroRing?.setPosition(hw.x, hw.y + 1).setDepth(d + 0.25).setVisible(!dead);
}

function safeFrames(bs: BattleScene, kind: TroopKind, anim: 'idle' | 'walk' | 'attack', skin?: string): ReturnType<typeof troopF> | null {
  try {
    const f = troopF(kind, anim, skin);
    if (f.length && bs.textures.exists(f[0]!.key)) return f;
    return skin ? safeFrames(bs, kind, anim) : null;
  } catch {
    return null;
  }
}

/** 每座塔上一次找到的最近的兵：id → 兵的编号和找的那一帧 */
const nearCache = new WeakMap<BattleScene, Map<number, { uid: number; frame: number }>>();
/** 隔几帧才重找一次（炮管提前转的目标差个几帧看不出来；各塔按编号错开） */
const NEAR_EVERY = 4;

/** 快进射程的兵（射程 1.35 倍内、最近的）：只给画面提前转炮管用，规则怎么挑目标不变。每 NEAR_EVERY 帧才扫一遍全军，中间沿用上次的（兵没了 / 跑出射程就立刻重找） */
export function nearUnit(bs: BattleScene, b: BBuilding): BUnit | undefined {
  const lv = BUILDINGS[b.kind].levels[b.level - 1];
  const R = (lv?.range ?? 0) * UNIT * 1.35;
  const cx = (b.x + b.size / 2) * UNIT;
  const cy = (b.y + b.size / 2) * UNIT;
  let cache = nearCache.get(bs);
  if (!cache) nearCache.set(bs, (cache = new Map()));
  const c = cache.get(b.id);
  if (c && bs.frameN - c.frame < NEAR_EVERY && bs.frameN >= c.frame) {
    const u = c.uid < 0 ? undefined : bs.ubyId.get(c.uid);
    if (c.uid < 0) return undefined;
    if (u && u.mode !== 'dead' && (u.x - cx) * (u.x - cx) + (u.y - cy) * (u.y - cy) < R * R) return u;
  }
  let best: BUnit | undefined;
  let bd = R * R;
  for (const u of bs.st.units) {
    if (u.mode === 'dead') continue;
    const d = (u.x - cx) * (u.x - cx) + (u.y - cy) * (u.y - cy);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  // 没找到也记下（-1），免得空场时每帧白扫
  cache.set(b.id, { uid: best ? best.id : -1, frame: bs.frameN });
  return best;
}

/** 落点的材质：海里出水花，砸在木头建筑 / 墙上出木屑，石头的出石屑，其余是地面尘土 */
export function matAt(bs: BattleScene, x: number, y: number): LandMat {
  if (isWater(bs.st.ext, x, y)) return 'water';
  const gx = Math.floor(x / UNIT);
  const gy = Math.floor(y / UNIT);
  for (const b of bs.st.buildings) {
    if (b.destroyed || b.kind === 'palm' || b.kind === 'rock' || b.kind === 'mine' || b.kind === 'tar') continue;
    if (gx >= b.x && gx < b.x + b.size && gy >= b.y && gy < b.y + b.size) return b.level <= 2 || b.kind === 'sawmill' || b.kind === 'woodyard' ? 'wood' : 'stone';
  }
  return 'ground';
}

/** 弹道：规则新出的弹（id 递增）交给对象池画弧线、阴影、落点；塔打的从炮口出发 */
export function renderProjectiles(bs: BattleScene, frac: number, dt: number): void {
  const s = bs.st;
  for (const p of s.projectiles) {
    if (p.id <= bs.projSeen) continue;
    bs.projSeen = p.id;
    const from = bs.shotFrom.get(p.id);
    bs.shotFrom.delete(p.id);
    const a = bs.W(p.x0, p.y0);
    const t = bs.W(p.x1, p.y1);
    let fx: ShotFx = PROJ_FX[p.kind] ?? 'ball';
    let land: LandKind = p.kind === 'bullet' ? 'bullet' : p.kind === 'shell' ? 'shell' : p.kind === 'ball' ? 'ball' : p.kind === 'grenade' ? 'grenade' : p.kind === 'shock' ? 'shock' : 'none';
    let aimed = AIMED.has(p.kind);
    let arcKind: string = p.kind;
    let rope: Turret | null = null;
    let hidden = false;
    const m = from?.m;
    if (from) {
      // 塔打的：鱼叉炮的"子弹"画成鱼叉拖绳，火箭塔的画成火箭，臼炮高抛，喷火塔的火团由炮台的火舌代替
      if (from.kind === 'harpoon') {
        fx = 'harpoon';
        land = 'harpoon';
        aimed = true;
        rope = from.t?.split ? from.t : null;
      } else if (from.kind === 'rocket') {
        fx = 'rocket';
        land = 'rocket';
        aimed = true;
        arcKind = 'rocket';
      } else if (from.kind === 'shock') {
        fx = 'shock';
        land = 'shock';
        arcKind = 'shock';
      } else if (from.kind === 'sniper') {
        // 狙击弹：白色长弹迹直线飞，命中点一团白闪
        fx = 'snipe';
        land = 'snipe';
        aimed = true;
        arcKind = 'snipe';
      } else if (from.kind === 'mortar') arcKind = 'mortar';
      else if (from.kind === 'flame') hidden = !!from.t?.split;
    }
    const sx = m ? m.x : a.x;
    const sy = m ? m.y : a.y - 14;
    const gx = m ? m.gx : a.x;
    const gy = m ? m.gy : a.y;
    // 天上来的炮击：从屏外落下
    const dist = Math.hypot(t.x - gx, t.y - gy);
    bs.shots.start({ fx, sx, sy, gx, gy, tx: t.x, ty: t.y, e1: p.kind === 'barrage' || p.kind === 'keg' ? 0 : 10, t0: p.t0, t1: p.t1, arc: arcHeight(arcKind, dist), aimed, land, mat: matAt(bs, p.x1, p.y1), rope, hidden, ring: (AREA[p.kind] ?? 0) * CELL_RX });
  }
  // 没对上弹道的开火记录（同一拍被清掉的）别越攒越多
  if (bs.shotFrom.size > 32) bs.shotFrom.clear();
  bs.shots.update(s.tick - 1 + frac, dt);
}

/**
 * 登陆战的自动构图（竖屏放大时，FitCam 每帧问一次看哪里）：自己的兵里最大的一簇是主组，主组里多数人正在打的那座建筑是目标，
 * 两者放得进可见区就一起框住，放不下只看主组。还没有兵上岛不动；选着船（还在下船）、瞄着技能、录像钩子在控镜头时不动。
 */
export function battleDirector(bs: BattleScene): Director {
  return {
    busy: () => bs.selSkill >= 0 || bs.selBoat >= 0 || bs.followT !== null || bs.ended,
    focus: (vw, vh) => {
      const alive = bs.st.units.filter((u) => u.mode !== 'dead');
      const pts: FPt[] = alive.map((u) => bs.W(u.x, u.y));
      const group = biggestCluster(pts);
      if (!group) return null;
      const votes = new Map<number, number>();
      alive.forEach((u, i) => {
        if (u.target >= 0 && Math.hypot(pts[i]!.x - group.x, pts[i]!.y - group.y) <= GROUP_R) votes.set(u.target, (votes.get(u.target) ?? 0) + 1);
      });
      let tid = -1;
      let best = 0;
      for (const [id, n] of votes) if (n > best || (n === best && id < tid)) [tid, best] = [id, n];
      const b = bs.st.buildings.find((q) => q.id === tid && !q.destroyed);
      return frameFocus(group, b ? bs.W((b.x + b.size / 2) * UNIT, (b.y + b.size / 2) * UNIT) : null, vw, vh);
    },
  };
}
