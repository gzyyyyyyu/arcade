/** 长期邀请码能设的范围（接口 worker/api/account/invite-codes.ts 校验，管理页输入框的上限和提示也用它）：默认 100 次、不过期 */
export const MULTI_CODE = { usesDefault: 100, usesMax: 10_000, daysMax: 365 } as const;
