import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, TILT_MAX, buyDropSlots, clickSuppressed, dragEnded, dragStarted, easeTilt, inRect, outsideArea, pastThreshold, resetClickSuppress, slotAt, tiltDeg } from '../../src/view/trade/dragGeo.ts';
import { KEY_ROWS, isKeysHelpKey } from '../../src/view/keys.ts';

/** 拖拽的命中判断、倾斜、点击抑制：都是纯函数，不碰 Phaser。 */

const slots = [
  { x: 266, y: 232, w: 160, h: 222 },
  { x: 442, y: 232, w: 160, h: 222 },
  null,
  { x: 610, y: 232, w: 160, h: 222 },
];

describe('开始拖的门槛', () => {
  it('挪不到门槛不算拖（手抖的点击），到了才算，斜着挪按直线距离', () => {
    expect(pastThreshold(3, 4)).toBe(false);
    expect(pastThreshold(DRAG_THRESHOLD, 0)).toBe(true);
    expect(pastThreshold(0, -DRAG_THRESHOLD)).toBe(true);
    expect(pastThreshold(6, 6)).toBe(true); // √72 ≈ 8.5
    expect(pastThreshold(5, 5)).toBe(false);
  });
});

describe('落在哪一格', () => {
  it('点在格子里返回序号，格子之间的空隙、区外返回 -1；null 的格子不算', () => {
    expect(slotAt(slots, 300, 300)).toBe(0);
    expect(slotAt(slots, 500, 232)).toBe(1);
    expect(slotAt(slots, 432, 300)).toBe(-1);
    expect(slotAt(slots, 100, 300)).toBe(-1);
    expect(slotAt([null], 0, 0)).toBe(-1);
  });
  it('命中区可以放大（手指拖进去不用太准）', () => {
    expect(slotAt(slots, 432, 300, 6)).toBe(0);
    expect(inRect(slots[0]!, 262, 228, 4)).toBe(true);
    expect(inRect(slots[0]!, 262, 228, 3)).toBe(false);
  });
});

describe('拖出持仓区才卖', () => {
  const area = { x: 266, y: 232, w: 692, h: 222 };
  it('区里不卖；贴着边在余量里也不卖；明显出去了才卖', () => {
    expect(outsideArea(area, 600, 300)).toBe(false);
    expect(outsideArea(area, 266 - 8, 300)).toBe(false);
    expect(outsideArea(area, 266 - 13, 300)).toBe(true);
    expect(outsideArea(area, 600, 232 + 222 + 40)).toBe(true);
    expect(outsideArea(area, 600, 100)).toBe(true);
  });
});

describe('倾斜', () => {
  it('往右拖往右歪、往左拖往左歪，限制在最大角度内', () => {
    expect(tiltDeg(5)).toBeGreaterThan(0);
    expect(tiltDeg(-5)).toBeLessThan(0);
    expect(tiltDeg(0)).toBe(0);
    expect(tiltDeg(500)).toBe(TILT_MAX);
    expect(tiltDeg(-500)).toBe(-TILT_MAX);
  });
  it('倾斜角每帧往目标靠，足够近就吸附（停下来能回正）', () => {
    let a = 10;
    for (let i = 0; i < 40; i++) a = easeTilt(a, 0);
    expect(a).toBe(0);
    expect(easeTilt(0, 10)).toBeCloseTo(3.5);
  });
});

describe('推荐卡能放进哪几格', () => {
  const held = (...f: boolean[]) => f.map((filled) => ({ filled }));
  it('能直接买：只有空格能放', () => {
    expect(buyDropSlots(held(true, false, true, false), 'buy')).toEqual([1, 3]);
  });
  it('满仓换股：每个有持仓的格子都能放', () => {
    expect(buyDropSlots(held(true, true, true), 'replace')).toEqual([0, 1, 2]);
  });
  it('买不了：哪都不能放', () => {
    expect(buyDropSlots(held(false, false), null)).toEqual([]);
  });
});

describe('点击抑制', () => {
  it('拖着的时候和刚松手的 150 毫秒里不算点击，过了才恢复', () => {
    resetClickSuppress();
    expect(clickSuppressed(1000)).toBe(false);
    dragStarted();
    expect(clickSuppressed(1000)).toBe(true);
    expect(clickSuppressed(9e9)).toBe(true);
    dragEnded(2000);
    expect(clickSuppressed(2100)).toBe(true);
    expect(clickSuppressed(2150)).toBe(false);
    resetClickSuppress();
  });
});

describe('快捷键一览', () => {
  const k = (o: Partial<Parameters<typeof isKeysHelpKey>[0]>) => ({ code: '', key: '', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...o });
  it('H 和 ? 打开；带 Ctrl / Alt / Meta 的不管', () => {
    expect(isKeysHelpKey(k({ code: 'KeyH', key: 'h' }))).toBe(true);
    expect(isKeysHelpKey(k({ code: 'Slash', key: '?', shiftKey: true }))).toBe(true);
    expect(isKeysHelpKey(k({ code: 'Slash', key: '/' }))).toBe(false);
    expect(isKeysHelpKey(k({ code: 'KeyH', ctrlKey: true }))).toBe(false);
    expect(isKeysHelpKey(k({ code: 'KeyG', key: 'g' }))).toBe(false);
  });
  it('一览里有任务要求的每一类键，每行都有键和说明', () => {
    const all = KEY_ROWS.flatMap((r) => r.keys).join(' ');
    for (const want of ['空格', 'F', '1', 'Shift + 1', '← → ↑ ↓', 'Tab', '回车', 'Esc', '右键', 'H']) expect(all, want).toContain(want);
    for (const r of KEY_ROWS) {
      expect(r.keys.length).toBeGreaterThan(0);
      expect(r.what.length).toBeGreaterThan(3);
    }
  });
});
