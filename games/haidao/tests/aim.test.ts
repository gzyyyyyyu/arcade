import { describe, expect, it } from 'vitest';
import {
  DIRS, FLAME, ROPE_BACK_MS, SNAP_EPS, TURRET_KINDS, TURRET_SPEC, aimSnap, aimStep, arcHeight, arcLift, arcSlope, dirAngle, dirIndex, dirResidual, flameStep, flightK, groundAngle,
  isoVec, musketPose, recoilAt, ropeBack, screenAngle, shadowLook, shakeAt, tipOffset, wrapPi, type AimState,
} from '../src/view/aim.ts';
import { iso } from '../src/view/iso.ts';

const F = 1000 / 60;

describe('等距方向', () => {
  it('地面角和屏幕位移互逆；isoVec 和 iso() 一致', () => {
    for (let a = -3; a <= 3; a += 0.37) {
      const v = isoVec(a);
      expect(wrapPi(groundAngle(v[0], v[1]) - a)).toBeCloseTo(0, 6);
      const p = iso(Math.cos(a), Math.sin(a));
      expect(v[0]).toBeCloseTo(p.x, 6);
      expect(v[1]).toBeCloseTo(p.y, 6);
    }
  });
  it('方向帧 + 剩余转角 = 真实朝向；剩余转角不超过半格对应的屏幕角', () => {
    for (let a = -Math.PI; a < Math.PI; a += 0.013) {
      const i = dirIndex(a);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(DIRS);
      const res = dirResidual(a, i);
      expect(wrapPi(screenAngle(dirAngle(i)) + res - screenAngle(a))).toBeCloseTo(0, 6);
      expect(Math.abs(res)).toBeLessThan(0.45);
    }
  });
  it('炮口点：转一整圈逐帧连续（相邻方向帧之间没有跳）', () => {
    const o = { x: 0, y: 0 };
    let px = NaN;
    let py = NaN;
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      tipOffset(o, a, 0.8, 15, 1.4);
      if (!Number.isNaN(px)) expect(Math.hypot(o.x - px, o.y - py)).toBeLessThan(1.5);
      px = o.x;
      py = o.y;
    }
  });
});

