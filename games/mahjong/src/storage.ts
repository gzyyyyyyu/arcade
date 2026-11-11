/**
 * 浏览器存储的读写收口。localStorage 在隐私模式、配额满、被禁用时读写都会抛错，
 * 而存档、偏好、战绩这些都不该因此打断打牌：这里统一吞掉并回退，调用处不再各写一遍 try/catch。
 * 键名一律 `mahjong.` 前缀（所有游戏同域，前缀是唯一的隔离手段），调用处写完整键名，这里不拼不改——改了键名玩家的存档就丢了。
 *
 * store 参数：不传用 localStorage；传 null 表示"没有存储"（读回退、写返回 false）；
 * 传别的实现是给测试和云存档（net/cloud.ts 的存储是注入的）用的。
 * 放在 src 根而不是 app/：game/、view/、net/ 也要读写，低层不许 import app/。src/core/ 和 src/ai/ 不碰存储。
 */
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
type Remover = Pick<Storage, 'removeItem'>;

/** 取 localStorage 本身就可能抛（Safari 隐私模式、禁用 Cookie 时访问属性即报错） */
function local(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const pick = <T>(store: T | null | undefined, fallback: () => unknown): T | null => (store === undefined ? (fallback() as T | null) : store);

/** 读文本：没有、读不了都是 null */
export function readText(key: string, store?: Reader | null): string | null {
  try {
    return pick<Reader>(store, local)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 写文本：存不上（隐私模式、满了）回 false，不抛 */
export function writeText(key: string, value: string, store?: Writer | null): boolean {
  try {
    const s = pick<Writer>(store, local);
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** 删键：删不了回 false，不抛 */
export function removeKey(key: string, store?: Remover | null): boolean {
  try {
    const s = pick<Remover>(store, local);
    if (!s) return false;
    s.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** 读 JSON：没有、读不了、解析失败都回 fallback。T 只是类型标注，内容是否合规由调用处校验 */
export function readJson<T>(key: string, fallback: T, store?: Reader | null): T {
  const raw = readText(key, store);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // 存的不是 JSON（被别的东西改过、写到一半）：当没存过，下一次写入会盖掉它
    return fallback;
  }
}

/** 写 JSON：序列化或存储失败回 false，不抛 */
export function writeJson(key: string, value: unknown, store?: Writer | null): boolean {
  try {
    return writeText(key, JSON.stringify(value), store);
  } catch {
    return false;
  }
}
