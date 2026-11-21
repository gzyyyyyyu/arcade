/** 海岛的美术：全部程序生成的 SVG（不引外部图片和字体）。画面层开局用 allArt() 一次烘焙成纹理。 */
import type { BuildingKind, TroopKind } from '../../core/types.ts';
import { PALETTE } from './palette.ts';
import { BUILDING_SIZE, CHIMNEY_AT, DECO_FRAMES, HQ_FLAG_AT, buildingArt, decoFrames, hqFlagFrames, hqNoFlagArt, isDecoAnim, palmSwayFrames } from './buildings.ts';
import { coastArt } from './coast.ts';
import { decoArt } from './deco.ts';
import { krakenArt, wallArt } from './buildings.ts';
import { badgeArt, lootChestArt } from './icons.ts';
import { fxArt, fxFrames } from './fx.ts';
import { scaffoldArt, scaffoldPieces } from './scaffold.ts';
import { iconArt } from './icons.ts';
import { mapDecoArt, mapIslandArt } from './mapart.ts';
import { shipArt } from './ships.ts';
import { tileArt } from './tiles.ts';
import { troopArt, troopFrames } from './troops.ts';
import type { ArtPiece } from './kit.ts';
import { isDecoKind } from '../../content/buildings.ts';

export { scaffoldArt, scaffoldPieces };
export type { DecoAnimKind } from './buildings.ts';
export { CHIMNEY_AT, DECO_FRAMES, decoFrames, isDecoAnim, HQ_FLAG_AT, hqFlagFrames, hqNoFlagArt, palmSwayFrames, krakenArt, wallArt, fxFrames, troopFrames, badgeArt, lootChestArt, coastArt, decoArt, mapDecoArt, mapIslandArt, PALETTE, BUILDING_SIZE, buildingArt, fxArt, iconArt, shipArt, tileArt, troopArt };
export type { ArtPiece };

export const BUILDING_KINDS: BuildingKind[] = ['hq', 'goldmine', 'sawmill', 'vault', 'woodyard', 'dock', 'armory', 'cannon', 'gunTower', 'mortar', 'mine', 'flame', 'harpoon', 'tar', 'rocket', 'fogTower', 'shock', 'sniper', 'kraken', 'wall', 'statue', 'flagpole', 'chest', 'wheel', 'windmill', 'lighthouse', 'bonfire', 'lookout', 'palm', 'rock'];
export const TROOP_KINDS: TroopKind[] = ['sailor', 'gunner', 'brute', 'bomber', 'captain', 'medic', 'cannoneer', 'harpooner', 'grenadier', 'shield'];
export const POSES = ['idle', 'walk1', 'walk2', 'attack'] as const;
export const TILE_KINDS = ['grass', 'grass2', 'sand', 'shallow', 'sea'] as const;
export const COAST_KINDS = ['reef', 'wave', 'shoal', 'foamPatch', 'spit', 'swash', 'glint', 'fish', 'cloud'] as const;
export const DECO_KINDS = ['bush', 'flowers', 'stones', 'tuft', 'path'] as const;
const MAP_DECO_KINDS = ['wave', 'gull', 'rock', 'compass', 'ship'] as const;
export const FX_FRAME_KINDS = ['hit', 'boom', 'collapse', 'slash', 'muzzle'] as const;
/** 皮肤帧不进 allArt（太占内存）：画面层按需 troopFrames(kind, anim, skin) 再烘焙 */
export const TROOP_SKINS = ['gold', 'shadow', 'royal'] as const;
export const FX_KINDS = ['ball', 'bullet', 'shell', 'flame', 'boom', 'smoke', 'spark', 'rubble', 'flare', 'heal', 'rocket', 'harpoon', 'tar', 'tentacle', 'fog', 'levelup', 'coins', 'grenade', 'stars', 'shock', 'snipe'] as const;
export const ICON_KINDS = ['gold', 'wood', 'star', 'starEmpty', 'energy', 'hammer', 'sword', 'shield', 'ship', 'map', 'home', 'skull', 'barrage', 'flare', 'medkit', 'bounty', 'trophy', 'shieldOn', 'replay', 'revenge', 'treasure', 'ingot'] as const;
/** 建筑外观的最大等级（更高的等级沿用这一级的样子） */
export const ART_MAX_LEVEL = 8;


/** 某一级的全部建筑外观（含这一级的城墙各邻接、海怪拍打姿态）：主寨升到这一级、或第一次出现时按需烘焙（默认开局只带 1 级的城墙和海怪拍打） */
export function levelArt(level: number): ArtPiece[] {
  const out: ArtPiece[] = [];
  for (const k of BUILDING_KINDS) {
    if (isDecoKind(k)) continue;
    if (k === 'wall') for (let m = 0; m < 16; m++) out.push(wallArt(level, m));
    else out.push(buildingArt(k, level));
  }
  out.push(krakenArt('slam', level));
  return out;
}

/**
 * 烘成纹理的通用素材。为了控制纹理内存（全部 2 倍烘焙 ≤ 60 MB），默认只带建筑 1–2 级（城墙只 1 级）和兵种动画帧；
 * 更高等级用 `levelArt(n)` 按需补烘焙，皮肤帧用 `troopFrames(kind, anim, skin)` 按需补烘焙。海图的岛、纪念章只进 DOM（ui.ts 的 img），不烘。
 * opts.maxLevel：带到第几级（默认 2，最多 8）；
 * opts.troops = false：不带兵的动作帧（开局用，兵帧见 troopArt3）。
 */
export function allArt(opts: { maxLevel?: number; troops?: boolean } = {}): ArtPiece[] {
  const maxLevel = Math.max(1, Math.min(ART_MAX_LEVEL, opts.maxLevel ?? 2));
  const out: ArtPiece[] = [];
  for (const k of BUILDING_KINDS) {
    if (isDecoKind(k)) out.push(buildingArt(k, 1));
    else for (let lv = 1; lv <= maxLevel; lv++) { if (k === 'wall') { if (lv === 1) for (let m = 0; m < 16; m++) out.push(wallArt(lv, m)); } else if (k !== 'kraken' || lv === 1) out.push(buildingArt(k, lv)); }
  }
  out.push(krakenArt('slam', 1));
  if (opts.troops !== false) out.push(...troopArt3());
  for (const k of COAST_KINDS) out.push(coastArt(k));
  for (const k of DECO_KINDS) out.push(decoArt(k));
  for (const k of FX_FRAME_KINDS) out.push(...fxFrames(k));
  for (const k of FX_KINDS) out.push(fxArt(k));
  for (const k of ICON_KINDS) out.push(iconArt(k));
  // 海图点缀里的海鸥、远处的船也飘在基地的海上（ambient.ts），要烘；海图的岛只进 DOM，不烘
  for (const k of MAP_DECO_KINDS) out.push(mapDecoArt(k));
  out.push(shipArt('raft'), shipArt('flagship'));
  return out;
}

/** 兵的三组动作帧（只有登陆战、守岛用）：开局不烘，基地就绪后在后台烘（main.ts 的 warmField） */
export function troopArt3(): ArtPiece[] {
  return TROOP_KINDS.flatMap((k) => (['idle', 'walk', 'attack'] as const).flatMap((an) => troopFrames(k, an)));
}
