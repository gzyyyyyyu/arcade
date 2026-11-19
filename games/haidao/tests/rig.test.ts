import { describe, expect, it } from 'vitest';
import {
  atkPhase,
  CROWD,
  DEATH_MS,
  deathAlpha,
  deathStyle,
  DIE_FLY,
  DIE_KNEEL,
  FLY_DMG,
  hatDrop,
  HIT,
  HIT_HEAVY,
  DEATH_CLIP,
  LOD_PX,
  newXf,
  onRest,
  pose,
  poseEvery,
  POSE_KEYS,
  RIG_KINDS,
  rigLod,
  sampleClip,
  SKEL,
  solveRig,
  strideOf,
  STYLE,
  WALK,
  WALK_SWING,
  zeroPose,
  type Clip,
} from '../src/view/rig.ts';

const loopClip: Clip = {
  loop: true,
  smooth: true,
  keys: [
    { t: 0, e: 'strike', p: pose({ armF: 0 }) },
    { t: 0.25, e: 'strike', p: pose({ armF: 10 }) },
    { t: 0.5, e: 'strike', p: pose({ armF: 0 }) },
    { t: 0.75, e: 'strike', p: pose({ armF: -10 }) },
  ],
};

describe('关键帧采样', () => {
  it('平滑循环：穿过关键帧、取模、首尾接得上', () => {
    const o = zeroPose();
    expect(sampleClip(o, loopClip, 0.25).armF).toBeCloseTo(10, 6);
    expect(sampleClip(o, loopClip, 0.75).armF).toBeCloseTo(-10, 6);
    expect(sampleClip(o, loopClip, 1.25).armF).toBeCloseTo(10, 6);
    expect(sampleClip(o, loopClip, -0.75).armF).toBeCloseTo(10, 6);
    const a = sampleClip(zeroPose(), loopClip, 0.9999).armF;
    const b = sampleClip(zeroPose(), loopClip, 0).armF;
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });

  it('逐帧插值：相邻 1/60 秒的姿势变化很小（没有瞬移）', () => {
    for (const kind of RIG_KINDS) {
      const st = STYLE[kind];
      for (const c of [st.walk, st.idle, st.attack, HIT, HIT_HEAVY, ...Object.values(DEATH_CLIP)]) {
        // 走路按最快的一步（约 0.6 秒一个循环）、待机按它的周期算
        const ms = c === st.walk ? 600 : c === st.idle ? 2600 : c.ms ?? 800;
        // 攻击出手那几帧最快（有刀光拖影补中间），其余动作每帧转动不超过 40 度
        const ang = c === st.attack ? 72 : 40;
        const steps = Math.ceil(ms / (1000 / 60));
        let prev = sampleClip(zeroPose(), c, 0);
        for (let i = 1; i <= steps; i++) {
          const cur = sampleClip(zeroPose(), c, i / steps);
          for (const ch of POSE_KEYS) {
            // 位移每帧不超过 6 个设计单位（身高约 46）
            const lim = ch === 'x' || ch === 'y' || ch === 'hipY' ? 6 : ch === 'sq' || ch === 'trail' || ch === 'turn' ? 1 : ang;
            expect(Math.abs(cur[ch] - prev[ch]), `${kind} ${ch} @${i}/${steps}`).toBeLessThanOrEqual(lim);
          }
          prev = cur;
        }
      }
    }
  });

  it('一次性动作：两端钳住、缓动段落在端点之间', () => {
    const o = zeroPose();
    const last = DIE_FLY.keys[DIE_FLY.keys.length - 1]!.p;
    expect(sampleClip(o, DIE_FLY, 2).rot).toBe(last.rot);
    expect(sampleClip(o, DIE_FLY, -1).rot).toBe(DIE_FLY.keys[0]!.p.rot);
    const a = DIE_FLY.keys[1]!;
    const b = DIE_FLY.keys[2]!;
    const mid = sampleClip(o, DIE_FLY, (a.t + b.t) / 2).rot;
    expect(mid).toBeGreaterThanOrEqual(Math.min(a.p.rot, b.p.rot) - 1e-6);
    expect(mid).toBeLessThanOrEqual(Math.max(a.p.rot, b.p.rot) + 1e-6);
  });

  it('onRest：增量加站姿，abs 通道直接用采样值', () => {
    const rest = pose({ legF: 14, armF: 37 });
    const d = pose({ legF: 5, armF: 3 });
    const o = onRest(zeroPose(), rest, d, WALK);
    expect(WALK.abs).toContain('legF');
    expect(o.legF).toBe(5);
    expect(o.armF).toBe(40);
  });
});

