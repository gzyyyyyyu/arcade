import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 首屏（main.ts 的静态 import 图）不许碰到 core/step.ts：step 顶层有注册等副作用，摇树摘不掉，一碰就把整个规则核心（gzip 约 40 KB）拖进首屏。
 * 开局、回放要的 createWorld、ReplayPlayer 从 app/engine.ts（按需加载的块）拿；首屏代码从 core 的小文件引，不经 core/index.ts。
 * 只看运行时 import：`import type` 编译后没了，动态 import() 本来就分块。
 */
const SRC = resolve(new URL('../../src/', import.meta.url).pathname);
// import 和汇总导出的 export … from 都算（core/index.ts 就是靠 export from 连到 step.ts）
const STATIC = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;

function chainTo(target: string): string[] | null {
  const prev = new Map<string, string | null>([[resolve(SRC, 'main.ts'), null]]);
  const queue = [resolve(SRC, 'main.ts')];
  while (queue.length) {
    const f = queue.shift()!;
    if (f === target) {
      const out: string[] = [];
      for (let x: string | null = f; x; x = prev.get(x) ?? null) out.unshift(x.slice(SRC.length + 1));
      return out;
    }
    for (const m of readFileSync(f, 'utf8').matchAll(STATIC)) {
      const n = resolve(dirname(f), m[1]!);
      if (n.startsWith(SRC) && existsSync(n) && !prev.has(n)) {
        prev.set(n, f);
        queue.push(n);
      }
    }
  }
  return null;
}

describe('首屏', () => {
  it('main.ts 静态 import 不到规则核心的 step.ts', () => {
    const chain = chainTo(resolve(SRC, 'core/step.ts'));
    expect(chain, chain?.join(' → ')).toBeNull();
  });
});
