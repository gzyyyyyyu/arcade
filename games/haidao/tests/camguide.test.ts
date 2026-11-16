import { describe, expect, it } from 'vitest';
import { AUTO_DEAD, AUTO_SETTLE, EDGE_PAD, EDGE_STEP, GROUP_R, INTRO_HOLD, INTRO_PUSH, autoStep, biggestCluster, camAt, centerFor, edgeMarks, focusCx, frameFocus, groupAround, type EdgeItem } from '../src/view/camguide.ts';

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

describe('自动构图', () => {
  it('主组：锚点周围 GROUP_R 以内的点取中心，远处的不算', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 5000, y: 0 }];
    expect(groupAround(pts, pts[0]!)).toEqual({ x: 50, y: 0 });
    expect(groupAround([], { x: 7, y: 8 })).toEqual({ x: 7, y: 8 });
  });
  it('最大的一簇：三个挤在一起的比两个散的多，取前者；没有点为 null', () => {
    const pts = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2050, y: 0 }, { x: 2100, y: 0 }, { x: 4000, y: 0 }];
    expect(biggestCluster(pts)).toEqual({ x: 2050, y: 0 });
    expect(biggestCluster([])).toBeNull();
    expect(GROUP_R).toBeGreaterThan(100);
  });
  it('主组和目标放得进可见区八成就框中间，放不下只看主组', () => {
    expect(frameFocus({ x: 0, y: 0 }, { x: 200, y: 100 }, 400, 600)).toEqual({ x: 100, y: 50 });
    expect(frameFocus({ x: 0, y: 0 }, { x: 900, y: 0 }, 400, 600)).toEqual({ x: 0, y: 0 });
    expect(frameFocus({ x: 3, y: 4 }, null, 400, 600)).toEqual({ x: 3, y: 4 });
  });
  it('centerFor 让目标落在可见区正中', () => {
    const vis = { l: 0, t: 100, r: 400, b: 700 };
    expect(centerFor(1000, 500, vis, 400, 800, 2)).toEqual({ cx: 1000, cy: 500 });
    expect(centerFor(1000, 500, { l: 0, t: 200, r: 400, b: 800 }, 400, 800, 2).cy).toBe(500 - 100 / 2);
  });
  it('死区：偏一点不动，偏过可见宽的 AUTO_DEAD 才起步，起步后一路追到 AUTO_SETTLE 以内停下', () => {
    const vw = 1000;
    const cur = { cx: 0, cy: 0 };
    expect(autoStep(cur, { cx: vw * AUTO_DEAD * 0.9, cy: 0 }, false, 16, vw)).toEqual({ cx: 0, cy: 0, moving: false });
    let st = autoStep(cur, { cx: vw * 0.5, cy: 0 }, false, 16, vw);
    expect(st.moving).toBe(true);
    expect(st.cx).toBeGreaterThan(0);
    for (let i = 0; i < 400 && st.moving; i++) st = autoStep(st, { cx: vw * 0.5, cy: 0 }, st.moving, 16, vw);
    expect(st).toEqual({ cx: vw * 0.5, cy: 0, moving: false });
    // 起步后在死区以内也接着追（不会停在半路）
    expect(autoStep({ cx: vw * 0.45, cy: 0 }, { cx: vw * 0.5, cy: 0 }, true, 16, vw).moving).toBe(vw * 0.05 > vw * AUTO_SETTLE);
  });
  it('限速、单调、不过冲；减弱动态更慢；track 没有死区；dt 为 0 不动', () => {
    const vw = 1000;
    const a = autoStep({ cx: 0, cy: 0 }, { cx: 5000, cy: 0 }, true, 100, vw);
    expect(a.cx).toBeLessThanOrEqual(1.1 * vw * 0.1 + 1e-9);
    const r = autoStep({ cx: 0, cy: 0 }, { cx: 5000, cy: 0 }, true, 100, vw, { reduced: true });
    expect(r.cx).toBeLessThan(a.cx);
    let st = { cx: 0, cy: 0, moving: true };
    for (let i = 0; i < 300; i++) {
      const nx = autoStep(st, { cx: 600, cy: 0 }, st.moving, 16, vw);
      expect(nx.cx).toBeGreaterThanOrEqual(st.cx);
      expect(nx.cx).toBeLessThanOrEqual(600);
      st = nx;
    }
    expect(autoStep({ cx: 0, cy: 0 }, { cx: 50, cy: 0 }, false, 16, vw, { track: true }).cx).toBeGreaterThan(0);
    expect(autoStep({ cx: 0, cy: 0 }, { cx: 500, cy: 0 }, true, 0, vw)).toEqual({ cx: 0, cy: 0, moving: true });
  });
});
