/**
 * 连不上平台（断网、5xx）时给玩家看的文字：开头统一，冒号后面各处补一句"东西现在在哪、接下来怎样"。
 * 只管文案；要不要重试、什么时候重试由各自的逻辑决定。
 */
export const NET_DOWN = '连不上，稍后再试';

/** 开头加上统一的断网说明，detail 写这一处的善后 */
export const netDown = (detail: string): string => `${NET_DOWN}：${detail}`;
