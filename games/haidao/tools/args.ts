/**
 * 工具脚本的命令行参数（tools/ 下各脚本共用）：`--名字 值` 取值，`--名字` 当开关。
 * 只认 `node tools/x.ts …` 后面的参数；被别的脚本 import 时读的是入口脚本的参数。
 */
export const argv = process.argv.slice(2);

/** `--名字 值` 的值；没写为 undefined */
export function opt(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** 数字参数：没写、不是数字或写了 0 都用默认值（和各脚本原来的 `Number(x) || d` 一样） */
export function num(name: string, d: number): number {
  return Number(opt(name)) || d;
}

/** 开关参数：写了 `--名字` 就是 true */
export function flag(name: string): boolean {
  return argv.includes(name);
}
