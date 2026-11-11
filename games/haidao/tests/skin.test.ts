import { describe, expect, it } from 'vitest';
import { skinCss } from '../src/view/skin.ts';
import { weatherOf } from '../src/view/post.ts';
import { tdCampaign } from '../src/core/index.ts';

describe('界面皮肤的样式', () => {
  const css = skinCss();
  // 去掉注释，按「选择器 { 声明 }」切成规则（@keyframes 里面的小规则和 @media 套着的规则单独处理）
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('每条普通规则的每个选择器都限定在 .hd-ui.hd-skin 根节点下', () => {
    const rules = body.match(/(?:^|\})\s*([^{}@]+)\{/g) ?? [];
    expect(rules.length).toBeGreaterThan(40);
    for (const r of rules) {
      const sel = r.replace(/^\}/, '').replace(/\{$/, '').trim();
      // @keyframes 内部的 0% / 55% / to 之类
      if (/^(\d+%|to|from)(\s*,\s*(\d+%|to|from))*$/.test(sel)) continue;
      for (const one of sel.split(',')) expect(one.trim().startsWith('.hd-ui.hd-skin'), one.trim()).toBe(true);
    }
  });
  it('字不小于 12 像素，不用 100vh，按钮高度不低于 44', () => {
    for (const m of body.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12);
    expect(body).not.toMatch(/100vh/);
    for (const m of body.matchAll(/min-height:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(44);
  });
  it('结算演出的几段都在：框落下、横幅、星星后淡入、按钮最后淡入、三星光芒、失败更安静', () => {
    for (const k of ['hd-resin', 'hd-banner', 'hd-rise', '--sd', '--fin', 'hd-s3', 'hd-lose', 'prefers-reduced-motion']) expect(css).toContain(k);
  });
  it('按钮按下去再弹回来', () => {
    expect(body).toMatch(/\.hd-btn:active:not\(:disabled\)\s*\{[^}]*translateY\(3px\)/);
    expect(body).toMatch(/\.hd-btn\s*\{[^}]*cubic-bezier/);
  });
});

describe('关卡天气（只在画面层查，不改关卡数据）', () => {
  it('雾关是雾、首领关是黄昏、暴潮之夜是夜，普通关晴', () => {
    const lv = (id: string) => tdCampaign().find((l) => l.id === id);
    expect(weatherOf(lv('td01'))).toBe('clear');
    expect(weatherOf(lv('td04'))).toBe('fog');
    expect(weatherOf(lv('td06'))).toBe('dusk');
    expect(weatherOf(lv('td12'))).toBe('night');
    expect(weatherOf(lv('td18'))).toBe('dusk');
    expect(weatherOf(undefined)).toBe('clear');
  });
  it('第二章带雾区的关都不是晴天', () => {
    for (const l of tdCampaign()) if (l.fogZones?.length) expect(weatherOf(l)).not.toBe('clear');
  });
});

describe('底部卡和技能钮的三态', () => {
  const css = skinCss();
  it('选中上浮加金光、冷却或充能暗化加进度、不可用去饱和加锁', () => {
    expect(css).toMatch(/\.hd-boat\.sel\s*\{[^}]*translateY\(-9px\)/);
    expect(css).toMatch(/\.hd-boat\.done\s*\{[^}]*grayscale\(1\)/);
    expect(css).toMatch(/\.hd-skill\.off\s*\{[^}]*saturate/);
    expect(css).toContain('.hd-skill.off::before');
    expect(css).toMatch(/\.hd-td-skill \.hd-cd\s*\{[^}]*conic-gradient/);
    expect(css).toMatch(/\.hd-td-skill\.off/);
  });
});
