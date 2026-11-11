import { describe, expect, it } from 'vitest';

/** core 层源码（以文本形式导入，不执行）。 */
const coreSources = import.meta.glob('../../src/core/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** 去掉注释，避免说明文字里的示例触发规则。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN: readonly [RegExp, string][] = [
  [/from\s+['"]phaser['"]/, '不能依赖 Phaser'],
  [/from\s+['"]\.\.?\/(\.\.\/)*(view|debug|platform)\b/, '不能依赖 view/debug/platform'],
  [/\b(window|document|localStorage|navigator)\b/, '不能使用浏览器全局对象'],
  [/Math\.random|Date\.now|new Date\b|performance\.now/, '随机数与时间必须来自种子'],
  [/Math\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b/, '该数学函数在不同引擎下结果可能不同'],
  [/[\w)\]]\s*\*\*\s*[\w(]/, '幂运算在不同引擎下结果可能不同'],
  [/toLocale\w*\(/, '格式化不能依赖系统区域设置'],
  [/\bprocess\s*\.|\bimport\.meta\.env\b/, '不能读 process / 环境变量（浏览器里没有；模拟需要的开关放在 tools/ 里注入）'],
];

describe('架构约束', () => {
  it('能找到 core 源码', () => {
    expect(Object.keys(coreSources).length).toBeGreaterThan(5);
  });

  for (const [path, raw] of Object.entries(coreSources)) {
    it(`${path.replace('../../src/', '')} 保持纯逻辑与确定性`, () => {
      const code = stripComments(raw);
      for (const [pattern, reason] of FORBIDDEN) {
        expect(pattern.test(code), `${reason}：${pattern}`).toBe(false);
      }
    });
  }
});

/** 分层约束用：整个 src 的源码（以文本形式导入，不执行）。 */
const srcSources = import.meta.glob('../../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** 取出某目录下的源码，去掉注释后返回。 */
function sourcesUnder(dir: string): [string, string][] {
  return Object.entries(srcSources)
    .filter(([p]) => p.startsWith(`../../src/${dir}/`))
    .map(([p, raw]) => [p, stripComments(raw)]);
}

/** 匹配 import / export from / 动态 import 里指向某目录的相对路径。 */
const importsDir = (dir: string) => new RegExp(`(from\\s+|import\\s*\\(\\s*|import\\s+)['"](\\.\\.?/)+${dir}/`);

describe('分层约束', () => {
  // platform 是和平台打交道的纯数据层（存档、接口），可能在没有画面的地方用；依赖 view/Phaser 会把渲染库拖进去。
  it('platform 不依赖 view 与 phaser', () => {
    const files = sourcesUnder('platform');
    expect(files.length).toBeGreaterThan(0);
    for (const [path, code] of files) {
      expect(importsDir('view').test(code), `${path} 不能 import view`).toBe(false);
      expect(/(from\s+|import\s*\(\s*|import\s+)['"]phaser['"]/.test(code), `${path} 不能 import phaser`).toBe(false);
    }
  });

  // worker 跑在没有浏览器的环境里，用到这些全局对象会在线上直接报错。
  it('worker 不使用浏览器全局对象', () => {
    for (const [path, code] of sourcesUnder('worker')) {
      expect(/\b(window|document|localStorage)\b/.test(code), `${path} 不能使用浏览器全局对象`).toBe(false);
    }
  });

  // tools 是开发期脚本（模拟、截图等），不随游戏发布；src 一旦引用就会被打进线上包。
  it('src 不依赖 tools', () => {
    for (const [path, raw] of Object.entries(srcSources)) {
      expect(importsDir('tools').test(stripComments(raw)), `${path} 不能 import tools`).toBe(false);
    }
  });
});