describe('动作数据', () => {
  it('每个兵种：走路、待机、攻击、受击、两种倒下都至少 8 个关键姿势', () => {
    for (const kind of RIG_KINDS) {
      const st = STYLE[kind];
      for (const [name, c] of [['walk', st.walk], ['idle', st.idle], ['attack', st.attack]] as const) expect(c.keys.length, `${kind} ${name}`).toBeGreaterThanOrEqual(8);
    }
    for (const c of [HIT, DIE_FLY, DIE_KNEEL]) expect(c.keys.length).toBeGreaterThanOrEqual(8);
  });

  it('攻击分三段：出手时刻前有预备、后有余势，出手在关键帧上', () => {
    for (const kind of RIG_KINDS) {
      const a = STYLE[kind].attack;
      expect(a.loop).toBe(false);
      expect(a.ms).toBeGreaterThan(0);
      expect(a.hit).toBeGreaterThan(0.15);
      expect(a.hit).toBeLessThan(0.7);
      expect(a.keys.some((k) => Math.abs(k.t - a.hit!) < 1e-9), kind).toBe(true);
      expect(a.keys.filter((k) => k.t < a.hit!).length).toBeGreaterThanOrEqual(2);
      expect(a.keys.filter((k) => k.t > a.hit!).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('循环动作的首帧在 0', () => {
    for (const kind of RIG_KINDS) for (const c of [STYLE[kind].walk, STYLE[kind].idle]) expect(c.keys[0]!.t).toBe(0);
  });
});

describe('攻击对齐', () => {
  it('出手那一刻进度 = hit，前后窗口线性、窗口外 -1', () => {
    const ms = 1000;
    const hit = 0.4;
    expect(atkPhase(0, 9999, ms, hit)).toBeCloseTo(0.4);
    expect(atkPhase(400, 9999, ms, hit)).toBeCloseTo(0);
    expect(atkPhase(200, 9999, ms, hit)).toBeCloseTo(0.2);
    expect(atkPhase(9999, 300, ms, hit)).toBeCloseTo(0.7);
    expect(atkPhase(9999, 600, ms, hit)).toBeCloseTo(1);
    expect(atkPhase(9999, 700, ms, hit)).toBe(-1);
    expect(atkPhase(500, 700, ms, hit)).toBe(-1);
  });
});

describe('倒下', () => {
  it('爆炸、大伤害、一击半血以上飞出去，其余跪倒', () => {
    expect(deathStyle(10, 100, true)).toBe('fly');
    expect(deathStyle(FLY_DMG, 1000, false)).toBe('fly');
    expect(deathStyle(50, 100, false)).toBe('fly');
    expect(deathStyle(30, 100, false)).toBe('kneel');
    expect(deathStyle(30, 0, false)).toBe('kneel');
  });

  it('透明度：前 60% 不透明，最后归零，单调不增', () => {
    expect(deathAlpha(0)).toBe(1);
    expect(deathAlpha(0.59)).toBe(1);
    expect(deathAlpha(1)).toBeCloseTo(0);
    let prev = 1;
    for (let k = 0; k <= 1; k += 0.01) {
      const a = deathAlpha(k);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });

  it('帽子最后落在脚底那条线上（离地 1.5 设计单位），被打飞的往后飞', () => {
    const y0 = -40;
    for (const style of ['fly', 'kneel'] as const) {
      const o = hatDrop({ x: 0, y: 0, r: 0 }, style, 1, y0);
      expect(y0 + o.y).toBeCloseTo(-1.5);
    }
    expect(hatDrop({ x: 0, y: 0, r: 0 }, 'fly', 1, y0).x).toBeLessThan(0);
    expect(hatDrop({ x: 0, y: 0, r: 0 }, 'kneel', 1, y0).x).toBeGreaterThan(0);
    expect(DEATH_MS).toBeGreaterThan(600);
  });
});

describe('细节层级和拥挤降频', () => {
  it('离屏隐藏、太小退化成单张帧', () => {
    expect(rigLod(100, false)).toBe(2);
    expect(rigLod(LOD_PX - 1, true)).toBe(1);
    expect(rigLod(LOD_PX, true)).toBe(0);
  });

  it('同屏骨架多时隔帧算姿势', () => {
    expect(poseEvery(1)).toBe(1);
    expect(poseEvery(CROWD)).toBe(1);
    expect(poseEvery(CROWD + 1)).toBe(2);
    expect(poseEvery(CROWD * 2)).toBe(2);
    expect(poseEvery(CROWD * 2 + 1)).toBe(3);
  });
});

describe('骨架正解', () => {
  it('站直不动时：腿挂在髋上，躯干在髋上方，手在肩下方一臂远', () => {
    const sk = SKEL['t.sailor'];
    const xf = solveRig(newXf(), sk, zeroPose());
    expect(xf.legF.x).toBeCloseTo(sk.hipX * sk.s);
    expect(xf.legF.y).toBeCloseTo(sk.hipY * sk.s);
    expect(xf.torso.r).toBeCloseTo(0);
    expect(xf.wep.x).toBeCloseTo(sk.shF[0] * sk.s);
    expect(xf.wep.y).toBeCloseTo((sk.hipY + sk.shF[1] + sk.arm) * sk.s);
  });

  it('整个人绕脚底转：rot 90 度是往前扑倒，头到了脚前方、和脚底差不多高', () => {
    const sk = SKEL['t.sailor'];
    const xf = solveRig(newXf(), sk, pose({ rot: 90 }));
    expect(xf.head.x).toBeGreaterThan(0);
    expect(Math.abs(xf.head.y)).toBeLessThan(Math.abs(sk.hipY * sk.s));
    expect(xf.torso.r).toBeCloseTo(Math.PI / 2);
  });

  it('前臂往前抬（armF 正）手往前走', () => {
    const sk = SKEL['t.sailor'];
    const a = solveRig(newXf(), sk, zeroPose()).wep.x;
    const b = solveRig(newXf(), sk, pose({ armF: 60 })).wep.x;
    expect(b).toBeGreaterThan(a);
  });

  it('步幅按腿长和摆角算，壮汉腿摆小步幅小', () => {
    const sk = SKEL['t.sailor'];
    expect(strideOf(sk)).toBeCloseTo(4 * sk.leg * Math.sin((WALK_SWING * Math.PI) / 180) * sk.s);
    const brute = SKEL['t.brute'];
    expect(strideOf(brute, STYLE['t.brute'].legScale) / brute.s).toBeLessThan(strideOf(sk, STYLE['t.sailor'].legScale) / sk.s);
  });
});
