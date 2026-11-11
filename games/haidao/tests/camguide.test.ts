import { describe, expect, it } from 'vitest';
import { EDGE_PAD, EDGE_STEP, INTRO_HOLD, INTRO_PUSH, camAt, edgeMarks, focusCx, type EdgeItem } from '../src/view/camguide.ts';

const view = { l: 0, t: 100, r: 390, b: 760 };
const item = (kind: EdgeItem['kind'], sx: number, sy: number): EdgeItem => ({ kind, sx, sy, wx: sx * 2, wy: sy * 2 });

describe('开场镜头时间线', () => {
  const from = { cx: 0, cy: 0, z: 0.2 };
  const to = { cx: 300, cy: 50, z: 0.5 };
  it('先停 1 秒整岛全景，再推到落点', () => {
    expect(INTRO_HOLD).toBe(1000);
    expect(camAt(0, from, to)).toEqual({ view: from, done: false });
    expect(camAt(INTRO_HOLD - 1, from, to).view).toEqual(from);
    const end = camAt(INTRO_HOLD + INTRO_PUSH, from, to);
    expect(end).toEqual({ view: to, done: true });
  });
  it('推的过程缩放和位置单调、不过冲', () => {
    let last = from;
    for (let t = INTRO_HOLD; t <= INTRO_HOLD + INTRO_PUSH; t += 50) {
      const v = camAt(t, from, to).view;
      expect(v.z).toBeGreaterThanOrEqual(last.z - 1e-12);
      expect(v.cx).toBeGreaterThanOrEqual(last.cx - 1e-12);
      expect(v.z).toBeLessThanOrEqual(to.z + 1e-12);
      last = v;
    }
  });
  it('不停直接移（点边缘箭头）', () => {
    expect(camAt(0, from, to, 0, 300).view).toEqual(from);
    expect(camAt(150, from, to, 0, 300).view.cx).toBeCloseTo(150, 5);
    expect(camAt(300, from, to, 0, 300).done).toBe(true);
  });
});

describe('推镜落点', () => {
  const content = { l: -1000, r: 1000 };
  it('可见区中线对准登陆口，但不越出内容盒左右', () => {
    // 屏宽 390、z 0.5：可见宽 780 世界单位
    expect(focusCx(0, content, 0.5, 390)).toBeCloseTo(0);
    expect(focusCx(-900, content, 0.5, 390)).toBeCloseTo(-1000 + 390);
    expect(focusCx(5000, content, 0.5, 390)).toBeCloseTo(1000 - 390);
  });
  it('内容盒比可见区窄就居中', () => {
    expect(focusCx(-900, { l: -100, r: 300 }, 0.5, 390)).toBeCloseTo(100);
  });
  it('两侧扣的宽不一样时按可见区中线算', () => {
    const cx = focusCx(0, content, 0.5, 390, 0, 90);
    // 可见区中线在屏幕 150 像素处，落点 0 要在那里
    expect((0 - cx) * 0.5 + 195).toBeCloseTo(150);
  });
});

describe('屏外指示', () => {
  it('屏内的不出指示', () => {
    expect(edgeMarks([item('enemy', 100, 300), item('slot', 389, 759)], view)).toEqual([]);
  });
  it('左右上下各归到对应的边，位置在边缘轨道上，方向指向它', () => {
    const ms = edgeMarks([item('enemy', -200, 430), item('enemy', 600, 430), item('enemy', 195, 0), item('enemy', 195, 900)], view);
    const by = Object.fromEntries(ms.map((m) => [m.side, m]));
    expect(Object.keys(by).sort()).toEqual(['b', 'l', 'r', 't']);
    expect(by.l!.x).toBe(view.l + EDGE_PAD);
    expect(by.r!.x).toBe(view.r - EDGE_PAD);
    expect(by.t!.y).toBe(view.t + EDGE_PAD);
    expect(by.b!.y).toBe(view.b - EDGE_PAD);
    expect(by.l!.dx).toBeLessThan(0);
    expect(by.b!.dy).toBeGreaterThan(0);
  });
  it('同一段的合成一个，带数量和世界中心；敌人和空木台分开', () => {
    const ms = edgeMarks([item('enemy', -50, 400), item('enemy', -80, 410), item('enemy', -60, 420), item('slot', -50, 400)], view);
    const en = ms.filter((m) => m.kind === 'enemy');
    expect(en).toHaveLength(1);
    expect(en[0]!.n).toBe(3);
    expect(en[0]!.wx).toBeCloseTo((-100 - 160 - 120) / 3);
    expect(ms.filter((m) => m.kind === 'slot')).toHaveLength(1);
    expect(ms[0]!.kind).toBe('enemy');
  });
  it('三种标记各自成组，排序固定：敌人、空木台、路口', () => {
    const ms = edgeMarks([item('gate', -50, 400), item('slot', -50, 400), item('enemy', -50, 400), item('gate', -60, 410)], view);
    expect(ms.map((m) => m.kind)).toEqual(['enemy', 'slot', 'gate']);
    expect(ms.find((m) => m.kind === 'gate')!.n).toBe(2);
  });
  it('同一边上不同段的指示相隔至少一段，不叠在一起', () => {
    const items = Array.from({ length: 40 }, (_, i) => item('enemy', -100, 100 + i * 17));
    const ms = edgeMarks(items, view).filter((m) => m.side === 'l');
    expect(ms.length).toBeGreaterThan(3);
    for (let i = 1; i < ms.length; i++) expect(ms[i]!.y - ms[i - 1]!.y).toBeGreaterThanOrEqual(EDGE_STEP - 1e-9);
    expect(ms.reduce((n, m) => n + m.n, 0)).toBeLessThanOrEqual(40);
  });
  it('结果确定（顺序不随输入顺序变）', () => {
    const a = [item('slot', 500, 200), item('enemy', -10, 300), item('enemy', 200, 1000)];
    expect(edgeMarks(a, view)).toEqual(edgeMarks([...a].reverse(), view));
  });
});
