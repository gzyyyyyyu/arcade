/**
 * 请求体：读取（大小、嵌套层数、必须是 JSON 对象）和字段读取器。接口读请求体的字段一律经这里。
 *
 * 约定（http.ts 开头也写了）：
 * - 字段的形状不对（缺了、类型不对、不在白名单里）一律 400 `bad_request`，由这里的读取器抛；
 * - 分数是例外：分数不对是玩家能碰到的业务错误，所有交分的接口都回 422 `invalid_score`（`scoreOf()`）；
 * - 不该抛、只想知道合不合法的地方（解析可选的小结、钱包请求）用 `isPlain`、`isCount` 这些判断函数。
 */
import { GAME_IDS } from '../../../shared/games';
import { ApiError } from './http';

/** 默认请求体上限 8 KB（15.1）。 */
export const BODY_LIMIT = 8 * 1024;

/**
 * 请求体的嵌套层数上限（最外层对象算 1 层）。JSON.parse 收得下几万层，但 JSON.stringify 是递归的，
 * 栈浅的时候会抛 RangeError 变成 500；游戏存档用不到这么深。在解析之前数一遍括号，结果和栈大小无关。
 */
export const JSON_MAX_DEPTH = 64;

export function tooDeep(text: string, max: number): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inString) {
      if (ch === 0x5c) i++; // 反斜杠：跳过被转义的下一个字符
      else if (ch === 0x22) inString = false;
    } else if (ch === 0x22) {
      inString = true;
    } else if (ch === 0x5b || ch === 0x7b) {
      if (++depth > max) return true;
    } else if (ch === 0x5d || ch === 0x7d) {
      depth--;
    }
  }
  return false;
}

/** 先看 content-length，没有就边读边数；超了立即 413，不读完。 */
export async function readJsonBody(request: Request, limit: number): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > limit) throw new ApiError(413, 'too_large');
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, 'too_large');
    }
    chunks.push(value);
  }
  if (size === 0) return {};
  const bytes = new Uint8Array(size);
  let off = 0;
  for (const ch of chunks) {
    bytes.set(ch, off);
    off += ch.byteLength;
  }
  let parsed: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    if (tooDeep(text, JSON_MAX_DEPTH)) throw new ApiError(400, 'bad_request');
    parsed = JSON.parse(text);
  } catch {
    // 不是合法 UTF-8 / JSON：统一当 400，不回显原因
    throw new ApiError(400, 'bad_request');
  }
  if (!isPlain(parsed)) throw new ApiError(400, 'bad_request');
  return parsed;
}

// ---------- 判断函数：只答合不合法 ----------

export const isPlain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
export const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);
export const isCount = (x: unknown): x is number => isInt(x) && x >= 0;

// ---------- 读取器：不合法就抛 400 bad_request ----------

const bad = (): never => {
  throw new ApiError(400, 'bad_request');
};

export function str(v: unknown): string {
  return typeof v === 'string' ? v : bad();
}

/** 没传（undefined）返回 undefined，传了就必须是字符串 */
export function optStr(v: unknown): string | undefined {
  return v === undefined ? undefined : str(v);
}

/** 字符串且整串匹配 re（re 自己带 ^$） */
export function match(v: unknown, re: RegExp): string {
  const s = str(v);
  return re.test(s) ? s : bad();
}

export function bool(v: unknown): boolean {
  return typeof v === 'boolean' ? v : bad();
}

export function optBool(v: unknown): boolean | undefined {
  return v === undefined ? undefined : bool(v);
}

/** 不小于 0 的安全整数 */
export function count(v: unknown): number {
  return isCount(v) ? v : bad();
}

export function oneOf<T extends string>(v: unknown, allowed: ReadonlySet<T>): T {
  return typeof v === 'string' && allowed.has(v as T) ? (v as T) : bad();
}

/** 数组：最多 max 个，每个用 read 读 */
export function listOf<T>(v: unknown, max: number, read: (x: unknown) => T): T[] {
  return Array.isArray(v) && v.length <= max ? v.map(read) : bad();
}

/** 平台登记过的游戏 id（shared/games.ts） */
export function gameId(v: unknown): string {
  return oneOf(v, GAME_IDS);
}

/** 业务规则的检查结果（account/validate.ts 的 RuleResult，为什么不直接抛写在那里）：不是 'ok' 就回 422 + 那个错误码。 */
export function check(result: 'ok' | `${'invalid' | 'weak' | 'reserved'}_${string}`): void {
  if (result !== 'ok') throw new ApiError(422, result);
}

/** 分数：安全整数、绝对值不超过 max；不对回 422 invalid_score（所有交分的接口一样） */
export function scoreOf(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (!isInt(v) || Math.abs(v) > max) throw new ApiError(422, 'invalid_score');
  return v;
}
