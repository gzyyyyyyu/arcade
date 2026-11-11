/** 架构约束（DESIGN.md 3、10）：规则核心和电脑是纯的、确定的；玩法之间不互相引用；电脑只拿视图 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = new URL('../src/', import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** 去掉注释，免得注释里提到的词被当成代码 */
const code = (p: string): string =>
  readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const PURE = [...files(join(ROOT, 'core')), ...files(join(ROOT, 'ai'))];

/**
 * 电脑（src/ai）能从玩法（src/core/variants/**）拿的名字。玩法的 index.ts 用 export * 把 rules.ts 整个转出来，
 * 光看"不 import rules.ts"挡不住经 index.ts 拿到 begin、tenpaiKinds、applyMut 这些读全量状态的函数，所以按名字放行：
 * 视图、动作、性格状态的类型，算番（只吃自己的牌）和牌型常量。加名字要想清楚它是不是只吃视图里有的东西（DESIGN.md 5.4）
 */
const AI_MAY_IMPORT = new Set(['XzView', 'XzAction', 'VariantAi', 'Tune', 'scoreHand', 'NO_CONTEXT', 'HIDDEN', 'SHAPE', 'SUITED_KINDS',
  // 立直：视图、动作的类型，和只吃自己的牌的算番、听牌、牌型常量
  'RcView',
  'RcAction',
  'WinContext',
  'ALL_KINDS',
  'RED',
  'doraOf',
  'waitsOf',
  'scoreWin',
]);

/** 一段代码从玩法那里拿了哪些名单外的东西（* as、动态 import 也算） */
function variantLeaks(src: string): string[] {
  const out: string[] = [];
  const target = String.raw`'[^']*core\/variants\/[^']*'`;
  for (const m of src.matchAll(new RegExp(String.raw`(?:import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*${target}`, 'g'))) {
    for (const part of m[2]!.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
      if (name && !AI_MAY_IMPORT.has(name)) out.push(name);
    }
  }
  for (const m of src.matchAll(new RegExp(String.raw`import\s+(?:type\s+)?(\*\s+as\s+\w+)\s+from\s*${target}`, 'g'))) out.push(m[1]!.replace(/\s+/g, ' '));
  if (new RegExp(String.raw`import\s*\(\s*${target}`).test(src)) out.push('import()');
  return out.sort();
}

