import { describe, expect, it } from 'vitest';

/** core、ai 与实盘规则（stake）的源码（以文本形式导入，不执行）。 */
// 牌馆重构（①b，docs/doudizhu.md 第 1 节）：通用层 src/core 加上每个玩法的 core、ai、stake
const sources = import.meta.glob(['../src/core/**/*.ts', '../src/variants/*/core/**/*.ts', '../src/variants/*/ai/**/*.ts', '../src/variants/*/stake/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** 去掉注释，避免说明文字里的示例触发规则。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN: readonly [RegExp, string][] = [
  [/from\s+['"]phaser['"]/, '不能依赖 Phaser'],
  [/from\s+['"]\.\.?\/(\.\.\/)*(view|debug|platform)\b/, '不能依赖画面层'],
  [/\b(window|document|localStorage|sessionStorage|navigator|HTMLElement)\b/, '不能使用浏览器全局对象（DOM）'],
  [/Math\.random|Date\.now|new Date\b|\bDate\(|performance\.now/, '随机数与时间必须来自种子'],
  [/Math\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b/, '该数学函数在不同引擎下结果可能不同'],
  [/[\w)\]]\s*\*\*\s*[\w(]/, '幂运算在不同引擎下结果可能不同'],
  [/toLocale\w*\(/, '格式化不能依赖系统区域设置'],
  [/\bprocess\s*\.|\bimport\.meta\.env\b/, '不能读 process / 环境变量'],
  [/\bfetch\s*\(|XMLHttpRequest|WebSocket/, '不能访问网络'],
];

describe('架构约束：core、ai、stake 保持纯逻辑与确定性', () => {
  it('能找到源码', () => {
    expect(Object.keys(sources).filter((p) => p.includes('/stake/')).length).toBeGreaterThan(0);
    expect(Object.keys(sources).filter((p) => p.includes('/core/')).length).toBeGreaterThan(4);
    expect(Object.keys(sources).filter((p) => p.includes('/ai/')).length).toBeGreaterThan(2);
  });

  for (const [path, raw] of Object.entries(sources)) {
    it(`${path.replace('../src/', '')}`, () => {
      const code = stripComments(raw);
      for (const [pattern, reason] of FORBIDDEN) {
        expect(pattern.test(code), `${reason}：${pattern}`).toBe(false);
      }
    });
  }

  it('core、ai 从 arcade-kit 只用纯函数的随机数（rng、prng），不碰房间、Worker、浏览器连接器', () => {
    for (const [path, raw] of Object.entries(sources)) {
      for (const m of stripComments(raw).matchAll(/from\s+['"](arcade-kit[^'"]*)['"]/g)) expect(['arcade-kit/rng', 'arcade-kit/prng'], path).toContain(m[1]);
    }
  });

  // prng 是 32 位种子的 sfc32，不保密：只经 core/rng.ts 一处包一层给单机规则用，别处（尤其房间、Worker）不许直接拿它发牌
  it('arcade-kit/prng 只在 src/core/rng.ts 里引', () => {
    const all = import.meta.glob(['../src/**/*.ts', '../worker/**/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const users = Object.entries(all)
      .filter(([, raw]) => /from\s+['"]arcade-kit\/prng['"]/.test(stripComments(raw)))
      .map(([p]) => p);
    expect(users).toEqual(['../src/core/rng.ts']);
  });

  // 电脑不看牌（0.8.1 AI 公平审计）：电脑的输入只有 viewFor 给的视图（PlayerView），碰不到完整状态；
  // 发牌、首出的随机流（用途 'deal'、'firstLead'）只在 core 里，电脑里出现这两个名字就可能在重算别人的牌。行为上的检查在 tests/core/ai.test.ts 的反事实测试
  it('ai 不引用完整牌局状态 GameState，也不碰发牌、首出的随机流', () => {
    for (const [path, raw] of Object.entries(sources)) {
      if (!path.includes('/ai/')) continue;
      const code = stripComments(raw);
      expect(/\bGameState\b/.test(code), `${path} 引用了 GameState`).toBe(false);
      expect(/['"`](deal|firstLead)['"`]/.test(code), `${path} 出现了发牌或首出的随机流名`).toBe(false);
    }
  });

  it('ai、stake 只通过 core 的公开入口取规则', () => {
    for (const [path, raw] of Object.entries(sources)) {
      if (!path.includes('/ai/') && !path.includes('/stake/')) continue;
      for (const m of stripComments(raw).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1]!;
        if (spec.startsWith('../core')) expect(spec, path).toBe('../core/index.ts');
      }
    }
  });

  it('通用层 src/core 不引用任何玩法（variants/*），玩法之间也互不引用', () => {
    for (const [path, raw] of Object.entries(sources)) {
      const own = /\/variants\/([^/]+)\//.exec(path)?.[1];
      for (const m of stripComments(raw).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const other = /variants\/([^/]+)\//.exec(m[1]!)?.[1];
        if (other !== undefined) expect(other, `${path} 引用了 ${m[1]}`).toBe(own);
        if (own === undefined) expect(m[1]!.includes('variants'), `${path} 引用了 ${m[1]}`).toBe(false);
      }
    }
  });
});

// ───────────── 玩法分目录：net 层和画面层 ─────────────
// 牌馆重构（画面层按玩法分目录）：玩法之间互不引用，两个玩法都用的部分放通用层。
//   掼蛋：src/variants/guandan/**、src/view/guandan/**、scenes/TableScene.ts
//   斗地主：src/variants/doudizhu/**、src/view/doudizhu/**、scenes/DdzScene.ts
//   通用：src/view/common/**、src/view/scenes/shared/**（两个牌桌场景的共用基类；不引用任何玩法，也不引用玩法的画面目录和两个牌桌场景）
// 两个玩法的入口（TitleScene、BootScene、main.ts、debug、view 根目录的 app/store/online/personas）和 src/net 里的 hall 可以都引，不在约束里。
const layerSources = import.meta.glob(['../src/variants/**/*.ts', '../src/view/**/*.ts', '../src/net/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type Owner = 'guandan' | 'doudizhu' | 'common' | null;

/** 一个源码文件（'../src/…'）属于谁 */
function ownerOf(p: string): Owner {
  if (p.startsWith('../src/variants/guandan/') || p.startsWith('../src/view/guandan/') || p === '../src/view/scenes/TableScene.ts') return 'guandan';
  if (p.startsWith('../src/variants/doudizhu/') || p.startsWith('../src/view/doudizhu/') || p === '../src/view/scenes/DdzScene.ts') return 'doudizhu';
  if (p.startsWith('../src/view/common/') || p.startsWith('../src/view/scenes/shared/')) return 'common';
  return null;
}

/** 文件里相对路径的 import，换算成 '../src/…' 形式（带 ?url 等后缀的去掉后缀；包名不管） */
function relativeImports(path: string, raw: string): string[] {
  const out: string[] = [];
  const dir = path.split('/').slice(0, -1);
  for (const m of stripComments(raw).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]*)['"]/g)) {
    const parts = [...dir];
    for (const seg of m[1]!.split('?')[0]!.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg !== '.') parts.push(seg);
    }
    out.push(parts.join('/'));
  }
  return out;
}

/** 违规的 import：满足 pick 的文件引用了 banned 里的玩法 / 目录（引用自己所属的不算） */
function crossings(pick: (path: string) => boolean, banned: Owner[]): string[] {
  const bad: string[] = [];
  for (const [path, raw] of Object.entries(layerSources)) {
    const own = ownerOf(path);
    if (!own || !pick(path)) continue;
    for (const target of relativeImports(path, raw)) {
      const to = ownerOf(target);
      if (to && to !== own && banned.includes(to)) bad.push(`${path.replace('../src/', '')} → ${target.replace('../src/', '')}`);
    }
  }
  return bad;
}

const inVariants = (p: string): boolean => p.startsWith('../src/variants/');

describe('架构约束：玩法分目录，net 层和画面层互不引用', () => {
  it('能找到源码', () => {
    const owners = Object.keys(layerSources).map(ownerOf);
    for (const o of ['guandan', 'doudizhu', 'common'] as const) expect(owners.filter((x) => x === o).length, o).toBeGreaterThan(5);
    for (const g of ['guandan', 'doudizhu']) expect(Object.keys(layerSources).filter((p) => p.startsWith(`../src/variants/${g}/net/`)).length, g).toBeGreaterThan(0);
  });

  it('检查器自己：相对路径换算、归属判断正确（构造的违规能被认出来）', () => {
    expect(relativeImports('../src/view/x.ts', "import { a } from './guandan/stake.ts';\nimport b from '../variants/doudizhu/index.ts';")).toEqual([
      '../src/view/guandan/stake.ts',
      '../src/variants/doudizhu/index.ts',
    ]);
    expect(ownerOf('../src/view/guandan/stake.ts')).toBe('guandan');
    expect(ownerOf('../src/variants/doudizhu/index.ts')).toBe('doudizhu');
    expect(ownerOf('../src/view/scenes/DdzScene.ts')).toBe('doudizhu');
    expect(ownerOf('../src/view/common/seed.ts')).toBe('common');
    expect(ownerOf('../src/view/scenes/shared/TableSceneBase.ts')).toBe('common');
    expect(ownerOf('../src/view/store.ts')).toBeNull();
  });

  it('net 层：src/variants 里掼蛋和斗地主（core、ai、net、stake 全部）互不引用', () => {
    expect(crossings((p) => inVariants(p) && ownerOf(p) === 'guandan', ['doudizhu'])).toEqual([]);
    expect(crossings((p) => inVariants(p) && ownerOf(p) === 'doudizhu', ['guandan'])).toEqual([]);
  });

  it('画面层：掼蛋（view/guandan、TableScene）不引用斗地主（variants/doudizhu、view/doudizhu、DdzScene）', () => {
    expect(crossings((p) => !inVariants(p) && ownerOf(p) === 'guandan', ['doudizhu'])).toEqual([]);
  });

  it('画面层：斗地主（view/doudizhu、DdzScene）不引用掼蛋（variants/guandan、view/guandan、TableScene）', () => {
    expect(crossings((p) => !inVariants(p) && ownerOf(p) === 'doudizhu', ['guandan'])).toEqual([]);
  });

  it('view/common 和 scenes/shared（牌桌场景的共用基类）不引用任何玩法（variants/*）和玩法的画面目录（view/guandan、view/doudizhu、两个牌桌场景）', () => {
    expect(Object.keys(layerSources).filter((p) => p.startsWith('../src/view/scenes/shared/')).length).toBeGreaterThan(0);
    expect(crossings((p) => p.startsWith('../src/view/common/') || p.startsWith('../src/view/scenes/shared/'), ['guandan', 'doudizhu'])).toEqual([]);
  });
});
