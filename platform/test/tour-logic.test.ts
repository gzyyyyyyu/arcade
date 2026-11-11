import { describe, expect, it } from 'vitest';
import { nextStep, placeBubble, shouldShow, TOUR_STEPS, tourKey } from '../src/features/lobby-tour/tour-logic';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 27);

describe('shouldShow', () => {
  it('新账号且没存过记录才显示', () => {
    expect(shouldShow({ id: 'u', createdAt: NOW - DAY }, NOW, null)).toBe(true);
    expect(shouldShow({ id: 'u', createdAt: NOW - 7 * DAY }, NOW, null)).toBe(true);
  });
  it('老账号、存过记录、没登录都不显示', () => {
    expect(shouldShow({ id: 'u', createdAt: NOW - 8 * DAY }, NOW, null)).toBe(false);
    expect(shouldShow({ id: 'u', createdAt: NOW }, NOW, 'done')).toBe(false);
    expect(shouldShow(null, NOW, null)).toBe(false);
    expect(shouldShow({ id: 'u', createdAt: Number.NaN }, NOW, null)).toBe(false);
  });
  it('key 按账号分开', () => {
    expect(tourKey('abc')).toBe('arcade.tour.abc');
  });
});

describe('nextStep', () => {
  const all = () => true;
  it('依次往后走，到头返回 -1', () => {
    expect(nextStep(TOUR_STEPS, -1, all)).toBe(0);
    expect(nextStep(TOUR_STEPS, 0, all)).toBe(1);
    expect(nextStep(TOUR_STEPS, 2, all)).toBe(-1);
  });
  it('跳过页面上没有的目标', () => {
    const noFriends = (t: string) => t !== 'friends';
    expect(nextStep(TOUR_STEPS, 0, noFriends)).toBe(1);
    expect(nextStep(TOUR_STEPS, 1, noFriends)).toBe(-1);
    expect(nextStep(TOUR_STEPS, -1, (t) => t === 'friends')).toBe(2);
    expect(nextStep(TOUR_STEPS, -1, () => false)).toBe(-1);
  });
});

describe('placeBubble', () => {
  const inset = { left: 0, top: 0, right: 0, bottom: 0 };
  const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });
  const inside = (p: ReturnType<typeof placeBubble>, vw: number, vh: number, h: number) => {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(vw);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y + h).toBeLessThanOrEqual(vh);
  };
  it('下方放得下就放下方，箭头对着目标中心', () => {
    const p = placeBubble(box(900, 20, 80, 40), { w: 1280, h: 800, inset }, { w: 320, h: 150 });
    expect(p.side).toBe('bottom');
    expect(p.y).toBeGreaterThan(60);
    expect(p.x + p.arrowX).toBeCloseTo(940, 0);
    inside(p, 1280, 800, 150);
  });
  it('下方放不下换上方', () => {
    const p = placeBubble(box(100, 700, 120, 44), { w: 1280, h: 800, inset }, { w: 320, h: 150 });
    expect(p.side).toBe('top');
    expect(p.y + 150).toBeLessThanOrEqual(700);
  });
  it('目标贴右边时夹进屏幕，箭头仍在气泡内', () => {
    const p = placeBubble(box(1230, 20, 40, 40), { w: 1280, h: 800, inset }, { w: 320, h: 150 });
    inside(p, 1280, 800, 150);
    expect(p.arrowX).toBeLessThanOrEqual(p.width - 20);
  });
  it('320 宽手机占满宽度且不出界，尊重安全区', () => {
    const ins = { left: 10, top: 20, right: 10, bottom: 30 };
    const p = placeBubble(box(250, 300, 60, 44), { w: 320, h: 568, inset: ins }, { w: 320, h: 180 });
    expect(p.width).toBe(320 - 20 - 24);
    expect(p.x).toBeGreaterThanOrEqual(10 + 12);
    expect(p.x + p.width).toBeLessThanOrEqual(320 - 10 - 12);
    expect(p.y + 180).toBeLessThanOrEqual(568 - 30 - 12);
    expect(p.y).toBeGreaterThanOrEqual(20 + 12);
  });
  it('两边都放不下时取空间大的一边并夹进屏幕', () => {
    const p = placeBubble(box(10, 200, 100, 44), { w: 390, h: 400, inset }, { w: 320, h: 300 });
    expect(p.y).toBeGreaterThanOrEqual(12);
    expect(p.y + 300).toBeLessThanOrEqual(400 - 12);
  });
});
