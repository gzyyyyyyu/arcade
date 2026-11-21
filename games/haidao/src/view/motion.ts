/**
 * 动作的数学（纯函数，不依赖 Phaser / DOM，tests/motion.test.ts 锁住）：
 * 统一缓动曲线、拍间插值、转向过渡、攻击三段（预备 - 出手 - 收招）、受击、死亡、建筑受损阶段和升起。
 * 场景里需要"按动作选 ease"时一律从这里取，不在各处自己写 'Quad.easeOut' 之类的字符串或线性插值。
 */
import { TICKS_PER_SEC } from '../core/types.ts';

/** 一个逻辑拍多少毫秒：画面在两拍之间插值、按墙钟追拍都用它（登陆战和守岛同一个） */
export const STEP_MS = 1000 / TICKS_PER_SEC;

// ---------------------------------------------------------------- 缓动

/** Phaser 补间用的曲线名：按动作选，不用线性 */
export const EASE = {
  /** 出手：快起、冲到头减速 */
  strike: 'Cubic.easeOut',
  /** 收招 / 呼吸 / 来回摆：慢进慢出 */
  recover: 'Sine.easeInOut',
  /** 落地、升起、弹出：过冲一点再回弹 */
  land: 'Back.easeOut',
  /** 后坐、击退：猛地顶出去再缓缓回位 */
  recoil: 'Quad.easeOut',
  /** 倒下、下沉：越来越快 */
  fall: 'Quad.easeIn',
  /** 淡出：先留着，后面才消 */
  fade: 'Quad.easeIn',
  /** 落地后的颤动 */
  bounce: 'Bounce.easeOut',
} as const;
export type EaseName = keyof typeof EASE;

export const clamp01 = (k: number): number => (k < 0 ? 0 : Math.min(k, 1));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const easeOutCubic = (k: number): number => 1 - (1 - clamp01(k)) ** 3;
export const easeInQuad = (k: number): number => clamp01(k) ** 2;
export const easeOutQuad = (k: number): number => 1 - (1 - clamp01(k)) ** 2;
export const easeInOutSine = (k: number): number => -(Math.cos(Math.PI * clamp01(k)) - 1) / 2;
/** 过冲约 10%，和 Phaser 的 Back.easeOut 同一条 */
export function easeOutBack(k: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const t = clamp01(k) - 1;
  return 1 + c3 * t ** 3 + c1 * t ** 2;
}

