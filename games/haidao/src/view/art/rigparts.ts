/**
 * 分件骨架的部件素材：每个兵种 / 守岛敌人拆成 后腿、前腿、后臂、身体、头（睁眼 / 眨眼 / 张嘴三张）、帽子、前臂、武器、刀光、脚下影子，
 * 每张以关节为锚点（腿 = 髋、身体 = 髋、头和帽子 = 颈、手臂 = 肩、武器 = 手心），画面层（rigsprite.ts）烘进一张图集再拼起来。
 *
 * - 坐标：设计单位、朝右，部件自己的锚点在原点；按骨架（rig.ts 的 SKEL）的缩放画大，所以贴图时和整张帧一样 setScale(1 / 渲染倍数)；
 * - 身上的装饰（衣服花样、背上的东西、长衣摆、胡子、帽子）和整张帧共用 troops.ts 的 DECO / tdart.ts 的 tdMan，改外观只改那里；
 * - 武器按"姿势通道 wep = 0"的方向画：刀、枪、锤、鱼叉沿 +x 朝前，炸弹、药箱、炮车这类立着画（rig.ts 的 Pose.wep）。
 */
import type { TroopKind } from '../../core/types.ts';
import { RIG_KINDS, SKEL, type RigKind, type Skel } from '../rig.ts';
import type { ArtPiece } from './kit.ts';
import { ell, f, line, path, piece, pieceRaw, shadow } from './kit.ts';
import { PALETTE as C } from './palette.ts';
import { NAV_DECO, NAV_LOOK, NAV_RANK } from './navigator.ts';
import { DECO, LOOKS, SKIN_GLOW, blade, woodShield, torsoShape, cart, grenadeBall, hammer, harpoon, head, keg, limb, medkit, musket, pistol, skinDeco, skinify, type Look, type PoseData, type TroopDeco, type TroopSkin } from './troops.ts';
import { tdEnemyDef, tdMan, type TdManSpec } from './tdart.ts';

export const RIG_FRAMES = ['shadow', 'legB', 'legF', 'armB', 'torso', 'head', 'headBlink', 'headAtk', 'hat', 'armF', 'wep', 'trail', 'shield'] as const;
export type RigFrame = (typeof RIG_FRAMES)[number];

/** 一个部件：设计单位的 SVG（锚点在原点）和包围盒 [x0, y0, x1, y1]（设计单位，宽松一点） */
interface Part {
  svg: string;
  box: [number, number, number, number];
}

/** 帧名：图集里每个部件一帧（`<种类>.<部件>`），皮肤另一张图集、帧名相同 */
export const rigFrame = (kind: RigKind, part: RigFrame): string => `${kind}.${part}`;

function mk(key: string, s: number, p: Part, raw = false): ArtPiece {
  const [x0, y0, x1, y1] = p.box;
  const w = Math.ceil((x1 - x0) * s);
  const h = Math.ceil((y1 - y0) * s);
  const body = `<g transform="scale(${s})">${p.svg}</g>`;
  return (raw ? pieceRaw : piece)(key, w, h, -x0 * s, -y0 * s, body);
}

const P0: PoseData = { bob: 0, ff: [5, 0], bf: [-4, 0], lean: 0, fh: [6, 8], bh: [-5, 9] };

/** 刀光：以肩为圆心、半径 r 的一弯月牙，朝"手臂来的方向"（手臂局部 +x 那侧）展开，越往后越淡越细 */
function trail(r: number, color = '#ffffff'): Part {
  const n = 9;
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 1.9;
    const w = 0.34 * r * (1 - i / n) + 0.6;
    outer.push(`${f(Math.sin(a) * r)},${f(Math.cos(a) * r)}`);
    inner.push(`${f(Math.sin(a) * (r - w))},${f(Math.cos(a) * (r - w))}`);
  }
  const d = `M${outer.join(' L')} L${inner.reverse().join(' L')} Z`;
  const id = `tr${Math.round(r * 10)}`;
  const grad = `<defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${color}" stop-opacity="0.95"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`;
  return { svg: grad + path(d, `url(#${id})`, { sw: 0 }), box: [-2, -r - 2, r + 2, r + 2] };
}

/** 盾兵的大木盾（分件骨架里的单独部件，中心是锚点；rigsprite.ts 按 gx / gy 把它摆到身体前后左右） */
export const SHIELD_W = 22;
export const SHIELD_H = 28;
const SHIELD_PART: Part = { svg: woodShield(SHIELD_W, SHIELD_H), box: [-SHIELD_W / 2 - 3, -SHIELD_H / 2 - 3, SHIELD_W / 2 + 3, SHIELD_H / 2 + 3] };

// ---------------------------------------------------------------- 兵（troops.ts 的外观）

