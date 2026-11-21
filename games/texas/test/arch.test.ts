import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAst } from 'vite';
import { describe, expect, it } from 'vitest';
import { KEYS } from '../src/store.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('架构约束', () => {
  const pure = [...files('src/core'), ...files('src/puzzle'), ...files('src/ai'), ...files('src/room'), ...files('src/fun'), ...files('src/tour'), 'src/bot.ts'];

  it('规则核心和电脑里没有 Math.random、时间、平台相关的数学函数、DOM 和网络', () => {
    const banned = /Math\.(random|exp|log|log2|log10|pow|sqrt|sin|cos|tan|atan2|hypot|cbrt)\b|\bDate\b|performance\.|crypto\.|\bwindow\b|\bdocument\b|\bfetch\(|localStorage|setTimeout|setInterval|\*\*|from 'node:/;
    for (const f of pure) expect(read(f).match(banned)?.[0], f).toBeUndefined();
  });

  it('电脑只拿视图：src/ai 不引用完整状态，只用类型引用规则', () => {
    for (const f of files('src/ai')) {
      const src = read(f);
      expect(src, f).not.toMatch(/\bTable\b|\bSeatState\b|\.deck\b|\.seed\b/);
      for (const m of src.matchAll(/^import (.*) from '(.*)';$/gm))
        if (m[2]!.includes('core/table') || m[2]!.includes('core/view')) expect(m[1], f).toMatch(/^type /);
    }
  });

  it('规则核心不引用电脑和页面；好友房的规则不引用页面（房间和页面共用）', () => {
    for (const f of files('src/core')) expect(read(f), f).not.toMatch(/from '\.\.\/(ai|view|net|room)\//);
    for (const f of files('src/room')) expect(read(f), f).not.toMatch(/from '\.\.\/(view|net)\/|from '\.\.\/(main|solo)\.ts'/);
  });

  it('电脑的出牌决定拿不到嘲讽、表情、道具（0.6.0）：src/ai 和 bot.ts 不引用页面、网络、房间和电脑的互动（src/fun），只吃规则给的视图', () => {
    for (const f of [...files('src/ai'), 'src/bot.ts']) expect(read(f), f).not.toMatch(/from '\.\.?\/(view|net|room|fun)\/|from '\.\.?\/(main|solo|online)\.ts'|banter|emote/);
  });

  it('页面启动先建云存档再画大厅：画大厅要按 cloud.userId() 读记着的房间，反过来在好友房里刷新一打开就报错', () => {
    const lobby = read('src/app/lobby.ts');
    const boot = lobby.slice(lobby.indexOf('async function boot('));
    const created = boot.indexOf('cloud = createCloud(');
    expect(created).toBeGreaterThan(0);
    for (const call of ['showLobby()', 'drawLobby()', 'savedRoom()', 'lastRoom()', 'cloud.']) {
      const at = boot.indexOf(call);
      if (at >= 0) expect(at, call).toBeGreaterThan(created);
    }
  });

  it('浏览器存储的键都在 store.ts 里，且以 texas. 开头（和平台、别的游戏同域，前缀是唯一的隔离）', () => {
    const keys = Object.values(KEYS).map((k) => (typeof k === 'function' ? k('u1') : k));
    expect(keys.length).toBeGreaterThanOrEqual(9);
    for (const k of keys) expect(k).toMatch(/^texas\./);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('只有 store.ts 直接碰 localStorage / sessionStorage；别处的键名都从 store.ts 拿，不再写 texas. 字面量', () => {
    for (const f of files('src').filter((f) => f !== 'src/store.ts')) {
      const src = read(f);
      // 注入点：src/app 把 localStorage 整个交给 solo / cloud / fun（它们经注入读写，便于测试），只传不调
      const bare = src.replace(/\blocalStorage(?=[,)])/g, '').replace(/\bsessionStorage(?=[,)])/g, '');
      expect(bare.match(/\b(localStorage|sessionStorage)\b/)?.[0], f).toBeUndefined();
      expect(src.match(/['"`]texas\.[^'"`]*['"`]/)?.[0], f).toBeUndefined();
    }
  });

  it('跟注提示（我的牌大约赢几成）只在单机桌：好友房、快速匹配（app/online.ts）和锦标赛（app/tour.ts）调 bar.update 只给两个参数，不传 hint', () => {
    /** 每处 bar.update( … ) 顶层有几个参数（数逗号，跳过括号、方括号、花括号里的） */
    const argCounts = (src: string): number[] =>
      [...src.matchAll(/bar\.update\(/g)].map((m) => {
        let depth = 0;
        let n = 1;
        for (let i = m.index + m[0].length; i < src.length; i++) {
          const ch = src[i]!;
          if ('([{'.includes(ch)) depth++;
          else if (')]}'.includes(ch)) {
            if (depth === 0) break;
            depth--;
          } else if (ch === ',' && depth === 0) n++;
        }
        return n;
      });
    for (const f of ['src/app/online.ts', 'src/app/tour.ts']) {
      const counts = argCounts(read(f));
      expect(counts.length, f).toBeGreaterThan(0);
      for (const n of counts) expect(n, f).toBe(2);
    }
    expect(argCounts(read('src/app/table.ts'))).toContain(3);
  });

  it('CSS 里的 :has() 只挂在不常变的小块上（弹窗、结果条、谜题格）：牌桌、舞台、body 上的 :has 在 iOS Safari 上让每次 DOM 变动都大面积重算样式（0.33.2 卡顿）', () => {
    const css = (dir: string): string[] =>
      readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? css(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : []));
    const ok = /(^|[\s,{}])(\.dialog|\.result|\.pz-slot(\.runout)?):has\(/;
    for (const f of css('src')) {
      for (const line of read(f).split('\n')) if (line.includes(':has(')) expect(ok.test(line), `${f}: ${line.trim()}`).toBe(true);
    }
  });
});

describe('页面入口（src/main.ts 和 src/app/）', () => {
  type Node = { type: string; [k: string]: unknown };
  const FUNCS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  const app = files('src/app');
  const ast = (f: string): Node => parseAst(readFileSync(join(ROOT, f), 'utf8'), { lang: 'ts' }) as unknown as Node;
  /** 模块顶层（函数体外）的所有节点：函数只在调用时才跑，里面怎么用 DOM 都行 */
  const outside = (n: Node, out: Node[] = []): Node[] => {
    out.push(n);
    if (FUNCS.has(n.type)) return out;
    for (const [k, v] of Object.entries(n)) {
      if (k === 'type' || !v || typeof v !== 'object') continue;
      for (const x of Array.isArray(v) ? v : [v]) if (x && typeof x === 'object' && typeof (x as Node).type === 'string') outside(x as Node, out);
    }
    return out;
  };
  const top = (f: string): Node[] => (ast(f).body as Node[]).flatMap((n) => outside(n).slice(n.type === 'FunctionDeclaration' ? 1 : 0));

  it('模块顶层不碰 document、window：import 进来不建 DOM、不挂事件', () => {
    expect(app.length).toBeGreaterThanOrEqual(8);
    for (const f of [...app, 'src/main.ts']) {
      const hit = top(f).find((n) => n.type === 'MemberExpression' && (n.object as Node).type === 'Identifier' && ['document', 'window'].includes((n.object as { name: string }).name));
      expect(hit && `${(hit.object as { name: string }).name}.`, f).toBeUndefined();
    }
  });

  it('src/app 的模块顶层没有可变状态、不调用函数：状态都在 mount 建的那一份里', () => {
    for (const f of app) {
      const nodes = top(f);
      const mutable = nodes.find((n) => n.type === 'VariableDeclaration' && n.kind !== 'const');
      expect(mutable && `${mutable.kind as string}`, f).toBeUndefined();
      const call = nodes.find((n) => n.type === 'CallExpression' || n.type === 'NewExpression' || n.type === 'ExpressionStatement');
      expect(call?.type, f).toBeUndefined();
    }
  });

  it('src/app 之间的运行时 import 没有环（类型引用不算）：mount 按顺序建，不靠初始化顺序', () => {
    const deps = new Map(
      app.map((f) => [
        f,
        (ast(f).body as Node[])
          .filter((n) => n.type === 'ImportDeclaration' && n.importKind !== 'type')
          .map((n) => (n.source as { value: string }).value)
          .filter((s) => s.startsWith('./'))
          .map((s) => join('src/app', s)),
      ]),
    );
    const done = new Set<string>();
    const visit = (f: string, path: string[]): void => {
      expect(path, `import 有环：${[...path, f].join(' → ')}`).not.toContain(f);
      if (done.has(f)) return;
      for (const d of deps.get(f) ?? []) visit(d, [...path, f]);
      done.add(f);
    };
    for (const f of app) visit(f, []);
  });

  it('main.ts 只找根节点、调 mount（少于 60 行）', () => {
    const src = readFileSync(join(ROOT, 'src/main.ts'), 'utf8');
    expect(src.split('\n').length).toBeLessThan(60);
    expect(src).toMatch(/mount\(must\(document\.getElementById\('app'\)/);
  });
});

describe('静态资源缓存（_headers）', () => {
  it('只给带哈希的 assets/ 设长缓存，构建时拷到 dist-cf 根目录', () => {
    const rules = readFileSync(join(ROOT, '_headers'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    expect(rules).toEqual(['/games/texas/assets/*', '  Cache-Control: public, max-age=31536000, immutable']);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['build:cf']).toMatch(/&& cp _headers dist-cf\/_headers$/);
  });
});
