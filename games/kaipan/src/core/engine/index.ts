/**
 * 规则引擎：dispatch(state, action) → { state, events, error }，以及开局、回放。
 * 一天的流程：盘前（startDay：推进题材阶段、掷好今天的行情、生成群聊）→ 玩家买卖 → 开盘结算（open）
 * → 月底还月供 → 三选一奖励 → 事件（如有）→ 下个月。
 * 按职责分文件，这里只列对外的导出（src/core/index.ts 再往外转），内部互相用到的函数不在此列。
 */
export { MONTHS, type DispatchOptions, type DispatchResult } from './shared.ts';
export { daysInMonth, isNoviceSetup, noviceSetup, shortSetup, shortGoalFor, shortGoal, runMonths, isFlash, flashDays, lastDayIndex, hasSwan, swanPlan, swanNotice, hasIpo, ipoOffer, ipoPending, ipoToday, totalDays, baseBill, billFor, surprisePlan, crashPlan, dayMarketRules, CRASH_LEVEL, daysLeftInMonth, holdingBase } from './calendar.ts';
export { unitsOf, usedUnits, freeUnits, sizeUnits, shortWind, canShortNow, debtOf, loanOffer, canSell, isBusy } from './ext.ts';
export { validate } from './validate.ts';
export { gearInterest, gearLevered } from './gear.ts';
export { emptyStats, isRankedSetup, pickThemes, type CreateOptions, createRun, dispatch, replay } from './run.ts';
