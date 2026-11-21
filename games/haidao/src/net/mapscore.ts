/**
 * 寻宝航线（每日航线）的浏览器端：当天的进度和最好成绩记在本机 `haidao.map`，结算时往平台每日榜交分。
 * 榜名 `daily-<北京日期>-map`（平台 0.16 的每日子榜），分数 = 宝分（越大越好）；分数怎么显示写在 public/daily.json。
 * 交分和错误处理跟大潮的每周榜同一套（tide.ts 的 submitTide：没登录、单独部署静默跳过，429 / 503 算榜单忙）。
 */
import type { MapState } from '../core/maptypes.ts';
import { submitTide, type TideSubmit } from './tide.ts';

const MAP_KEY = 'haidao.map';

export interface MapLocal {
  /** 北京日期 'YYYY-MM-DD' */
  day: string;
  /** 今天打完的最好宝分；没打完过为 0 */
  best: number;
  /** 正在走的航线（断线 / 刷新后接着走；打完清掉） */
  state?: MapState;
  /** 正在打的一站：进战斗前记下，打完写回时清掉；还在就是中途离开了 */
  pending?: { node: number; rest: number };
}

const mapBoardId = (day: string): string => `daily-${day}-map`;

/** 今天的本机记录；换天了（或没有、坏数据）给一份空的 */
export function readMap(day: string): MapLocal {
  try {
    const v = JSON.parse(localStorage.getItem(MAP_KEY) ?? 'null') as Partial<MapLocal> | null;
    if (v && v.day === day && typeof v.best === 'number' && Number.isFinite(v.best) && v.best >= 0) {
      const out: MapLocal = { day, best: v.best };
      if (v.state && typeof v.state === 'object' && v.state.route?.day === day && !v.state.over) out.state = v.state;
      if (out.state && v.pending && Number.isInteger(v.pending.node) && Number.isInteger(v.pending.rest)) out.pending = { node: v.pending.node, rest: v.pending.rest };
      return out;
    }
  } catch {
    // 坏数据当没有
  }
  return { day, best: 0 };
}

export function writeMap(v: MapLocal): void {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(v));
  } catch {
    // 存不上：最坏是刷新后从头走
  }
}

/** 交分：只在比今天本机最好更高时交（调用方先比），其余同 submitTide */
export function submitMap(day: string, score: number): Promise<TideSubmit> {
  return submitTide(mapBoardId(day), score);
}
