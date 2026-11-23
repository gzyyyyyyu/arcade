/**
 * 地图事件（DESIGN.md 3.6，0.5.0）：每张守夜图一种自己的天象或怪潮，第 4、8、12 分钟各来一次，提前 3 秒预告，让各图打法不一样。
 * 夜探没有；实盘守夜照样有（实盘系数按带事件的全量模拟拟合，DESIGN 4.2）。核心在 `core/step.ts` 的 mapEvents。
 */
import { TICKS_PER_SECOND } from './clock.ts';
import type { EnemyKind } from './enemies.ts';
import type { MapId } from './maps.ts';

const S = TICKS_PER_SECOND;

export type MapEventKind = 'wind' | 'sprouts' | 'icefall' | 'tide' | 'risen' | 'bell' | 'parade' | 'allfire';
/** 事件编号（Ev.MapEvent 的 b，画面层按它查名字） */
export const MAP_EVENT_KINDS: readonly MapEventKind[] = ['wind', 'sprouts', 'icefall', 'tide', 'risen', 'bell', 'parade', 'allfire'];

export interface MapEventDef {
  kind: MapEventKind;
  /** 横幅上的名字 */
  name: string;
  /** 一句话（横幅副标题、玩法说明） */
  blurb: string;
  /** 持续几拍（一下子的事件也给 3 秒横幅） */
  dur: number;
  /** 一下子刷出来的怪和只数（乘危险档的数量倍数）；没有就不刷 */
  mob?: { kind: EnemyKind; count: number };
}

/** 第几拍来（三次都一样，好记）；提前 MAP_EVENT_WARN 拍预告 */
export const MAP_EVENT_AT: readonly number[] = [240 * S, 480 * S, 720 * S];
export const MAP_EVENT_WARN = 3 * S;
/** 白毛风：每拍把主角往风向推多少（主角走路每拍 3）；风向三次左右交替 */
export const WIND_PUSH = 1.1;
/** 涨潮：水里走路再乘这个 */
export const TIDE_SLOW = 0.6;
/** 晨钟：多大范围里的怪被定住几拍（尸王不吃） */
export const BELL_STUN = { r: 700, ticks: 75 };
/**
 * 百鬼夜行：一横排皮影鬼在主角一侧 dist 远处排开（排宽 span，按只数均分，缝能钻过去），齐步横扫过来（PUPPET.march、marchSpeed）；
 * 三次的来向依次是西、北、东，躲开或者从缝里穿过去
 */
export const PARADE = { dist: 420, span: 1200 };

export const MAP_EVENTS: Record<MapId, MapEventDef> = {
  snow: { kind: 'wind', name: '白毛风', blurb: '大风把人往一边吹，顶着风走', dur: 30 * S },
  bamboo: { kind: 'sprouts', name: '竹浪', blurb: '脚下一圈竹精同时钻出来', dur: 3 * S, mob: { kind: 'bamsprout', count: 12 } },
  icelake: { kind: 'icefall', name: '冰凌雨', blurb: '一片冰凌落下，别站着不动', dur: 3 * S, mob: { kind: 'icicle', count: 8 } },
  riverbank: { kind: 'tide', name: '涨潮', blurb: '水里更难走，溺鬼跟着上岸', dur: 30 * S, mob: { kind: 'drown', count: 6 } },
  yizhuang: { kind: 'risen', name: '起尸', blurb: '一群跳尸从门洞涌进来', dur: 3 * S, mob: { kind: 'jiangshi', count: 14 } },
  temple: { kind: 'bell', name: '晨钟', blurb: '钟声一响，身边的怪定住一会儿', dur: 3 * S },
  luanzang: { kind: 'allfire', name: '鬼火齐燃', blurb: '所有磷火一起烧，掘墓鬼钻出一圈', dur: 6 * S, mob: { kind: 'juemu', count: 10 } },
  guishi: { kind: 'parade', name: '百鬼夜行', blurb: '一排皮影鬼横扫过来，躲开或从缝里钻过去', dur: 3 * S, mob: { kind: 'puppet', count: 12 } },
};

/** 这一拍 kind 这种地图事件正在进行就回第几次（1 起），没有回 0；只有守夜（不含连战）有地图事件 */
export function mapEventRound(tick: number, setup: { mode: string; rush?: boolean; map?: MapId }, kind: MapEventKind): number {
  if (setup.mode !== 'vigil' || setup.rush) return 0;
  const ev = MAP_EVENTS[setup.map ?? 'snow'];
  if (ev.kind !== kind) return 0;
  for (let k = 0; k < MAP_EVENT_AT.length; k++) if (tick >= MAP_EVENT_AT[k]! && tick < MAP_EVENT_AT[k]! + ev.dur) return k + 1;
  return 0;
}

/** HUD 倒计时小牌开始出现的提前量（拍） */
const MAP_EVENT_HUD_LEAD = 60 * S;
/** 小牌变红脉动的提前量（拍） */
const MAP_EVENT_HUD_URGENT = 10 * S;

/**
 * 离下一次地图事件还有几拍、是哪种；没有（夜探、三次都过了、事件已经开始）回 null。条件同 core/step.ts 的 mapEvents，
 * 只在事件开始前 MAP_EVENT_HUD_LEAD 拍内回值，开始那拍起收起，等下一次再出现。
 */
export function nextMapEvent(tick: number, setup: { mode: string; live?: boolean; map?: MapId }): { kind: MapEventKind; name: string; left: number; urgent: boolean } | null {
  if (setup.mode !== 'vigil') return null;
  const ev = MAP_EVENTS[setup.map ?? 'snow'];
  for (const at of MAP_EVENT_AT) {
    if (tick >= at) continue;
    const left = at - tick;
    return left <= MAP_EVENT_HUD_LEAD ? { kind: ev.kind, name: ev.name, left, urgent: left <= MAP_EVENT_HUD_URGENT } : null;
  }
  return null;
}