/** 落地后的颤动，和 Phaser 的 Bounce.easeOut 同一条 */
function easeOutBounce(k: number): number {
  let t = clamp01(k);
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

/** 同一套曲线的函数版（分件骨架按帧采样关键帧时用，rig.ts），名字和 EASE 一一对应 */
export const EASE_FN: Record<EaseName, (k: number) => number> = {
  strike: easeOutCubic,
  recover: easeInOutSine,
  land: easeOutBack,
  recoil: easeOutQuad,
  fall: easeInQuad,
  fade: easeInQuad,
  bounce: easeOutBounce,
};

// ---------------------------------------------------------------- 拍间插值

export interface Pt {
  x: number;
  y: number;
}

/** 逻辑拍是 20 拍 / 秒，画面按帧走：显示位置 = 上一拍到这一拍之间按帧内时间比例插。 */
export function interpPos(out: Pt, px: number, py: number, cx: number, cy: number, frac: number, snap = Infinity): Pt {
  // 一拍之间跳得太远（传送、重生、刚出生）不插，直接到位，免得滑过半个岛
  if (Math.abs(cx - px) + Math.abs(cy - py) > snap) {
    out.x = cx;
    out.y = cy;
    return out;
  }
  const k = clamp01(frac);
  out.x = px + (cx - px) * k;
  out.y = py + (cy - py) * k;
  return out;
}

/** 走路步伐：按走过的距离算第几帧，脚不在地上打滑（stride = 走多远换一帧） */
export function strideFrame(dist: number, stride: number, n: number): number {
  return Math.floor(Math.max(0, dist) / stride) % n;
}

// ---------------------------------------------------------------- 转向

/** 一次转身（从一边翻到另一边）用的时间 */
export const TURN_MS = 130;

/**
 * 转向过渡：facing 在 -1..1 之间连续变，显示用 scaleX = facing * 基准缩放。
 * 经过 0 时图是扁的，看上去是"先压扁再翻过去"，不是瞬切。target 只取 -1 / 1。
 */
export function turnStep(cur: number, target: number, dtMs: number, ms = TURN_MS): number {
  const step = (2 * Math.max(0, dtMs)) / ms;
  if (cur < target) return Math.min(target, cur + step);
  if (cur > target) return Math.max(target, cur - step);
  return cur;
}

// ---------------------------------------------------------------- 攻击

/** 攻击一个来回的三段占比：预备（蓄力后拉）- 出手（快）- 收招（慢） */
export const ATTACK = { windup: 0.28, strike: 0.42 } as const;

/** 攻击进度 → 单张帧的下标（远处退化成单张帧的兵、鹦鹉用；n 帧：预备、出手、出手后摇、收招；n 不是 4 时按比例落） */
export function attackFrame(k: number, n: number): number {
  const t = clamp01(k);
  const q = t < ATTACK.windup ? 0 : t < ATTACK.strike ? 1 : t < 0.6 ? 2 : 3;
  return Math.min(n - 1, Math.round((q * (n - 1)) / 3));
}

// ---------------------------------------------------------------- 死亡

/** 倒下用的时长（毫秒）：先倒（前 55%），再淡出 */
export const DEATH_MS = 620;

export interface DeathPose {
  /** 旋转弧度（乘以倒向 dir 用） */
  angle: number;
  /** 往下沉多少像素 */
  dy: number;
  /** 纵向缩放（落地那一下压扁） */
  sy: number;
  alpha: number;
}

/** 死亡姿态：先后仰倒地（越倒越快），落地压一下，再淡出；k = 经过时间 / DEATH_MS */
export function deathPose(out: DeathPose, k: number): DeathPose {
  const t = clamp01(k);
  const fall = easeInQuad(Math.min(1, t / 0.5));
  out.angle = fall * 1.45;
  out.dy = fall * 5;
  const land = t > 0.5 && t < 0.7 ? Math.sin(((t - 0.5) / 0.2) * Math.PI) : 0;
  out.sy = 1 - land * 0.1;
  out.alpha = t < 0.55 ? 1 : 1 - easeInQuad((t - 0.55) / 0.45);
  return out;
}

// ---------------------------------------------------------------- 建筑

/** 受损阶段：0 完好，1 冒烟（血量 <66%），2 着火（<33%），3 半塌（<15%：压低、歪一点、发黑） */
export type DamageStage = 0 | 1 | 2 | 3;
export function damageStage(hp: number, maxHp: number): DamageStage {
  if (maxHp <= 0) return 0;
  const f = hp / maxHp;
  return f < 0.15 ? 3 : f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
}

/** 各阶段的外观：纵向压低、歪斜（弧度）、染色（0xffffff = 不染）、冒烟 / 起火的间隔（毫秒，0 = 没有） */
export const STAGE_LOOK: Record<DamageStage, { sy: number; tilt: number; tint: number; smokeMs: number; fireMs: number }> = {
  0: { sy: 1, tilt: 0, tint: 0xffffff, smokeMs: 0, fireMs: 0 },
  1: { sy: 1, tilt: 0, tint: 0xe6e0da, smokeMs: 380, fireMs: 0 },
  2: { sy: 0.97, tilt: 0.012, tint: 0xc4b8ae, smokeMs: 300, fireMs: 170 },
  3: { sy: 0.9, tilt: 0.03, tint: 0x9a8f86, smokeMs: 240, fireMs: 120 },
};

/** 建造升起：纵向从压扁到站直，带一点过冲；k = 经过时间 / 总时长。返回 [纵向缩放, 横向缩放, 透明度] */
export function riseScale(k: number): [number, number, number] {
  const t = clamp01(k);
  const y = Math.max(0.05, easeOutBack(t));
  const x = 1 + (1 - Math.min(1.2, y)) * 0.12;
  return [y, x, Math.min(1, t * 4)];
}

/** 守岛造塔升起的总时长（毫秒）和到顶的时刻（占比）：前 300 毫秒从木台上慢进慢出地长高、略高过头，后 100 毫秒落回原大 */
export const TOWER_RISE_MS = 400;
const TOWER_PEAK = 0.75;
const TOWER_OVER = 0.07;

/**
 * 守岛造塔的升起：基地的 riseScale 是 easeOutBack，前三成时间就到原大，放在守岛 12 帧联系表里第 3 格已经长完、看不出升起；
 * 这里改成整段慢进慢出地长到 1 + TOWER_OVER，再落回 1。返回 [纵向缩放, 横向缩放, 透明度]
 */
export function towerRise(k: number): [number, number, number] {
  const t = clamp01(k);
  const y = t < TOWER_PEAK ? 0.05 + (1 + TOWER_OVER - 0.05) * easeInOutSine(t / TOWER_PEAK) : 1 + TOWER_OVER * (1 - easeInOutSine((t - TOWER_PEAK) / (1 - TOWER_PEAK)));
  return [y, 1 + (1 - Math.min(1, y)) * 0.12 - Math.max(0, y - 1) * 0.5, Math.min(1, t * 6)];
}

/** 船沉下去的总时长（毫秒）：比人倒下（DEATH_MS）长，看得清船身没进水里 */
export const SINK_MS = 1200;

/**
 * 船沉没的姿态，k = 0..1：船身按吃水线往下缩（图的锚点在船底，纵向缩放 = 没进水里）、船尾翘起一点、略往下沉，后四成淡出。
 * 返回 { rot（弧度，乘倒向）, sy（纵向缩放）, dy（下沉像素）, alpha }
 */
export function sinkPose(k: number): { rot: number; sy: number; dy: number; alpha: number } {
  const t = clamp01(k);
  const e = t * t;
  return { rot: 0.2 * easeOutQuad(t), sy: 1 - 0.7 * e, dy: 8 * e, alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4 };
}

/**
 * 船在水里的起伏，now 毫秒、seed 让每条船错开：上下约 ±2.4 像素、周期约 3.9 秒。返回竖向偏移
 */
export function shipBob(now: number, seed: number): number {
  return Math.sin(now / 620 + seed * 1.7) * 2.4;
}

/** 船开炮的后坐，k = 开炮后经过的时间 / SHIP_RECOIL_MS：一下坐到底再慢慢回位，返回 0..1 的后坐量 */
export const SHIP_RECOIL_MS = 320;
export function shipRecoil(k: number): number {
  return k < 0 || k >= 1 ? 0 : (1 - k) * (1 - k);
}

/**
 * 建筑挨打的纵向压扁回弹，k = 经过时间 / HIT_SQUASH_MS：挨打那一下立刻压到 1 - HIT_SQUASH，再衰减着回弹（略过 1），k = 1 时正好回到 1。
 * 横向跟着胖 / 瘦一半（体积感）。返回 [横向缩放, 纵向缩放]
 */
export const HIT_SQUASH = 0.06;
export const HIT_SQUASH_MS = 140;
export function hitSquash(k: number): [number, number] {
  const t = clamp01(k);
  const y = t >= 1 ? 1 : 1 - HIT_SQUASH * Math.exp(-3 * t) * Math.cos(2.5 * Math.PI * t);
  return [1 + (1 - y) * 0.5, y];
}

/** 倒塌的下沉：压扁 + 下沉 + 发暗，k = 0..1（easeIn，越塌越快） */
export function collapseScale(k: number): { sx: number; sy: number; dy: number } {
  const e = easeInQuad(k);
  return { sx: 1 + 0.06 * e, sy: 1 - 0.28 * e, dy: 5 * e };
}

// ---------------------------------------------------------------- 锚钩（tdhookfx.ts）

/** 收链几拍（拉完以后链子缩回英雄手里） */
export const REEL_TICKS = 4;
type HookPhase = { kind: 'fly'; k: number } | { kind: 'pull' } | { kind: 'reel'; k: number } | { kind: 'done' };

/** 这一刻（ft 是带小数的拍）锚钩演到哪一段，k 是这一段走了几成（0..1）。纯函数，单测锁住 */
export function hookPhase(fx: { t0: number; t1: number; t2: number }, ft: number): HookPhase {
  if (ft < fx.t1) return { kind: 'fly', k: Math.max(0, (ft - fx.t0) / Math.max(1, fx.t1 - fx.t0)) };
  if (ft < fx.t2) return { kind: 'pull' };
  if (ft < fx.t2 + REEL_TICKS) return { kind: 'reel', k: (ft - fx.t2) / REEL_TICKS };
  return { kind: 'done' };
}
