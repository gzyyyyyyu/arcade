/**
 * 页面打平台 /api 和本模块 Worker 的请求都走这里：挂住的请求 10 秒后放弃，按断网处理（各调用方已有的失败路径），
 * 不让「同步中」「交成绩中」一直卡着。读响应体也算在这 10 秒里
 */
const TIMEOUT_MS = 10_000;

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}
