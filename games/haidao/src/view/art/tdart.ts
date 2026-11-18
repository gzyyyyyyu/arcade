/** 守岛模式的素材：各种敌人（走路、攻击各几帧，朝右，脚底是锚点）和场地道具。风格同 troops.ts：描边 Q 版。 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece, Pt } from './kit.ts';
import { limb, woodShield } from './troops.ts';
import { OUT, P, box, cyl, darken, ell, f, lighten, line, mat, path, piece, poly, rect, shadow, skull, uid } from './kit.ts';

export const TD_ENEMY_KINDS = ['sailor', 'ironclad', 'fog', 'skiff', 'skiffling', 'sapper', 'grenadier', 'parrot', 'captain', 'shield', 'bosun', 'macaw', 'mate', 'medic', 'gunboat', 'king'] as const;
export type TdEnemyKind = (typeof TD_ENEMY_KINDS)[number];
export type TdAnim = 'walk' | 'attack';
export type TdPropKind = 'pad' | 'padBuilt' | 'keg' | 'wreck' | 'barrel' | 'tideEdge' | 'mist' | 'jam' | 'tideWave' | 'sluiceUp' | 'sluiceDown' | 'battery' | 'crate';
export const TD_PROP_KINDS: TdPropKind[] = ['pad', 'padBuilt', 'keg', 'wreck', 'barrel', 'tideEdge', 'mist', 'jam', 'tideWave', 'sluiceUp', 'sluiceDown', 'battery', 'crate'];

// ================================================================= 人形的共用部分

interface Pd {
  bob: number;
  ff: Pt;
  bf: Pt;
  lean: number;
  fh: Pt; // 前手相对肩
  bh: Pt; // 后手相对肩
  ang: number; // 武器朝向（度，0 = 水平向右，负 = 向上）
}

const WALK: Pd[] = [
  { bob: -1.6, ff: [8, 0], bf: [-6, -3.5], lean: 1, fh: [4, 7], bh: [-2, 8], ang: -58 },
  { bob: 0, ff: [3, 0], bf: [-3, 0], lean: 0, fh: [6, 6], bh: [-4, 9], ang: -50 },
  { bob: -1.6, ff: [3, -3.5], bf: [-8, 0], lean: 1, fh: [6, 8], bh: [-3, 8], ang: -62 },
  { bob: 0, ff: [-3, 0], bf: [3, 0], lean: 0, fh: [5, 6], bh: [-4, 9], ang: -50 },
];
const ATTACK: Pd[] = [
  { bob: 0, ff: [6, 0], bf: [-6, 0], lean: -2, fh: [-3, -8], bh: [-4, 6], ang: -115 },
  { bob: 0, ff: [10, 0], bf: [-6, 0], lean: 4, fh: [13, 3], bh: [-2, 8], ang: 12 },
  { bob: 0, ff: [8, 0], bf: [-6, 0], lean: 2, fh: [10, 9], bh: [-3, 9], ang: 62 },
];
const poses = (a: TdAnim): Pd[] => (a === 'walk' ? WALK : ATTACK);

interface Look {
  skin: string;
  pants: string;
  boot: string;
  shirt: string;
  sleeve: string;
  half: number;
  top: number;
  head: number;
}

interface Hooks {
  back?: (p: Pd, L: Look) => string; // 画在最底下（背上的东西）
  backHand?: (hd: Pt, p: Pd) => string;
  torso?: (x: number, yt: number, p: Pd) => string;
  hat?: (cx: number, cy: number, r: number, p: Pd) => string;
  weapon?: (hd: Pt, p: Pd, atk: boolean) => string;
  face?: (cx: number, cy: number, r: number) => string;
  coat?: (L: Look, p: Pd) => string; // 盖在腿上的长衣摆
  /** 只在整张帧里画（盾兵的大木盾：分件骨架里盾是单独的部件，不在手上） */
  flat?: (hd: Pt, p: Pd, atk: boolean) => string;
  skip?: { legs?: boolean };
}

const handDot = (to: Pt, skin: string): string => ell(to[0], to[1], 2.9, 2.9, skin, { sw: 1.5 });

function headBall(L: Look, p: Pd, atk: boolean): { svg: string; cx: number; cy: number } {
  const r = L.head;
  const cx = p.lean + 1;
  const cy = L.top - 9 + p.bob;
  let o = ell(cx - r + 1.5, cy + 1.5, 2.4, 3.2, L.skin, { sw: 1.6 }) + ell(cx, cy, r, r * 0.96, L.skin, { sw: 2 });
  o += `<path d="M${f(cx + r * 0.4)},${f(cy - r * 0.9)} A${f(r)},${f(r)} 0 0 1 ${f(cx + r * 0.5)},${f(cy + r * 0.85)} Q${f(cx + r * 0.9)},${f(cy)} ${f(cx + r * 0.4)},${f(cy - r * 0.9)}Z" fill="${darken(L.skin, 0.12)}" opacity="0.6"/>`;
  const ex = cx + r * 0.42;
  const ey = cy - r * 0.05;
  o += ell(ex, ey, 2.7, 3.1, '#ffffff', { sw: 1.4 }) + ell(ex + 1, ey + 0.2, 1.4, 1.8, '#241410', { sw: 0 }) + ell(ex + 1.4, ey - 0.5, 0.5, 0.5, '#fff', { sw: 0 });
  o += ell(ex - r * 0.7, ey + 1, 2.4, 2.8, '#ffffff', { sw: 1.2 }) + ell(ex - r * 0.7 + 0.9, ey + 1.2, 1.1, 1.6, '#241410', { sw: 0 });
  // 凶巴巴的眉毛
  o += line([ex - 3.6, ey - 5.4], [ex + 3.4, ey - 2.8], '#241410', 2) + line([ex - r * 0.7 - 3, ey - 3], [ex - r * 0.7 + 2.4, ey - 3.6], '#241410', 1.6);
  if (atk) o += path(`M${f(cx + r * 0.2)},${f(cy + r * 0.5)} q${f(r * 0.3)},${f(r * 0.55)} ${f(r * 0.65)},-1 z`, '#7a1f1f', { sw: 1.2 });
  else o += path(`M${f(cx + r * 0.2)},${f(cy + r * 0.56)} q${f(r * 0.3)},${f(r * 0.2)} ${f(r * 0.6)},-1.6`, 'none', { stroke: '#7a3a2a', sw: 1.4 });
  return { svg: o, cx, cy };
}

interface Spec {
  L: Look;
  h: Hooks;
}
const manOf = (sp: Spec, p: Pd, atk: boolean): string => man(sp.L, p, atk, sp.h);

/** 躯干的形状和明暗（不含花样） */
function torsoShape(L: Look, p: Pd): string {
  const b = p.bob;
  const hipY = -11 + b;
  const hw = L.half;
  const x0 = p.lean - hw;
  const x1 = p.lean + hw;
  const yt = L.top + b;
  return (
    path(`M${f(x0)},${f(hipY + 1)} L${f(x0 - 0.5)},${f(yt + 3)} Q${f(p.lean)},${f(yt - 2)} ${f(x1 + 0.5)},${f(yt + 3)} L${f(x1)},${f(hipY + 1)} Q${f(p.lean)},${f(hipY + 4)} ${f(x0)},${f(hipY + 1)} Z`, L.shirt, { sw: 2 }) +
    path(`M${f(p.lean + hw * 0.35)},${f(yt + 1)} L${f(x1 + 0.5)},${f(yt + 3)} L${f(x1)},${f(hipY + 1)} Q${f(p.lean + hw * 0.6)},${f(hipY + 3)} ${f(p.lean + hw * 0.35)},${f(hipY + 2)} Z`, darken(L.shirt, 0.25), { sw: 0, op: 0.9 })
  );
}

function man(L: Look, p: Pd, atk: boolean, h: Hooks): string {
  const b = p.bob;
  let o = h.back ? h.back(p, L) : '';
  const bsh: Pt = [p.lean - L.half * 0.7, L.top + 4 + b];
  const bhd: Pt = [bsh[0] + p.bh[0], bsh[1] + p.bh[1]];
  o += limb(bsh, bhd, 4.2, L.sleeve) + handDot(bhd, L.skin) + (h.backHand ? h.backHand(bhd, p) : '');
  const hipY = -11 + b;
  if (!h.skip?.legs) {
    o += limb([-2.5 + p.lean * 0.3, hipY], [p.bf[0], p.bf[1] - 1.5], 5, L.pants) + ell(p.bf[0] + 1.2, p.bf[1] - 0.6, 4.6, 2.8, L.boot, { sw: 1.6 });
    o += limb([2.5 + p.lean * 0.3, hipY], [p.ff[0], p.ff[1] - 1.5], 5, L.pants) + ell(p.ff[0] + 1.6, p.ff[1] - 0.6, 5, 3, L.boot, { sw: 1.6 });
  }
  if (h.coat) o += h.coat(L, p);
  const hw = L.half;
  const yt = L.top + b;
  o += torsoShape(L, p);
  if (h.torso) o += h.torso(p.lean, yt, p);
  const hb = headBall(L, p, atk);
  o += hb.svg + (h.face ? h.face(hb.cx, hb.cy, L.head) : '') + (h.hat ? h.hat(hb.cx, hb.cy, L.head, p) : '');
  const sh: Pt = [p.lean + hw * 0.7, L.top + 4 + b];
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  o += limb(sh, hd, 4.2, L.sleeve);
  if (h.weapon) o += h.weapon(hd, p, atk);
  if (h.flat) o += h.flat(hd, p, atk);
  o += handDot(hd, L.skin);
  return o;
}

