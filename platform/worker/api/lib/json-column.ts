/**
 * D1 里 JSON 列的读取：解析 + 运行时形状校验。
 * 不直接 `JSON.parse(x) as T` 断言：库里的数据坏了（不是合法 JSON、形状不对）要么抛 SyntaxError，
 * 要么带着错的形状往下走（比如钱包余额是字符串）。解析后过 guard，过不了就明确失败。
 * 错误和日志只带列名，绝不带数据内容（5.2：日志不记数据）。
 */

/** 库里某列的 JSON 坏了。message 只有列名；走 router 的未捕获异常路径，变 500 internal */
export class BadColumnError extends Error {
  constructor(column: string) {
    super(column);
    this.name = 'BadColumnError';
  }
}

type Guard<T> = (v: unknown) => v is T;

/** 严格：解析失败或形状不对就抛 BadColumnError，调用方让它冒到 500，或自己 catch 兜底 */
export function parseJsonColumn<T>(text: string, guard: Guard<T>, column: string): T {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new BadColumnError(column);
  }
  if (!guard(v)) throw new BadColumnError(column);
  return v;
}

/** 宽松：空值直接给 fallback（不算坏）；坏了给 fallback 并记一条日志（只记列名） */
export function parseJsonColumnOr<T>(text: string | null | undefined, guard: Guard<T>, fallback: T, column: string): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return parseJsonColumn(text, guard, column);
  } catch {
    console.warn('bad json column', column);
    return fallback;
  }
}

// ---------- 常用 guard ----------

/** 只要求是合法 JSON：给原样回传浏览器的列用 */
export const isUnknown = (_v: unknown): _v is unknown => true;

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 值逐个过 valueGuard 的对象 */
export const isRecordOf =
  <V>(valueGuard: Guard<V>) =>
  (v: unknown): v is Record<string, V> =>
    isRecord(v) && Object.values(v).every(valueGuard);

export const isNumberRecord = isRecordOf(isFiniteNumber);
