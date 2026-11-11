/**
 * DO 存储的最小接口：Base、Harbor 的逻辑只依赖它，测试换成内存假存储并数写入行数（每步 ≤ 2 行，docs/platform-backend.md 4.2）。
 * 线上是 SQLite 后端 DO 的 ctx.storage（键值接口，一个键一行），包装在 worker/do.ts（这里不碰 Workers 的全局类型，页面的 tsc 也能查测试）。
 */
export interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  list<T>(prefix: string): Promise<Map<string, T>>;
}

/** 测试和本地用：内存存储，writes 记累计写了几行 */
export class MemKv implements Kv {
  data = new Map<string, unknown>();
  writes = 0;
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.data.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async put(key: string, value: unknown): Promise<void> {
    this.writes++;
    this.data.set(key, structuredClone(value));
  }
  async list<T>(prefix: string): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const [k, v] of this.data) if (k.startsWith(prefix)) out.set(k, structuredClone(v) as T);
    return out;
  }
}
