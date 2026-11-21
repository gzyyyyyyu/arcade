/**
 * 画面用的查询函数：只返回玩家能看到的信息（隐藏字段只在规则允许时出现，例如情绪指标显示真实阶段）。
 * 画面不要直接读 GameState 里标了「隐藏」的字段，见 docs/core-api-modes.md 第 12 节。
 * 按主题拆在 queries/ 下，这里只做入口。
 */
export * from './queries/themes.ts';
export * from './queries/cards.ts';
export * from './queries/chat.ts';
export * from './queries/topbar.ts';
export * from './queries/items.ts';
export * from './queries/summary.ts';
export * from './queries/history.ts';
export * from './queries/board.ts';