describe('规则核心和电脑', () => {
  test('不用 Math.random、Date.now、new Date 和结果依赖平台的数学函数', () => {
    const banned = /Math\.(random|exp|log|log2|log10|pow|sin|cos|tan|atan|atan2|sqrt|cbrt|hypot|expm1|log1p|sinh|cosh|tanh|asin|acos)\b|Date\.now|new Date|performance\.now/;
    for (const f of PURE) expect(banned.test(code(f)), relative(ROOT, f)).toBe(false);
  });

  test('不碰 DOM、网络、存储', () => {
    const banned = /\b(document|window|localStorage|sessionStorage|fetch|WebSocket|navigator)\b/;
    for (const f of PURE) expect(banned.test(code(f)), relative(ROOT, f)).toBe(false);
  });

  test('玩法之间不互相 import，只依赖通用层', () => {
    const dir = join(ROOT, 'core/variants');
    const variants = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
    for (const v of variants) {
      for (const f of files(join(dir, v))) {
        const imports = [...code(f).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
        for (const i of imports) {
          for (const other of variants) if (other !== v) expect(i.includes(`/${other}/`) || i.endsWith(`/${other}`), `${relative(ROOT, f)} → ${i}`).toBe(false);
        }
      }
    }
  });

  test('通用层不 import 任何玩法', () => {
    for (const layer of ['tiles', 'hand', 'table', 'match']) {
      for (const f of files(join(ROOT, 'core', layer))) expect(code(f).includes('variants/'), relative(ROOT, f)).toBe(false);
    }
  });

  test('规则和电脑出牌不碰互动：不 import 互动、短语表情、画面（电脑的决策读不到任何人发的东西）', () => {
    for (const f of PURE) {
      const imports = [...code(f).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
      for (const i of imports) expect(/\/(game\/(banter|emotes)|view\/)|^arcade-kit\/fun/.test(i), `${relative(ROOT, f)} → ${i}`).toBe(false);
    }
  });

  test('电脑不读聊天（单机也能说话）：规则、电脑和单机牌局都不 import 聊天和互动组件，说的话只在画面上显示', () => {
    for (const f of [...PURE, join(ROOT, 'solo.ts')]) {
      const imports = [...code(f).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
      for (const i of imports) expect(/^arcade-kit\/(chat|table-fun)/.test(i), `${relative(ROOT, f)} → ${i}`).toBe(false);
    }
  });

  test('电脑从玩法那里只拿名单上的东西：视图和动作的类型、只吃牌的纯函数和常量（不经 index.ts 的 export * 拿到 begin、tenpaiKinds 这类状态函数）', () => {
    for (const f of files(join(ROOT, 'ai'))) expect(variantLeaks(code(f)), relative(ROOT, f)).toEqual([]);
  });

  test('上面那条抓得住偷拿状态函数（阳性对照）', () => {
    const from = "'../core/variants/sichuan-xuezhan/index.ts'";
    expect(variantLeaks(`import { scoreHand, type XzView } from ${from};`)).toEqual([]);
    expect(variantLeaks(`import { begin, tenpaiKinds as tk, view } from ${from};`)).toEqual(['begin', 'tenpaiKinds', 'view']);
    expect(variantLeaks(`import * as XZ from ${from};`)).toEqual(['* as XZ']);
    expect(variantLeaks(`const m = await import(${from});`)).toEqual(['import()']);
    expect(variantLeaks(`export { applyMut } from ${from};`)).toEqual(['applyMut']);
  });

  test('电脑只拿视图：不出现状态类型、不调规则的 apply', () => {
    for (const f of files(join(ROOT, 'ai'))) {
      const c = code(f);
      expect(/\bXzState\b|\bapplyMut\b|\bapply\(/.test(c), relative(ROOT, f)).toBe(false);
      // 只用规则的类型和纯函数（算番、牌型），不碰流程文件（状态和推进拆在 rules.ts 和它转出的 state/actions/settle… 里）：
      // 从玩法只许经各玩法的 index.ts（名字再由上面的名单把关）和公共的 variants/types.ts 引
      for (const m of c.matchAll(/from\s+'([^']*core\/variants\/[^']*)'/g))
        expect(/core\/variants\/(?:[\w-]+\/index|types)\.ts$/.test(m[1]!), `${relative(ROOT, f)} → ${m[1]}`).toBe(true);
    }
  });
});

describe('页面层不按玩法分叉（棘轮，DESIGN.md 3.6）', () => {
  // 页面和流程（main.ts、app/、view/ 里除了 variants/ 的文件）一律经 view/variants/pages.ts 的 pageOf(玩法id) 取玩法不同的东西，
  // 不自己写 `variant === RC_ID`、`rc ? a : b`。核心层、电脑和各玩法自己的目录可以认得自己的 id。
  const OWN = ['core/variants/', 'ai/', 'view/variants/'];
  // 这些文件里的 'riichi' 不是"按玩法分叉"：过场条的种类名、役种 id、事件名。要加白名单，先想清楚它真的不是玩法判断
  const NOT_A_FORK: Record<string, string> = {
    'view/cutin-spec.ts': '过场条的种类（碰吃杠胡自摸立直），演出种类表',
    'view/cutin.ts': '同上，过场条的样式表',
    'game/dex.ts': '役种 id riichi（立直这一役）',
    'solo.ts': '事件名 riichi（电脑出牌后的停顿）',
  };
  // 现存的三处都不在页面层：game/daily.ts 每日挑战的玩法表、game/match.ts 快速匹配的档位（Worker 和页面共用，不能 import 页面钩子）、
  // room/talk.ts 好友房里电脑起哄按玩法选事件来源。以后只许减不许加：新玩法的页面差异写进 VariantPage，不要在这里加数字。
  const MAX_FORKS = 3;
  const FORK = /\bRC_ID\b|['"]riichi['"]/g;

  const forks = (src: string): number => code_(src).match(FORK)?.length ?? 0;
  const code_ = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  test('src/ 里玩法目录以外的文件，把 RC_ID / \'riichi\' 当玩法判断的地方不超过上限', () => {
    const hits: string[] = [];
    let total = 0;
    for (const f of files(ROOT)) {
      const rel = relative(ROOT, f);
      if (OWN.some((d) => rel.startsWith(d)) || rel in NOT_A_FORK) continue;
      const n = forks(readFileSync(f, 'utf8'));
      if (n) hits.push(`${rel}:${n}`);
      total += n;
    }
    expect(total, hits.join(' ')).toBeLessThanOrEqual(MAX_FORKS);
  });

  test('白名单里的文件都还在（删了的要从白名单去掉）', () => {
    for (const rel of Object.keys(NOT_A_FORK)) expect(statSync(join(ROOT, rel)).isFile(), rel).toBe(true);
  });

  test('上限抓得住新增的分叉（阳性对照；注释里提到不算）', () => {
    expect(forks("if (variant === RC_ID) return 1; const id = 'riichi';")).toBe(2);
    expect(forks("// variant === RC_ID\n/* 'riichi' */ const x = 1;")).toBe(0);
  });

  test('页面层不 import 某个玩法的 page.ts，一律经登记处 pages.ts', () => {
    for (const f of files(ROOT)) {
      const rel = relative(ROOT, f);
      if (rel.startsWith('view/variants/') || rel.startsWith('core/') || rel.startsWith('ai/')) continue;
      const imports = [...code(f).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
      for (const i of imports) expect(/view\/variants\/[\w-]+\/page(\.ts)?$|^\.\/variants\/[\w-]+\/page(\.ts)?$/.test(i), `${rel} → ${i}`).toBe(false);
    }
  });

  test('各玩法的页面钩子之间不互相 import', () => {
    const dir = join(ROOT, 'view/variants');
    const variants = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
    for (const v of variants) {
      for (const f of files(join(dir, v))) {
        const imports = [...code(f).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
        for (const i of imports) for (const other of variants) if (other !== v) expect(i.includes(`variants/${other}/`) || i.endsWith(`/${other}`), `${relative(ROOT, f)} → ${i}`).toBe(false);
      }
    }
  });
});
