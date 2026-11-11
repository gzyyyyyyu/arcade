/**
 * 斗地主每日挑战（docs/doudizhu.md 第 5 节）：同一天全服同一个种子、同样两个普通难度的电脑，打满一场（6 副），
 * 分数是我这一场的累计分，交到平台的每日榜 daily-<日期>-ddz（子榜 ddz，平台按 public/daily.json 显示）。
 * 日期、交分、结束页的话和掼蛋共用（daily.ts）。
 */
import { dailyBoard, submitDaily, type DailySubmit } from '../common/daily.ts';

export { beijingDate, dailySubmitText, type DailySubmit } from '../common/daily.ts';

/** 每日挑战的规则版本：发牌、计分大改时加一，榜名带 -v<n>，改前改后不在一个榜上比；0 = 不带 */
// 1：0.30.7 起娱乐普通档的电脑带出牌失误（DDZ_FUN_BLUNDER），对手变弱，分数和之前不在一个榜上比
export const DDZ_DAILY_RULES = 1;
/** 两家电脑的难度：大家打同样的对手 */
export const DDZ_DAILY_LEVEL = 'normal';

/** 这一天的种子：只和日期有关，所有人一样 */
export function ddzDailySeed(date: string): string {
  return `ddz-daily-${date}`;
}

export function ddzDailyBoard(date: string): string {
  return dailyBoard(date, 'ddz', DDZ_DAILY_RULES);
}

export function submitDdzDaily(date: string, score: number, fetcher: typeof fetch = fetch): Promise<DailySubmit> {
  return submitDaily(ddzDailyBoard(date), score, fetcher);
}
