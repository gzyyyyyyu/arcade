import { Ev } from '../../core/events.ts';

/** 事件预告的小图标字（横幅和图鉴夜事页共用；颜色在 banner.css / codex.css 里按 ev-<kind> 配） */
export const EVENT_ICON: Record<string, string> = { wind: '风', sprouts: '竹', icefall: '冰', tide: '潮', risen: '尸', bell: '钟', parade: '鬼', allfire: '火', blood: '月' };

/** 本局经历的夜事计数：地图事件按种类，血月升起，精英发狂（结算页「今晚」一行用） */
export interface NightLog {
  events: Record<string, number>;
  blood: number;
  rage: number;
}

export const newNightLog = (): NightLog => ({ events: {}, blood: 0, rage: 0 });

/** 只数真正发生的：预告（a=0）不算，地图事件和血月 a===1 才算开始，精英发狂每次都算 */
export function noteNight(log: NightLog, type: number, a: number, kind?: string): void {
  if (type === Ev.MapEvent && a === 1 && kind) log.events[kind] = (log.events[kind] ?? 0) + 1;
  else if (type === Ev.BloodMoon && a === 1) log.blood++;
  else if (type === Ev.EliteRage) log.rage++;
}

export interface NightItem {
  kind: string;
  icon: string;
  n: number;
}

/** 非 0 的项，顺序：地图事件（按 EVENT_ICON 里的顺序）、血月、发狂；全 0 返回空 */
export function nightItems(log: NightLog | undefined): NightItem[] {
  if (!log) return [];
  const out: NightItem[] = [];
  for (const k of Object.keys(EVENT_ICON)) {
    if (k === 'blood') continue;
    const n = log.events[k] ?? 0;
    if (n > 0) out.push({ kind: k, icon: EVENT_ICON[k]!, n });
  }
  if (log.blood > 0) out.push({ kind: 'blood', icon: EVENT_ICON.blood!, n: log.blood });
  if (log.rage > 0) out.push({ kind: 'rage', icon: '怒', n: log.rage });
  return out;
}
