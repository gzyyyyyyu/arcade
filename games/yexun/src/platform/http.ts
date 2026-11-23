// 和平台 /api 说话的唯一入口：同源、不缓存、带超时；写请求是 JSON 并带 X-Arcade（平台只挡浏览器里的跨站写）。排行榜、云存档、实盘、换筹码都走这里

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** 请求超时：外部依赖卡住时按断网处理，各调用方自己决定重试还是提示 */
const FETCH_TIMEOUT_MS = 10_000;

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** status 0 = 没连上或超时；body 不是 JSON 对象时为 null */
export interface JsonRes {
  status: number;
  body: Record<string, unknown> | null;
}

function timeoutSignal(): { signal?: AbortSignal } {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) } : {};
}

/** 发一个请求读 JSON。body 给了就是写请求；keepalive：页面马上关掉也发得出去（请求体要小） */
export async function requestJson(fetch: Fetch, method: 'GET' | 'POST' | 'PUT', url: string, body?: string, keepalive = false): Promise<JsonRes> {
  const init: RequestInit = { method, credentials: 'same-origin', cache: 'no-store', ...timeoutSignal() };
  if (body !== undefined) Object.assign(init, { body, keepalive, headers: { 'Content-Type': 'application/json', 'X-Arcade': '1' } });
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    return { status: 0, body: null };
  }
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    json = null;
  }
  return { status: r.status, body: isObj(json) ? json : null };
}

/** /api/me 回 200 时的结论：登录的 userId；null = 平台明确说没登录；'fail' = 回的东西不对（当作没问到，不当作没登录） */
export function userOf(body: Record<string, unknown>): string | null | 'fail' {
  const user = body.user;
  if (user === null) return null;
  return isObj(user) && typeof user.id === 'string' ? user.id : 'fail';
}
