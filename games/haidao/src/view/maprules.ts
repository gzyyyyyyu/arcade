/**
 * 寻宝航线：画面拿规则的注入点。画面只调这里给的函数，不自己算宝分、损耗、能量；默认是 core/map.ts 的实现，测试可以换。
 */
import { MAP_RULES, mapIsland } from '../core/index.ts';
import type { MapIslandDef, MapRules } from '../core/maptypes.ts';

/** 契约的 MapRules 加一样画面要的：岛的定义（名字、风格、宝分、侦察） */
export interface MapSource extends MapRules {
  island(id: string): MapIslandDef | undefined;
}

const src: MapSource = { ...MAP_RULES, island: mapIsland };

export const mapRules = (): MapSource => src;

/** 北京时间的日期 'YYYY-MM-DD'（航线一天一条，按北京时间换天） */
export function beijingDay(now = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}
