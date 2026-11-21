/**
 * 每周夜事（DESIGN.md 5.8）：北京时间每个自然周（周一起）一个，只在单独开局的「本周夜事」挑战里生效；普通守夜、实盘、夜探、每日挑战不开。
 * 事件按周序号从这张表里轮着取（src/online/weekly.ts），不用随机。规则核心只认 Setup.weekly 里的 id，
 * 数值都在这里；改数值要走模拟器，别凭感觉。
 */

export type WeeklyId = 'coin' | 'lantern' | 'elite' | 'moon' | 'chest';

export interface WeeklyDef {
  id: WeeklyId;
  name: string;
  /** 一句话说明（主页小牌、暂停面板、图鉴共用） */
  text: string;
}

/** 轮换顺序：周序号对表长取余 */
export const WEEKLY_ORDER: readonly WeeklyId[] = ['coin', 'lantern', 'elite', 'moon', 'chest'];

/** 数值：铜钱周在结算时多给（和咒印同一处算）；灯会周掉落、精英周多一只、月蚀周夜色半径、宝箱周大箱概率 */
export const WEEKLY_FX = {
  /** 铜钱周：这局铜钱（捡到的、时间、击杀、天亮等的合计）多 50% */
  coinBonus: 0.5,
  /** 灯会周：杂兵掉铜钱、肉包的概率 ×1.4 */
  lanternDrop: 1.4,
  /** 精英周：每次精英多一只；打倒一只精英另给这么多铜钱，魂珠（经验）多 50% */
  eliteExtra: 1,
  eliteCoins: 15,
  eliteXp: 0.5,
  /** 月蚀周：全程只看得见主角身边这么大的一圈（世界单位；噩梦 2 是 380，这里松得多） */
  moonRadius: 620,
  /** 宝箱周：5 件、3 件大箱的概率（平时是 player.ts CHEST 的 0.12 / 0.33） */
  chestFive: 0.18,
  chestThree: 0.36,
};

export const WEEKLIES: Record<WeeklyId, WeeklyDef> = {
  coin: { id: 'coin', name: '铜钱周', text: '这局铜钱多 50%' },
  lantern: { id: 'lantern', name: '灯会周', text: '怪掉铜钱和肉包多四成' },
  elite: { id: 'elite', name: '精英周', text: '每次精英多一只，打倒一只多给铜钱和经验' },
  moon: { id: 'moon', name: '月蚀周', text: '全程夜色，只看得见身边一圈' },
  chest: { id: 'chest', name: '宝箱周', text: '精英宝箱更容易开出 3 件、5 件' },
};

export function isWeeklyId(x: unknown): x is WeeklyId {
  return typeof x === 'string' && Object.hasOwn(WEEKLIES, x);
}

/** 一条「名 · 说明」：暂停面板用 */
export function weeklyLine(e: WeeklyDef): string {
  return `${e.name} · ${e.text}`;
}
