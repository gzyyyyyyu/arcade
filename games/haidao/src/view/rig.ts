/**
 * 分件骨架（cutout）的数学和关键帧数据：纯数据 + 纯函数，不依赖 Phaser / DOM（tests/rig.test.ts 锁住）。
 *
 * 一个人形单位拆成 8 个部件：后腿、前腿、后臂、身体、头、帽子、前臂、武器（素材在 art/rigparts.ts，烘进一张图集），
 * 每个部件的锚点就是它的关节（髋、颈、肩、腕），画面层（rigsprite.ts）每帧按姿势算出各部件的位置和角度。
 *
 * - 姿势（Pose）是一组通道：根的位移和整体倒地角、身体前倾、头、两臂、两腿、武器朝向、蹲低、压扁、刀光、回头看；
 * - 动作（Clip）是关键帧（每个动作 ≥ 8 个关键姿势），关键帧存的是相对兵种站姿（RigDef.rest）的增量；
 *   循环动作（走、待机）用 Catmull-Rom 平滑穿过关键帧（速度连续，不在每个关键帧停一下），
 *   一次性动作（攻击、受击、倒下）每段按到达那一帧标的曲线插值，曲线名就是 motion.ts 的 EASE（出手 strike 快、收招 recover 慢），不用线性；
 * - 走路按走过的距离推进（一个循环的距离 = 两步的步幅，由腿长和摆角算，脚不打滑，步频自然和逻辑速度对上）；
 *   攻击按规则的出手拍对齐（atkPhase：离下一次出手还有多久、离上一次过了多久），远程的出手就是 shoot 事件那一拍；
 * - 不同兵种：站姿、动作的幅度（RigStyle 的倍数）、攻击动作的种类和时长各不一样。
 */
import { EASE_FN, clamp01, easeInQuad, easeOutQuad, lerp, type EaseName } from './motion.ts';

// ---------------------------------------------------------------- 姿势

/** 角度一律是度，"往前"为正（朝向右时：前倾、手臂往前抬、腿往前迈为正；武器朝向 0 = 水平朝前，90 = 朝上） */
export interface Pose {
  /** 根（脚底）的位移，设计单位（未乘兵种缩放），x 往前为正、y 往下为正 */
  x: number;
  y: number;
  /** 整个人绕脚底转（倒地用），往前为正 */
  rot: number;
  /** 身体绕髋前倾 */
  lean: number;
  /** 头相对身体 */
  head: number;
  /** 手臂相对身体（0 = 垂下，90 = 平举向前，180 = 举过头） */
  armF: number;
  armB: number;
  /** 武器相对身体的朝向（刀、枪按画的方向 0 = 朝前；炸弹、药箱这类竖着画的 0 = 立着） */
  wep: number;
  /** 腿（0 = 垂直） */
  legF: number;
  legB: number;
  /** 髋往下沉（跪、蹲），设计单位 */
  hipY: number;
  /** 压扁量：纵向 ×(1 - sq)、横向 ×(1 + sq/2)；负的是拉长（吸气） */
  sq: number;
  /** 刀光 / 残影的不透明度 0..1 */
  trail: number;
  /** 回头看：0..1，画面层把朝向乘 (1 - 2·turn)，经过 0.5 时压扁翻过去 */
  turn: number;
}

export const POSE_KEYS = ['x', 'y', 'rot', 'lean', 'head', 'armF', 'armB', 'wep', 'legF', 'legB', 'hipY', 'sq', 'trail', 'turn'] as const satisfies ReadonlyArray<keyof Pose>;
export type PoseKey = (typeof POSE_KEYS)[number];

export const zeroPose = (): Pose => ({ x: 0, y: 0, rot: 0, lean: 0, head: 0, armF: 0, armB: 0, wep: 0, legF: 0, legB: 0, hipY: 0, sq: 0, trail: 0, turn: 0 });
export function pose(p: Partial<Pose>): Pose {
  return { ...zeroPose(), ...p };
}
export function copyPose(out: Pose, a: Pose): Pose {
  for (const c of POSE_KEYS) out[c] = a[c];
  return out;
}
/** out += d × w（叠加受击、回头这类附加动作） */
export function addPose(out: Pose, d: Pose, w = 1): Pose {
  for (const c of POSE_KEYS) out[c] += d[c] * w;
  return out;
}
/** out = a 和 b 之间按 w 混合（切换动作时过渡） */
export function mixPose(out: Pose, a: Pose, b: Pose, w: number): Pose {
  for (const c of POSE_KEYS) out[c] = lerp(a[c], b[c], w);
  return out;
}

// ---------------------------------------------------------------- 关键帧

export interface Key {
  /** 0..1 */
  t: number;
  p: Pose;
  /** 从上一帧到这一帧用的曲线（平滑循环的动作不看它） */
  e: EaseName;
}
export interface Clip {
  keys: Key[];
  loop: boolean;
  /** 循环动作穿过关键帧用 Catmull-Rom（速度连续） */
  smooth: boolean;
  /** 这些通道是绝对值（不加站姿），比如走路的两条腿围着垂直线摆 */
  abs?: PoseKey[];
  /** 一次性动作的时长（毫秒）和出手时刻（0..1，攻击才有） */
  ms?: number;
  hit?: number;
  /** 挥砍类攻击画弧形残影（arcLook） */
  arc?: 'slash' | 'smash' | 'throw';
}

const K = (t: number, e: EaseName, p: Partial<Pose>): Key => ({ t, e, p: pose(p) });

