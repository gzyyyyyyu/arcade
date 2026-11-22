/** 发到平台的请求统一的超时：卡住的请求按连不上处理（各调用方本来就会重试或提示），不让界面一直转 */
export const FETCH_TIMEOUT_MS = 10_000;

/** 给 fetch 的 init 展开用；老浏览器没有 AbortSignal.timeout 时不带（照旧等浏览器自己的超时） */
export function timeoutSignal(ms = FETCH_TIMEOUT_MS): { signal?: AbortSignal } {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(ms) } : {};
}