interface TroopRig {
  sleeve: string;
  sleeveB?: string;
  armW: number;
  handR: number;
  /** 前手拿的东西（手心在原点）和它的包围盒；trail = 刀光半径（0 = 没有刀光） */
  wep: Part;
  trail: number;
}

const TROOP_RIG: Record<TroopKind, TroopRig> = {
  sailor: { sleeve: '#fefefe', armW: 4.2, handR: 2.9, wep: { svg: blade([0, 0], [17, 0], 2.4, false, 4), box: [-5, -9, 21, 9] }, trail: 25 },
  gunner: { sleeve: '#3a8f48', armW: 4.2, handR: 2.9, wep: { svg: musket([0, 0], false), box: [-13, -8, 36, 6] }, trail: 0 },
  brute: { sleeve: LOOKS.brute.skin, armW: 8.4, handR: 5, wep: { svg: rotHammer(), box: [-6, -14, 38, 14] }, trail: 34 },
  bomber: { sleeve: '#ff8a1f', armW: 4.2, handR: 2.9, wep: { svg: keg([1, -6]), box: [-9, -26, 16, 4] }, trail: 0 },
  captain: { sleeve: '#ff3a2e', armW: 4.6, handR: 3, wep: { svg: pistol([0, 0], false), box: [-9, -7, 18, 10] }, trail: 0 },
  medic: { sleeve: '#4a8fd0', armW: 4.2, handR: 2.9, wep: { svg: medkit(1, 3), box: [-9, -9, 11, 11] }, trail: 0 },
  cannoneer: { sleeve: '#3a5aa0', armW: 5.6, handR: 4, wep: { svg: cart([8, 6], 0), box: [-6, -9, 28, 20] }, trail: 0 },
  grenadier: { sleeve: '#5a7a4a', armW: 4.2, handR: 2.9, wep: { svg: grenadeBall([1, -6]), box: [-9, -18, 16, 4] }, trail: 0 },
  harpooner: { sleeve: '#f2c230', armW: 4.2, handR: 2.9, wep: { svg: harpoon([-14, 0], [26, 0]), box: [-16, -9, 40, 9] }, trail: 0 },
  shield: { sleeve: '#9a6a3c', armW: 4.2, handR: 2.9, wep: { svg: blade([0, 0], [14, 0], 2.2, false, 2), box: [-5, -8, 19, 8] }, trail: 20 },
};

/** 大锤横过来画：锤柄沿 +x、锤头和柄垂直（整张帧里锤柄是竖的，这里转 90°） */
function rotHammer(): string {
  return `<g transform="rotate(90)">${hammer([0, 0], [0, -24])}</g>`;
}

/** 守岛英雄按等级换的外观（部件图集另烘一张，key 见 rigsprite.ts 的 rigTex） */
export type HeroRank = 'rank1' | 'rank2' | 'rank3';
/** 英雄到这几级换外观：4 级帽子插白色长羽，8 级加金肩章，12 级腰带上再插一把手枪（双枪） */
export const HERO_RANK_LEVELS = [4, 8, 12] as const;
export function heroRank(level: number): HeroRank | undefined {
  const n = HERO_RANK_LEVELS.filter((l) => level >= l).length;
  return n === 0 ? undefined : (`rank${n}` as HeroRank);
}

/** 英雄等级外观的小件（坐标同 DECO.captain：hy 是头心的 y） */
const RANK_DECO = {
  plume: (cx: number, cy: number): string =>
    path(`M${f(cx - 8)},${f(cy - 13)} Q${f(cx - 22)},${f(cy - 20)} ${f(cx - 15)},${f(cy - 35)} Q${f(cx - 12)},${f(cy - 24)} ${f(cx - 3)},${f(cy - 17)} Z`, '#fbfbf6', { sw: 1.6 }) +
    path(`M${f(cx - 7)},${f(cy - 15)} Q${f(cx - 15)},${f(cy - 22)} ${f(cx - 14)},${f(cy - 31)}`, 'none', { stroke: '#c9d6e6', sw: 1.2 }),
  // 12 级：腰带上斜插第二把手枪（背手在身后看不见，插在正面才认得出双枪）
  beltPistol: (): string => `<g transform="rotate(-20 -6 -9)">${pistol([-6, -9], false)}</g>`,
  epaulettes: (): string => {
    let s = '';
    for (const x of [-7.4, 7.4]) {
      s += ell(x, -23, 4.2, 2.2, C.gold!, { sw: 1.4 });
      for (const dx of [-2.4, 0, 2.4]) s += line([x + dx, -21.4], [x + dx * 1.2, -18.2], C.goldD!, 1.2);
    }
    return s;
  },
};