/** 一把弯刀或大剑：握点 hd，朝向 ang 度，长 len，半宽 w */
function sword(hd: Pt, ang: number, len: number, w: number, blade = '#dfe8f0', curve = 3, guard = C.goldD!): string {
  const a = (ang * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const nx = -dy;
  const ny = dx;
  const s: Pt = [hd[0] + dx * 2, hd[1] + dy * 2];
  const t: Pt = [hd[0] + dx * len, hd[1] + dy * len];
  const m: Pt = [(s[0] + t[0]) / 2 + nx * curve, (s[1] + t[1]) / 2 + ny * curve];
  let o = line([hd[0] - dx * 5, hd[1] - dy * 5], hd, '#4a2a16', 3.4);
  o += path(`M${f(s[0] + nx * w)},${f(s[1] + ny * w)} Q${f(m[0] + nx * w)},${f(m[1] + ny * w)} ${f(t[0])},${f(t[1])} Q${f(m[0] - nx * w)},${f(m[1] - ny * w)} ${f(s[0] - nx * w)},${f(s[1] - ny * w)} Z`, blade, { sw: 1.7 });
  o += line([s[0] + dx * 2, s[1] + dy * 2], [m[0] + dx * 2, m[1] + dy * 2], '#ffffff', 0.9, 0.9);
  o += line([s[0] + nx * (w + 2.6), s[1] + ny * (w + 2.6)], [s[0] - nx * (w + 2.6), s[1] - ny * (w + 2.6)], guard, 2.6);
  return o;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 把一帧包成素材：body 在以脚底为原点的坐标里画，按 s 放大，box 是放大前的包围盒 */
function frame(key: string, s: number, bx: Box, sh: string, body: string, shScale = 1): ArtPiece {
  const w = Math.ceil((bx.x1 - bx.x0) * s);
  const h = Math.ceil((bx.y1 - bx.y0) * s);
  void shScale;
  return piece(key, w, h, Math.round(-bx.x0 * s), Math.round(-bx.y0 * s), sh + `<g transform="scale(${s})">${body}</g>`);
}

const stdShadow = (rx: number, ry: number): string => shadow(rx, ry, 2, 1, 0.42);

// ================================================================= 八种敌人

const STEEL = '#8d98a6';

function sailorSpec(p: Pd): Spec {
  const L: Look = { skin: '#e8a878', pants: '#4a4a58', boot: '#2e2420', shirt: '#f4ead0', sleeve: '#f4ead0', half: 6.6, top: -24, head: 9.5 };
  return { L, h: {
    torso: (x, yt) => {
      let s = '';
      for (let i = 0; i < 3; i++) s += rect(x - 6.4, yt + 3.5 + i * 4.4, 12.8, 2.1, C.red!, { sw: 0, op: 0.95 });
      s += rect(x - 7, -13 + p.bob, 14, 3, '#3a2a20', { sw: 1.4 }) + rect(x - 1.5, -13.4 + p.bob, 3, 3.6, C.gold!, { sw: 0.8 });
      return s;
    },
    face: (cx, cy, r) => ell(cx + r * 0.42 + 1, cy - 0.2, 3.4, 3.6, '#1b1214', { sw: 0 }) + line([cx - r, cy - 4], [cx + r * 0.9, cy - 2.6], '#1b1214', 1.1),
    hat: (cx, cy) => {
      let s = path(`M${f(cx - 9.8)},${f(cy - 2.2)} A9.8,9.6 0 0 1 ${f(cx + 9.8)},${f(cy - 2.4)} Q${f(cx)},${f(cy - 6.4)} ${f(cx - 9.8)},${f(cy - 2.2)} Z`, '#2a2c3a', { sw: 2 });
      s += path(`M${f(cx - 9.2)},${f(cy - 3)} q-8,-2 -9,5 q5,-2 7,-1 Z`, '#2a2c3a', { sw: 1.8 });
      s += skull(cx + 1, cy - 6.4, 4.6, false);
      return s;
    },
    weapon: (hd, pd) => sword(hd, pd.ang, 20, 3, '#dfe8f0', 3),
  } };
}
const sailorBody = (p: Pd, atk: boolean): string => manOf(sailorSpec(p), p, atk);

/**
 * 军医（第四章）：水手的身板，白上衣不带条纹、绿头巾、斜挎一只药包（包上一片叶子，不用红十字），手里一卷绷带当武器；
 * 一眼认得出"这个人不一样，先打它"
 */
function medicSpec(p: Pd): Spec {
  const L: Look = { skin: '#e8a878', pants: '#3e4a3a', boot: '#2e2420', shirt: '#f6f2e6', sleeve: '#f6f2e6', half: 6.6, top: -24, head: 9.5 };
  return { L, h: {
    torso: (x, yt) => {
      // 斜挎带 + 药包（叶子）
      let s = line([x - 6, yt + 2], [x + 6, -13 + p.bob], '#5a3a1e', 2.4);
      s += rect(x + 2.4, -17 + p.bob, 8, 6.4, '#3f7a3a', { sw: 1.4 }) + path(`M${f(x + 6.4)},${f(-15.8 + p.bob)} q2.4,1.8 0,4 q-2.4,-1.8 0,-4 Z`, '#bfe6a0', { sw: 0.8 });
      s += rect(x - 7, -13 + p.bob, 14, 3, '#3a2a20', { sw: 1.4 });
      return s;
    },
    face: (cx, cy, r) => ell(cx + r * 0.42 + 1, cy - 0.2, 1.6, 1.8, '#1b1214', { sw: 0 }) + line([cx + r * 0.1, cy - 3.4], [cx + r * 0.8, cy - 2.8], '#1b1214', 1.2),
    hat: (cx, cy) =>
      path(`M${f(cx - 9.8)},${f(cy - 2.2)} A9.8,9.6 0 0 1 ${f(cx + 9.8)},${f(cy - 2.4)} Q${f(cx)},${f(cy - 6.4)} ${f(cx - 9.8)},${f(cy - 2.2)} Z`, '#3f8a46', { sw: 2 }) +
      path(`M${f(cx - 9.2)},${f(cy - 3)} q-8,-2 -9,5 q5,-2 7,-1 Z`, '#2f6a36', { sw: 1.8 }),
    weapon: (hd) => ell(hd[0] + 3, hd[1] - 1, 4, 3, '#f6f2e6', { sw: 1.4 }) + line([hd[0] + 5, hd[1] + 1], [hd[0] + 12, hd[1] + 6], '#f6f2e6', 2.2),
  } };
}
const medicBody = (p: Pd, atk: boolean): string => manOf(medicSpec(p), p, atk);

/**
 * 海盗王（第四章终局）：停在海上的大旗舰，整帧画。船身是炮艇的两倍长、金边，船舷三个炮门，两根桅杆挂黑帆，
 * 主帆上一个戴金冠的骷髅，桅顶红旗；walk 是在浪里慢慢起伏，attack 是三个炮门一起冒火、船身往后一坐
 */
function kingFrame(anim: TdAnim, i: number): ArtPiece {
  const bob = anim === 'walk' ? [0, -2, 0, 2][i]! : [0, 3, 1][i]!;
  const fire = anim === 'attack' && i === 1;
  const y = (v: number): string => f(v + bob);
  let o = ell(0, 4, 84, 16, '#bfe7f2', { sw: 0, op: 0.55 }) + ell(0, 4, 66, 11, '#8fd0e6', { sw: 0, op: 0.5 });
  const hull = `M-80,${y(-40)} Q-76,${y(-6)} -36,${y(0)} L44,${y(0)} Q78,${y(-10)} 88,${y(-46)} Q40,${y(-34)} -10,${y(-34)} Q-46,${y(-34)} -80,${y(-40)} Z`;
  o += path(hull, '#5a2f1c', { sw: 3 });
  o += path(`M-80,${y(-40)} Q-10,${y(-28)} 88,${y(-46)}`, 'none', { stroke: C.gold!, sw: 3.2 });
  o += path(`M-66,${y(-16)} Q0,${y(-10)} 70,${y(-22)}`, 'none', { stroke: C.gold!, sw: 1.6, op: 0.8 });
  // 船舷三个炮门，开炮时炮口冒火
  for (const x of [-34, 0, 34]) {
    o += rect(x - 6, -27 + bob, 12, 9, '#2b1a15', { sw: 1.6 }) + rect(x - 2, -25 + bob, 8, 5, '#3a3a44', { sw: 1 });
    if (fire) o += ell(x + 2, -14 + bob, 8, 6, '#ffcf5a', { sw: 0 }) + ell(x + 2, -8 + bob, 5, 4, '#fff1b8', { sw: 0, op: 0.9 });
  }
  // 两根桅杆：后桅小黑帆，主桅大黑帆上戴金冠的骷髅，桅顶红旗
  o += line([-40, -36 + bob], [-40, -104 + bob], C.woodDD!, 4) + line([14, -36 + bob], [14, -138 + bob], C.woodDD!, 5);
  o += path(`M-62,${y(-96)} Q-40,${y(-90)} -20,${y(-96)} L-22,${y(-50)} Q-40,${y(-46)} -60,${y(-50)} Z`, '#24202a', { sw: 2 });
  o += path(`M-20,${y(-128)} Q14,${y(-120)} 48,${y(-128)} L44,${y(-52)} Q14,${y(-46)} -16,${y(-52)} Z`, '#24202a', { sw: 2.4 });
  o += skull(14, -88 + bob, 7, true);
  o += poly([[4, -100 + bob], [8, -110 + bob], [14, -103 + bob], [20, -110 + bob], [24, -100 + bob]], C.gold!, { sw: 1.6 });
  o += path(`M15,${y(-138)} L40,${y(-132)} L15,${y(-125)} Z`, '#c8382e', { sw: 1.6 });
  return piece(`td.king.${anim}.${i}`, 200, 168, 100, 150, o);
}

/**
 * 炮艇（第四章）：不上岸的一条小炮船，整帧画（不走骨架）。船身比小艇大一圈，甲板上一门短炮、一根桅杆挂黑旗，
 * 船底一圈浪花；walk 是在浪里起伏，attack 是炮口冒火、船身往后一坐
 */
function gunboatFrame(anim: TdAnim, i: number): ArtPiece {
  const bob = anim === 'walk' ? [0, -1.5, 0, 1.5][i]! : [0, 2, 1][i]!;
  const fire = anim === 'attack' && i === 1;
  let o = ell(0, 2, 40, 9, '#bfe7f2', { sw: 0, op: 0.55 }) + ell(0, 2, 30, 6, '#8fd0e6', { sw: 0, op: 0.5 });
  const hull = `M-38,${f(-20 + bob)} Q-36,${f(-4 + bob)} -16,${f(0 + bob)} L${f(20)},${f(0 + bob)} Q${f(36)},${f(-6 + bob)} ${f(42)},${f(-24 + bob)} Q${f(18)},${f(-17 + bob)} ${f(-6)},${f(-17 + bob)} Q${f(-22)},${f(-17 + bob)} -38,${f(-20 + bob)} Z`;
  o += path(hull, C.woodD!, { sw: 2.4 });
  o += path(`M-38,${f(-20 + bob)} Q-6,${f(-14 + bob)} ${f(42)},${f(-24 + bob)}`, 'none', { stroke: C.woodL!, sw: 2.4 });
  o += path(`M-30,${f(-9 + bob)} Q0,${f(-6 + bob)} ${f(32)},${f(-12 + bob)}`, 'none', { stroke: C.woodDD!, sw: 1.2, op: 0.8 });
  // 桅杆和黑旗
  o += line([-14, -18 + bob], [-14, -62 + bob], C.woodDD!, 3) + path(`M-13,${f(-60 + bob)} L8,${f(-54 + bob)} L-13,${f(-46 + bob)} Z`, '#24202a', { sw: 1.6 });
  o += skull(-6, -53 + bob, 3, false);
  // 甲板上的炮：炮座 + 炮管朝右上，开炮时往后坐
  const kick = fire ? -4 : 0;
  o += rect(6 + kick, -26 + bob, 14, 8, C.woodDD!, { sw: 1.6 });
  o += path(`M${f(12 + kick)},${f(-28 + bob)} L${f(34 + kick)},${f(-36 + bob)} L${f(35 + kick)},${f(-30 + bob)} L${f(14 + kick)},${f(-22 + bob)} Z`, '#3a3a44', { sw: 1.8 });
  if (fire) o += ell(40 + kick, -34 + bob, 7, 5, '#ffcf5a', { sw: 0 }) + ell(46 + kick, -37 + bob, 5, 4, '#fff1b8', { sw: 0, op: 0.9 });
  return piece(`td.gunboat.${anim}.${i}`, 128, 96, 64, 80, o);
}

/**
 * 水手长（精英水手）：同一身条纹衫，一眼认得是水手那一伙；个子大一圈、皮背心、红头巾上金骷髅、络腮胡、大弯刀。
 * 和船长（红外套、披风、三角帽）、铁甲（灰甲、圆盾）分得开。
 * mate = 大副：同一副身板，蓝头巾、深蓝背心、腰上别一支铜望远镜，和水手长一眼分得开（打法不同：倒下散成水手）
 */
function bosunSpec(p: Pd, mate = false): Spec {
  const band = mate ? '#2f62a8' : C.red!;
  const bandD = mate ? '#1f4278' : C.redD!;
  const L: Look = { skin: '#d89868', pants: '#3a3240', boot: '#2a1a14', shirt: '#f4ead0', sleeve: '#7a4a2a', half: 8.4, top: -25, head: 10 };
  return { L, h: {
    torso: (x, yt) => {
      let s = '';
      for (let i = 0; i < 3; i++) s += rect(x - 3.4, yt + 3.5 + i * 4.4, 6.8, 2.1, C.red!, { sw: 0, op: 0.95 });
      // 皮背心：两片盖住条纹衫外侧
      s += path(`M${f(x - 8.4)},${f(yt + 3)} L${f(x - 3.6)},${f(yt + 2)} L${f(x - 3.4)},${f(-12 + p.bob)} L${f(x - 8.2)},${f(-12 + p.bob)} Z`, mate ? '#22324c' : '#6a3e22', { sw: 1.6 });
      s += path(`M${f(x + 8.6)},${f(yt + 3)} L${f(x + 3.6)},${f(yt + 2)} L${f(x + 3.4)},${f(-12 + p.bob)} L${f(x + 8.4)},${f(-12 + p.bob)} Z`, mate ? '#2e4262' : '#7a4a2a', { sw: 1.6 });
      s += rect(x - 8.8, -13.4 + p.bob, 17.6, 3.6, '#2e2018', { sw: 1.4 }) + rect(x - 2.4, -14 + p.bob, 4.8, 4.6, C.gold!, { sw: 1 });
      // 大副腰上斜别一支铜望远镜
      if (mate) s += rect(x + 3.2, -17 + p.bob, 3, 9.5, '#c8963c', { sw: 1.2 }) + rect(x + 2.8, -18.2 + p.bob, 3.8, 2.4, '#8a6224', { sw: 1 });
      return s;
    },
    face: (cx, cy, r) =>
      path(`M${f(cx - r * 0.2)},${f(cy + 2)} Q${f(cx + r * 0.5)},${f(cy + r + 3)} ${f(cx + r + 0.6)},${f(cy + 1)} Q${f(cx + r * 0.5)},${f(cy + 4)} ${f(cx - r * 0.2)},${f(cy + 2)} Z`, '#3a2418', { sw: 1.2 }) +
      ell(cx + r * 0.42 + 1, cy - 0.6, 1.6, 1.8, '#1b1214', { sw: 0 }) + line([cx + r * 0.1, cy - 3.6], [cx + r * 0.85, cy - 2.4], '#1b1214', 1.6),
    hat: (cx, cy) => {
      let s = path(`M${f(cx - 10.6)},${f(cy - 2.2)} A10.6,10.2 0 0 1 ${f(cx + 10.6)},${f(cy - 2.4)} Q${f(cx)},${f(cy - 6.8)} ${f(cx - 10.6)},${f(cy - 2.2)} Z`, band, { sw: 2 });
      s += path(`M${f(cx - 10)},${f(cy - 3)} q-9,-2 -10,6 q5,-2 8,-1 Z`, bandD, { sw: 1.8 });
      s += ell(cx + 1, cy - 7, 3.4, 3.2, C.gold!, { sw: 1.2 }) + ell(cx, cy - 7.4, 0.8, 0.8, '#3a2418', { sw: 0 }) + ell(cx + 2, cy - 7.4, 0.8, 0.8, '#3a2418', { sw: 0 });
      return s;
    },
    weapon: (hd, pd) => sword(hd, pd.ang, 27, 4.4, '#e8eef4', 5),
  } };
}
const bosunBody = (p: Pd, atk: boolean, mate = false): string => manOf(bosunSpec(p, mate), p, atk);

function ironcladSpec(p: Pd): Spec {
  const L: Look = { skin: '#d8a070', pants: '#4a4e58', boot: STEEL, shirt: '#7c8794', sleeve: '#6a7482', half: 9.6, top: -25, head: 9 };
  return { L, h: {
    backHand: (hd) => {
      // 圆盾
      const c: Pt = [hd[0] - 1, hd[1] - 1];
      return ell(c[0], c[1], 8.6, 11, '#5e6672', { sw: 2 }) + ell(c[0], c[1], 5.4, 7.6, '#8a5a30', { sw: 1.4 }) + ell(c[0], c[1], 2, 2.6, STEEL, { sw: 1.2 });
    },
    torso: (x, yt) => {
      let s = '';
      s += line([x - 8, yt + 8], [x + 8, yt + 9], '#4a525e', 1.4, 0.9) + line([x - 8, yt + 14], [x + 8, yt + 15], '#4a525e', 1.4, 0.9);
      for (const dx of [-5.5, 0, 5.5]) s += ell(x + dx, yt + 5, 1.1, 1.1, '#cfd6de', { sw: 0 });
      // 肩甲
      s += ell(x - 8.6, yt + 4, 5.2, 4.2, STEEL, { sw: 1.8 }) + ell(x + 8.8, yt + 4, 5.6, 4.4, '#a7b2bf', { sw: 1.8 });
      s += rect(x - 9.6, -13 + p.bob, 19.2, 3.4, '#3a2a20', { sw: 1.4 });
      return s;
    },
    hat: (cx, cy, r) => {
      let s = path(`M${f(cx - r - 1)},${f(cy + 3)} L${f(cx - r - 1)},${f(cy - 3)} A${f(r + 1)},${f(r + 1.2)} 0 0 1 ${f(cx + r + 1)},${f(cy - 3)} L${f(cx + r + 1)},${f(cy + 3)} L${f(cx + 3)},${f(cy + 3)} L${f(cx + 3)},${f(cy - 1)} L${f(cx - 4)},${f(cy - 1)} L${f(cx - 4)},${f(cy + 3)} Z`, '#9aa5b2', { sw: 2.2 });
      s += rect(cx - 5, cy - 2.4, 13, 2.6, '#1b1c22', { sw: 0 });
      s += path(`M${f(cx - r)},${f(cy - 4)} Q${f(cx - 1)},${f(cy - r - 3)} ${f(cx + 4)},${f(cy - r - 0.5)}`, 'none', { stroke: '#d6dde5', sw: 1.6, op: 0.8 });
      s += path(`M${f(cx - 1)},${f(cy - r - 1)} q2,-5 6,-5`, 'none', { stroke: C.red!, sw: 3.4 });
      return s;
    },
    weapon: (hd, pd) => {
      // 沉重的阔刃斧
      const a = (pd.ang * Math.PI) / 180;
      const tip: Pt = [hd[0] + Math.cos(a) * 20, hd[1] + Math.sin(a) * 20];
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      let s = line([hd[0] - Math.cos(a) * 5, hd[1] - Math.sin(a) * 5], tip, '#4a2a16', 3.4);
      const hb: Pt = [tip[0] - Math.cos(a) * 3, tip[1] - Math.sin(a) * 3];
      s += poly([[hb[0] + nx * 1.5, hb[1] + ny * 1.5], [hb[0] + nx * 9 + Math.cos(a) * 4, hb[1] + ny * 9 + Math.sin(a) * 4], [hb[0] + nx * 9 - Math.cos(a) * 5, hb[1] + ny * 9 - Math.sin(a) * 5], [hb[0] - Math.cos(a) * 6, hb[1] - Math.sin(a) * 6]], '#aab4c0', { sw: 1.8 });
      return s;
    },
  } };
}
const ironcladBody = (p: Pd, atk: boolean): string => manOf(ironcladSpec(p), p, atk);

/** 雾灵：半透明身体，下半身化成雾，眼睛发光 */
const FOG_OP = 0.56;
function fogSpec(p: Pd, ph: number): Spec {
  const L: Look = { skin: '#c4d8e4', pants: '#a4bccc', boot: '#9ab', shirt: '#9fb8c8', sleeve: '#a9c0d0', half: 7, top: -24, head: 9 };
  const b = p.bob;
  const sway = Math.sin(ph) * 3;
  return { L, h: {
    skip: { legs: true },
    coat: () => {
      // 下摆撕成雾缕
      const y0 = -13 + b;
      return path(`M${f(-7 + sway * 0.2)},${f(y0)} Q${f(-9 + sway)},-5 ${f(-12 + sway)},1 Q${f(-8 + sway)},-1 ${f(-6 + sway)},4 Q${f(-2)},0 ${f(1 + sway * 0.5)},5 Q${f(5)},0 ${f(8 + sway * 0.4)},3 Q${f(8 + sway)},-4 ${f(7)},${f(y0)} Z`, '#9fb8c8', { sw: 2 });
    },
    torso: (x, yt) => path(`M${f(x - 6)},${f(yt + 9)} q4,3 6,0 q4,3 6,0`, 'none', { stroke: '#e8f4fa', sw: 1.2, op: 0.8 }),
    hat: (cx, cy, r) => path(`M${f(cx - r)},${f(cy - 1)} Q${f(cx - 4)},${f(cy - r - 7)} ${f(cx + 5)},${f(cy - r - 2)} Q${f(cx + r + 4)},${f(cy - 3)} ${f(cx + r)},${f(cy + 1)} Q${f(cx)},${f(cy - 4)} ${f(cx - r)},${f(cy - 1)} Z`, '#b3cadb', { sw: 2 }),
    weapon: (hd, pd) => sword(hd, pd.ang, 20, 3, '#c9ecff', 3, '#88b4cc'),
  } };
}
/** 雾灵发光的眼睛（不透明，保证看得清） */
function fogEyes(p: Pd): string {
  const ex = p.lean + 1 + 4;
  const ey = -33 + p.bob - 0.5;
  return ell(ex, ey, 2.2, 2.8, '#8ff3ff', { sw: 0 }) + ell(ex - 6.6, ey + 1, 1.9, 2.4, '#8ff3ff', { sw: 0 });
}
/** 雾缕 */
function fogWisps(ph: number): string {
  const sway = Math.sin(ph) * 3;
  let o = path(`M-14,-26 q-5,-3 -3,-7 q3,3 6,0`, 'none', { stroke: '#e8f4fa', sw: 2.2, op: 0.55 });
  o += path(`M${f(14 + sway)},-8 q6,-3 4,-8 q-4,3 -6,0`, 'none', { stroke: '#e8f4fa', sw: 2.2, op: 0.55 });
  o += path(`M${f(-14 + sway)},-2 q-6,0 -9,-4`, 'none', { stroke: '#e8f4fa', sw: 2, op: 0.5 });
  o += ell(-10 + sway, 3, 9, 2.6, '#e8f4fa', { sw: 0, op: 0.32 });
  return o;
}
function fogBody(p: Pd, atk: boolean, ph: number): string {
  const ghost = manOf(fogSpec(p, ph), { ...p, ff: [0, 0], bf: [0, 0] }, atk);
  return `<g opacity="${FOG_OP}">${ghost}</g>` + fogEyes(p) + fogWisps(ph);
}

/** 小艇怪：一条会走路的划艇，船舷后面探出船员的脑袋；大的有一道裂缝，能裂成两半 */
/** 小艇怪船员的脑袋（头巾、眼睛、嘴），头中心 (hx, hy) */
function skiffHead(hx: number, hy: number, atk: boolean): string {
  let o = ell(hx, hy, 8.4, 8, '#e8a878', { sw: 2 });
  o += path(`M${f(hx - 8.6)},${f(hy - 1.5)} A8.6,8 0 0 1 ${f(hx + 8.6)},${f(hy - 1.6)} Q${f(hx)},${f(hy - 4.6)} ${f(hx - 8.6)},${f(hy - 1.5)} Z`, C.blue!, { sw: 1.8 });
  o += ell(hx + 3.6, hy + 0.4, 2.4, 2.8, '#fff', { sw: 1.2 }) + ell(hx + 4.5, hy + 0.6, 1.2, 1.6, '#241410', { sw: 0 });
  o += line([hx + 0.5, hy - 3.6], [hx + 6.6, hy - 1.6], '#241410', 1.8);
  if (atk) o += path(`M${f(hx + 2.4)},${f(hy + 3.6)} q3,4 6,0 z`, '#7a1f1f', { sw: 1.1 });
  else o += path(`M${f(hx + 2.4)},${f(hy + 4)} q3,1.6 5.4,-1`, 'none', { stroke: '#7a3a2a', sw: 1.3 });
  return o;
}

/** 小艇怪的船身（船头在右、翘起），b = 上下起伏；crack = 大的那条有裂缝，能裂成两半 */
function skiffHull(b: number, crack: boolean): string {
  let o = '';
  const hull = `M-27,${f(-17 + b)} Q-26,${f(-5 + b)} -12,${f(-1.5 + b)} L${f(14)},${f(-1.5 + b)} Q${f(26)},${f(-6 + b)} ${f(32)},${f(-21 + b)} Q${f(14)},${f(-14 + b)} ${f(-4)},${f(-14 + b)} Q${f(-16)},${f(-14 + b)} -27,${f(-17 + b)} Z`;
  o += path(hull, C.wood!, { sw: 2.2 });
  o += path(`M-24,${f(-9 + b)} Q-8,${f(-6 + b)} ${f(22)},${f(-13 + b)}`, 'none', { stroke: C.woodD!, sw: 1.2, op: 0.8 });
  o += path(`M-18,${f(-4 + b)} Q0,${f(-3 + b)} ${f(18)},${f(-7.5 + b)}`, 'none', { stroke: C.woodD!, sw: 1.2, op: 0.8 });
  o += path(`M-27,${f(-17 + b)} Q-4,${f(-12 + b)} ${f(32)},${f(-21 + b)}`, 'none', { stroke: C.woodL!, sw: 2.2 });
  o += ell(31, -22 + b, 2.2, 2.2, C.gold!, { sw: 1.2 });
  if (crack) {
    // 裂缝：锯齿线，缝里漏出深色
    o += path(`M2,${f(-14 + b)} L-1,${f(-10 + b)} L4,${f(-8 + b)} L0,${f(-4.6 + b)} L3.4,${f(-1.6 + b)}`, 'none', { stroke: '#1a0f0a', sw: 2.4 });
    o += path(`M2,${f(-14 + b)} L-1,${f(-10 + b)} L4,${f(-8 + b)} L0,${f(-4.6 + b)} L3.4,${f(-1.6 + b)}`, 'none', { stroke: '#ffd98a', sw: 0.8, op: 0.7 });
    o += poly([[-6, -14 + b], [-3, -14 + b], [-4, -10 + b]], '#1a0f0a', { sw: 0 });
  }
  // 船舷上的铆钉
  for (const x of [-18, -8, 6, 16]) o += ell(x, -12 + b + (x > 6 ? -1.5 : 0), 1.2, 1.2, C.woodDD!, { sw: 0 });
  return o;
}

/** 一支当腿的桨：从桨架 (x0, y0) 到桨叶 (x1, 0) */
function oar(x0: number, y0: number, x1: number): string {
  return line([x0, y0], [x1, 0], OUT, 5.6) + line([x0, y0], [x1, 0], C.woodL!, 3) + ell(x1 - 1, -1, 4.6, 2.4, C.woodD!, { sw: 1.6 });
}

/** 小艇怪：一条会走路的划艇，船舷后面探出船员的脑袋；大的有一道裂缝，能裂成两半 */
function skiffBody(_p: Pd, atk: boolean, i: number, crack: boolean, anim: TdAnim): string {
  const step = anim === 'walk' ? [1, 0, -1, 0][i]! : 0;
  const lunge = anim === 'attack' ? [-3, 7, 3][i]! : 0;
  const b = anim === 'walk' ? (i % 2 ? 0 : -1.5) : 0;
  let o = '';
  // 桨当腿
  for (const [ox, sg] of [[-9, -1], [9, 1]] as Array<[number, number]>) o += oar(ox, -9 + b, ox + step * sg * 5 - 4);
  // 船员（在船舷后面）
  const hx = 3 + lunge;
  const hy = -29 + b;
  o += limb([hx - 2, hy + 12], [hx + 10 + lunge * 0.6, hy + 9], 3.8, '#f4ead0');
  o += skiffHead(hx, hy, atk);
  return o + skiffHull(b, crack);
}

/** 火药工：背着点着引线的火药桶，戴护目镜，扔炸弹 */
function sapperSpec(_p: Pd, i: number): Spec {
  const L: Look = { skin: '#eaa972', pants: '#5a4634', boot: '#2e2420', shirt: '#d9822b', sleeve: '#e6e0cc', half: 6.4, top: -23, head: 9.6 };
  const fl = i % 2;
  return { L, h: {
    back: (pd) => {
      const kx = -10 + pd.lean;
      const ky = -24 + pd.bob;
      let s = ell(kx, ky + 8, 8.4, 3.2, '#2e1c10', { sw: 0, op: 0.001 });
      s += rect(kx - 7.6, ky - 9, 15.2, 18, '#6a4a2c', { sw: 2, r: 4 });
      s += rect(kx - 7.6, ky - 5, 15.2, 2.2, '#2e2a30', { sw: 0 }) + rect(kx - 7.6, ky + 3, 15.2, 2.2, '#2e2a30', { sw: 0 });
      s += skull(kx, ky - 0.5, 5.2, false);
      s += ell(kx, ky - 9, 7.6, 2.6, '#8a6038', { sw: 1.8 });
      // 引线 + 火花
      const tip: Pt = [kx + 4, ky - 17 + (fl ? 1 : 0)];
      s += path(`M${f(kx)},${f(ky - 10)} Q${f(kx + 1)},${f(ky - 15)} ${f(tip[0])},${f(tip[1])}`, 'none', { stroke: '#3a2a20', sw: 1.8 });
      const r = fl ? 4.4 : 3.4;
      s += poly([[tip[0], tip[1] - r * 1.5], [tip[0] + r * 0.4, tip[1] - r * 0.4], [tip[0] + r * 1.4, tip[1]], [tip[0] + r * 0.4, tip[1] + r * 0.4], [tip[0], tip[1] + r], [tip[0] - r * 0.4, tip[1] + r * 0.4], [tip[0] - r * 1.4, tip[1]], [tip[0] - r * 0.4, tip[1] - r * 0.4]], '#ffd23f', { sw: 1, stroke: '#e0561c' });
      s += ell(tip[0], tip[1], 1.2, 1.2, '#fff', { sw: 0 });
      return s;
    },
    hat: (cx, cy, r) => {
      // 头顶一圈布 + 护目镜
      let s = path(`M${f(cx - r)},${f(cy - 2)} A${f(r)},${f(r)} 0 0 1 ${f(cx + r)},${f(cy - 2.4)} Q${f(cx)},${f(cy - 5)} ${f(cx - r)},${f(cy - 2)} Z`, '#6a4a2c', { sw: 2 });
      s += path(`M${f(cx - r - 0.6)},${f(cy - 3)} L${f(cx + r + 0.6)},${f(cy - 3.4)}`, 'none', { stroke: '#2e2a30', sw: 3.2 });
      s += ell(cx + r * 0.42, cy - 3.6, 4.2, 4, '#9fe8ff', { sw: 1.8, stroke: '#4a4a52' }) + ell(cx - r * 0.3, cy - 3.8, 3.6, 3.6, '#9fe8ff', { sw: 1.8, stroke: '#4a4a52' });
      s += ell(cx + r * 0.42 - 1.2, cy - 4.8, 1.2, 1, '#fff', { sw: 0 });
      return s;
    },
    weapon: (hd, pd, at) => {
      // 一枚点着的小炸弹
      const bx = hd[0] + (at ? 3 : 1);
      const by = hd[1] - 5 + (pd.ang > 40 ? 5 : 0);
      let s = path(`M${f(bx)},${f(by - 5)} q2,-4 5,-3`, 'none', { stroke: '#3a2a20', sw: 1.6 });
      s += ell(bx, by, 5.4, 5.4, '#2a2b36', { sw: 2 }) + ell(bx - 1.6, by - 1.8, 1.6, 1.2, '#7a7e90', { sw: 0 });
      s += ell(bx + 5, by - 8, fl ? 2.4 : 1.8, fl ? 2.4 : 1.8, '#ffd23f', { sw: 0.8, stroke: '#e0561c' });
      return s;
    },
  } };
}
const sapperBody = (p: Pd, atk: boolean, i: number): string => manOf(sapperSpec(p, i), p, atk);

/** 掷弹兵：钢盔、胸前一排手雷、手里举着一颗点着的（不贴脸砸，走到三格外就扔） */
function grenadierSpec(_p: Pd, i: number): Spec {
  const L: Look = { skin: '#eaa972', pants: '#3a4a3a', boot: '#2a1a14', shirt: '#8a4a3a', sleeve: '#8a4a3a', half: 6.6, top: -23, head: 9.6 };
  const fl = i % 2;
  return { L, h: {
    back: (pd) => {
      // 背后一只帆布雷袋，袋口露出三个雷把
      const kx = -10 + pd.lean;
      const ky = -22 + pd.bob;
      let s = rect(kx - 6.4, ky - 6, 12.8, 13, '#8a7a50', { sw: 2, r: 3 });
      s += rect(kx - 6.4, ky - 6, 12.8, 3.6, '#a8966a', { sw: 1.4, r: 1.6 });
      for (let g = 0; g < 3; g++) s += rect(kx - 4.6 + g * 3.8, ky - 9.4, 2.2, 4, '#c9893a', { sw: 0.9 });
      return s;
    },
    torso: (x, _yt, pd) => {
      // 斜挎的雷带
      let s = path(`M${f(x - 6.4)},${f(-23 + pd.bob)} L${f(x + 6.4)},${f(-13 + pd.bob)}`, 'none', { stroke: '#3b2a1e', sw: 3.4 });
      for (let g = 0; g < 3; g++) {
        const gx = x - 3.6 + g * 3.8;
        const gy = -20.4 + g * 2.9 + pd.bob;
        s += ell(gx, gy, 2.1, 2.3, '#2a2b36', { sw: 1.2 }) + rect(gx - 0.7, gy - 4, 1.4, 1.8, '#f2c230', { sw: 0.6 });
      }
      return s;
    },
    hat: (cx, cy, r) => {
      let s = path(`M${f(cx - r - 0.6)},${f(cy - 1.6)} A${f(r + 0.6)},${f(r + 0.4)} 0 0 1 ${f(cx + r + 0.6)},${f(cy - 2)} L${f(cx + r + 2.8)},${f(cy - 0.4)} L${f(cx - r - 1.8)},${f(cy - 0.2)} Z`, '#6a7480', { sw: 2 });
      s += path(`M${f(cx - r)},${f(cy - 2.8)} Q${f(cx)},${f(cy - 5.4)} ${f(cx + r)},${f(cy - 3.2)}`, 'none', { stroke: '#c9893a', sw: 2 });
      s += ell(cx - 3, cy - 8, 3.4, 1.6, '#a9b4c0', { sw: 0, op: 0.8 });
      return s;
    },
    weapon: (hd, pd, at) => {
      const bx = hd[0] + (at ? 3 : 1);
      const by = hd[1] - 6 + (pd.ang > 40 ? 5 : 0);
      let s = rect(bx - 1.6, by - 8.4, 3.2, 3, '#f2c230', { sw: 0.9 });
      s += ell(bx, by, 5.6, 5.6, '#2a2b36', { sw: 2 }) + ell(bx - 1.8, by - 2, 1.7, 1.2, '#8a90a4', { sw: 0 });
      s += path(`M${f(bx - 5)},${f(by)} L${f(bx + 5)},${f(by)}`, 'none', { stroke: '#4a4e5c', sw: 1.1 });
      s += ell(bx + 5, by - 11, fl ? 2.6 : 2, fl ? 2.6 : 2, '#ffd23f', { sw: 0.8, stroke: '#e0561c' });
      return s;
    },
  } };
}
const grenadierBody = (p: Pd, atk: boolean, i: number): string => manOf(grenadierSpec(p, i), p, atk);

/** 盾兵：铁桶盔、皮甲加护心镜，前手一面大木盾，后手（整张帧里）一把短刀；分件骨架里盾另是一个部件 */
function shieldSpec(_p: Pd, _i: number): Spec {
  const L: Look = { skin: '#d8a070', pants: '#7a6a52', boot: '#3a2a1e', shirt: '#9a6a3c', sleeve: '#9a6a3c', half: 7.2, top: -24, head: 9.6 };
  return { L, h: {
    torso: (x, yt) => {
      let s = ell(x + 0.5, yt + 8, 4.6, 4, '#a7b2bf', { sw: 1.6 }) + ell(x - 0.6, yt + 6.6, 1.5, 1, '#e8eef4', { sw: 0 });
      s += rect(x - 7.2, -13, 14.4, 3.2, '#3b2a1e', { sw: 1.4 });
      return s;
    },
    hat: (cx, cy, r) => {
      let s = path(`M${f(cx - r - 0.6)},${f(cy + 2)} L${f(cx - r - 0.6)},${f(cy - 3)} A${f(r + 0.6)},${f(r)} 0 0 1 ${f(cx + r + 0.6)},${f(cy - 3.4)} L${f(cx + r + 0.6)},${f(cy + 2)} L${f(cx + 6)},${f(cy + 2)} L${f(cx + 6)},${f(cy - 1)} L${f(cx - 6)},${f(cy - 1)} L${f(cx - 6)},${f(cy + 2)} Z`, '#8f9aa8', { sw: 2 });
      s += rect(cx - r - 0.8, cy - 4.4, 2 * r + 1.6, 2.6, '#5a626e', { sw: 0 }) + rect(cx + 3.6, cy - 4, 3, 8.6, '#a7b2bf', { sw: 1.2 });
      return s;
    },
    weapon: (hd, pd) => sword(hd, pd.ang * 0.6 - 10, 14, 2, '#dfe8f0', 2),
    flat: (hd, _pd, atk) => `<g transform="translate(${f(hd[0] + 3 + (atk ? 4 : 0))} ${f(hd[1] - 5)})">${woodShield(19, 25)}</g>`,
  } };
}
const shieldBody = (p: Pd, atk: boolean, i: number): string => manOf(shieldSpec(p, i), p, atk);

/** 鹦鹉群：三只飞在半空，影子落在地上（锚点在影子处） */
function birdAt(x: number, y: number, wing: number, s: number, hue: 0 | 1 | 2, dive: boolean): string {
  const body = hue === 0 ? C.red! : hue === 1 ? '#3fa34f' : '#2f9ae0';
  const wc = hue === 0 ? '#2f6fd0' : hue === 1 ? '#f2c230' : '#e8483a';
  const tilt = dive ? 22 : 0;
  let o = `<g transform="translate(${f(x)} ${f(y)}) rotate(${tilt}) scale(${s})">`;
  // 尾羽
  o += path('M-8,-1 Q-17,1 -22,8 Q-14,6 -10,4 Q-14,9 -12,13 Q-6,8 -4,3 Z', wc, { sw: 1.6 });
  // 后翅
  const wy = wing === 0 ? -15 : wing === 1 ? -4 : 12;
  const wx = wing === 0 ? -9 : wing === 1 ? -17 : -9;
  o += path(`M-3,-2 Q${wx - 3},${f(wy * 0.5)} ${wx},${wy} Q${f(wx + 7)},${f(wy * 0.4)} 4,-1 Z`, darken(wc, 0.15), { sw: 1.6 });
  // 身体 + 头
  o += ell(0, 1, 9.4, 6.6, body, { sw: 2 });
  o += ell(3, 3.6, 5, 3, lighten(body, 0.45), { sw: 0, op: 0.7 });
  o += ell(9, -4, 5.6, 5.2, body, { sw: 2 });
  o += path('M12.4,-6 Q19,-6 18,0 Q16,-1.4 14.4,-1 Q12.4,-3 12.4,-6 Z', '#ffd23f', { sw: 1.6 });
  o += ell(10.6, -5.4, 1.9, 1.9, '#fff', { sw: 1 }) + ell(11.1, -5.4, 0.9, 0.9, '#241410', { sw: 0 });
  o += line([8, -8.8], [12.6, -7.2], '#241410', 1.2);
  // 前翅
  o += path(`M-1,-2 Q${wx + 2},${f(wy * 0.5)} ${wx + 6},${wy} Q${f(wx + 14)},${f(wy * 0.35)} 7,0 Z`, wc, { sw: 1.8 });
  o += path(`M${f(wx + 6)},${wy} L${f(wx + 8)},${f(wy * 0.3)}`, 'none', { stroke: lighten(wc, 0.4), sw: 1, op: 0.8 });
  if (dive) o += line([1, 7], [3, 11], '#c98a12', 1.8) + line([5, 7], [8, 10], '#c98a12', 1.8);
  return o + '</g>';
}

function parrotFrame(anim: TdAnim, i: number): ArtPiece {
  const wingSeq = anim === 'walk' ? [0, 1, 2, 1] : [0, 2, 1];
  const dive = anim === 'attack' && i > 0;
  const lift = anim === 'attack' ? [-44, -26, -34][i]! : -46 - (i % 2) * 2;
  const push = anim === 'attack' ? [-4, 8, 4][i]! : 0;
  const w = (k: number): number => wingSeq[(i + k) % wingSeq.length]!;
  const birds: Array<[number, number, number, 0 | 1 | 2]> = [
    [-16 + push, lift + 6, 0.92, 1],
    [12 + push, lift - 2 + (i % 2) * -2, 1, 0],
    [-1 + push, lift - 18 + (i % 2) * 2, 0.86, 2],
  ];
  let body = '';
  // 地上的软影子，每只鸟一个
  for (const [x, , s] of birds) body += shadow(11 * s, 4 * s, x, 1, 0.34);
  birds
    .map((b, k) => ({ b, k }))
    .sort((a, c) => a.b[1] - c.b[1])
    .forEach(({ b, k }) => (body += birdAt(b[0], b[1], w(k), b[2], b[3], dive)));
  return piece(`td.parrot.${anim}.${i}`, 96, 92, 48, 78, body);
}

/** 鹦鹉王（精英鹦鹉）：一只大金刚鹦鹉戴金冠，带两只小的；和鹦鹉群（三只一般大）一眼分得开 */
function macawFrame(anim: TdAnim, i: number): ArtPiece {
  const wingSeq = anim === 'walk' ? [0, 1, 2, 1] : [0, 2, 1];
  const dive = anim === 'attack' && i > 0;
  const lift = anim === 'attack' ? [-50, -32, -40][i]! : -54 - (i % 2) * 2;
  const push = anim === 'attack' ? [-4, 8, 4][i]! : 0;
  const w = (k: number): number => wingSeq[(i + k) % wingSeq.length]!;
  let body = shadow(20, 6, push, 1, 0.38) + shadow(8, 3, -26 + push, 1, 0.3) + shadow(8, 3, 26 + push, 1, 0.3);
  // 两只小的跟在大鸟身后（朝右飞，身后 = 左边），不挨着头上的冠
  body += birdAt(-34 + push, lift + 2, w(1), 0.6, 1, dive) + birdAt(-24 + push, lift - 22, w(2), 0.6, 2, dive);
  body += birdAt(push, lift, w(0), 1.7, 0, dive);
  // 金冠：压在大鸟头顶（birdAt 的头心 (9, -4)、半径 5.2，乘 1.7）
  const hx = push + 15.3;
  const hy = lift - 12.6;
  body += path(`M${f(hx - 7)},${f(hy)} L${f(hx - 7.5)},${f(hy - 8)} L${f(hx - 3.5)},${f(hy - 4)} L${f(hx)},${f(hy - 10)} L${f(hx + 3.5)},${f(hy - 4)} L${f(hx + 7.5)},${f(hy - 8)} L${f(hx + 7)},${f(hy)} Z`, C.gold!, { sw: 1.6 });
  body += ell(hx, hy - 3, 1.4, 1.4, C.red!, { sw: 0 });
  return piece(`td.macaw.${anim}.${i}`, 128, 116, 64, 100, body);
}

function captainSpec(p: Pd, atk = false): Spec {
  const L: Look = { skin: '#eaa972', pants: '#2c3e6a', boot: '#2a1a14', shirt: '#cc2a24', sleeve: '#b82620', half: 8.2, top: -25, head: 9.6 };
  return { L, h: {
    back: (pd) => {
      // 披风：从肩后垂到小腿，随步子向后飘
      const w = -(pd.ff[0] - pd.bf[0]) * 0.18 - (atk ? 3 : 0);
      return path(`M${f(pd.lean - 4)},${f(-25 + pd.bob)} Q${f(pd.lean - 17 + w)},${f(-18)} ${f(pd.lean - 16 + w)},${f(-2)} L${f(pd.lean - 8)},${f(-5 + pd.bob)} L${f(pd.lean - 2)},${f(-12 + pd.bob)} Z`, '#7a1a22', { sw: 2 }) + line([pd.lean - 5, -22 + pd.bob], [pd.lean - 13 + w, -6], '#a02a30', 1.2, 0.8);
    },
    coat: (l, pd) => {
      // 长外套下摆，盖到膝盖
      const b = pd.bob;
      const sw = (pd.ff[0] - pd.bf[0]) * 0.18;
      return path(`M${f(pd.lean - 8)},${f(-13 + b)} L${f(pd.lean - 10.4 - sw)},${f(-3)} Q${f(pd.lean)},${f(1)} ${f(pd.lean + 11 + sw)},${f(-3.4)} L${f(pd.lean + 8)},${f(-13 + b)} Z`, '#b82620', { sw: 2 }) + line([pd.lean + 2, -12 + b], [pd.lean + 3, -3], C.redD!, 1.2, 0.7) + void l;
    },
    torso: (x, yt) => {
      let s = rect(x - 8.2, -13 + p.bob, 16.4, 3.2, '#2a1a14', { sw: 1.4 }) + rect(x - 2, -13.4 + p.bob, 4, 3.8, C.gold!, { sw: 1 });
      s += path(`M${f(x - 1)},${f(yt + 2)} L${f(x + 4)},${f(yt + 12)} L${f(x - 5)},${f(yt + 12)} Z`, '#f4ead0', { sw: 1.2 });
      for (let k = 0; k < 3; k++) s += ell(x + 5.2, yt + 6 + k * 3.4, 1.1, 1.1, C.gold!, { sw: 0.6 });
      // 肩章
      s += ell(x - 7, yt + 3.4, 4, 2.4, C.gold!, { sw: 1.4 }) + ell(x + 7.4, yt + 3.4, 4.4, 2.6, C.goldL!, { sw: 1.4 });
      // 腰间佩剑的剑鞘（剑柄在腰上，鞘尖向后下）
      s += line([x - 5, -12.5 + p.bob], [x - 16, -2], OUT, 4.4) + line([x - 5, -12.5 + p.bob], [x - 16, -2], '#3a2418', 2.4) + ell(x - 16.4, -1.6, 1.8, 1.8, C.gold!, { sw: 0.8 });
      s += line([x - 7, -15.5 + p.bob], [x - 3, -11 + p.bob], C.gold!, 2.6);
      return s;
    },
    face: (cx, cy, r) => {
      // 大胡子 + 胡须尖
      return path(`M${f(cx - r * 0.5)},${f(cy + 6.4)} Q${f(cx + r * 0.1)},${f(cy + r + 6)} ${f(cx + r * 0.8)},${f(cy + 6.8)} Q${f(cx + r * 0.2)},${f(cy + 5.2)} ${f(cx - r * 0.5)},${f(cy + 6.4)} Z`, '#2a1a14', { sw: 1.6 }) + line([cx + r * 0.1, cy + 4.2], [cx + r * 0.6, cy + 4.6], '#2a1a14', 2.2);
    },
    hat: (cx, cy, r) => {
      // 三角帽 + 羽毛
      let s = path(`M${f(cx - r - 5)},${f(cy - 2.4)} Q${f(cx)},${f(cy - r - 12)} ${f(cx + r + 6)},${f(cy - 1.6)} Q${f(cx + r + 4)},${f(cy - 5)} ${f(cx + r)},${f(cy - 4.8)} Q${f(cx)},${f(cy - 5.6)} ${f(cx - r)},${f(cy - 5)} Q${f(cx - r - 4)},${f(cy - 5)} ${f(cx - r - 5)},${f(cy - 2.4)} Z`, '#2a2b36', { sw: 2.2 });
      s += path(`M${f(cx - r - 5)},${f(cy - 2.4)} Q${f(cx)},${f(cy - r - 12)} ${f(cx + r + 6)},${f(cy - 1.6)}`, 'none', { stroke: C.gold!, sw: 1.6 });
      s += skull(cx + 0.5, cy - r - 2.2, 4.6, false);
      s += path(`M${f(cx - 6)},${f(cy - r - 3)} Q${f(cx - 17)},${f(cy - r - 10)} ${f(cx - 12)},${f(cy - r - 15)} Q${f(cx - 6)},${f(cy - r - 10)} ${f(cx - 3)},${f(cy - r - 4)} Z`, '#f4ead0', { sw: 1.6 });
      s += path(`M${f(cx - 6)},${f(cy - r - 3)} Q${f(cx - 13)},${f(cy - r - 8)} ${f(cx - 12)},${f(cy - r - 14)}`, 'none', { stroke: C.red!, sw: 1.6 });
      return s;
    },
    weapon: (hd, pd) => sword(hd, pd.ang, 31, 4, '#e6eef6', 4, C.gold!),
  } };
}
const captainBody = (p: Pd, atk: boolean): string => manOf(captainSpec(p, atk), p, atk);

// ================================================================= 分件骨架用的部件（art/rigparts.ts）

/** 一种守岛敌人拆成部件后的样子：坐标同整张帧（脚底为原点），腿、手臂、武器是部件自己的局部坐标（锚点在原点） */
export interface TdManSpec {
  /** 头中心的高度 */
  headY: number;
  /** 身体：背上的东西 + 长衣摆 + 躯干 + 花样（脚底坐标） */
  torso: string;
  /** 头 + 脸（脚底坐标），atk = 张嘴 */
  head(atk: boolean): string;
  /** 帽子（脚底坐标），没有就不给 */
  hat?: string;
  /** 腿（髋在原点、朝下），没有腿（雾灵）不给 */
  leg?(front: boolean): string;
  /** 手臂（肩在原点、朝下长 arm），后臂带手和盾 */
  arm(front: boolean, arm: number): string;
  /** 武器（手心在原点，刀沿 +x 朝前）和包围盒 */
  wep?: { svg: string; box: [number, number, number, number] };
  /** 刀光半径（0 = 没有） */
  trail: number;
}

const P0: Pd = { bob: 0, ff: [5, 0], bf: [-4, 0], lean: 0, fh: [5, 6], bh: [-4, 9], ang: 0 };

function specParts(sp: Spec, trail: number, ghost = false): TdManSpec {
  const { L, h } = sp;
  const op = (svg: string): string => (ghost ? `<g opacity="${FOG_OP}">${svg}</g>` : svg);
  const hb = (atk: boolean): string => {
    const r = headBall(L, P0, atk);
    return r.svg + (h.face ? h.face(r.cx, r.cy, L.head) : '');
  };
  const c0 = headBall(L, P0, false);
  return {
    headY: c0.cy,
    torso: op((h.back ? h.back(P0, L) : '') + (h.coat ? h.coat(L, P0) : '') + torsoShape(L, P0) + (h.torso ? h.torso(P0.lean, L.top, P0) : '')) + (ghost ? fogWisps(0) : ''),
    head: (atk) => op(hb(atk)) + (ghost ? fogEyes(P0) : ''),
    hat: h.hat ? op(h.hat(c0.cx, c0.cy, L.head, P0)) : undefined,
    leg: h.skip?.legs ? undefined : (front) => limb([0, 0], [0, 9.5], 5, front ? L.pants : darken(L.pants, 0.12)) + ell(front ? 1.6 : 1.2, 10.1, front ? 5 : 4.6, front ? 3 : 2.8, L.boot, { sw: 1.6 }),
    arm: (front, arm) => op(limb([0, 0], [0, arm], 4.2, L.sleeve) + (front ? '' : handDot([0, arm], L.skin) + (h.backHand ? h.backHand([0, arm], P0) : ''))),
    wep: h.weapon ? { svg: op(h.weapon([0, 0], P0, false) + handDot([0, 0], L.skin)), box: [-8, -14, 36, 14] } : undefined,
    trail,
  };
}

export function tdMan(kind: 'sailor' | 'ironclad' | 'fog' | 'sapper' | 'grenadier' | 'captain' | 'shield' | 'bosun' | 'mate' | 'medic' | 'skiff' | 'skiffling'): TdManSpec {
  if (kind === 'sailor') return specParts(sailorSpec(P0), 23);
  if (kind === 'bosun') return specParts(bosunSpec(P0), 27);
  if (kind === 'mate') return specParts(bosunSpec(P0, true), 27);
  if (kind === 'medic') return specParts(medicSpec(P0), 23);
  if (kind === 'ironclad') return specParts(ironcladSpec(P0), 25);
  if (kind === 'fog') return specParts(fogSpec(P0, 0), 23, true);
  if (kind === 'sapper') return specParts(sapperSpec(P0, 1), 0);
  if (kind === 'grenadier') return specParts(grenadierSpec(P0, 1), 0);
  if (kind === 'captain') return specParts(captainSpec(P0), 34);
  if (kind === 'shield') return specParts(shieldSpec(P0, 1), 20);
  // 小艇怪：船身当身体、两支桨当腿、船员的一只手当前臂；船员的脑袋当头
  const crack = kind === 'skiff';
  return {
    headY: -29,
    torso: skiffHull(0, crack),
    head: (atk) => skiffHead(3, -29, atk),
    leg: () => oar(0, 0, -4),
    arm: (front, arm) => (front ? limb([0, 0], [0, arm], 3.8, '#f4ead0') + handDot([0, arm], '#e8a878') : ''),
    trail: 0,
  };
}

/** 骨架缩放、影子大小（和整张帧一致） */
export function tdEnemyDef(kind: TdEnemyKind): { scale: number; shadow: [number, number] } {
  return DEF[kind];
}

interface EnemyDef {
  scale: number;
  box: Box;
  shadow: [number, number];
}
const DEF: Record<TdEnemyKind, EnemyDef> = {
  sailor: { scale: 1.5, box: { x0: -28, y0: -62, x1: 40, y1: 6 }, shadow: [24, 8] },
  ironclad: { scale: 1.75, box: { x0: -26, y0: -60, x1: 38, y1: 6 }, shadow: [28, 9] },
  fog: { scale: 1.5, box: { x0: -30, y0: -62, x1: 40, y1: 8 }, shadow: [20, 6] },
  skiff: { scale: 1.45, box: { x0: -34, y0: -42, x1: 40, y1: 6 }, shadow: [30, 8] },
  skiffling: { scale: 0.85, box: { x0: -34, y0: -42, x1: 40, y1: 6 }, shadow: [30, 8] },
  sapper: { scale: 1.5, box: { x0: -30, y0: -62, x1: 40, y1: 6 }, shadow: [22, 8] },
  grenadier: { scale: 1.5, box: { x0: -30, y0: -62, x1: 40, y1: 6 }, shadow: [22, 8] },
  parrot: { scale: 1, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, shadow: [0, 0] },
  captain: { scale: 2.25, box: { x0: -28, y0: -68, x1: 44, y1: 6 }, shadow: [22, 7] },
  shield: { scale: 1.6, box: { x0: -30, y0: -62, x1: 42, y1: 6 }, shadow: [24, 8] },
  bosun: { scale: 1.95, box: { x0: -30, y0: -64, x1: 44, y1: 6 }, shadow: [24, 8] },
  mate: { scale: 1.95, box: { x0: -30, y0: -64, x1: 44, y1: 6 }, shadow: [24, 8] },
  medic: { scale: 1.5, box: { x0: -28, y0: -62, x1: 40, y1: 6 }, shadow: [24, 8] },
  gunboat: { scale: 1, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, shadow: [0, 0] },
  king: { scale: 1, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, shadow: [0, 0] },
  macaw: { scale: 1, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, shadow: [0, 0] },
};

const ecache = new Map<string, ArtPiece[]>();
/** 敌人动画帧（朝右、脚底锚点）：walk 4 帧、attack 3 帧；同一种敌人所有帧同一尺寸 */
export function tdEnemyFrames(kind: TdEnemyKind, anim: TdAnim): ArtPiece[] {
  const ck = `${kind}.${anim}`;
  let r = ecache.get(ck);
  if (r) return r;
  const ps = poses(anim);
  const atk = anim === 'attack';
  if (kind === 'parrot') {
    r = ps.map((_, i) => parrotFrame(anim, i));
  } else if (kind === 'macaw') {
    r = ps.map((_, i) => macawFrame(anim, i));
  } else if (kind === 'gunboat') {
    r = ps.map((_, i) => gunboatFrame(anim, i));
  } else if (kind === 'king') {
    r = ps.map((_, i) => kingFrame(anim, i));
  } else {
    const d = DEF[kind];
    r = ps.map((p, i) => {
      const a = atk && i > 0;
      let body: string;
      if (kind === 'sailor') body = sailorBody(p, a);
      else if (kind === 'ironclad') body = ironcladBody(p, a);
      else if (kind === 'fog') body = fogBody(p, a, i * 1.6);
      else if (kind === 'skiff') body = skiffBody(p, a, i, true, anim);
      else if (kind === 'skiffling') body = skiffBody(p, a, i, false, anim);
      else if (kind === 'sapper') body = sapperBody(p, a, i);
      else if (kind === 'grenadier') body = grenadierBody(p, a, i);
      else if (kind === 'shield') body = shieldBody(p, a, i);
      else if (kind === 'bosun') body = bosunBody(p, a);
      else if (kind === 'mate') body = bosunBody(p, a, true);
      else if (kind === 'medic') body = medicBody(p, a);
      else body = captainBody(p, a);
      return frame(`td.${kind}.${anim}.${i}`, d.scale, d.box, stdShadow(d.shadow[0] * d.scale, d.shadow[1] * d.scale), body);
    });
  }
  ecache.set(ck, r);
  return r;
}

// ================================================================= 道具

const WOOD = mat(C.wood!);

function padBody(built: boolean): string {
  const m = built ? mat('#7a5230') : mat('#d09a58');
  const k = 0.95;
  let o = ell(4, 8, 74, 32, '#000', { sw: 0, op: built ? 0.22 : 0.15 });
  o += box(-k, -k, k, k, 0, 8, m, '', 2);
  const z = 8;
  // 木板：沿 gx 方向铺，错开的接缝
  const n = 6;
  for (let i = 1; i < n; i++) {
    const g = -k + (2 * k * i) / n;
    o += line(P(-k, g, z), P(k, g, z), m.line, 1.3, 0.7);
    const j = (i * 0.37) % 1;
    const gx = -k + 2 * k * (0.25 + 0.5 * j);
    o += line(P(gx, g - (2 * k) / n, z), P(gx, g, z), m.line, 1.1, 0.55);
  }
  // 木板侧面竖纹
  for (let i = 1; i < 6; i++) o += line(P(-k + (2 * k * i) / 6, k, 1), P(-k + (2 * k * i) / 6, k, 7), m.line, 1, 0.4);
  for (let i = 1; i < 6; i++) o += line(P(k, -k + (2 * k * i) / 6, 1), P(k, -k + (2 * k * i) / 6, 7), m.line, 1, 0.5);
  // 四角的钉头
  for (const [gx, gy] of [[-0.82, -0.82], [0.82, -0.82], [0.82, 0.82], [-0.82, 0.82]] as Array<[number, number]>) {
    const q = P(gx, gy, z);
    o += ell(q[0], q[1], 2, 1.1, built ? '#3a2a20' : '#6a4a2c', { sw: 0.8 });
  }
  if (built) {
    // 踩得发黑的旧板子：深色污渍、划痕、一圈圆形的塔座印
    const c = P(0, 0, z);
    o += ell(c[0], c[1], 34, 17, '#3a2412', { sw: 0, op: 0.34 });
    o += ell(c[0], c[1], 27, 13.5, 'none', { sw: 1.4, stroke: '#2a1808', op: 0.6 });
    o += line(P(-0.6, -0.3, z), P(-0.2, -0.45, z), '#2a1808', 1.4, 0.5) + line(P(0.35, 0.5, z), P(0.7, 0.25, z), '#2a1808', 1.4, 0.5);
  } else {
    // 淡淡的内框，提示这里能放塔
    const q = 0.72;
    o += `<polygon points="${[P(-q, -q, z), P(q, -q, z), P(q, q, z), P(-q, q, z)].map((a) => `${f(a[0])},${f(a[1])}`).join(' ')}" fill="rgba(255,244,200,0.14)" stroke="#fff4c8" stroke-width="1.4" stroke-dasharray="5 4" stroke-opacity="0.5"/>`;
  }
  return o;
}

function kegBody(): string {
  const km = mat('#6a4a2c');
  let o = ell(3, 4, 22, 10, '#000', { sw: 0, op: 0.22 });
  o += cyl(0, 0, 15, 0, 30, km, 0);
  // 两道铁箍（跟着桶身弧度）
  for (const z of [7, 22]) {
    o += path(`M-15,${-z} A15,7.5 0 0 0 15,${-z}`, 'none', { stroke: OUT, sw: 4.6 }) + path(`M-15,${-z} A15,7.5 0 0 0 15,${-z}`, 'none', { stroke: '#5a626e', sw: 2.6 });
  }
  o += skull(0, -14, 11, false);
  // 引线与火花
  o += path('M2,-30 Q6,-38 2,-42 Q-1,-45 3,-48', 'none', { stroke: OUT, sw: 3.6 }) + path('M2,-30 Q6,-38 2,-42 Q-1,-45 3,-48', 'none', { stroke: '#d8c9a0', sw: 1.8 });
  const t: Pt = [3, -50];
  o += poly([[t[0], t[1] - 8], [t[0] + 2, t[1] - 2], [t[0] + 7, t[1]], [t[0] + 2, t[1] + 2], [t[0], t[1] + 6], [t[0] - 2, t[1] + 2], [t[0] - 7, t[1]], [t[0] - 2, t[1] - 2]], '#ffd23f', { sw: 1, stroke: '#e0561c' });
  o += ell(t[0], t[1], 2, 2, '#fff', { sw: 0 });
  return o;
}

function barrelBody(): string {
  const bm = mat(C.wood!);
  let o = ell(3, 5, 40, 17, '#000', { sw: 0, op: 0.2 });
  const one = (gx: number, gy: number, rx: number, h: number): string => {
    let s = cyl(gx, gy, rx, 0, h, bm, 0);
    const c = P(gx, gy);
    for (const z of [h * 0.22, h * 0.76]) {
      s += path(`M${f(c[0] - rx)},${f(c[1] - z)} A${rx},${rx / 2} 0 0 0 ${f(c[0] + rx)},${f(c[1] - z)}`, 'none', { stroke: '#3a2a20', sw: 2.6 });
    }
    s += ell(c[0], c[1] - h, rx * 0.72, rx * 0.36, darken(C.wood!, 0.28), { sw: 0, op: 0.8 });
    return s;
  };
  o += one(-0.1, -0.26, 12, 28);
  o += one(0.28, 0.0, 12, 26);
  o += one(-0.3, 0.16, 12, 24);
  o += one(0.06, 0.3, 11, 20);
  return o;
}

function wreckBody(): string {
  let o = ell(2, 8, 74, 32, C.sandD!, { sw: 0, op: 0.55 });
  o += ell(-6, 10, 52, 20, C.sand!, { sw: 0, op: 0.7 });
  // 断掉的桅杆（躺在后面）
  o += line([30, -22], [58, -46], OUT, 8) + line([30, -22], [58, -46], C.woodD!, 5);
  // 撕烂的帆
  o += path('M34,-26 Q48,-18 44,-6 Q38,-12 34,-8 Q32,-16 34,-26 Z', '#efe4c4', { sw: 1.8 });
  // 船壳：侧翻在沙滩上，船头翘起（右）
  const hull = 'M-58,-4 Q-60,-26 -34,-36 L-6,-40 L18,-34 L38,-26 Q60,-20 62,-6 Q40,12 4,14 Q-36,14 -58,-4 Z';
  o += path(hull, '#8c542a', { sw: 2.4 });
  for (let i = 0; i < 4; i++) o += path(`M${-56 + i * 3},${-14 + i * 7} Q0,${-22 + i * 9} ${62 - i * 2},${-8 + i * 4}`, 'none', { stroke: '#5e3719', sw: 1.4, op: 0.8 });
  // 船舷的锯齿破口
  o += poly([[-34, -36], [-30, -26], [-24, -33], [-19, -22], [-12, -34], [-6, -40], [-6, -30], [2, -38], [8, -28], [14, -36], [18, -34], [18, -26], [-34, -26]], '#2a1808', { sw: 1.8 });
  // 露出来的肋骨
  for (const [x, h] of [[-27, 20], [-14, 24], [0, 24], [12, 20]] as Array<[number, number]>) {
    o += path(`M${x},-28 q${x < 0 ? -6 : 6},${-h * 0.35} 0,${-h * 0.62}`, 'none', { stroke: OUT, sw: 6.4 });
    o += path(`M${x},-28 q${x < 0 ? -6 : 6},${-h * 0.35} 0,${-h * 0.62}`, 'none', { stroke: C.woodL!, sw: 3.6 });
  }
  // 船头的铁环与金漆
  o += ell(58, -10, 4.4, 4.4, 'none', { sw: 2.2, stroke: '#6c7b8d' }) + path('M-50,-10 Q0,-6 54,-12', 'none', { stroke: C.gold!, sw: 1.6, op: 0.8 });
  // 散落的木板、海草
  o += poly([[-62, 10], [-40, 6], [-38, 11], [-60, 15]], '#a36a38', { sw: 1.6 }) + poly([[34, 12], [58, 14], [57, 19], [32, 17]], '#a36a38', { sw: 1.6 });
  o += path('M-48,8 q-3,-8 2,-12 q0,6 3,8', C.grassDD!, { sw: 1.2 });
  return o;
}

function tideEdgeBody(): string {
  const d = [P(0, -0.5), P(0.5, 0), P(0, 0.5), P(-0.5, 0)];
  let o = poly(d, '#9c7a44', { sw: 0, op: 0.5 });
  o += `<polygon points="${d.map((a) => `${f(a[0])},${f(a[1])}`).join(' ')}" fill="none" stroke="#e8f8f4" stroke-width="2" stroke-dasharray="2 4" stroke-linecap="round" stroke-opacity="0.8"/>`;
  for (const [x, y, r] of [[-14, 1, 2.2], [-4, -6, 1.6], [8, 4, 2.4], [14, -1, 1.4], [0, 7, 1.8], [-9, 6, 1.2]] as Array<[number, number, number]>) o += ell(x, y, r, r * 0.6, '#effcf7', { sw: 0, op: 0.85 });
  o += line([-12, -4], [-4, 0], '#6b5230', 1, 0.5) + line([4, 6], [12, 2], '#6b5230', 1, 0.5);
  return o;
}

/** 雾区的一团雾：几个重叠的软椭圆，不描边（成片铺开才像雾） */
function mistBody(): string {
  let o = '';
  for (const [x, y, rx, ry, op] of [[0, 0, 70, 32, 0.5], [-34, 6, 42, 22, 0.46], [32, -4, 46, 24, 0.46], [-8, -12, 38, 18, 0.42], [14, 12, 40, 18, 0.4]] as Array<[number, number, number, number, number]>) {
    o += ell(x, y, rx, ry, '#f3fbff', { sw: 0, op });
  }
  o += ell(-6, -4, 30, 12, '#ffffff', { sw: 0, op: 0.22 });
  return o;
}

/** 被炸哑的塔头上的一团烟和几颗电火花 */
function jamBody(): string {
  let o = ell(0, 6, 34, 12, '#3a4350', { sw: 0, op: 0.35 });
  for (const [x, y, r] of [[-16, -2, 13], [0, -10, 16], [16, -2, 12], [-4, 2, 12]] as Array<[number, number, number]>) o += ell(x, y, r, r * 0.8, '#6b7482', { sw: 2, op: 0.92 });
  for (const [x, y] of [[-22, -22], [4, -34], [24, -20]] as Array<[number, number]>) {
    o += poly([[x, y - 8], [x + 3, y - 2], [x + 9, y], [x + 3, y + 2], [x, y + 8], [x - 3, y + 2], [x - 9, y], [x - 3, y - 2]], '#ffe885', { sw: 1.6 });
  }
  return o;
}

/** 涨落的潮的小浪花：落潮路口的预告牌用 */
function tideWaveBody(): string {
  let o = '';
  for (const [y, op] of [[-8, 0.95], [2, 0.8], [12, 0.6]] as Array<[number, number]>) {
    o += path(`M-36,${y} q9,-12 18,0 t18,0 t18,0 t18,0`, 'none', { stroke: '#2b7fa3', sw: 7, op: 1 });
    o += path(`M-36,${y} q9,-12 18,0 t18,0 t18,0 t18,0`, 'none', { stroke: '#effcf7', sw: 3.6, op });
  }
  return o;
}

/**
 * 潮汐水闸（第二章最后两关）：落潮路口两根粗木桩、顶上一根铁箍横梁，中间一扇闸板。
 * 提起（up）时闸板挂在横梁下、露出底下的路；放下（down）时闸板落到底、挡住的水在外侧堆起浪花
 */
function sluiceBody(down: boolean): string {
  let o = ell(0, 6, 46, 14, C.sandD!, { sw: 0, op: 0.5 });
  if (down) {
    o += path('M-44,4 q8,-10 16,0 t16,0 t16,0 t16,0 t16,0', 'none', { stroke: '#2b7fa3', sw: 7 });
    o += path('M-44,4 q8,-10 16,0 t16,0 t16,0 t16,0 t16,0', 'none', { stroke: '#effcf7', sw: 3 });
  }
  const gy = down ? -30 : -58;
  o += rect(-26, gy, 52, 30, C.wood!, { sw: 2.4 });
  for (const y of [gy + 10, gy + 20]) o += line([-26, y], [26, y], C.woodDD!, 1.6);
  o += rect(-30, gy - 2, 4, 32, C.ironD!, { sw: 0, op: 0.4 }) + rect(26, gy - 2, 4, 32, C.ironD!, { sw: 0, op: 0.4 });
  for (const x of [-38, 30]) {
    o += rect(x, -74, 8, 80, C.woodD!, { sw: 2.4 });
    o += line([x + 2, -70], [x + 2, 2], C.woodL!, 1.6, 0.7);
  }
  o += rect(-42, -80, 84, 9, C.iron!, { sw: 2.4 }) + ell(-34, -75.5, 2.4, 2.4, C.ironL!, { sw: 0 }) + ell(34, -75.5, 2.4, 2.4, C.ironL!, { sw: 0 });
  // 提闸的绳和轮
  o += ell(0, -84, 7, 7, C.woodD!, { sw: 2 }) + line([0, -84], [0, gy], '#d9c08a', 2);
  return o;
}

/** 漂流补给箱（第一章最后两关）：搁在浪花边的木箱，铁角、麻绳十字捆着，顶上插一面小黄旗 */
function crateBody(): string {
  let o = path('M-34,10 q8,-8 16,0 t16,0 t16,0 t16,0', 'none', { stroke: '#2b7fa3', sw: 6, op: 0.9 }) + path('M-34,10 q8,-8 16,0 t16,0 t16,0 t16,0', 'none', { stroke: '#effcf7', sw: 2.6 });
  // 箱子：正面、侧面、顶面
  o += poly([[-22, -10], [0, 0], [0, 18], [-22, 8]], '#a36a38', { sw: 2.4 }) + poly([[22, -10], [0, 0], [0, 18], [22, 8]], '#8c542a', { sw: 2.4 }) + poly([[-22, -10], [0, -20], [22, -10], [0, 0]], '#c98a4b', { sw: 2.4 });
  for (const [a, b] of [[[-22, -1], [0, 9]], [[22, -1], [0, 9]]] as Array<[Pt, Pt]>) o += line(a, b, '#5e3719', 1.4, 0.8);
  // 绳十字
  o += line([-11, -15], [11, -5], '#e6cf94', 2.6) + line([11, -15], [-11, -5], '#e6cf94', 2.6) + line([-11, -5], [-11, 13], '#e6cf94', 2.4) + line([11, -5], [11, 13], '#e6cf94', 2.4);
  // 铁角
  for (const [x, y] of [[-22, -10], [22, -10], [0, 18], [0, 0]] as Array<[number, number]>) o += ell(x, y, 2.4, 2.4, C.ironD!, { sw: 0 });
  // 小旗
  o += line([12, -14], [12, -42], C.woodDD!, 2.4) + poly([[12, -42], [30, -36], [12, -30]], C.gold!, { sw: 2 });
  return o;
}

/** 岸防老炮（第三章最后两关）：沙滩上一圈沙袋围着的石墩，上面一门粗短的旧铜炮朝岛里，旁边一摞炮弹 */
function batteryBody(): string {
  let o = ell(0, 8, 58, 20, C.sandD!, { sw: 0, op: 0.55 });
  // 沙袋一圈
  for (const [x, y] of [[-46, 2], [-30, 10], [-10, 14], [12, 14], [32, 10], [48, 2]] as Array<[number, number]>) o += ell(x, y, 13, 8, '#c8a868', { sw: 2 });
  // 石墩
  o += path('M-34,-2 L0,-18 L34,-2 L0,14 Z', C.stone!, { sw: 2.4 }) + path('M-34,-2 L0,14 L0,24 L-34,8 Z', C.stoneD!, { sw: 2.4 }) + path('M34,-2 L0,14 L0,24 L34,8 Z', C.stone!, { sw: 2.4, op: 0.9 });
  // 炮架和炮管（朝左上，指向岛里）
  o += poly([[-16, -8], [10, -20], [16, -12], [-8, 0]], C.woodD!, { sw: 2.2 });
  o += path('M10,-22 Q2,-34 -12,-36 L-40,-44 L-44,-34 L-18,-22 Q-4,-12 10,-14 Z', '#b07a3a', { sw: 2.6 });
  o += path('M-12,-34 L-38,-41', 'none', { stroke: '#e3b06a', sw: 2.4, op: 0.8 });
  o += ell(-42, -39, 4, 6, '#2b1a15', { sw: 1.8 }) + ell(4, -22, 4, 6, '#8a5a24', { sw: 1.8 });
  for (const x of [-14, 0]) o += line([x, -30], [x + 2, -16], '#6b4a1e', 2.2);
  o += ell(-4, -6, 7, 7, C.woodD!, { sw: 2 }) + ell(-4, -6, 2.4, 2.4, C.gold!, { sw: 0 });
  // 一摞炮弹
  for (const [x, y] of [[20, 2], [28, -2], [24, -8]] as Array<[number, number]>) o += ell(x, y, 5, 5, '#2f3140', { sw: 1.6 }) + ell(x - 1.6, y - 1.6, 1.4, 1, '#8a8da2', { sw: 0 });
  return o;
}

const pcache = new Map<TdPropKind, ArtPiece>();
/** 场地道具。2x2 的按建筑一样以占地中心为锚点；1x1 同理。 */
export function tdPropArt(kind: TdPropKind): ArtPiece {
  let a = pcache.get(kind);
  if (a) return a;
  const key = `td.prop.${kind}`;
  if (kind === 'pad') a = piece(key, 152, 92, 76, 52, padBody(false));
  else if (kind === 'padBuilt') a = piece(key, 152, 92, 76, 52, padBody(true));
  else if (kind === 'keg') a = piece(key, 64, 92, 32, 70, kegBody());
  else if (kind === 'barrel') a = piece(key, 96, 88, 48, 64, barrelBody());
  else if (kind === 'wreck') a = piece(key, 160, 120, 80, 86, wreckBody());
  else if (kind === 'mist') a = piece(key, 190, 100, 95, 50, mistBody());
  else if (kind === 'jam') a = piece(key, 100, 80, 50, 60, jamBody());
  else if (kind === 'tideWave') a = piece(key, 90, 40, 45, 20, tideWaveBody());
  else if (kind === 'battery') a = piece(key, 132, 96, 66, 66, batteryBody());
  else if (kind === 'crate') a = piece(key, 80, 72, 40, 52, crateBody());
  else if (kind === 'sluiceUp' || kind === 'sluiceDown') a = piece(key, 104, 112, 52, 96, sluiceBody(kind === 'sluiceDown'));
  else a = piece(key, 64, 32, 32, 16, tideEdgeBody());
  pcache.set(kind, a);
  return a;
}

/** 全部素材（敌人所有帧 + 道具），开局烘焙用 */
export function tdAllArt(): ArtPiece[] {
  const out: ArtPiece[] = [];
  for (const k of TD_ENEMY_KINDS) for (const an of ['walk', 'attack'] as const) out.push(...tdEnemyFrames(k, an));
  for (const k of TD_PROP_KINDS) out.push(tdPropArt(k));
  return out;
}

void uid;
void WOOD;