describe('炮管转向', () => {
  it('每种塔：按 1/60 秒逐帧，转角步长 ≤ 最高转速 / 60，最后停在目标、不过冲', () => {
    for (const k of TURRET_KINDS) {
      const sp = TURRET_SPEC[k];
      const st: AimState = { a: 0, v: 0 };
      const target = 2.6;
      let maxStep = 0;
      let over = false;
      let n = 0;
      for (; n < 600 && (st.a !== target || st.v !== 0); n++) {
        const d = aimStep(st, target, F, sp);
        maxStep = Math.max(maxStep, Math.abs(d));
        if (st.a > target + 1e-9) over = true;
      }
      expect(st.a).toBeCloseTo(target, 9);
      expect(over).toBe(false);
      expect(maxStep).toBeLessThanOrEqual(sp.w / 60 + 1e-9);
      // 用时 ≥ 按最高速直接转过去（有加速段），但不拖太久
      expect(n).toBeGreaterThan((2.6 / sp.w) * 60);
      expect(n).toBeLessThan((2.6 / sp.w) * 60 + (sp.w / sp.acc) * 60 * 2 + 4);
    }
  });
  it('缓入缓出：起转那几帧步长递增，到位前几帧递减（不是匀速硬切）', () => {
    const sp = TURRET_SPEC.cannon;
    const st: AimState = { a: 0, v: 0 };
    const steps: number[] = [];
    while (steps.length < 400 && (st.a !== 2 || st.v !== 0)) steps.push(aimStep(st, 2, F, sp));
    expect(steps[1]!).toBeGreaterThan(steps[0]!);
    expect(steps[3]!).toBeGreaterThan(steps[1]!);
    const tail = steps.slice(-6, -1);
    for (let i = 1; i < tail.length; i++) expect(tail[i]!).toBeLessThanOrEqual(tail[i - 1]! + 1e-9);
    // 相邻两帧的步长差（角加速度）有上限：不是瞬间到全速
    for (let i = 1; i < steps.length - 1; i++) expect(Math.abs(steps[i]! - steps[i - 1]!)).toBeLessThanOrEqual(sp.acc / 3600 + 1e-9 + 0.02);
  });
  it('走最短的一边：从 3 转到 -3 是跨过 ±π，不是绕一大圈', () => {
    const st: AimState = { a: 3, v: 0 };
    aimStep(st, -3, F, TURRET_SPEC.cannon);
    expect(st.a === 3 || Math.abs(wrapPi(st.a - 3)) < 0.1).toBe(true);
    expect(wrapPi(st.a - 3)).toBeGreaterThanOrEqual(0);
  });
  it('跟住移动目标：每帧步长仍有上限，误差收敛', () => {
    const sp = TURRET_SPEC.gunTower;
    const st: AimState = { a: 0, v: 0 };
    let err = 0;
    for (let n = 0; n < 300; n++) {
      const tgt = 1 + 0.6 * Math.sin(n / 40);
      const d = aimStep(st, tgt, F, sp);
      expect(Math.abs(d)).toBeLessThanOrEqual(sp.w / 60 + 1e-9);
      err = Math.abs(wrapPi(tgt - st.a));
    }
    expect(err).toBeLessThan(0.08);
  });
  it('要开火了：按剩余时间加急（≤ wMax / 60 每帧），到开火那一帧已经对准，不用补', () => {
    const sp = TURRET_SPEC.cannon;
    const st: AimState = { a: 0, v: 0 };
    const total = 400;
    let maxStep = 0;
    for (let t = 0; t < total; t += F) maxStep = Math.max(maxStep, Math.abs(aimStep(st, 2.4, F, sp, total - t)));
    expect(maxStep).toBeLessThanOrEqual(sp.wMax / 60 + 1e-9);
    expect(maxStep).toBeGreaterThan(sp.w / 60);
    expect(aimSnap(st, 2.4)).toBe(0);
  });
  it('真来不及时开火那一帧补完剩余角度；差得少不补', () => {
    const st: AimState = { a: 0, v: 1 };
    expect(aimSnap(st, SNAP_EPS * 0.5)).toBe(0);
    expect(st.a).toBe(0);
    expect(aimSnap(st, 1)).toBeCloseTo(1, 9);
    expect(st.a).toBeCloseTo(1, 9);
    expect(st.v).toBe(0);
  });
  it('冻住（dt = 0）不动', () => {
    const st: AimState = { a: 0.3, v: 2 };
    expect(aimStep(st, 2, 0, TURRET_SPEC.mortar)).toBe(0);
    expect(st.a).toBe(0.3);
  });
});

describe('开火序列', () => {
  it('预备后缩 → 猛地顶到底 → 慢慢回位；逐帧连续，出手比收手快', () => {
    for (const k of ['cannon', 'mortar', 'harpoon', 'rocket', 'gunTower'] as const) {
      const sp = TURRET_SPEC[k];
      const xs: number[] = [];
      // 开火前 300ms 到开火后 600ms，下一枪在 2 秒后
      for (let t = -300; t <= 600; t += F) xs.push(t < 0 ? recoilAt(-1, -t, sp) : recoilAt(t, 2000 - t, sp));
      const i0 = Math.round(300 / F);
      expect(xs[0]).toBe(0);
      expect(xs[i0 - 1]!).toBeLessThan(-sp.prep * 0.6);
      expect(Math.min(...xs)).toBeCloseTo(-sp.recoil, 1);
      expect(xs[xs.length - 1]).toBeCloseTo(0, 6);
      for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i]! - xs[i - 1]!)).toBeLessThan(sp.recoil * 0.6);
      expect(sp.kick).toBeLessThan(sp.ret);
    }
  });
  it('装填很快时预备和余势重叠也连续（取更靠后的那个）', () => {
    const sp = TURRET_SPEC.gunTower;
    let last = recoilAt(0, 240, sp);
    for (let t = F; t < 240; t += F) {
      const x = recoilAt(t, 240 - t, sp);
      expect(Math.abs(x - last)).toBeLessThan(sp.recoil * 0.6);
      last = x;
    }
  });
  it('底座震动：开火后一两下就停，幅度不超过设定', () => {
    const sp = TURRET_SPEC.mortar;
    for (let t = 0; t < sp.shakeMs; t += F) expect(Math.abs(shakeAt(t, sp))).toBeLessThanOrEqual(sp.shake);
    expect(shakeAt(sp.shakeMs, sp)).toBe(0);
    expect(shakeAt(-5, sp)).toBe(0);
  });
});