/** 一个人形角色拼部件要的东西：外观、身上装饰、骨架、手臂和武器；rankDeco 是英雄等级外观加在身体上的小件 */
interface ManRig {
  L: Look;
  D: TroopDeco;
  sk: Skel;
  R: TroopRig;
  /** 身体部件的包围盒顶部多留多少（船医背包高） */
  topPad: number;
  rankDeco: (rank: number) => string;
  /** 帽子部件里额外加的（船长 4 级的白羽） */
  hatDeco: (rank: number, hy: number) => string;
}

function troopParts(kind: TroopKind, skin?: TroopSkin, rank = 0): Partial<Record<RigFrame, Part>> {
  const out = manParts({
    L: LOOKS[kind], D: DECO[kind], sk: SKEL[`t.${kind}`], R: TROOP_RIG[kind], topPad: kind === 'medic' ? 4 : 0,
    rankDeco: (r) => (r >= 2 ? RANK_DECO.epaulettes() : '') + (r >= 3 ? RANK_DECO.beltPistol() : ''),
    hatDeco: (r, hy) => (r >= 1 ? RANK_DECO.plume(1, hy) : ''),
  }, rank, skin ? skinDeco(kind, skin, 0) : '');
  if (kind === 'shield') out.shield = SHIELD_PART;
  if (skin) {
    for (const k of Object.keys(out) as RigFrame[]) {
      const p = out[k]!;
      if (k === 'trail') continue;
      const glow = skin === 'shadow' ? ' filter="url(#sg)"' : '';
      out[k] = { svg: (skin === 'shadow' ? SKIN_GLOW : '') + `<g${glow}>${skinify(p.svg, kind, skin)}</g>`, box: p.box };
    }
  }
  return out;
}

/** 航海士（外观在 art/navigator.ts）：手臂是深青袖子，端长管火枪；等级外观 4 级辫子金扣、8 级金肩章、12 级金边望远镜 */
const NAV_RIG: TroopRig = { sleeve: NAV_LOOK.shirt, armW: 4.2, handR: 2.9, wep: { svg: musket([0, 0], false), box: [-13, -8, 36, 6] }, trail: 0 };
function navParts(rank: number): Partial<Record<RigFrame, Part>> {
  return manParts({
    L: NAV_LOOK, D: NAV_DECO, sk: SKEL['h.nav'], R: NAV_RIG, topPad: 0,
    rankDeco: (r) => (r >= 1 ? NAV_RANK.clasp() : '') + (r >= 2 ? RANK_DECO.epaulettes() : '') + (r >= 3 ? NAV_RANK.goldGlass() : ''),
    hatDeco: () => '',
  }, rank, '');
}

function manParts(m: ManRig, rank: number, hatExtra: string): Partial<Record<RigFrame, Part>> {
  const { L, D, sk, R } = m;
  const neckY = sk.hipY + sk.neck[1];
  const top = neckY - 11;
  const hy = D.headY;
  const rel = hy - neckY;
  const toNeck = (svg: string): string => `<g transform="translate(-1 ${f(-neckY)})">${svg}</g>`;
  const leg = (front: boolean): Part => {
    const pants = front ? L.pants : darkenHex(L.pants, 0.12);
    return { svg: limb([0, 0], [0, 9.5], 5, pants) + ell(front ? 1.6 : 1.2, 10.1, front ? 5 : 4.6, front ? 3 : 2.8, L.boot, { sw: 1.6 }), box: [-6, -3, 9, 14] };
  };
  const torso: Part = {
    svg: `<g transform="translate(0 11)">${D.back ? D.back(0, 0, -2) : ''}${torsoShape(L, P0, (x, yt) => D.torso(x, yt, 0))}${D.coat ? D.coat(0, 0, 1) : ''}${m.rankDeco(rank)}</g>`,
    box: [-24, top + 11 - 9 - m.topPad, 22, 14],
  };
  const headPart = (mouth: boolean, blink: boolean): Part => ({
    svg: toNeck(head(L, P0, hy, mouth, '', blink) + (D.face ? D.face(1, hy) : '')),
    box: [-15, rel - 17, 17, rel + 18],
  });
  const hatSvg = m.hatDeco(rank, hy) + (D.hat ? D.hat(1, hy) : '') + hatExtra;
  const arm = (front: boolean): Part => {
    const c = front ? R.sleeve : R.sleeveB ?? R.sleeve;
    const hand = front ? '' : ell(0, sk.arm, R.handR, R.handR, L.skin, { sw: 1.6 });
    const w = R.armW / 2 + 3;
    return { svg: limb([0, 0], [0, sk.arm], R.armW, c) + hand, box: [-w - R.handR, -w, w + R.handR, sk.arm + R.handR + 3] };
  };
  const out: Partial<Record<RigFrame, Part>> = {
    legB: leg(false),
    legF: leg(true),
    armB: arm(false),
    torso,
    head: headPart(false, false),
    headBlink: headPart(false, true),
    headAtk: headPart(true, false),
    armF: arm(true),
    wep: { svg: R.wep.svg + ell(0, 0, R.handR, R.handR, L.skin, { sw: 1.5 }), box: R.wep.box },
  };
  if (hatSvg) out.hat = { svg: toNeck(hatSvg), box: [-21, rel - 32, 23, rel + 8] };
  if (R.trail) out.trail = trail(R.trail);
  return out;
}

