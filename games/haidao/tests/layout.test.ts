import { describe, expect, it } from 'vitest';
import { layoutCss } from '../src/view/layout.ts';

describe('排布样式（layout.ts）', () => {
  const css = layoutCss();
  it('刘海和圆角：界面缩进、静音钮、底栏都用 safe-area 带兜底值', () => {
    expect(css).toContain('env(safe-area-inset-top,0px)');
    expect(css).toContain('env(safe-area-inset-left,0px)');
    expect(css).toContain('env(safe-area-inset-bottom,0px)');
    expect(css).not.toMatch(/env\(safe-area-inset-[a-z]+\)/);
  });
  it('电脑：悬停态只在有鼠标时生效，数字键角标只在有鼠标时显示', () => {
    expect(css).toContain('@media (hover:hover) and (pointer:fine)');
    expect(css).toMatch(/\.hd-key \{ display:none; \}/);
  });
  it('三种屏幕的断点都在：宽屏并一行、手机横屏侧边、手机竖屏压缩', () => {
    expect(css).toContain('@media (min-width:560px)');
    expect(css).toContain('@media (orientation:landscape) and (max-height:500px)');
    expect(css).toContain('@media (max-width:559px) and (orientation:portrait)');
  });
});
