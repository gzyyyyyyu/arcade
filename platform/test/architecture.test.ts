/// <reference types="vite/client" />
/**
 * 目录分工：worker/ 是后端，src/ 是界面（React、DOM），两边都要的登记表和纯函数放 shared/。
 * worker 引 src 会把界面代码的改动带进后端；shared 引 src、worker 或 React 就不再是"两边都能用"的纯代码。
 */
import { describe, expect, it } from 'vitest';

const raw = (files: Record<string, unknown>) => Object.entries(files as Record<string, string>);
const WORKER = raw(import.meta.glob('../worker/**/*.ts', { query: '?raw', import: 'default', eager: true }));
const SHARED = raw(import.meta.glob('../shared/**/*.ts', { query: '?raw', import: 'default', eager: true }));

/** 文件里所有 import / export ... from / import() 的模块名 */
function specifiers(src: string): string[] {
  return [...src.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm)].map((m) => m[2]!);
}

describe('目录分工', () => {
  it('读到了文件（glob 路径写错时别静默通过）', () => {
    expect(WORKER.length).toBeGreaterThan(20);
    expect(SHARED.length).toBeGreaterThanOrEqual(2);
  });

  it('worker 不引 src/ 下的界面代码', () => {
    const bad = WORKER.flatMap(([file, src]) => specifiers(src).filter((s) => /(^|\/)src(\/|$)/.test(s)).map((s) => `${file} → ${s}`));
    expect(bad).toEqual([]);
  });

  it('worker/api/lib 只引 lib 自己、worker/env、shared 和外部包', () => {
    const libs = WORKER.filter(([file]) => file.startsWith('../worker/api/lib/'));
    expect(libs.length).toBeGreaterThan(5);
    const bad = libs.flatMap(([file, src]) =>
      specifiers(src)
        .filter((s) => s.startsWith('.') && !/^\.\/[^/]+$/.test(s) && !/^(\.\.\/){2}env$/.test(s) && !/^(\.\.\/){3}shared\//.test(s))
        .map((s) => `${file} → ${s}`),
    );
    expect(bad).toEqual([]);
  });

  it('钱包目录只往一个方向引：api、service → store → state、parse、tally', () => {
    // 账（state）是纯函数，读写（store）只靠它；反过来引就会把 D1、请求带进纯函数的账里。最底下那层之间可以互相引
    const LAYER: Record<string, number> = { state: 0, parse: 0, tally: 0, store: 1, api: 2, service: 2, routes: 3 };
    const wallet = WORKER.filter(([file]) => file.startsWith('../worker/api/wallet/'));
    expect(wallet.map(([f]) => f.slice('../worker/api/wallet/'.length, -3)).sort()).toEqual(Object.keys(LAYER).sort());
    const bad = wallet.flatMap(([file, src]) => {
      const me = LAYER[file.slice('../worker/api/wallet/'.length, -3)]!;
      return specifiers(src)
        .map((s) => /^\.\/([^/]+)$/.exec(s)?.[1])
        .filter((dep): dep is string => dep !== undefined && LAYER[dep]! >= me && !(me === 0 && LAYER[dep] === 0))
        .map((dep) => `${file} → ./${dep}`);
    });
    expect(bad).toEqual([]);
  });

  it('shared 只引 shared 自己的文件', () => {
    const bad = SHARED.flatMap(([file, src]) => specifiers(src).filter((s) => !/^\.\/[^/]+$/.test(s)).map((s) => `${file} → ${s}`));
    expect(bad).toEqual([]);
  });
});
