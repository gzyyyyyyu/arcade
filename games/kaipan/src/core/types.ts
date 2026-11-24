/**
 * 《开盘》规则层的数据结构（按领域拆在 types/ 下，这里只做入口）。
 *
 * 单位约定：
 * - 涨跌幅、收益一律用「百分点」（pp）：5.2 表示 +5.2%。
 * - 账户、月供用元（保留 2 位小数）。
 * - 热度 0..100。
 *
 * 标了「隐藏」的字段是画面不能显示的信息（题材真实阶段、今天预先掷好的行情等），
 * 详见 docs/core-api-engine.md。
 */
export * from './types/base.ts';
export * from './types/state.ts';
export * from './types/report.ts';
export * from './types/run.ts';
export * from './types/action.ts';
export * from './types/event.ts';
