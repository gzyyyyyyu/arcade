/**
 * 房间的限速和入站额度里"输入状态和参数、返回结果"的那部分（从 room.ts 拆出）：短语、聊天的节奏，令牌桶，每人入站份额。
 * 时间由调用方传入（room.ts 里仍是 Date.now()），内存里的 Map、计数、日志留在房间类里；单独放是为了不起 DO 就能测这些数字。
 */

/** 快捷短语的节奏（0.7.0）：每 ms 毫秒补 1 个令牌、最多攒 burst 个 */
export interface EmoteRate {
  ms: number;
  burst: number;
}

export function hasEmotes(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

/** KIT_QUOTA（对象或 JSON 字符串）里的 emoteMs / emoteBurst 覆盖默认值；不合格的忽略。burst 至少 1 */
export function emoteRateOf(raw: unknown, base: EmoteRate): EmoteRate {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const q = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  return { ms: ok(q.emoteMs) ? q.emoteMs : base.ms, burst: Math.max(1, ok(q.emoteBurst) ? q.emoteBurst : base.burst) };
}

/** 聊天的节奏（0.18.0）：两条至少隔 ms 毫秒，一分钟最多 perMin 条 */
export interface ChatRate {
  ms: number;
  perMin: number;
}

/** KIT_QUOTA（对象或 JSON 字符串）里的 chatMs / chatPerMin 覆盖默认值；不合格的忽略 */
export function chatRateOf(raw: unknown, base: ChatRate): ChatRate {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const q = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  return { ms: ok(q.chatMs) ? q.chatMs : base.ms, perMin: ok(q.chatPerMin) ? q.chatPerMin : base.perMin };
}

/** 令牌桶：tokens 是现有的令牌数，at 是上次补充的时刻（毫秒） */
export interface Bucket {
  tokens: number;
  at: number;
}

/**
 * 一个座位发一条聊天：先丢掉一分钟以前的记录，再看两条的间隔和一分钟的条数；放行就把现在记进去。
 * 返回的 times 是要存回去的那个数组（已经裁过，放行时已经加上 now）。
 */
export function chatAllow(prev: number[] | undefined, now: number, { ms, perMin }: ChatRate): { times: number[]; ok: boolean } {
  const times = (prev ?? []).filter((t) => now - t < 60_000);
  const last = times[times.length - 1];
  if (ms > 0 && last !== undefined && now - last < ms) return { times, ok: false };
  if (perMin > 0 && times.length >= perMin) return { times, ok: false };
  times.push(now);
  return { times, ok: true };
}

/** 一个座位发一条短语的令牌桶（ms>0 时才用）：按过去的时间补令牌，够 1 个就扣掉放行。 */
export function emoteTake(prev: Bucket | undefined, now: number, { ms, burst }: EmoteRate): { bucket: Bucket; ok: boolean } {
  const b = prev ?? { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + (now - b.at) / ms);
  b.at = now;
  if (b.tokens < 1) return { bucket: b, ok: false };
  b.tokens -= 1;
  return { bucket: b, ok: true };
}

/** 一个人入站消息的令牌桶：每秒补 perSec 个、最多攒 burst 个，够 1 个就扣掉放行。 */
export function tokenTake(prev: Bucket | undefined, now: number, burst: number, perSec: number): { bucket: Bucket; ok: boolean } {
  const b = prev ?? { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec);
  b.at = now;
  if (b.tokens < 1) return { bucket: b, ok: false };
  b.tokens -= 1;
  return { bucket: b, ok: true };
}

/** 一个人在这个房间最多能用多少条入站额度。 */
export function userInboundCap(maxInbound: number, maxInboundShare: number): number {
  return Math.max(1, Math.floor(maxInbound * maxInboundShare));
}

/** 一个人已经用掉的入站条数：存下来的加上这一步还没写库的。 */
export function inboundOf(inboundBy: Record<string, number>, pendingBy: ReadonlyMap<string, number>, userId: string): number {
  return (inboundBy[userId] ?? 0) + (pendingBy.get(userId) ?? 0);
}

/** 发得最多的人和他的条数（只用于关房日志，不含消息内容）。 */
export function busiestSender(inboundBy: Record<string, number>, pendingBy: ReadonlyMap<string, number>): [id: string, count: number] {
  let top = '';
  let most = 0;
  for (const id of new Set([...Object.keys(inboundBy), ...pendingBy.keys()])) {
    const n = (inboundBy[id] ?? 0) + (pendingBy.get(id) ?? 0);
    if (n > most) [top, most] = [id, n];
  }
  return [top, most];
}
