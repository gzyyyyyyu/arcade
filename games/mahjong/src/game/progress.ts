/**
 * 主页"我的进度"卡的汇总（纯函数，不碰存储和画面）：每日挑战今天打没打 + 连续天数、成就解锁数、图鉴收集数。
 * 每日挑战两种玩法各记一份，连续天数取较大的那个；图鉴两种玩法合计。
 */
import { ACHIEVEMENTS, type AchRecord } from './achieve.ts';
import { DAILY_VARIANTS, streakOf, type DailyAll } from './daily.ts';
import { dexProgress, type DexRecord } from './dex.ts';

export interface Progress {
  daily: { doneToday: boolean; streak: number };
  ach: { got: number; total: number };
  dex: { got: number; total: number };
}

export function summarize(daily: DailyAll, ach: AchRecord, dex: DexRecord, today: string): Progress {
  const datas = DAILY_VARIANTS.map((v) => daily[v]);
  const xz = dexProgress(dex, 'xz');
  const rc = dexProgress(dex, 'rc');
  return {
    daily: { doneToday: datas.some((d) => d.days[today] !== undefined), streak: Math.max(...datas.map((d) => streakOf(d, today))) },
    ach: { got: ACHIEVEMENTS.filter((a) => ach.got[a.id]).length, total: ACHIEVEMENTS.length },
    dex: { got: xz.got + rc.got, total: xz.total + rc.total },
  };
}
