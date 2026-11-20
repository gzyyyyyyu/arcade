/** 护航界面的文案和小计算（纯函数，tests/escort-ui.test.ts 锁住）：大白话，不用术语 */
import { ESCORT_DIFF_NAME, ESCORT_MEND, type EscortDiff, type EscortPace } from '../core/escorttypes.ts';

export const PACE_ORDER: readonly EscortPace[] = ['hold', 'sail', 'rush'];
export const PACE_INFO: Readonly<Record<EscortPace, { label: string; key: string; tip: string }>> = {
  hold: { label: '停', key: 'Q', tip: '停船：船不动，等塔把海盗打光再走' },
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

/** 预告里的相遇点说明：meet 是航线下标，total 是航线格数 */
export function meetText(meet: number | undefined, total: number): string {
  if (meet === undefined) return '';
  if (meet < 0) return '这一波追不上船';
  return `这一波在第 ${meet + 1}/${total} 格追上船`;
}
