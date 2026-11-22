import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRUSH_CHARS } from '../../src/view/ui/brushChars.ts';
import { CURSES } from '../../src/content/meta.ts';
import { MAP_EVENTS } from '../../src/content/mapEvents.ts';

// 毛笔字体是子集：横幅里用到的字不在子集里就会退回后备字体，画风一下就破了
describe('毛笔字子集', () => {
  it('HUD 里用毛笔字写的字都在子集里', () => {
    for (const ch of '0123456789连斩!') expect(BRUSH_CHARS).toContain(ch);
  });
  it('界面标题和横幅里的毛笔字都在子集里', () => {
    // 暂停、结算标题，模式卡，升级卡片，出场预警（banner.ts、screens.ts、cards.ts、GameScene.ts 里用 YxBrush 的文案）
    for (const s of ['暂停', '天亮了', '尸王伏诛', '倒下了', '收工', '夜巡', '守夜', '夜探', '升到级', '宝箱·挑一件', '尸王来了', '石狮怪', '跳尸将军', '白狐', '纸轿', '纸扎老爷来了', '老爷翻脸', '尸王发怒', '尸王发狂', '+30', '封']) {
      for (const ch of s) expect(BRUSH_CHARS, s).toContain(ch);
    }
  });
  it('咒印名、地图事件和血月的横幅都在子集里', () => {
    // 开局准备的咒印卡和事件预告横幅用 YxBrush；表里新加一条就自动查到
    const names = [...Object.values(CURSES).map((c) => c.name), ...Object.values(MAP_EVENTS).map((e) => e.name), '血月'];
    for (const s of names) for (const ch of s) expect(BRUSH_CHARS, s).toContain(ch);
  });
  it('横幅（banners.say）里写死的字都在子集里', () => {
    // 拼进来的名字（宝物、怪）不查：不在子集里的整条换粗体（banner.ts brushOk）
    const dir = new URL('../../src/view/', import.meta.url);
    const files = readdirSync(dir, { recursive: true }).filter((f): f is string => typeof f === 'string' && f.endsWith('.ts'));
    let n = 0;
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      for (const m of src.matchAll(/\.say\(\s*(?:[^,]*\?\s*)?([`'])((?:[^`'\\]|\\.)*?)\1/g)) {
        n++;
        for (const ch of m[2]!.replace(/\$\{[^}]*\}/g, '')) if (/[\u3000-\u9fff\uff00-\uffef%]/.test(ch)) expect(BRUSH_CHARS, `${f}：${m[2]}`).toContain(ch);
      }
    }
    expect(n).toBeGreaterThan(40);
  });
  it('子集字体文件存在且不大', () => {
    const url = new URL('../../public/fonts/brush.woff2', import.meta.url);
    expect(existsSync(url)).toBe(true);
    expect(readFileSync(url).length).toBeLessThan(120 * 1024);
  });
});