describe('火枪手、喷火、鱼叉', () => {
  it('火枪手：竖起枪装填（通条捅两下）→ 放平 → 端稳，逐帧连续', () => {
    const p = { lift: 0, ram: 0, lean: 0 };
    let last = { lift: 0, ram: 0 };
    let maxLift = 0;
    let rams = 0;
    let prevRam = 0;
    let rising = false;
    for (let t = 0; t <= 1000; t += F) {
      musketPose(p, t, 1000);
      maxLift = Math.max(maxLift, p.lift);
      expect(Math.abs(p.lift - last.lift)).toBeLessThan(0.3);
      if (p.ram > prevRam) rising = true;
      else if (rising && p.ram < prevRam) {
        rams++;
        rising = false;
      }
      prevRam = p.ram;
      last = { lift: p.lift, ram: p.ram };
    }
    expect(maxLift).toBeGreaterThan(0.9);
    expect(rams).toBeGreaterThanOrEqual(2);
    expect(musketPose(p, 990, 1000).lift).toBe(0);
  });
  it('喷火：起势快、收尾慢，都不是一下到位', () => {
    let l = 0;
    let n = 0;
    while (l < 1) {
      l = flameStep(l, true, F);
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(Math.floor(FLAME.rise / F));
    let m = 0;
    while (l > 0) {
      l = flameStep(l, false, F);
      m++;
    }
    expect(m).toBeGreaterThan(n);
  });
  it('鱼叉收回：叉头从命中点回到炮口，绳子中途下垂、收完拉直', () => {
    expect(ropeBack(0)[0]).toBe(1);
    expect(ropeBack(1)[0]).toBe(0);
    expect(ropeBack(0.3)[1]).toBeGreaterThan(2);
    let last = 1;
    for (let t = 0; t <= ROPE_BACK_MS; t += F) {
      const [rest] = ropeBack(t / ROPE_BACK_MS);
      expect(rest).toBeLessThanOrEqual(last + 1e-9);
      last = rest;
    }
  });
});

describe('弹道', () => {
  it('起点是炮口高度、终点是命中高度；按 1/60 秒逐帧连续、没有跳点', () => {
    for (const kind of ['ball', 'mortar', 'bullet', 'rocket']) {
      const dist = 180;
      const h = arcHeight(kind, dist);
      const e0 = 22;
      const e1 = 10;
      expect(arcLift(0, e0, e1, h)).toBe(e0);
      expect(arcLift(1, e0, e1, h)).toBe(e1);
      // 规则 20 拍 / 秒，飞 12 拍；画面逐帧算
      const t0 = 100;
      const t1 = 112;
      let px = NaN;
      let py = NaN;
      for (let f = 0; f <= 36; f++) {
        const k = flightK(t0 + (f * 20) / 60, t0, t1);
        const x = dist * k;
        const y = -arcLift(k, e0, e1, h);
        if (!Number.isNaN(px)) expect(Math.hypot(x - px, y - py)).toBeLessThan(dist / 36 + (h * 4) / 36 + 2);
        px = x;
        py = y;
      }
    }
  });
  it('臼炮弧最高，加农炮低平，子弹几乎直线', () => {
    expect(arcHeight('mortar', 200)).toBeGreaterThan(arcHeight('ball', 200) * 3);
    expect(arcHeight('bullet', 200)).toBe(0);
  });
  it('切线：弧顶处是平的，起点往上、终点往下', () => {
    expect(arcSlope(0.5, 10, 10, 50)).toBeCloseTo(0, 9);
    expect(arcSlope(0, 10, 10, 50)).toBeGreaterThan(0);
    expect(arcSlope(1, 10, 10, 50)).toBeLessThan(0);
  });
  it('阴影：贴地最大最浓，越高越小越淡', () => {
    const [s0, a0] = shadowLook(0, 100);
    const [s1, a1] = shadowLook(100, 100);
    expect(s0).toBe(1);
    expect(s1).toBeLessThan(0.5);
    expect(a1).toBeLessThan(a0);
  });
});
