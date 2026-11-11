import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lackText } from '../src/view/basefeel.ts';

/** 界面规范（仓库 docs/ui.md 第 3、6 节）：字号只有 12/14/16/20 四级，游戏资源不够统一说"还差 N"，筹码说"筹码不够" */
const SRC = new URL('../src/', import.meta.url).pathname;
function walk(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const noComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('字号阶梯', () => {
  // 画布里的世界字（Phaser fontSize）按镜头缩放，不算
  const scoped = walk(SRC).filter((p) => !p.includes('/art/'));
  it('CSS 里的 font-size 只用 12/14/16/20，大数字（≥24）另算', () => {
    const bad: string[] = [];
    for (const p of scoped) {
      const s = noComments(readFileSync(p, 'utf8'));
      for (const m of s.matchAll(/font(?:-size)?:\s*(?:[a-z0-9]+\s+)?([0-9.]+)px/g)) {
        const n = Number(m[1]);
        if (![12, 14, 16, 20].includes(n) && n < 24) bad.push(`${p.replace(SRC, '')}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('没有 11px', () => {
    for (const p of scoped) expect(readFileSync(p, 'utf8'), p).not.toMatch(/font-size:\s*11px/);
  });
});

describe('资源不够的说法', () => {
  it('源码里没有"余额不足"，资源也不写"X 不够"', () => {
    for (const p of walk(SRC)) {
      const s = noComments(readFileSync(p, 'utf8'));
      expect(s, p).not.toMatch(/余额不足/);
      expect(s, p).not.toMatch(/(金币|木材|能量)不够/); // 筹码按 docs/ui.md 第 6 节就叫"筹码不够"
    }
  });
  it('lackText：不够的项写"还差 N"，够了是空串', () => {
    expect(lackText({ gold: 1200, wood: 50 }, { gold: 200, wood: 80 })).toBe('还差 1,000 金币');
    expect(lackText({ gold: 100, wood: 90 }, { gold: 20, wood: 30 })).toBe('还差 80 金币，60 木材');
    expect(lackText({ gold: 5, wood: 5 }, { gold: 5, wood: 9 })).toBe('');
  });
});