function cr(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** 关键帧采样：k = 0..1（循环动作自动取模），结果写进 out（增量，未加站姿） */
export function sampleClip(out: Pose, clip: Clip, k: number): Pose {
  const ks = clip.keys;
  const n = ks.length;
  if (n === 1) return copyPose(out, ks[0]!.p);
  const t = clip.loop ? ((k % 1) + 1) % 1 : clamp01(k);
  // 找所在的段 [i, i+1)；循环动作的最后一段从末帧接回首帧（首帧 t 必须是 0）
  let i = n - 1;
  for (let j = 0; j < n - 1; j++) {
    if (t < ks[j + 1]!.t) {
      i = j;
      break;
    }
  }
  if (!clip.loop && i === n - 1) return copyPose(out, ks[n - 1]!.p);
  const a = ks[i]!;
  const bi = i + 1 < n ? i + 1 : 0;
  const b = ks[bi]!;
  const t1 = bi === 0 ? 1 : b.t;
  const u = t1 > a.t ? (t - a.t) / (t1 - a.t) : 0;
  if (clip.smooth) {
    const at = (j: number): Pose => (clip.loop ? ks[((j % n) + n) % n]! : ks[Math.max(0, Math.min(n - 1, j))]!).p;
    const p0 = at(i - 1);
    const p3 = at(i + 2);
    for (const c of POSE_KEYS) out[c] = cr(p0[c], a.p[c], b.p[c], p3[c], u);
    return out;
  }
  const w = EASE_FN[b.e](u);
  for (const c of POSE_KEYS) out[c] = a.p[c] + (b.p[c] - a.p[c]) * w;
  return out;
}

/** 把采样出的增量加到站姿上（abs 里的通道直接用采样值） */
export function onRest(out: Pose, rest: Pose, d: Pose, clip: Clip): Pose {
  for (const c of POSE_KEYS) out[c] = rest[c] + d[c];
  if (clip.abs) for (const c of clip.abs) out[c] = d[c];
  return out;
}

/** 按通道放大缩小一个动作（兵种差异：壮汉腿摆小、身子晃大……） */
export function scaleClip(clip: Clip, f: Partial<Record<PoseKey, number>>, extra?: Partial<Clip>): Clip {
  return {
    ...clip,
    ...extra,
    keys: clip.keys.map((k) => {
      const p = { ...k.p };
      for (const c of POSE_KEYS) if (f[c] !== undefined) p[c] *= f[c]!;
      return { ...k, p };
    }),
  };
}

// ---------------------------------------------------------------- 动作数据（增量，相对兵种站姿）

/**
 * 走路：一个循环 = 两步，每步 8 个关键姿势，共 16 个，Catmull-Rom 逐帧穿过（gaitClip 生成，每个兵种一组参数）。
 * 一步里 s = 0 是过渡位（两腿并拢、身子最高、略拉长），s = 0.5 是落脚（腿摆到最大、身子最低、压扁，对应整个循环的 t = 0.25 / 0.75）：
 * - 重心转移：落脚时身子压得快（髋下沉 hipY、压扁），蹬地时抬得慢，不是对称的正弦；
 * - 腿"出手快收手慢"：迈出去的前半步快，落脚后往回蹬的后半步慢；手臂反相，比腿晚半拍到顶，还带一点过头再回弹（1.07 → 0.96）；
 * - 头比身子滞后：头的前后点头在落脚之后才到顶；
 * - 左右两步不镜像：asym 让第二步的手臂、前倾、落脚压扁和髋沉比第一步多一点（拐一点、肩头一高一低），落脚和过渡这两个最关键的帧不动。
 * 摆幅、起伏按 WALK_SWING / WALK_BOB（主线 10-30：比上一版各放大一倍，海岛奇兵那种大步走）。
 *
 * 步幅和步频：腿的摆幅决定一个循环（两步）走多远 stride = strideOf = 4 × 腿长 × sin(WALK_SWING × leg) × 缩放，画面按"走过的距离 / stride"推进循环，
 * 所以脚不打滑，一个循环的时间 T = stride / (速度 × 每格像素)。速度是规则的（troops.ts，格/秒），每格约 PX_PER_TILE 像素，
 * 各兵种先定想要的 T（重兵慢而沉，水手鱼叉手碎步快），再反推 leg（摆幅倍数，见 STYLE 上方的表）。
 */
export const WALK_SWING = 48;
export const WALK_BOB = 4.6;
/** 触地那一拍的压扁量 */
export const WALK_SQUASH = 0.07;
/** 每格走过的屏幕像素（等距投影，沿格线 35.8、沿对角 32–64，取约数），只用来估步频 */
export const PX_PER_TILE = 40;

/** 一步里 8 个关键的位置（0 = 过渡位，0.5 = 落脚）：落脚前的间隔密（落得快），落脚后疏（蹬得慢） */
const G_S = [0, 0.14, 0.3, 0.42, 0.5, 0.6, 0.76, 0.9] as const;
/** 腿：前半步快（0.14 已摆到 0.62）、落脚后慢慢蹬回 */
const G_LEG = [0, 0.62, 0.93, 0.99, 1, 0.97, 0.72, 0.36] as const;
/** 手臂（和腿反相）：比腿晚到顶，过头 7% 再回弹 */
const G_ARM = [0, 0.5, 0.84, 1, 1.07, 1.04, 0.8, 0.42] as const;
const G_WEP = [0, 0.6, 0.9, 1, 1, 0.95, 0.7, 0.4] as const;
/** 身子高度（-1 = 最高、0 = 落脚最低）：落得快（0.42 已接近底）、抬得慢 */
const G_Y = [-1, -0.9, -0.6, -0.2, 0, -0.12, -0.5, -0.8] as const;
const G_LEAN = [3, 3.8, 4.6, 5, 5, 4.8, 4.4, 3.6] as const;
/** 头的点头（度）：落脚后才点到底（滞后约 0.1 个步长） */
const G_HEAD = [-2.5, -2.2, -0.6, 1.8, 3, 3.4, 1.4, -1] as const;
/** 压扁（落脚 = 1）：落脚前一瞬间猛压，落脚后很快弹起；过渡位略拉长 */
const G_SQ = [-0.3, 0, 0.2, 0.65, 1, 0.55, 0.25, 0] as const;
/** 髋下沉（落脚 = 1，膝盖一弯）：重兵用 */
const G_HIP = [0, 0, 0.2, 0.7, 1, 0.6, 0.2, 0] as const;
/** asym 作用在这些位置上的权重（过渡位、落脚位 0：最关键的两帧不变） */
const G_ASYM = [0, 0.6, 1, 1, 0, 1, 1, 0.8] as const;

/** 一个兵种的步态参数：全是相对默认值的倍数（除 leg 外 1 = 默认） */
export interface Gait {
  /** 腿摆幅倍数（同时决定步幅，见 strideOf） */
  leg: number;
  /** 手臂摆幅；armF 再额外乘前臂（拿盾、提药箱的手摆得小） */
  arm: number;
  armF?: number;
  armB?: number;
  /** 武器随手摆 */
  wep: number;
  /** 身体起伏（上下弹） */
  bob: number;
  lean: number;
  head: number;
  /** 落脚压扁 */
  sq: number;
  /** 髋下沉（设计单位，落脚那一拍） */
  hip: number;
  /** 左右两步的差别（0 = 镜像） */
  asym: number;
}

export function gaitClip(g: Gait): Clip {
  const keys: Key[] = [];
  for (let step = 0; step < 2; step++) {
    const sg = step ? -1 : 1;
    const m = step ? 1 : -1;
    for (let i = 0; i < G_S.length; i++) {
      const a = g.asym * G_ASYM[i]! * m;
      const leg = sg * G_LEG[i]! * g.leg * WALK_SWING;
      const arm = sg * G_ARM[i]! * 26 * g.arm * (1 + a * 0.6);
      keys.push(
        K((step * 0.5 + G_S[i]! * 0.5), 'recover', {
          legF: leg,
          legB: -leg,
          armF: -arm * (g.armF ?? 1),
          armB: arm * (g.armB ?? 1),
          wep: sg * G_WEP[i]! * 10 * g.wep,
          y: G_Y[i]! * WALK_BOB * g.bob * (1 - a * 0.5),
          lean: G_LEAN[i]! * g.lean + a * 1.2,
          head: G_HEAD[i]! * g.head,
          sq: G_SQ[i]! * WALK_SQUASH * g.sq * (1 + a),
          hipY: G_HIP[i]! * g.hip * (1 + a),
        }),
      );
    }
  }
  return { loop: true, smooth: true, abs: ['legF', 'legB'], keys };
}

/** 默认步态（不属于哪个兵种，单测和 scaleClip 的基准） */
const BASE_GAIT: Gait = { leg: 1, arm: 1, wep: 1, bob: 1, lean: 1, head: 1, sq: 1, hip: 0, asym: 0.1 };
export const WALK: Clip = gaitClip(BASE_GAIT);

/** 待机：呼吸起伏（吸气时身子微微拉长、手臂外张），一个循环 IDLE_MS */
export const IDLE_MS = 2600;
export const IDLE: Clip = {
  loop: true,
  smooth: true,
  keys: [
    K(0, 'recover', {}),
    K(0.125, 'recover', { y: -0.3, sq: -0.006, armF: 1, armB: -1, lean: 0.4, head: -0.5 }),
    K(0.25, 'recover', { y: -0.6, sq: -0.012, armF: 2, armB: -2, lean: 0.8, head: -1, wep: 1 }),
    K(0.375, 'recover', { y: -0.5, sq: -0.01, armF: 1.5, armB: -1.5, lean: 0.6, head: -1.2, wep: 1 }),
    K(0.5, 'recover', { y: -0.2, sq: -0.004, armF: 0.5, armB: -0.5, lean: 0.2, head: -0.6 }),
    K(0.625, 'recover', { y: 0.1, sq: 0.004, armF: -0.5, armB: 0.5, head: 0 }),
    K(0.75, 'recover', { y: 0.2, sq: 0.008, armF: -1, armB: 1, lean: -0.3, head: 0.4, wep: -1 }),
    K(0.875, 'recover', { y: 0.1, sq: 0.004, armF: -0.5, armB: 0.5, head: 0.2 }),
  ],
};

/** 东张西望（叠在待机上，隔一阵随机来一次）：抬头看远处 → 回头看身后 → 转回来低头瞄一眼 */
export const LOOK: Clip = {
  loop: false,
  smooth: false,
  ms: 1500,
  keys: [
    K(0, 'recover', {}),
    K(0.12, 'recover', { head: -9, lean: -1 }),
    K(0.3, 'recover', { head: -8, lean: -1 }),
    K(0.4, 'recover', { turn: 1, head: 3 }),
    K(0.5, 'recover', { turn: 1, head: 5 }),
    K(0.62, 'recover', { turn: 1, head: 4 }),
    K(0.72, 'recover', { turn: 0, head: 0 }),
    K(0.86, 'recover', { head: 5 }),
    K(1, 'recover', {}),
  ],
};

/** 船长的指挥姿势（待机时随机）：举剑指向前方、往前一点一点，再收回 */
export const COMMAND: Clip = {
  loop: false,
  smooth: false,
  ms: 1800,
  keys: [
    K(0, 'recover', {}),
    K(0.15, 'strike', { armF: 55, wep: -55, lean: -3, head: -4, armB: -12 }),
    K(0.22, 'land', { armF: 62, wep: -62, lean: -4, head: -5, armB: -14 }),
    K(0.3, 'recover', { armF: 57, wep: -58, lean: -3, head: -4, armB: -12 }),
    K(0.6, 'recover', { armF: 58, wep: -58, lean: -3, head: -4, armB: -12 }),
    K(0.68, 'strike', { armF: 66, wep: -64, lean: 2, head: -2, armB: -16, x: 1 }),
    K(0.76, 'recover', { armF: 57, wep: -58, lean: -2, head: -4, armB: -12 }),
    K(0.9, 'recover', { armF: 15, wep: -15 }),
    K(1, 'recover', {}),
  ],
};

/**
 * 砍：预备（后仰、刀举过头、刀尖朝后，顶点稍停）→ 出手（越挥越快，出手那一刻最快，刀光最亮）→ 余势（过头、减速）→ 回弹 → 收招（慢）。
 * 出手段用 fall（加速）进、recoil（减速）出，速度最快的一帧正好落在规则的出手拍上；段长保证 60 帧下每帧刀转不超过 72 度（有刀光拖影补中间）。站姿是刀尖朝上的持刀
 */
export const SLASH: Clip = {
  loop: false,
  smooth: false,
  arc: 'slash',
  ms: 640,
  hit: 0.42,
  keys: [
    K(0, 'recover', {}),
    K(0.1, 'recover', { armF: 55, wep: 55, armB: 10, lean: -9, rot: -3, head: -4, legF: -6, legB: 6, x: -1.5, sq: -0.02 }),
    K(0.2, 'recover', { armF: 118, wep: 125, armB: 24, lean: -20, rot: -6, head: -10, legF: -10, legB: 10, x: -3, y: -0.8, sq: -0.05 }),
    K(0.25, 'recover', { armF: 123, wep: 132, armB: 25, lean: -22, rot: -7, head: -10, legF: -11, legB: 11, x: -3.2, y: -0.8, sq: -0.05 }),
    K(0.42, 'fall', { armF: 33, wep: -85, armB: -24, lean: 22, rot: 6, head: 9, legF: 18, legB: -12, x: 4.5, y: 0.6, hipY: 1.4, sq: 0.07, trail: 1 }),
    K(0.52, 'recoil', { armF: 14, wep: -118, armB: -28, lean: 27, rot: 8, head: 9, legF: 20, legB: -14, x: 5.5, y: 1, hipY: 1.8, sq: 0.05, trail: 0.6 }),
    K(0.64, 'recover', { armF: 10, wep: -78, armB: -12, lean: 15, rot: 4, head: 5, legF: 13, legB: -9, x: 3.5, y: 0.4, hipY: 1, trail: 0.12 }),
    K(0.78, 'recover', { armF: 3, wep: -23, lean: 5, rot: 1, head: 1, legF: 5, legB: -3, x: 1 }),
    K(1, 'recover', {}),
  ],
};

/** 重砸（壮汉的锤、铁甲的斧）：蓄力很久（踮脚、锤举过头停一下）→ 一下砸下去（膝盖一沉、身子压扁）→ 慢慢直起来 */
export const SMASH: Clip = {
  loop: false,
  smooth: false,
  arc: 'smash',
  ms: 1100,
  hit: 0.5,
  keys: [
    K(0, 'recover', {}),
    K(0.1, 'recover', { armF: 20, armB: 25, wep: -10, lean: 6, y: 0.8, hipY: 1.5, sq: 0.04 }),
    K(0.3, 'recover', { armF: 120, armB: 110, wep: 70, lean: -22, rot: -6, head: -10, x: -2.5, y: -2.4, legF: -8, legB: 8, sq: -0.06 }),
    K(0.38, 'recover', { armF: 128, armB: 118, wep: 82, lean: -26, rot: -8, head: -11, x: -3, y: -3, legF: -9, legB: 9, sq: -0.07 }),
    K(0.5, 'fall', { armF: -10, armB: -5, wep: -95, lean: 30, rot: 8, head: 12, x: 4, y: 1.5, hipY: 4, sq: 0.15, legF: 18, legB: -14, trail: 1 }),
    K(0.58, 'recoil', { armF: -16, armB: -10, wep: -105, lean: 33, rot: 9, head: 13, x: 4.8, y: 2, hipY: 4.5, sq: 0.1, legF: 19, legB: -15, trail: 0.6 }),
    K(0.7, 'recover', { armF: -8, wep: -85, lean: 22, rot: 5, head: 8, x: 3, y: 1, hipY: 3, sq: 0.03, legF: 12, legB: -9, trail: 0.1 }),
    K(0.85, 'recover', { armF: 0, wep: -40, lean: 8, rot: 1.5, head: 2, x: 1, hipY: 1, legF: 4, legB: -3 }),
    K(1, 'recover', {}),
  ],
};

/** 火枪：举枪瞄准 → 开火（出手点）→ 后坐（枪口上跳、身子后仰）→ 放低枪、通条往枪口里捅两下（装填）→ 端回 */
export const SHOOT: Clip = {
  loop: false,
  smooth: false,
  ms: 1300,
  hit: 0.25,
  keys: [
    K(0, 'recover', {}),
    K(0.12, 'recover', { armF: 48, wep: -31, armB: 84, lean: -3, head: 3 }),
    K(0.25, 'recover', { armF: 48, wep: -31, armB: 84, lean: -3, head: 3 }),
    K(0.29, 'recoil', { armF: 58, wep: -15, armB: 90, lean: -9, head: -2, x: -2, sq: 0.03 }),
    K(0.4, 'recover', { armF: 48, wep: -29, armB: 84, lean: -4, head: 2, x: -0.5 }),
    K(0.5, 'recover', { armF: -15, wep: 52, armB: 170, lean: 3, head: -6 }),
    K(0.58, 'strike', { armF: -15, wep: 54, armB: 192, lean: 3, head: -7, y: -0.3 }),
    K(0.66, 'strike', { armF: -15, wep: 52, armB: 160, lean: 4, head: -5 }),
    K(0.74, 'strike', { armF: -15, wep: 54, armB: 192, lean: 3, head: -7, y: -0.3 }),
    K(0.82, 'strike', { armF: -15, wep: 52, armB: 160, lean: 4, head: -5 }),
    K(0.92, 'recover', { armF: 20, wep: 18, armB: 40, lean: 1 }),
    K(1, 'recover', {}),
  ],
};

/** 推着的小炮开火：两脚分开、压低 → 点火（出手点）→ 炮口上扬、人被顶着往后滑 → 再把炮推回原位 */
export const CANNON: Clip = {
  loop: false,
  smooth: false,
  ms: 1600,
  hit: 0.3,
  keys: [
    K(0, 'recover', {}),
    K(0.12, 'recover', { lean: -4, legF: 8, legB: -8, hipY: 1.2, x: -0.5, head: -2 }),
    K(0.22, 'recover', { lean: -6, legF: 10, legB: -10, hipY: 1.8, x: -1, head: -4, armB: 40 }),
    K(0.3, 'recover', { lean: -6, legF: 10, legB: -10, hipY: 1.8, x: -1, head: -4, armB: 40 }),
    K(0.34, 'recoil', { x: -6, wep: 18, lean: -14, armF: 14, armB: 30, head: -9, sq: 0.08, legF: 14, legB: -12, hipY: 1 }),
    K(0.45, 'recoil', { x: -7.5, wep: 8, lean: -9, armF: 8, head: -5, sq: 0.02, legF: 10, legB: -9, hipY: 1 }),
    K(0.6, 'recover', { x: -5.5, wep: 2, lean: -2, armF: 2, head: -2, legF: 6, legB: -6 }),
    K(0.8, 'recover', { x: -1.5, lean: 8, head: 2, legF: 10, legB: -12 }),
    K(1, 'recover', {}),
  ],
};

/** 投掷（鱼叉、炸弹）：手臂往后举、身子后仰、前脚迈出 → 一下甩出去（出手点）→ 余势前倾 → 收回 */
export const THROW: Clip = {
  loop: false,
  smooth: false,
  arc: 'throw',
  ms: 620,
  hit: 0.45,
  keys: [
    K(0, 'recover', {}),
    K(0.12, 'recover', { armF: 140, wep: -40, armB: -20, lean: -13, rot: -3, head: -4, legF: 10, legB: -8, x: -1.5 }),
    K(0.24, 'recover', { armF: 172, wep: -55, armB: -35, lean: -20, rot: -6, head: -7, legF: 16, legB: -12, x: -2.5, sq: -0.04 }),
    K(0.3, 'recover', { armF: 178, wep: -58, armB: -38, lean: -21, rot: -6, head: -7, legF: 16, legB: -12, x: -2.5, sq: -0.04 }),
    K(0.45, 'fall', { armF: 65, wep: -70, armB: 20, lean: 20, rot: 5, head: 8, legF: 18, legB: -13, x: 4, hipY: 1, sq: 0.05, trail: 0.6 }),
    K(0.52, 'recoil', { armF: 25, wep: -95, armB: 30, lean: 25, rot: 7, head: 9, legF: 18, legB: -13, x: 4.8, hipY: 1.3, sq: 0.04 }),
    K(0.62, 'recover', { armF: 15, wep: -50, armB: 15, lean: 13, rot: 3, head: 5, legF: 11, legB: -8, x: 3 }),
    K(0.8, 'recover', { armF: 5, wep: -15, lean: 3, legF: 3, legB: -2, x: 0.5 }),
    K(1, 'recover', {}),
  ],
};

/** 船医：把药箱举过头晃一晃（出手点放绿光），再放下 */
export const HEAL: Clip = {
  loop: false,
  smooth: false,
  ms: 800,
  hit: 0.5,
  keys: [
    K(0, 'recover', {}),
    K(0.2, 'recover', { armF: 75, lean: -4, head: -6, armB: 20 }),
    K(0.4, 'recover', { armF: 115, lean: -6, head: -9, y: -1, sq: -0.03, armB: 35 }),
    K(0.5, 'strike', { armF: 125, lean: -7, head: -10, y: -1.6, sq: -0.05, armB: 45 }),
    K(0.56, 'land', { armF: 115, wep: 8, lean: -6, head: -9, y: -1, armB: 40 }),
    K(0.62, 'recover', { armF: 121, wep: -8, lean: -6, head: -9, y: -1.2, armB: 42 }),
    K(0.68, 'recover', { armF: 115, wep: 6, lean: -5, head: -8, y: -1, armB: 38 }),
    K(0.82, 'recover', { armF: 30, lean: -1, head: -2, armB: 10 }),
    K(1, 'recover', {}),
  ],
};

/** 小艇怪：船身往后一仰再往前一撞（出手点），船员跟着探身 */
export const RAM: Clip = {
  loop: false,
  smooth: false,
  ms: 600,
  hit: 0.42,
  keys: [
    K(0, 'recover', {}),
    K(0.12, 'recover', { x: -1, rot: -3, lean: -4, head: -3, armF: 20 }),
    K(0.25, 'recover', { x: -2.5, rot: -7, lean: -8, head: -6, armF: 40, legF: -15, legB: 15 }),
    K(0.32, 'recover', { x: -3, rot: -8, lean: -9, head: -6, armF: 45, legF: -18, legB: 18 }),
    K(0.42, 'strike', { x: 5, rot: 9, lean: 14, head: 8, armF: -10, legF: 20, legB: -20, sq: 0.06 }),
    K(0.5, 'recoil', { x: 6, rot: 11, lean: 16, head: 9, armF: -20, legF: 22, legB: -22, sq: 0.04 }),
    K(0.62, 'recover', { x: 3, rot: 4, lean: 8, head: 4, armF: 0, legF: 10, legB: -10 }),
    K(0.8, 'recover', { x: 1, rot: 1, lean: 2, head: 1, legF: 3, legB: -3 }),
    K(1, 'recover', {}),
  ],
};

/** 受击（叠加，HIT_MS）：闪白的同时身子后仰、头往后甩、两手一扬，再慢慢回正 */
export const HIT_MS = 280;
export const HIT: Clip = {
  loop: false,
  smooth: false,
  keys: [
    K(0, 'recover', {}),
    K(0.12, 'strike', { lean: -10, head: -9, armF: 10, armB: 12, x: -1.6, sq: 0.05, legF: 3 }),
    K(0.2, 'strike', { lean: -14, head: -12, armF: 14, armB: 16, x: -2.2, sq: 0.06, legF: 4 }),
    K(0.32, 'recover', { lean: -11, head: -8, armF: 10, armB: 12, x: -2, sq: 0.03, legF: 3 }),
    K(0.45, 'recover', { lean: -7, head: -4, armF: 6, armB: 7, x: -1.4, sq: 0.01, legF: 2 }),
    K(0.6, 'recover', { lean: -4, head: -1, armF: 3, armB: 4, x: -0.9 }),
    K(0.75, 'recover', { lean: -1.5, head: 0.5, armF: 1, armB: 1, x: -0.4 }),
    K(0.88, 'recover', { lean: 0.4, head: 0.4, x: -0.1 }),
    K(1, 'recover', {}),
  ],
};

/**
 * 重击受击（叠加，HIT_HEAVY_MS）：单次伤害占最大血量一大块时用。身子猛地后仰、头甩得更狠，
 * 脚下踉跄后退一步（root x 往后挪、前脚抬起再落下），火花也比轻击多；回正比轻击慢。
 */
export const HIT_HEAVY_MS = 460;
export const HIT_HEAVY: Clip = {
  loop: false,
  smooth: false,
  keys: [
    K(0, 'recover', {}),
    K(0.08, 'strike', { lean: -20, head: -17, armF: 30, armB: 36, x: -3.4, sq: 0.1, legF: 8, legB: -4, y: -0.6 }),
    K(0.18, 'strike', { lean: -26, head: -21, armF: 38, armB: 44, x: -5.8, sq: 0.08, legF: 22, legB: -12, y: -1.2 }),
    K(0.3, 'recoil', { lean: -20, head: -14, armF: 24, armB: 28, x: -7.2, sq: 0.1, legF: 6, legB: 14, y: 0, hipY: 0.8 }),
    K(0.42, 'recover', { lean: -13, head: -8, armF: 14, armB: 16, x: -7, sq: 0.05, legF: 2, legB: 6, hipY: 0.4 }),
    K(0.56, 'recover', { lean: -8, head: -4, armF: 8, armB: 9, x: -5.4, sq: 0.02, legF: 1, legB: 2 }),
    K(0.7, 'recover', { lean: -4, head: -1.5, armF: 4, armB: 4, x: -3.2 }),
    K(0.85, 'recover', { lean: -1.2, head: 0.5, armF: 1, armB: 1, x: -1.2 }),
    K(1, 'recover', {}),
  ],
};

// ---------------------------------------------------------------- 倒下

/** 倒下的总时长（毫秒）：前 60% 是动作，之后淡出 */
export const DEATH_MS = 1100;
/**
 * 倒下的样子：fly 炸飞（炮弹 / 爆炸）、shot 中弹倒地（枪弹）、burn 烧焦再倒下（火）、soft 软倒（被晕时死）、kneel 跪倒（没有类型线索时的老逻辑）
 */
export type DeathStyle = 'fly' | 'kneel' | 'shot' | 'burn' | 'soft';

/** 被炸飞：整个人被掀起来往后仰着飞出去（比原来更高更远）、落地弹两下、躺平 */
export const DIE_FLY: Clip = {
  loop: false,
  smooth: false,
  ms: DEATH_MS,
  keys: [
    K(0, 'recover', {}),
    K(0.07, 'strike', { lean: -20, head: -16, armF: 48, armB: 54, x: -4, y: -3, legF: 16, legB: -10, wep: 22, sq: -0.04 }),
    K(0.15, 'recoil', { rot: -42, x: -11, y: -17, lean: -12, head: -12, armF: 100, armB: 110, legF: 36, legB: 14, wep: 46 }),
    K(0.26, 'recover', { rot: -78, x: -19, y: -15, lean: -6, head: -6, armF: 120, armB: 130, legF: 44, legB: 28, wep: 64 }),
    K(0.36, 'fall', { rot: -96, x: -26, y: 0, lean: -4, head: -4, armF: 128, armB: 138, legF: 32, legB: 22, wep: 72, sq: 0.13 }),
    K(0.42, 'recoil', { rot: -80, x: -28, y: -6, lean: -4, head: -2, armF: 120, armB: 130, legF: 30, legB: 20, wep: 72 }),
    K(0.5, 'fall', { rot: -93, x: -29.5, y: 0, lean: -3, head: 2, armF: 108, armB: 118, legF: 24, legB: 14, wep: 76, sq: 0.08 }),
    K(0.56, 'recoil', { rot: -88, x: -30, y: -1.5, lean: -2, head: 6, armF: 102, armB: 112, legF: 22, legB: 12, wep: 76 }),
    K(0.64, 'recover', { rot: -90, x: -30.5, y: 0, lean: -2, head: 8, armF: 100, armB: 110, legF: 20, legB: 10, wep: 75 }),
    K(1, 'recover', { rot: -90, x: -30.5, y: 0, lean: -2, head: 8, armF: 100, armB: 110, legF: 20, legB: 10, wep: 75 }),
  ],
};

/** 中弹倒地：被枪弹一击，身子猛一抖、手捂胸口、膝盖一软跪下去，再往后仰躺下（比炸飞安静，不飞） */
export const DIE_SHOT: Clip = {
  loop: false,
  smooth: false,
  ms: DEATH_MS,
  keys: [
    K(0, 'recover', {}),
    K(0.05, 'strike', { lean: -15, head: -11, armF: 24, armB: 28, x: -2, sq: 0.05 }),
    K(0.13, 'recoil', { lean: -9, head: -7, armF: 62, armB: 20, x: -2.4, hipY: 1.4, legF: 12, legB: -14, wep: -20 }),
    K(0.25, 'recover', { lean: 4, head: 6, armF: 68, armB: 14, x: -2, hipY: 4, legF: 46, legB: -52, wep: -48 }),
    K(0.37, 'fall', { lean: 8, head: 10, armF: 40, armB: 6, x: -2.5, hipY: 6.2, legF: 74, legB: -80, wep: -70, sq: 0.05 }),
    K(0.47, 'fall', { rot: -48, x: -7, lean: 0, head: -4, hipY: 5, legF: 78, legB: -40, armF: 50, armB: 40, wep: -40 }),
    K(0.56, 'fall', { rot: -88, x: -12, lean: -3, head: -3, hipY: 1, legF: 24, legB: 6, armF: 84, armB: 92, wep: 30, sq: 0.08 }),
    K(0.62, 'recoil', { rot: -84, x: -12.5, lean: -3, head: 0, hipY: 1, legF: 22, legB: 4, armF: 88, armB: 94, wep: 32 }),
    K(0.7, 'recover', { rot: -90, x: -12.5, lean: -2, head: 6, hipY: 0.5, legF: 18, legB: 4, armF: 94, armB: 98, wep: 34 }),
    K(1, 'recover', { rot: -90, x: -12.5, lean: -2, head: 6, hipY: 0.5, legF: 18, legB: 4, armF: 94, armB: 98, wep: 34 }),
  ],
};

/** 烧焦：着火后乱蹦乱挥手（人在冒烟变黑）、腿一软跪下、往前栽倒，躺着还冒烟 */
export const DIE_BURN: Clip = {
  loop: false,
  smooth: false,
  ms: DEATH_MS,
  keys: [
    K(0, 'recover', {}),
    K(0.1, 'recover', { lean: -8, head: -12, armF: 80, armB: 88, y: -2.2, sq: -0.04, legF: 10, legB: -8 }),
    K(0.18, 'recover', { lean: 6, head: 8, armF: 150, armB: 140, y: -3, legF: 32, legB: -26 }),
    K(0.26, 'recover', { lean: -6, head: -9, armF: 100, armB: 150, y: -1.2, x: 1, legF: -22, legB: 28 }),
    K(0.34, 'recover', { lean: 6, head: 7, armF: 160, armB: 100, y: -2.6, legF: 26, legB: -30 }),
    K(0.43, 'recover', { lean: 12, head: 13, armF: 92, armB: 82, hipY: 3, legF: 52, legB: -58, wep: -50 }),
    K(0.52, 'fall', { lean: 24, head: 20, armF: 34, armB: 30, hipY: 6.4, legF: 78, legB: -86, wep: -72, sq: 0.05 }),
    K(0.66, 'fall', { rot: 82, x: 2, lean: 8, head: 10, hipY: 1, legF: 12, legB: -6, armF: 76, armB: 56, wep: -30, sq: 0.07 }),
    K(0.72, 'recoil', { rot: 78, x: 2, lean: 8, head: 8, hipY: 1, legF: 14, legB: -8, armF: 78, armB: 58, wep: -30 }),
    K(0.8, 'recover', { rot: 84, x: 2, lean: 8, head: 10, hipY: 1, legF: 10, legB: -5, armF: 72, armB: 52, wep: -30 }),
    K(1, 'recover', { rot: 84, x: 2, lean: 8, head: 10, hipY: 1, legF: 10, legB: -5, armF: 72, armB: 52, wep: -30 }),
  ],
};

/** 软倒（晕着的时候死）：没有任何挣扎，整个人一松，膝盖先塌、上身垂下去、慢慢瘫倒 */
export const DIE_SOFT: Clip = {
  loop: false,
  smooth: false,
  ms: DEATH_MS,
  keys: [
    K(0, 'recover', {}),
    K(0.1, 'recover', { lean: 3, head: 7, armF: -6, armB: -6, hipY: 1, wep: -22 }),
    K(0.22, 'recover', { lean: 8, head: 15, armF: -16, armB: -18, hipY: 3, legF: 26, legB: -22, wep: -46 }),
    K(0.34, 'fall', { lean: 14, head: 21, armF: -22, armB: -24, hipY: 6, legF: 62, legB: -70, wep: -70, sq: 0.04 }),
    K(0.46, 'recover', { lean: 20, head: 24, armF: -24, armB: -26, hipY: 6.8, legF: 72, legB: -82, wep: -76 }),
    K(0.56, 'recover', { rot: 38, x: 1, lean: 24, head: 22, hipY: 5.2, legF: 60, legB: -60, armF: 6, armB: 4, wep: -60 }),
    K(0.68, 'fall', { rot: 84, x: 3, lean: 10, head: 14, hipY: 1, legF: 14, legB: -8, armF: 40, armB: 30, wep: -20, sq: 0.05 }),
    K(0.74, 'recoil', { rot: 82, x: 3, lean: 10, head: 12, hipY: 1, legF: 15, legB: -9, armF: 42, armB: 32, wep: -20 }),
    K(0.84, 'recover', { rot: 86, x: 3, lean: 10, head: 14, hipY: 1, legF: 12, legB: -6, armF: 38, armB: 28, wep: -20 }),
    K(1, 'recover', { rot: 86, x: 3, lean: 10, head: 14, hipY: 1, legF: 12, legB: -6, armF: 38, armB: 28, wep: -20 }),
  ],
};

/** 跪倒：踉跄一下 → 膝盖一软跪下、武器垂下 → 晃一晃 → 往前扑倒 */
export const DIE_KNEEL: Clip = {
  loop: false,
  smooth: false,
  ms: DEATH_MS,
  keys: [
    K(0, 'recover', {}),
    K(0.08, 'strike', { lean: -10, head: -12, armF: 20, armB: 20, x: -1 }),
    K(0.2, 'recover', { lean: 10, head: 10, hipY: 3, legF: 40, legB: -45, armF: -10, armB: -10, wep: -40 }),
    K(0.32, 'fall', { lean: 22, head: 18, hipY: 6.5, legF: 75, legB: -85, armF: -20, armB: -25, wep: -70, sq: 0.05 }),
    K(0.4, 'recover', { lean: 18, head: 16, hipY: 6, legF: 75, legB: -85, armF: -16, armB: -20, wep: -70 }),
    K(0.5, 'recover', { lean: 26, head: 22, hipY: 6.5, legF: 75, legB: -85, armF: -24, armB: -28, wep: -75 }),
    K(0.62, 'fall', { rot: 82, x: 2, lean: 8, head: 10, hipY: 1, legF: 12, legB: -6, armF: 70, armB: 50, wep: -30 }),
    K(0.68, 'recoil', { rot: 78, x: 2, lean: 8, head: 8, hipY: 1, legF: 14, legB: -8, armF: 72, armB: 52, wep: -30, sq: 0.06 }),
    K(0.74, 'recover', { rot: 84, x: 2, lean: 8, head: 10, hipY: 1, legF: 10, legB: -5, armF: 70, armB: 50, wep: -30 }),
    K(1, 'recover', { rot: 84, x: 2, lean: 8, head: 10, hipY: 1, legF: 10, legB: -5, armF: 70, armB: 50, wep: -30 }),
  ],
};

/** 倒下的样子到动作 */
export const DEATH_CLIP: Record<DeathStyle, Clip> = { fly: DIE_FLY, kneel: DIE_KNEEL, shot: DIE_SHOT, burn: DIE_BURN, soft: DIE_SOFT };

/** 单次伤害到这个数、或打掉一半以上的血、或是自爆（blast），算被打飞；否则跪倒 */
export const FLY_DMG = 90;
export function deathStyle(dmg: number, maxHp: number, blast: boolean): DeathStyle {
  return blast || dmg >= FLY_DMG || (maxHp > 0 && dmg * 2 >= maxHp) ? 'fly' : 'kneel';
}

/**
 * 按伤害类型选倒下的样子（类型从画面已有的事件推，见 dmgkind.ts；推不出来传 null 退回 deathStyle 的老逻辑）：
 * 炮弹 / 爆炸 → 炸飞，火 → 烧焦，枪弹 → 中弹倒地；晕着死的软倒（但被炸的照样飞，物理上躲不掉）；自爆的炸药兵总是飞。
 */
export function deathStyleFor(kind: 'shot' | 'shell' | 'fire' | 'blast' | null, dmg: number, maxHp: number, blast: boolean, stunned: boolean): DeathStyle {
  if (blast || kind === 'blast' || kind === 'shell') return 'fly';
  if (kind === 'fire') return 'burn';
  if (stunned) return 'soft';
  if (kind === 'shot') return 'shot';
  return deathStyle(dmg, maxHp, false);
}

/** 倒下过程里该放的粒子（位标志）：落地的尘土、烧焦的黑烟和火星 */
export const DFX_DUST = 1;
export const DFX_DUST_SMALL = 2;
export const DFX_SMOKE = 4;
export const DFX_EMBER = 8;
/**
 * 倒下进度从 k0 走到 k1 这一帧要放哪些粒子（只看有没有越过时间点，所以不管帧率高低、暂停冻结都不会重复放）：
 * 炸飞落地两次各扬一团尘；中弹倒地躺平时一小团；烧焦全程每 0.1 冒一缕黑烟、前 0.3 里隔 0.05 迸火星；软倒和跪倒不放。
 */
export function deathFx(style: DeathStyle, k0: number, k1: number): number {
  const cross = (t: number): boolean => k0 < t && k1 >= t;
  let f = 0;
  if (style === 'fly') {
    if (cross(0.36) || cross(0.5)) f |= DFX_DUST;
  } else if (style === 'shot') {
    if (cross(0.56)) f |= DFX_DUST_SMALL;
  } else if (style === 'burn') {
    if (k1 < 0.97 && Math.floor(k1 * 10) > Math.floor(k0 * 10)) f |= DFX_SMOKE;
    if (k1 <= 0.3 && Math.floor(k1 * 20) > Math.floor(k0 * 20)) f |= DFX_EMBER;
    if (cross(0.66)) f |= DFX_DUST_SMALL;
  }
  return f;
}

/** 烧焦的黑度：0 = 原色，1 = 烧黑；前 30% 的时间里烧黑，之后保持 */
export function charLevel(k: number): number {
  return clamp01(k / 0.3);
}

/** 倒下的透明度：前 60% 不透明，之后越淡越快 */
export function deathAlpha(k: number): number {
  return k < 0.6 ? 1 : 1 - easeInQuad((k - 0.6) / 0.4);
}

/**
 * 帽子掉落（和身体分开飞的部件）：返回帽子相对它倒下那一刻位置的偏移（设计单位）和角度（度，往前为正）。
 * fly：被打飞时往后上方飞出去、转着圈落地再弹一下；kneel：跪下时从头上滑落、往前翻着掉到地上。
 * y0 是帽子挂点离脚底的高度（负值），落地 = 回到脚底那条线。
 */
export function hatDrop(out: { x: number; y: number; r: number }, style: DeathStyle, k: number, y0: number): { x: number; y: number; r: number } {
  if (style === 'fly') {
    const u = clamp01(k / 0.45);
    const land = -y0 - 1.5;
    out.x = -48 * easeOutQuad(u);
    out.y = land * u - 16 * Math.sin(Math.PI * u);
    out.r = -520 * easeOutQuad(u);
    if (k > 0.45 && k < 0.58) out.y -= 2.5 * Math.sin(((k - 0.45) / 0.13) * Math.PI);
    return out;
  }
  if (style === 'shot') {
    // 帽子被震得往上跳一下，掉在身后
    const u = clamp01((k - 0.04) / 0.5);
    const land = -y0 - 1.5;
    out.x = -16 * easeOutQuad(u);
    out.y = land * u - 12 * Math.sin(Math.PI * u);
    out.r = -260 * easeOutQuad(u);
    return out;
  }
  const u = clamp01((k - 0.16) / 0.4);
  const land = -y0 - 1.5;
  out.x = 12 * easeOutQuad(u);
  out.y = land * easeInQuad(u) - 3 * Math.sin(Math.PI * u);
  out.r = 150 * u;
  if (k > 0.56 && k < 0.68) out.y -= 1.5 * Math.sin(((k - 0.56) / 0.12) * Math.PI);
  return out;
}

// ---------------------------------------------------------------- 攻击对齐

/**
 * 攻击动作的进度：tn = 离下一次出手还有多少毫秒，tl = 离上一次出手过了多少毫秒，ms = 动作时长，hit = 出手时刻（0..1）。
 * 下一次出手前的 hit·ms 毫秒里是预备和出手，上一次出手后的 (1-hit)·ms 毫秒里是余势和收招，中间等着（返回 -1，画面摆架势待机）。
 */
export function atkPhase(tn: number, tl: number, ms: number, hit: number): number {
  if (tn >= 0 && tn <= hit * ms) return hit - tn / ms;
  if (tl >= 0 && tl <= (1 - hit) * ms) return hit + tl / ms;
  return -1;
}

/**
 * 出手的局部顿帧（hit-stop）：攻击进度走到出手点后，这个兵自己的姿势停 HITSTOP_MS（60 帧下 2–3 帧），
 * 再用 CATCH_MS 平滑追回规则的进度（不跳、不突然变速），只停这一个单位，不顿全屏、不进 BIG_EVENT。k = 规则给的进度，返回画面用的进度。
 */
export const HITSTOP_MS = 45;
export const CATCH_MS = 90;
export function stopK(k: number, hit: number, ms: number): number {
  const u = (k - hit) * ms;
  if (u < 0) return k;
  if (u < HITSTOP_MS) return hit;
  if (u < HITSTOP_MS + CATCH_MS) {
    // smoothstep 追回：起步和收尾速度都和前后衔接（停住时 0、追上时 1 倍），中间最快约 2 倍
    const e = (u - HITSTOP_MS) / CATCH_MS;
    return hit + (k - hit) * e * e * (3 - 2 * e);
  }
  return k;
}

/** 挥砍的弧形残影：哪些攻击有、多大（相对肩到手 + 武器的长度）、多亮；壮汉的锤子最明显 */
export function arcLook(kind: RigKind): { len: number; alpha: number; tint: number } | null {
  const t = STYLE[kind].attack.arc;
  if (!t) return null;
  return t === 'smash' ? { len: 24, alpha: 0.95, tint: 0xf3ead8 } : t === 'throw' ? { len: 12, alpha: 0.6, tint: 0xffffff } : { len: 17, alpha: 0.75, tint: 0xffffff };
}

// ---------------------------------------------------------------- 细节层级、拥挤时降频

/** 身高（屏幕 CSS 像素）低于这个就退化成单张烘焙帧：小到看不清部件，没必要算 8 个部件 */
export const LOD_PX = 20;
/** 离屏外多少像素也算在屏里（走进屏幕前就摆好姿势） */
export const LOD_MARGIN = 60;
/** 0 = 完整骨架，1 = 单张烘焙帧，2 = 不在屏里（隐藏，不算姿势） */
export function rigLod(screenH: number, onScreen: boolean): 0 | 1 | 2 {
  if (!onScreen) return 2;
  return screenH < LOD_PX ? 1 : 0;
}

/** 同屏完整骨架多于这个数时，每个兵隔帧才重算一次部件（按编号错开），位置照样每帧插值 */
export const CROWD = 36;
export function poseEvery(n: number): number {
  return n <= CROWD ? 1 : n <= CROWD * 2 ? 2 : 3;
}

// ---------------------------------------------------------------- 骨架和兵种

/** 骨架：部件关节在设计单位里的位置（脚底为原点、朝右，未乘缩放）。素材生成（art/rigparts.ts）和正解（solveRig）共用 */
export interface Skel {
  /** 设计单位 → 世界像素的缩放（和原来整张帧的缩放一致） */
  s: number;
  /** 髋（身体的转轴）离脚底的高度（负值）和两腿离髋中线的距离 */
  hipY: number;
  hipX: number;
  /** 腿长（髋到脚底） */
  leg: number;
  /** 颈（头的转轴）、两肩：相对髋，身体直立时 */
  neck: [number, number];
  shF: [number, number];
  shB: [number, number];
  /** 手臂长（肩到手心） */
  arm: number;
  /** 帽子顶离脚底的高度（负值）：血条、受击飘字挂在它上面 */
  top: number;
}

/** 正解的结果：各部件锚点在容器里的位置（世界像素）和角度（弧度，Phaser 的顺时针为正） */
export interface PartXf {
  x: number;
  y: number;
  r: number;
}
export interface RigXf {
  legB: PartXf;
  legF: PartXf;
  armB: PartXf;
  torso: PartXf;
  head: PartXf;
  armF: PartXf;
  wep: PartXf;
}
export const RIG_PARTS = ['legB', 'legF', 'armB', 'torso', 'head', 'armF', 'wep'] as const satisfies ReadonlyArray<keyof RigXf>;
export const newXf = (): RigXf => ({ legB: { x: 0, y: 0, r: 0 }, legF: { x: 0, y: 0, r: 0 }, armB: { x: 0, y: 0, r: 0 }, torso: { x: 0, y: 0, r: 0 }, head: { x: 0, y: 0, r: 0 }, armF: { x: 0, y: 0, r: 0 }, wep: { x: 0, y: 0, r: 0 } });

const D = Math.PI / 180;

/**
 * 正解：姿势 → 各部件的位置和角度。腿挂在髋上（不跟身体前倾），头、两肩跟着身体转，手在手臂末端，武器在手上；
 * 整个人再绕脚底转 rot（倒地），最后乘缩放 s。帽子和头同一个锚点（倒下时画面层把它单独拿出来飞）。
 */
export function solveRig(out: RigXf, sk: Skel, p: Pose): RigXf {
  const rr = p.rot * D;
  const cr0 = Math.cos(rr);
  const sr0 = Math.sin(rr);
  const s = sk.s;
  const put = (o: PartXf, x: number, y: number, r: number): void => {
    o.x = (x * cr0 - y * sr0 + p.x) * s;
    o.y = (x * sr0 + y * cr0 + p.y) * s;
    o.r = r;
  };
  const hy = sk.hipY + p.hipY;
  put(out.legB, -sk.hipX, hy, rr - p.legB * D);
  put(out.legF, sk.hipX, hy, rr - p.legF * D);
  const lt = p.lean * D;
  const cl = Math.cos(lt);
  const sl = Math.sin(lt);
  put(out.torso, 0, hy, rr + lt);
  // 身体里的点（相对髋）转过前倾角，再落到根坐标
  const nx = sk.neck[0] * cl - sk.neck[1] * sl;
  const ny = sk.neck[0] * sl + sk.neck[1] * cl;
  put(out.head, nx, hy + ny, rr + lt + p.head * D);
  const fx = sk.shF[0] * cl - sk.shF[1] * sl;
  const fy = sk.shF[0] * sl + sk.shF[1] * cl;
  const bx = sk.shB[0] * cl - sk.shB[1] * sl;
  const by = sk.shB[0] * sl + sk.shB[1] * cl;
  const af = lt - p.armF * D;
  put(out.armB, bx, hy + by, rr + lt - p.armB * D);
  put(out.armF, fx, hy + fy, rr + af);
  // 手在前臂末端：手臂是朝下（0, arm）的向量，转过 af
  const hx = fx - sk.arm * Math.sin(af);
  const hyy = hy + fy + sk.arm * Math.cos(af);
  put(out.wep, hx, hyy, rr + lt - p.wep * D);
  return out;
}

/** 走路一个循环（两步）走多远（世界像素）：两步的步幅 = 4 × 腿长 × sin(最大摆角) × 缩放 */
export function strideOf(sk: Skel, legScale = 1): number {
  return 4 * sk.leg * Math.sin(WALK_SWING * legScale * D) * sk.s;
}

/** 兵种的动作风格 */
export interface RigStyle {
  /** 站姿（关键帧都是相对它的增量） */
  rest: Pose;
  walk: Clip;
  idle: Clip;
  attack: Clip;
  /** 待机时随机插进来的小动作（东张西望、船长指挥） */
  extras: Clip[];
  /** 走路腿摆的倍数（算步幅用，和 walk 里 legF 的缩放一致） */
  legScale: number;
  /** 受击幅度：重的兵挨一下晃得小 */
  hitScale: number;
  /** 没有腿（雾灵飘着）、没有帽子 */
  noLegs?: boolean;
}

export type RigKind =
  | 't.sailor' | 't.gunner' | 't.brute' | 't.bomber' | 't.captain' | 't.medic' | 't.cannoneer' | 't.harpooner' | 't.grenadier' | 't.shield'
  | 'e.sailor' | 'e.ironclad' | 'e.fog' | 'e.skiff' | 'e.skiffling' | 'e.sapper' | 'e.grenadier' | 'e.captain' | 'e.shield';

export const RIG_KINDS: RigKind[] = ['t.sailor', 't.gunner', 't.brute', 't.bomber', 't.captain', 't.medic', 't.cannoneer', 't.harpooner', 't.grenadier', 't.shield', 'e.sailor', 'e.ironclad', 'e.fog', 'e.skiff', 'e.skiffling', 'e.sapper', 'e.grenadier', 'e.captain', 'e.shield'];

/** 人形骨架的默认数：髋 -11、腿 10.4、肩在身体顶下 3～4 */
function man(s: number, top: number, sh: [number, number], arm: number, headTop: number): Skel {
  return { s, hipY: -11, hipX: 2.5, leg: 10.4, neck: [1, top + 12], shF: [sh[0], sh[1] + 11], shB: [-sh[0], sh[1] + 11], arm, top: headTop };
}

export const SKEL: Record<RigKind, Skel> = {
  't.sailor': man(1.56, -24, [4.6, -21], 10, -46),
  't.gunner': man(1.56, -24, [4.6, -21], 10, -49),
  't.brute': man(2.0, -28, [8.5, -24], 10.5, -50),
  't.bomber': man(1.42, -23, [4.4, -20], 9.5, -47),
  't.captain': man(1.7, -25, [5.6, -22], 10, -58),
  't.medic': man(1.56, -24, [4.6, -21], 10, -46),
  't.cannoneer': man(1.9, -26, [7.4, -22], 10, -48),
  't.harpooner': man(1.56, -24, [4.6, -21], 10, -49),
  't.grenadier': man(1.5, -24, [4.6, -21], 10, -49),
  't.shield': man(1.6, -24, [4.8, -21], 10, -50),
  'e.sailor': man(1.5, -24, [4.6, -20], 9.5, -47),
  'e.ironclad': man(1.75, -25, [6.7, -21], 9.5, -48),
  'e.fog': man(1.5, -24, [4.9, -20], 9.5, -48),
  'e.sapper': man(1.5, -23, [4.5, -19], 9.5, -46),
  'e.grenadier': man(1.5, -24, [4.6, -20], 9.5, -48),
  'e.shield': man(1.6, -24, [4.8, -20], 9.5, -49),
  'e.captain': man(2.25, -25, [5.7, -21], 10, -58),
  // 小艇怪：船身当身体（髋 = 船底中间），两支桨当腿，船员探出的脑袋和一只手
  'e.skiff': { s: 1.45, hipY: -9, hipX: 9, leg: 9.5, neck: [3, -13], shF: [1, -7], shB: [-3, -7], arm: 9, top: -40 },
  'e.skiffling': { s: 0.85, hipY: -9, hipX: 9, leg: 9.5, neck: [3, -13], shF: [1, -7], shB: [-3, -7], arm: 9, top: -40 },
};

const rest = (p: Partial<Pose>): Pose => pose(p);
const STD_REST = { armF: 37, armB: -29, legF: 14, legB: -9 };

/**
 * 各兵种的步态。T = 想要的一个循环（两步）的秒数，v = 规则速度（格/秒，troops.ts 一级），按 PX_PER_TILE = 40 估：
 * leg 由 sin(WALK_SWING × leg) = v × 40 × T / (4 × 腿长 10.4 × 缩放) 反推（tests/rig-feel.test.ts 校验 T 在 ±8% 内）。
 *   兵种        v    缩放   T(秒)  步频(步/秒)  leg    风格
 *   水手       1.6  1.56   0.72   2.8        0.94   碎步快、弹跳大、手甩得开
 *   鱼叉手     1.6  1.56   0.70   2.9        0.91   同水手，更碎更轻
 *   炸药兵     2.0  1.42   0.62   3.2        1.19   小跑、前倾、蹦得高
 *   船医       1.6  1.56   0.80   2.5        1.09   提药箱，前臂少摆
 *   火枪手     1.5  1.56   0.86   2.3        1.10   端枪走：手臂、头、上身都稳
 *   掷弹兵     1.3  1.50   0.95   2.1        1.09   稳步，手臂摆一半
 *   船长       1.5  1.70   0.95   2.1        1.12   挺胸大步，起伏小
 *   盾兵       1.0  1.60   1.00   2.0        0.77   小步沉稳，持盾的前臂几乎不摆
 *   火炮兵     1.2  1.90   1.05   1.9        0.83   推炮：手不摆、身子前倾、膝盖弯
 *   壮汉       1.2  2.00   1.15   1.7        0.87   慢而沉：落脚下压（髋沉、压扁大）、身子晃
 * 敌人（守岛的单位速度和登陆战不是一套单位）沿用对应兵种的步态，leg 不动，步幅和以前一样。
 */
const G = (o: Partial<Gait>): Gait => ({ ...BASE_GAIT, ...o });
const GAIT = {
  sailor: G({ leg: 0.94, arm: 1.35, bob: 1.35, lean: 0.9, head: 1.2, sq: 0.9, asym: 0.1 }),
  harpooner: G({ leg: 0.91, arm: 1.35, bob: 1.4, lean: 1.1, head: 1.2, sq: 0.9, asym: 0.12 }),
  bomber: G({ leg: 1.19, arm: 1.3, bob: 1.7, lean: 1.8, head: 1, hip: 0.4, asym: 0.1, wep: 0.6 }),
  medic: G({ leg: 1.09, arm: 1, armF: 0.45, wep: 0, bob: 1, lean: 1, head: 1, asym: 0.15 }),
  gunner: G({ leg: 1.1, arm: 0.35, wep: 0.25, bob: 0.65, lean: 0.55, head: 0.45, sq: 0.75, asym: 0.06 }),
  grenadier: G({ leg: 1.09, arm: 0.7, bob: 1.1, lean: 1, head: 0.9, asym: 0.08 }),
  captain: G({ leg: 1.12, arm: 0.85, bob: 0.8, lean: 0.4, head: 0.6, sq: 0.9, asym: 0.05 }),
  shield: G({ leg: 0.77, arm: 0.5, armF: 0.35, armB: 1.3, wep: 0.4, bob: 0.9, lean: 0.9, head: 0.8, sq: 1.3, hip: 0.8, asym: 0.1 }),
  cannoneer: G({ leg: 0.83, arm: 0.12, wep: 0.1, bob: 0.8, lean: 2.6, head: 1, sq: 1.2, hip: 1.5, asym: 0.1 }),
  brute: G({ leg: 0.87, arm: 0.55, wep: 0.4, bob: 1.5, lean: 1.6, head: 1.4, sq: 1.8, hip: 2.2, asym: 0.18 }),
  // 敌人：沿用对应兵种
  eSailor: G({ leg: 1, arm: 1.1, bob: 1.1, asym: 0.1 }),
  eIronclad: G({ leg: 0.8, arm: 0.55, wep: 0.4, bob: 1.5, lean: 1.6, head: 1.4, sq: 1.8, hip: 2.2, asym: 0.18 }),
  eSapper: G({ leg: 1, bob: 1.3, lean: 1.4, asym: 0.1 }),
  eGrenadier: G({ leg: 1, arm: 0.7, bob: 1.1, head: 0.9, asym: 0.08 }),
  eShield: G({ leg: 0.9, arm: 0.5, armF: 0.35, armB: 1.3, wep: 0.4, bob: 0.9, lean: 0.9, head: 0.8, sq: 1.3, hip: 0.8, asym: 0.1 }),
  eCaptain: G({ leg: 1, arm: 0.8, bob: 1.2, lean: 0.6, head: 0.7, asym: 0.05 }),
  // 雾灵飘着：没有腿，只上下浮、前后晃
  fog: G({ leg: 0, arm: 0.6, wep: 1, bob: 1.6, lean: 1.2, sq: 0.5, asym: 0.1 }),
  // 小艇：桨当腿，摆得大，船身一晃一晃
  skiff: G({ leg: 1.4, arm: 0.4, armB: 0, wep: 1, bob: 0.7, lean: 1.5, head: 1.5, sq: 1, asym: 0.12 }),
  skiffling: G({ leg: 1.4, arm: 0.4, armB: 0, wep: 1, bob: 0.91, lean: 1.5, head: 1.5, sq: 1, asym: 0.12 }),
} as const satisfies Record<string, Gait>;
const WALKS = Object.fromEntries(Object.entries(GAIT).map(([k, g]) => [k, gaitClip(g)])) as { [K in keyof typeof GAIT]: Clip };

export const STYLE: Record<RigKind, RigStyle> = {
  // 水手：轻快，步子碎、手甩得开，砍得快（出手比别的砍手快：540 毫秒、预备 0.23 秒）
  't.sailor': { rest: rest({ ...STD_REST, wep: 68 }), walk: WALKS.sailor, idle: IDLE, attack: scaleClip(SLASH, {}, { ms: 540 }), extras: [LOOK], legScale: GAIT.sailor.leg, hitScale: 1 },
  // 火枪手：枪斜扛着走，开火后要装填
  't.gunner': { rest: rest({ ...STD_REST, wep: 31 }), walk: WALKS.gunner, idle: IDLE, attack: SHOOT, extras: [LOOK], legScale: GAIT.gunner.leg, hitScale: 1 },
  // 壮汉：慢而沉，每步身子一晃、落脚下压，锤子蓄力很久（1200 毫秒、预备 0.6 秒，比水手长一倍多）
  't.brute': { rest: rest({ ...STD_REST, armF: 30, armB: -20, wep: 92, legF: 12, legB: -10 }), walk: WALKS.brute, idle: scaleClip(IDLE, { y: 1.5, sq: 1.3 }), attack: scaleClip(SMASH, {}, { ms: 1200 }), extras: [LOOK], legScale: GAIT.brute.leg, hitScale: 0.55 },
  // 炸药兵：背着桶小跑，蹦得高
  't.bomber': { rest: rest({ ...STD_REST, armF: 45 }), walk: WALKS.bomber, idle: IDLE, attack: scaleClip(THROW, { wep: 0.2 }, { ms: 520 }), extras: [LOOK], legScale: GAIT.bomber.leg, hitScale: 1.1 },
  // 船长：挺胸、步子稳，砍得大开大合，待机时举剑指挥
  't.captain': { rest: rest({ ...STD_REST, armF: 30, wep: 67, lean: -2 }), walk: WALKS.captain, idle: IDLE, attack: scaleClip(SLASH, { armF: 1.1, wep: 1.1, lean: 1.2 }, { ms: 760 }), extras: [COMMAND, LOOK], legScale: GAIT.captain.leg, hitScale: 0.7 },
  // 船医：提着药箱走，举箱子放绿光
  't.medic': { rest: rest({ ...STD_REST, armF: 20 }), walk: WALKS.medic, idle: IDLE, attack: HEAL, extras: [LOOK], legScale: GAIT.medic.leg, hitScale: 1 },
  // 火炮兵：双手推着小炮，身子前倾，开火被顶得往后滑
  't.cannoneer': { rest: rest({ armF: 62, armB: 50, legF: 12, legB: -10, lean: 6 }), walk: WALKS.cannoneer, idle: scaleClip(IDLE, { armF: 0.3, armB: 0.3 }), attack: CANNON, extras: [], legScale: GAIT.cannoneer.leg, hitScale: 0.8 },
  // 鱼叉手：轻，出手快
  't.harpooner': { rest: rest({ ...STD_REST, wep: 69 }), walk: WALKS.harpooner, idle: IDLE, attack: scaleClip(THROW, {}, { ms: 520 }), extras: [LOOK], legScale: GAIT.harpooner.leg, hitScale: 1.1 },
  // 掷弹兵：步子稳，抬手一抛，抛完要收手
  't.grenadier': { rest: rest({ ...STD_REST, armF: 45 }), walk: WALKS.grenadier, idle: IDLE, attack: scaleClip(THROW, { wep: 0.2 }, { ms: 640 }), extras: [LOOK], legScale: GAIT.grenadier.leg, hitScale: 1 },
  // 盾兵：沉稳的小步，短刀慢慢捅，被打时晃得很小（盾那一下晃由画面层另算）
  't.shield': { rest: rest({ ...STD_REST, armF: 52, armB: -16, wep: 62 }), walk: WALKS.shield, idle: IDLE, attack: scaleClip(SLASH, { armF: 0.8, wep: 0.85 }, { ms: 760 }), extras: [LOOK], legScale: GAIT.shield.leg, hitScale: 0.6 },
  'e.shield': { rest: rest({ ...STD_REST, armF: 52, armB: -16, wep: 62 }), walk: WALKS.eShield, idle: IDLE, attack: scaleClip(SLASH, { armF: 0.8, wep: 0.85 }, { ms: 800 }), extras: [], legScale: GAIT.eShield.leg, hitScale: 0.6 },
  'e.sailor': { rest: rest({ ...STD_REST, armF: 30, wep: 55 }), walk: WALKS.eSailor, idle: IDLE, attack: SLASH, extras: [], legScale: GAIT.eSailor.leg, hitScale: 1 },
  'e.ironclad': { rest: rest({ ...STD_REST, armF: 30, armB: 10, wep: 60 }), walk: WALKS.eIronclad, idle: IDLE, attack: scaleClip(SMASH, {}, { ms: 900 }), extras: [], legScale: GAIT.eIronclad.leg, hitScale: 0.5 },
  'e.fog': { rest: rest({ armF: 30, armB: -25, wep: 55 }), walk: WALKS.fog, idle: IDLE, attack: SLASH, extras: [], legScale: 1, hitScale: 1.2, noLegs: true },
  'e.sapper': { rest: rest({ ...STD_REST, armF: 45 }), walk: WALKS.eSapper, idle: IDLE, attack: scaleClip(THROW, { wep: 0.2 }), extras: [], legScale: GAIT.eSapper.leg, hitScale: 1 },
  'e.grenadier': { rest: rest({ ...STD_REST, armF: 45 }), walk: WALKS.eGrenadier, idle: IDLE, attack: scaleClip(THROW, { wep: 0.2 }, { ms: 700 }), extras: [], legScale: GAIT.eGrenadier.leg, hitScale: 1 },
  'e.captain': { rest: rest({ ...STD_REST, armF: 30, wep: 60, lean: -2 }), walk: WALKS.eCaptain, idle: IDLE, attack: scaleClip(SLASH, { armF: 1.1, wep: 1.1, lean: 1.3, sq: 1.4 }, { ms: 840 }), extras: [], legScale: GAIT.eCaptain.leg, hitScale: 0.45 },
  'e.skiff': { rest: rest({ armF: 40, legF: 10, legB: -10 }), walk: WALKS.skiff, idle: IDLE, attack: RAM, extras: [], legScale: GAIT.skiff.leg, hitScale: 0.8 },
  'e.skiffling': { rest: rest({ armF: 40, legF: 10, legB: -10 }), walk: WALKS.skiffling, idle: IDLE, attack: scaleClip(RAM, {}, { ms: 480 }), extras: [], legScale: GAIT.skiffling.leg, hitScale: 1.3 },
};
