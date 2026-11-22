import { describe, expect, it } from 'vitest';
import { newGuide } from '../../src/explore/guide.ts';
import { Raid } from '../../src/explore/raid.ts';
import { edgeArrow, walkSecs } from '../../src/explore/view/guide-hud.ts';

describe('夜探指引的画面计算', () => {
  it('箭头贴在屏幕边上（内缩），写门名和秒数；没有开着的门不画', () => {
    const raid = new Raid({ seed: 1, template: 'guzhen', danger: 2 });
    const g = newGuide();
    expect(edgeArrow(raid, g, 0, 0, 1280, 720)).toBeNull();
    Object.assign(g, { gate: 1, dist: 900, dirX: 1, dirY: 0 });
    const a = edgeArrow(raid, g, 3000, 0, 1280, 720)!;
    expect(a).toMatchObject({ x: 1280 - 48, y: 360, onScreen: false, label: '东门 · 10 秒' });
    Object.assign(g, { dirX: 0.6, dirY: -0.8 });
    const b = edgeArrow(raid, g, 100, -100, 844, 390)!;
    expect(b.y).toBeCloseTo(48, 9);
    expect(b.onScreen).toBe(true);
  });

  it('沿路走过去的秒数向上取整', () => {
    expect(walkSecs(91)).toBe(2);
  });
});
