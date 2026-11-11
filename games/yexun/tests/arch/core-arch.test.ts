import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** 依赖方向是 explore → core（模块 AGENTS.md 第 2 节）：src/core 里任何文件（含类型 import）都不许指向 explore；核心只经 core/raid-port.ts 的钩子碰夜探 */
function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) out.push(p);
    }
  };
  walk(new URL(`../../${dir}/`, import.meta.url).pathname);
  return out;
}

describe('核心架构', () => {
  it('src/core 不 import src/explore（含 import type、export from、动态 import）', () => {
    const list = files('src/core');
    expect(list.length).toBeGreaterThan(10);
    for (const f of list) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(/(?:from|import)\s*\(?\s*['"][^'"]*\/explore\//.test(src), `${f} 指向了 explore`).toBe(false);
    }
  });
});
