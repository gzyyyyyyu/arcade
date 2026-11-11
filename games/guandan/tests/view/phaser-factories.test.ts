import { describe, expect, it } from 'vitest';

/**
 * 画面层用到的 `scene.add.<名字>(`（Phaser 的游戏对象工厂）必须在 src/phaser-lite.js 里注册过：
 * 我们不用官方整包，漏注册要到运行时才报 "add.xxx is not a function"。
 * 注册名单从 phaser-lite.js 引入的 *Factory 模块源码里的 `GameObjectFactory.register('名字'` 读出，再加上工厂自带的 existing。
 */
const lite = import.meta.glob('../../src/phaser-lite.js', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const factorySources = import.meta.glob('../../node_modules/phaser/src/gameobjects/**/*Factory.js', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const srcFiles = import.meta.glob(['../../src/**/*.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function registeredNames(): Set<string> {
  const names = new Set<string>(['existing']);
  const liteSrc = Object.values(lite)[0] ?? '';
  for (const m of liteSrc.matchAll(/import\s+'phaser-src\/([^']*Factory)'/g)) {
    const src = factorySources[`../../node_modules/phaser/src/${m[1]}.js`] ?? '';
    for (const r of src.matchAll(/GameObjectFactory\.register\(\s*'(\w+)'/g)) if (r[1]) names.add(r[1]);
  }
  return names;
}

/** 返回没注册的 `.add.<名字>(` 用法：「文件: 名字」。 */
function unregistered(files: Record<string, string>, names: Set<string>): string[] {
  const bad: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(/\.add\.([A-Za-z]+)\(/g)) if (m[1] && !names.has(m[1])) bad.push(`${file}: ${m[1]}`);
  }
  return bad;
}

describe('Phaser 游戏对象工厂都在 phaser-lite.js 注册过', () => {
  const names = registeredNames();
  const files = srcFiles;

  it('能读到注册名单', () => {
    for (const n of ['image', 'container', 'text', 'graphics', 'zone', 'existing']) expect(names.has(n), n).toBe(true);
  });

  it('src 里每个 .add.<名字>( 都已注册', () => {
    expect(unregistered(files, names)).toEqual([]);
  });

  it('没注册的名字会被报出来（阳性对照）', () => {
    expect(unregistered({ 'src/x.ts': 'this.add.tilemap(0)' }, names)).toEqual(['src/x.ts: tilemap']);
  });
});
