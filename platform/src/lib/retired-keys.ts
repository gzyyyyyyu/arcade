/**
 * 不再用的浏览器存储：启动时清掉，免得一直占着、也免得以后同名 key 读到旧格式。
 * 大厅去掉"今天的新鲜事"：sessionStorage 的 arcade.dailyStrip（每日挑战缓存）、localStorage 的 arcade.trip.<用户>（每日巡游天数）。
 */
const SESSION_KEYS = ['arcade.dailyStrip'];
const LOCAL_PREFIXES = ['arcade.trip.'];

/** 用到的那几样（不直接写 Storage：测试跑在 workerd 里，没有 DOM 的类型） */
export interface KeyStore {
  readonly length: number;
  key(i: number): string | null;
  removeItem(k: string): void;
}

export function clearRetiredKeys(local: KeyStore, session: KeyStore): void {
  for (const k of SESSION_KEYS) session.removeItem(k);
  // 先收集再删：边遍历边删会跳过下一个
  const doomed: string[] = [];
  for (let i = 0; i < local.length; i++) {
    const k = local.key(i);
    if (k && LOCAL_PREFIXES.some((p) => k.startsWith(p))) doomed.push(k);
  }
  for (const k of doomed) local.removeItem(k);
}
