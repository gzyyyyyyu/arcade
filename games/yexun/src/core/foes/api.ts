/**
 * foes 要用的 step.ts 里的东西（spawnEnemy、hurt 等是 step.ts 私有的，且 step.ts 要 import foes，直接 import 会成环）。
 * step.ts 加载时调一次 bindFoeApi 填进来。
 */
import type { EnemyKind } from '../../content/enemies.ts';
import type { World } from '../state.ts';

export interface FoeApi {
  spawn(w: World, kind: EnemyKind, x: number, y: number): number;
  hurt(w: World, dmg: number, by: number): void;
  /** (x, y) 半径 r 里的主角挨 dmg，打中返回 true */
  areaHurt(w: World, x: number, y: number, r: number, dmg: number, by: number): boolean;
  /** 一颗敌方弹（直飞），state 是 sState（4 水鞭：打中减速；5 棺钉） */
  shot(w: World, x: number, y: number, vx: number, vy: number, life: number, dmg: number, r: number, state: number): void;
  /** Boss 现在是第几段（血线 at 从高到低），刚进新一段发 Ev.Boss a=4 */
  phase(w: World, i: number, at: readonly number[]): number;
  /** 半径 r 的东西放在 (x, y) 会不会压到挡路的块 */
  blocked(w: World, x: number, y: number, r: number): boolean;
  /** 主角被拖、被推以后：别出场地、别进墙 */
  fixPlayer(w: World): void;
  /** 守夜的地图事件正在进行就回第几次（0 = 没有）；kind 如 'wind' */
  mapEvent(w: World, kind: string): number;
}

export let api: FoeApi;
export function bindFoeApi(a: FoeApi): void {
  api = a;
}
