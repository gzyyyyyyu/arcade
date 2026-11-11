import { describe, expect, it } from 'vitest';
import { centerAfterZoom, clampZoom, DRAG_PX, exceedsDrag, isTap } from '../src/view/camgesture.ts';

describe('点和拖的判定', () => {
  it('触屏阈值比鼠标宽', () => {
    expect(DRAG_PX.touch).toBeGreaterThan(DRAG_PX.mouse);
    expect(exceedsDrag(8, 0, true)).toBe(false);
    expect(exceedsDrag(8, 0, false)).toBe(true);
    expect(exceedsDrag(6, 0, false)).toBe(false);
    expect(exceedsDrag(7, 8, true)).toBe(true);
  });
  it('没动算点，动过、捏合、被接管、长按都不算', () => {
    const base = { moved: false, multi: false, dragging: false, heldMs: 120 };
    expect(isTap(base)).toBe(true);
    expect(isTap({ ...base, moved: true })).toBe(false);
    expect(isTap({ ...base, multi: true })).toBe(false);
    expect(isTap({ ...base, dragging: true })).toBe(false);
    expect(isTap({ ...base, heldMs: 700 })).toBe(false);
  });
});

describe('缩放', () => {
  it('夹在上下限', () => {
    expect(clampZoom(0.1, 0.2, 1.6)).toBe(0.2);
    expect(clampZoom(3, 0.2, 1.6)).toBe(1.6);
    expect(clampZoom(1, 0.2, 1.6)).toBe(1);
  });
  it('缩放后指定屏幕点下的世界点不动', () => {
    const w = 800;
    const h = 600;
    const cam = { cx: 100, cy: 50, k: 1 };
    const sx = 600;
    const sy = 150;
    const wp = { x: cam.cx + (sx - w / 2) / cam.k, y: cam.cy + (sy - h / 2) / cam.k };
    const k2 = 2.5;
    const c = centerAfterZoom(wp, sx, sy, k2, w, h);
    expect(c.cx + (sx - w / 2) / k2).toBeCloseTo(wp.x);
    expect(c.cy + (sy - h / 2) / k2).toBeCloseTo(wp.y);
  });
});
