/** 请求平台接口时最多等多久：超时按连不上处理（各调用方本来就有连不上的说法和重试），不会一直转圈。 */
const API_TIMEOUT_MS = 10_000;

/** 给 fetch 的 init 加超时（老浏览器没有 AbortSignal.timeout 就不加，靠浏览器自己的超时） */
export function timeoutSignal(ms = API_TIMEOUT_MS): { signal?: AbortSignal } {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(ms) } : {};
}
