/**
 * "普通"玩家的打法（docs/balance.md 第 1 节）：会看牌效、中等防守、偶尔打错。
 * 模拟器的普通玩家（scripts/play.ts 的 PLAYER）和牌桌上的"推荐出牌"共用这一份，推荐出来的牌就是配平量过的那个水平，不更强。
 */
import type { Tile } from '../core/tiles/index.ts';
import type { Persona } from './personas.ts';
import { fixedStyle, type Style } from './style.ts';

export const NORMAL_PLAYER: Persona = {
  name: '普通',
  style: '',
  defense: 500,
  greed: 300,
  kanLove: 400,
  pon: 500,
  slip: 40,
  reads: 300,
  temper: 0,
  swing: 0,
  tempo: 1_000,
  talk: 0,
  fun: 'normal',
  level: 1,
  skill: 0,
};

/** 推荐出牌：普通玩家的打法，只是不故意打错（推荐一张错的没有意义） */
export const COACH_STYLE: Style = fixedStyle({ ...NORMAL_PLAYER, slip: 0 });

/** 电脑这一步要是打牌，就是推荐的那张；自摸、杠、立直里别的选择不推荐（按钮本来就摆着） */
export function discardOf(a: { t: string; tile?: Tile }): Tile | null {
  return a.t === 'discard' && a.tile !== undefined ? a.tile : null;
}
