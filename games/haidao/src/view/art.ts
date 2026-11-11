import type { BuildingKind, SkillKind, TroopKind } from '../core/types.ts';
import { isBaked } from './textures.ts';
import { buildingArt, fxArt, fxFrames, hqFlagFrames, hqNoFlagArt, iconArt, palmSwayFrames, shipArt, tileArt, troopArt, troopFrames, wallArt, type ArtPiece } from './art/index.ts';

/** 美术函数每次现画 SVG 字符串，按参数记下来 */
const memo = new Map<string, ArtPiece>();
function m(k: string, f: () => ArtPiece): ArtPiece {
  let v = memo.get(k);
  if (!v) memo.set(k, (v = f()));
  return v;
}
type Arg<F> = F extends (a: infer A, ...r: never[]) => unknown ? A : never;
export const bArt = (kind: BuildingKind, level: number): ArtPiece =>
  m(`b${kind}${level}`, () => {
    if (kind === 'wall') return wallArt(level, 0);
    try {
      return buildingArt(kind, level);
    } catch {
      // 美术还没画的建筑：先用岩石顶着，不让界面崩
      return buildingArt('rock', 1);
    }
  });
/** 城墙按四邻的有无选图：mask 的四位 = 上右下左有没有墙 */
export const wArt = (level: number, mask: number): ArtPiece => m(`w${level}.${mask}`, () => wallArt(level, mask));
/** 兵的动画帧（每种动作 ≥ 3 帧）；皮肤是 'gold' | 'shadow' | 'royal' */
export const troopF = (kind: TroopKind, anim: 'idle' | 'walk' | 'attack', skin?: string): ArtPiece[] => troopFrames(kind, anim, skin);
/** 特效序列帧 */
export const fxF = (kind: 'hit' | 'boom' | 'collapse' | 'slash' | 'muzzle'): ArtPiece[] => fxFrames(kind);
export const tArt = (kind: TroopKind, pose: 'idle' | 'walk1' | 'walk2' | 'attack'): ArtPiece => m(`t${kind}${pose}`, () => troopArt(kind, pose));
export const tileA = (kind: Arg<typeof tileArt>): ArtPiece => m(`l${kind}`, () => tileArt(kind));
export const fxA = (kind: Arg<typeof fxArt>): ArtPiece => m(`f${kind}`, () => fxArt(kind));
export const iconA = (kind: Arg<typeof iconArt> | SkillKind): ArtPiece => m(`i${kind}`, () => iconArt(kind as Arg<typeof iconArt>));
/** rank：自己的船按王阶涂装（0 = 原样） */
export const shipA = (kind: 'raft' | 'flagship', rank = 0): ArtPiece => m(`s${kind}${rank}`, () => shipArt(kind, rank));
export type { ArtPiece };

/** 环境动画用的素材（envfx.ts）：棕榈 5 帧错切、主寨无旗布版、旗布 3 帧；按参数记下来，不每次现画 */
let palmMemo: ArtPiece[] | null = null;
export const palmFrames = (): ArtPiece[] => (palmMemo ??= palmSwayFrames());
export const hqNf = (level: number): ArtPiece => m(`hqnf${level}`, () => hqNoFlagArt(level));
const flagMemo = new Map<number, ArtPiece[]>();
export const hqFlagF = (level: number): ArtPiece[] => {
  const v = flagMemo.get(level) ?? hqFlagFrames(level);
  flagMemo.set(level, v);
  return v;
};

/**
 * 场景里贴建筑用（带环境动画的版本）：主寨用没有旗布的图（旗布另贴 3 帧飘，见 envfx.ts），该等级的无旗版还没烘好就退到带旗布的静态图。
 * 其余建筑和 bTex 一样。
 */
export function sTex(kind: BuildingKind, level: number): ArtPiece {
  if (kind === 'hq') {
    for (let lv = level; lv >= 1; lv--) {
      const nf = hqNf(lv);
      if (isBaked(nf.key) && hqFlagF(lv).every((p) => isBaked(p.key))) return nf;
    }
  }
  return bTex(kind, level);
}

/** 场景里贴图用：该等级的纹理还没烘好时，逐级退到烘好的低等级（最差 1 级），绝不缺纹理 */
export function bTex(kind: BuildingKind, level: number): ArtPiece {
  for (let lv = level; lv > 1; lv--) {
    const p = bArt(kind, lv);
    if (isBaked(p.key)) return p;
  }
  return bArt(kind, 1);
}
export function wTex(level: number, mask: number): ArtPiece {
  for (let lv = level; lv > 1; lv--) {
    const p = wArt(lv, mask);
    if (isBaked(p.key)) return p;
  }
  return wArt(1, mask);
}
/** 一组建筑要用到的外观（给 ensureArt）：城墙 16 种邻接只取用到的 */
export function piecesFor(list: Array<{ kind: BuildingKind; level: number }>): ArtPiece[] {
  const out: ArtPiece[] = [];
  for (const b of list) {
    if (b.kind === 'wall') for (let m = 0; m < 16; m++) out.push(wArt(b.level, m));
    else {
      out.push(bArt(b.kind, b.level));
      // 环境动画的素材：棕榈 5 帧（整岛共用）、主寨无旗版 + 旗布 3 帧
      if (b.kind === 'palm') out.push(...palmFrames());
      else if (b.kind === 'hq') out.push(hqNf(b.level), ...hqFlagF(b.level));
    }
  }
  return out;
}

// ---- 守岛的素材（敌人帧、木台、火药桶等）：进守岛前按需烘焙（tdPieces），不进开局的 allArt
import { tdAllArt, tdEnemyFrames, tdPropArt, type TdAnim, type TdPropKind } from './art/tdart.ts';
export type { TdAnim, TdPropKind };
const tdMemo = new Map<string, ArtPiece[]>();
export const tdE = (kind: Parameters<typeof tdEnemyFrames>[0], anim: TdAnim): ArtPiece[] => {
  const k = `${kind}.${anim}`;
  let v = tdMemo.get(k);
  if (!v) tdMemo.set(k, (v = tdEnemyFrames(kind, anim)));
  return v;
};
export const tdP = (kind: TdPropKind): ArtPiece => m(`tdp${kind}`, () => tdPropArt(kind));
/** 守岛要烘焙的全部素材 + 局内塔 1–3 阶的外观（规则核心的 TD_TIER_LEVEL：2、5、8 级） */
export const tdPieces = (): ArtPiece[] => [
  ...tdAllArt(),
  ...(['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'sniper'] as const).flatMap((k) => [2, 5, 8].map((l) => bArt(k, l))),
  ...(['captain'] as const).flatMap((k) => (['idle', 'walk', 'attack'] as const).flatMap((an) => troopF(k, an))),
  bArt('treasure', 1),
];
