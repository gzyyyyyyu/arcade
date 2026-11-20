/** 护航界面的文案和小计算（纯函数，tests/escort-ui.test.ts 锁住）：大白话，不用术语 */
import { ESCORT_DIFF_NAME, ESCORT_MEND, type EscortDiff, type EscortPace } from '../core/escorttypes.ts';

export const PACE_ORDER: readonly EscortPace[] = ['hold', 'sail', 'rush'];
export const PACE_INFO: Readonly<Record<EscortPace, { label: string; key: string; tip: string }>> = {
  hold: { label: '停', key: 'Q', tip: '停船：船不动，海盗会围上来咬；潮水照走，停久了赶不上潮' },
  sail: { label: '巡航', key: 'W', tip: '巡航：慢慢往前开' },
  rush: { label: '冲', key: 'E', tip: '冲：开得快一半，海盗来不及追，但塔也少打几轮' },
};

/** 键盘 Q/W/E → 船速；别的键 null（守岛的 1/2/3 另有用处） */
export function paceOfKey(k: string): EscortPace | null {
  const u = k.toLowerCase();
  return u === 'q' ? 'hold' : u === 'w' ? 'sail' : u === 'e' ? 'rush' : null;
}

/** 剩余血量百分比（向下取整，0..100） */
export function hullPercent(hull: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((hull * 100) / max)));
}

/** 血条的颜色档：低于 1/3 红，低于 2/3 黄，其余绿 */
export function hullTone(pct: number): 'good' | 'mid' | 'low' {
  return pct < 34 ? 'low' : pct < 67 ? 'mid' : 'good';
}

export interface MendView {
  state: 'ready' | 'cool' | 'poor' | 'full';
  /** 冷却还剩多少（0..1），转圈用 */
  cd: number;
  label: string;
  sub: string;
  disabled: boolean;
}

/** 修船钮：价格、冷却、金币不够、血满了，四种状态 */
export function mendView(o: { hull: number; max: number; gold: number; tick: number; ready: number; tps: number }): MendView {
  const left = Math.max(0, o.ready - o.tick);
  if (o.hull >= o.max) return { state: 'full', cd: 0, label: '修船', sub: '船是满的', disabled: true };
  if (left > 0) return { state: 'cool', cd: Math.min(1, left / ESCORT_MEND.cd), label: '修船', sub: `${Math.ceil(left / o.tps)}秒`, disabled: true };
  if (o.gold < ESCORT_MEND.gold) return { state: 'poor', cd: 0, label: '修船', sub: `还差 ${ESCORT_MEND.gold - o.gold} 金币`, disabled: true };
  return { state: 'ready', cd: 0, label: '修船', sub: `${ESCORT_MEND.gold} 金币`, disabled: false };
}

/** retreated：玩家点了撤退（规则里和误了潮一样是「没到也没沉」，只有画面层知道是谁结束的） */
export interface ResultLike { arrived: boolean; sunk: boolean; retreated?: boolean }
/** 结算标题：到港 / 沉没 / 撤退 / 误了潮（没到也没沉、时间到了） */
export function resultTitle(r: ResultLike): string {
  return r.arrived ? '到港' : r.sunk ? '沉没' : r.retreated ? '撤退' : '误了潮';
}
export const resultBig = (pct: number): string => `${pct}%`;
export function resultLine(r: { stars: number; cells: number; mends: number }): string {
  return `${r.stars} 星 · 走了 ${r.cells} 格 · 修了 ${r.mends} 次`;
}

/** 选图页难度按钮上写的最好成绩 */
export function bestText(stars: number): string {
  return stars > 0 ? `最好 ${stars} 星` : '没护过';
}
export function diffName(d: EscortDiff): string {
  return ESCORT_DIFF_NAME[d];
}

/** 图名：关卡名里带难度字样的去掉（"溪口商道·普通" → "溪口商道"） */
export function mapTitle(name: string): string {
  let s = name;
  for (const d of Object.values(ESCORT_DIFF_NAME)) s = s.replace(d, '');
  return s.replace(/[\s·・\-—（）()]+$/u, '').replace(/^[\s·・\-—]+/u, '') || name;
}

/** 星数线的说明："船剩 50% 以上 2 星，80% 以上 3 星" */
export function starRuleText(stars: readonly [number, number]): string {
  return `到港时船剩 ${stars[0]}% 以上 2 星，${stars[1]}% 以上 3 星`;
}

export function lockText(prevMap: string | null): string {
  return prevMap ? `先在「${prevMap}」护到港，再来这里` : '还没解锁';
}

/**
 * 预告里的相遇点说明：meet 是航线下标，total 是航线格数，at 是船现在在第几格。
 * 不写「第 1/28 格」：试玩里新手读成「第 1 格有埋伏」；其实是船停在港口、海盗一到就追上。改说船现在会怎样、在航线哪一段
 */
export function meetText(meet: number | undefined, total: number, at: number): string {
  if (meet === undefined) return '';
  if (meet < 0) return '这一波追不上船';
  if (meet <= at + 1) return '这一波一到就咬上船';
  const f = (meet + 1) / total;
  if (f >= 0.9) return '这一波快到港时追上船';
  return `这一波在航线${f > 0.65 ? '后段' : f > 0.35 ? '中段' : '前段'}追上船`;
}

/** 第一次点「停」时的提醒（一局一次）：停着潮水照走，试玩里有人一见海盗就停，最后误了潮 */
/** 准备倒数还剩几秒起「巡航」钮发光提醒（只在会自动开船的娱乐局、玩家还没碰过船速时） */
export const SAIL_NUDGE_SEC = 10;

/** 「巡航」钮该不该发光：第一波还没开打、倒数进了最后 SAIL_NUDGE_SEC 秒、船会自己开（autoSail，说明玩家还没定过船速） */
export function sailNudge(o: { autoSail?: boolean; wave: number; next: number; tick: number; tps: number }): boolean {
  return !!o.autoSail && o.wave === 0 && o.next >= 0 && o.next - o.tick <= SAIL_NUDGE_SEC * o.tps;
}

/** 第一波开打时船自己开了（娱乐护航，规则 25） */
export const AUTO_SAIL_NOTE = '第一波来了，船自己开了';

export const HOLD_NOTE = '停着时潮水照走，海盗也会围上来咬船；打完这一拨就开船';
