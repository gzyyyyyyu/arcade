/**
 * 测试和调试入口：开局直接给法器、当场放怪、当场开宝箱。规则照常，只是跳过选卡和刷怪节奏。
 * 不在 core/index.ts 的正式接口里；测试、bench、?give= 等调试查询从这里拿。
 */
export { grantWeapon, openChestNow, openEliteChestNow, spawnNow } from './step.ts';
