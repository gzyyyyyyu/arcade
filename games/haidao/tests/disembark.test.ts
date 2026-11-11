import { describe, expect, it } from 'vitest';
import { HOP_H, HOP_MS, RAFT_OFFSHORE, SLIDE_MS, WADE_MS, allOffAt, deckSlot, disembark, endOf, hopStart, raftAlpha, raftPos, totalMs, type Disp } from '../src/view/disembark.ts';

const D = (): Disp => ({ x: 0, y: 0, oy: 0, sq: 0, hold: false, wading: false, done: false });
const shore = { x: 100, y: 50 };
const away = { x: 0.6, y: 0.8 };
const raft = { x: shore.x + away.x * RAFT_OFFSHORE, y: shore.y + away.y * RAFT_OFFSHORE };
const rule = { x: 90, y: 40 };

describe('下船时间线', () => {
  it('整段不超过约 1 秒，兵再多也一样', () => {
    for (const n of [1, 2, 5, 9, 30]) expect(totalMs(n)).toBeLessThanOrEqual(1000);
  });
  it('兵一个个错开，间隔不超过 60 毫秒，起跳都在木筏靠岸之后', () => {
    for (let i = 1; i < 5; i++) expect(hopStart(i, 5) - hopStart(i - 1, 5)).toBeLessThanOrEqual(60);
    expect(hopStart(0, 5)).toBe(SLIDE_MS);
    expect(endOf(4, 5)).toBe(hopStart(4, 5) + HOP_MS + WADE_MS);
  });
  it('最后一个兵下完之后木筏才开始淡掉', () => {
    const n = 4;
    expect(raftAlpha(allOffAt(n) - 1, n)).toBe(1);
    expect(raftAlpha(allOffAt(n) + 400, n)).toBe(0);
  });
  it('木筏滑到停靠点后不动，兵下完后往海里退', () => {
    const from = { x: 200, y: 200 };
    const p = { x: 0, y: 0 };
    raftPos(p, SLIDE_MS, from, raft, 3, away);
    expect(p.x).toBeCloseTo(raft.x);
    raftPos(p, allOffAt(3) + 400, from, raft, 3, away);
    expect(Math.hypot(p.x - raft.x, p.y - raft.y)).toBeGreaterThan(20);
  });
});

describe('下船位移', () => {
  const at = (t: number, i = 0, n = 3, r = rule): Disp => disembark(D(), t, i, n, raft, shore, away, r);
  it('起跳前坐在筏上，走路循环不推进', () => {
    const d = at(10, 2);
    const s = deckSlot({ x: 0, y: 0 }, 2, 3);
    expect(d.hold).toBe(true);
    expect(d.x).toBeCloseTo(raft.x + s.x);
  });
  it('跳的时候抬高，落水时压扁，涉水时才溅水', () => {
    const s = hopStart(0, 3);
    expect(at(s + HOP_MS / 2).oy).toBeCloseTo(HOP_H);
    expect(at(s + HOP_MS + 60).sq).toBeGreaterThan(0.1);
    expect(at(s + HOP_MS + 60).wading).toBe(true);
    expect(at(s + 10).wading).toBe(false);
  });
  it('演完正好落在规则位置，偏差为 0', () => {
    const d = at(endOf(0, 3), 0, 3);
    expect(d.done).toBe(true);
    expect(d.x).toBe(rule.x);
    expect(d.y).toBe(rule.y);
  });
  it('涉水时终点跟着规则位置走（兵已经在走路也不会错开）', () => {
    const t = hopStart(0, 3) + HOP_MS + WADE_MS - 1;
    const d = at(t, 0, 3, { x: 300, y: 80 });
    expect(Math.hypot(d.x - 300, d.y - 80)).toBeLessThan(2);
  });
  it('显示位置从筏到规则位置连续，没有大跳', () => {
    let px = NaN;
    let py = NaN;
    for (let t = 0; t <= totalMs(3); t += 16) {
      const d = at(t, 1, 3);
      if (!Number.isNaN(px)) expect(Math.hypot(d.x - px, d.y - py)).toBeLessThan(14);
      px = d.x;
      py = d.y;
    }
  });
});