function darkenHex(c: string, t: number): string {
  const n = parseInt(c.slice(1), 16);
  const ch = (v: number): string => Math.round(v * (1 - t)).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// ---------------------------------------------------------------- 守岛敌人（tdart.ts 的外观）

type TdRigKind = 'sailor' | 'ironclad' | 'fog' | 'sapper' | 'grenadier' | 'captain' | 'shield' | 'bosun' | 'mate' | 'medic' | 'skiff' | 'skiffling';

function tdParts(kind: TdRigKind): Partial<Record<RigFrame, Part>> {
  const sk = SKEL[`e.${kind}`];
  const spec: TdManSpec = tdMan(kind);
  const neckY = sk.hipY + sk.neck[1];
  const toNeck = (svg: string): string => `<g transform="translate(${f(-sk.neck[0])} ${f(-neckY)})">${svg}</g>`;
  const toHip = (svg: string): string => `<g transform="translate(0 ${f(-sk.hipY)})">${svg}</g>`;
  const rel = spec.headY - neckY;
  const out: Partial<Record<RigFrame, Part>> = {
    torso: { svg: toHip(spec.torso), box: [-30, sk.neck[1] - 12, 34, 16] },
    head: { svg: toNeck(spec.head(false)), box: [-16, rel - 18, 18, rel + 18] },
    headAtk: { svg: toNeck(spec.head(true)), box: [-16, rel - 18, 18, rel + 18] },
    armF: { svg: spec.arm(true, sk.arm), box: [-6, -5, 6, sk.arm + 6] },
    armB: { svg: spec.arm(false, sk.arm), box: [-14, -14, 14, sk.arm + 16] },
  };
  if (spec.leg) {
    out.legB = { svg: spec.leg(false), box: [-8, -4, 10, 14] };
    out.legF = { svg: spec.leg(true), box: [-8, -4, 10, 14] };
  }
  if (spec.hat) out.hat = { svg: toNeck(spec.hat), box: [-22, rel - 30, 24, rel + 8] };
  if (spec.wep) out.wep = { svg: spec.wep.svg, box: spec.wep.box };
  if (spec.trail) out.trail = trail(spec.trail);
  if (kind === 'shield') out.shield = SHIELD_PART;
  return out;
}

// ---------------------------------------------------------------- 汇总


function partsOf(kind: RigKind, skin?: TroopSkin | HeroRank): Partial<Record<RigFrame, Part>> {
  const rank = skin?.startsWith('rank') ? Number(skin.slice(4)) : 0;
  if (kind === 'h.nav') return navParts(rank);
  if (!kind.startsWith('t.')) return tdParts(kind.slice(2) as TdRigKind);
  return troopParts(kind.slice(2) as TroopKind, rank ? undefined : (skin as TroopSkin | undefined), rank);
}

const cache = new Map<string, ArtPiece[]>();
/** 一个种类（可带皮肤）的全部部件素材；帧名见 rigFrame */
export function rigPieces(kind: RigKind, skin?: TroopSkin | HeroRank): ArtPiece[] {
  const ck = `${kind}~${skin ?? ''}`;
  let r = cache.get(ck);
  if (r) return r;
  const sk: Skel = SKEL[kind];
  const parts = partsOf(kind, skin);
  r = [];
  for (const name of RIG_FRAMES) {
    if (name === 'shadow') continue;
    const p = parts[name];
    if (p) r.push(mk(rigFrame(kind, name), sk.s, p, name === 'trail'));
  }
  // 影子不跟缩放走（和整张帧里的一样大），单独按世界像素画
  const td = kind.startsWith('e.') ? tdEnemyDef(kind.slice(2) as TdRigKind).shadow : null;
  const [rx, ry] = td ? [td[0] * sk.s, td[1] * sk.s] : [14 * sk.s + 2, 5.5 * sk.s];
  r.push(piece(rigFrame(kind, 'shadow'), Math.ceil(rx * 2 + 8), Math.ceil(ry * 2 + 6), rx + 2, ry + 2, shadow(rx, ry, 2, 1, 0.42)));
  cache.set(ck, r);
  return r;
}

/** 图集里的全部（不带皮肤）：开局烘一次 */
export function rigAllPieces(): ArtPiece[] {
  return RIG_KINDS.flatMap((k) => rigPieces(k));
}

