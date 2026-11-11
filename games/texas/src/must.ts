/** 页面上一定该有的东西（根节点、模板里的子元素）没找到：报出是哪一个，不留给后面一个看不懂的 TypeError */
export function must<T>(x: T | null | undefined, name: string): T {
  if (x === null || x === undefined) throw new Error(`texas: 找不到 ${name}`);
  return x;
}
