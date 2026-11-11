/**
 * 炮台和弹道的数学（纯函数，不依赖 Phaser / DOM，tests/aim.test.ts 锁住）：
 * 炮管转向（角速度上限 + 缓入缓出、要开火时加急）、等距方向帧、开火序列（预备后缩 - 后坐 - 回位、底座震动）、
 * 火枪手装填、喷火的起势 / 持续 / 收尾、鱼叉绳子、炮弹弧线和地面阴影。
 *
 * 角度一律用"地面角" φ（等距投影之前的地面平面，atan2(格 y, 格 x)），转速在地面上均匀；画的时候再投到屏幕。
 * 规则的开火时刻不动：画面按规则的 aim（正瞄着谁）和 cd（下一次开火的拍）提前转，开火瞬间已经对准；
 * 对不准（刚换目标、冷却已好）时转速按剩余时间加急，开火那一帧还差的角度一次补完（aimSnap），画面和命中不错位。
 */
import { ISLAND } from '../core/types.ts';
import { unIso } from './iso.ts';
import { clamp01, easeInOutSine, easeInQuad, easeOutCubic, easeOutQuad } from './motion.ts';

export type TurretKind = 'cannon' | 'gunTower' | 'mortar' | 'flame' | 'harpoon' | 'rocket' | 'shock' | 'sniper';
export const TURRET_KINDS: readonly TurretKind[] = ['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'sniper'];
export const isTurret = (k: string): k is TurretKind => (TURRET_KINDS as readonly string[]).includes(k);

const TAU = Math.PI * 2;

/** 角度差折到 (-π, π] */
export function wrapPi(a: number): number {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  else if (x <= -Math.PI) x += TAU;
  return x;
}

// ---------------------------------------------------------------- 等距方向

/** 地面上一格长的单位向量投到屏幕（1 倍像素）：右下 (1,0) → (32,16)，左下 (0,1) → (-32,16) */
export function isoVec(phi: number): [number, number] {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [(c - s) * 32, (c + s) * 16];
}

/** 地面角在屏幕上的方向角 */
export function screenAngle(phi: number): number {
  const v = isoVec(phi);
  return Math.atan2(v[1], v[0]);
}

/** 屏幕上的位移 → 地面角（目标在屏幕上的位置换成炮管该朝的方向） */
export function groundAngle(dx: number, dy: number): number {
  return Math.atan2(dy / 32 - dx / 64, dx / 64 + dy / 32);
}

/** 炮管画成多少个方向的帧（每个方向按真实透视画，帧之间用小角度旋转补齐，转起来连续） */
export const DIRS = 16;
const STEP = TAU / DIRS;

/** 地面角对应的方向帧下标（0 = 地面 +x，即屏幕右下，逆着屏幕顺时针递增） */
export function dirIndex(phi: number): number {
  return ((Math.round(phi / STEP) % DIRS) + DIRS) % DIRS;
}
export const dirAngle = (i: number): number => i * STEP;

/** 选中的方向帧和真实朝向在屏幕上差的角度：图再转这么多，炮口方向逐帧连续 */
export function dirResidual(phi: number, i = dirIndex(phi)): number {
  return wrapPi(screenAngle(phi) - screenAngle(dirAngle(i)));
}

/** 炮口（或任意挂点）相对转轴的屏幕偏移：沿地面方向 len 格、高出 z 像素，再乘整体缩放 k */
export function tipOffset(out: { x: number; y: number }, phi: number, len: number, z: number, k = 1): { x: number; y: number } {
  const v = isoVec(phi);
  out.x = v[0] * len * k;
  out.y = v[1] * len * k - z * k;
  return out;
}

// ---------------------------------------------------------------- 转向

export interface AimSpec {
  /** 平时的最高转速（弧度 / 秒）和角加速度（弧度 / 秒²）：起转有加速、到位前减速（缓入缓出） */
  w: number;
  acc: number;
  /** 开火前来不及时的加急上限 */
  wMax: number;
  /** 后坐：预备时后缩 prep 像素、开火顶回 recoil 像素；kick 毫秒顶到底，ret 毫秒回位，预备 prepMs 毫秒 */
  prep: number;
  recoil: number;
  kick: number;
  ret: number;
  prepMs: number;
  /** 底座震动：往下压几个像素、多少毫秒 */
  shake: number;
  shakeMs: number;
}

/** 震荡炮开火前的蓄力时长（毫秒） */
export const SHOCK_CHARGE_MS = 300;

export const TURRET_SPEC: Record<TurretKind, AimSpec> = {
  cannon: { w: 3.6, acc: 16, wMax: 16, prep: 1.4, recoil: 6, kick: 45, ret: 340, prepMs: 120, shake: 1.2, shakeMs: 150 },
  gunTower: { w: 5.5, acc: 30, wMax: 20, prep: 0.6, recoil: 2.5, kick: 50, ret: 200, prepMs: 90, shake: 0.4, shakeMs: 90 },
  mortar: { w: 2.6, acc: 10, wMax: 12, prep: 2.5, recoil: 5, kick: 60, ret: 460, prepMs: 180, shake: 2, shakeMs: 220 },
  flame: { w: 2.8, acc: 9, wMax: 12, prep: 0, recoil: 0, kick: 1, ret: 1, prepMs: 1, shake: 0, shakeMs: 1 },
  harpoon: { w: 3.2, acc: 13, wMax: 14, prep: 2.2, recoil: 3, kick: 40, ret: 280, prepMs: 160, shake: 0.8, shakeMs: 120 },
  rocket: { w: 3, acc: 11, wMax: 13, prep: 1.2, recoil: 3, kick: 50, ret: 300, prepMs: 130, shake: 1, shakeMs: 140 },
  // 震荡炮：开火前蓄力 0.3 秒（炮身慢慢缩进去），放出去时猛地顶出，底座震得最重
  shock: { w: 2.4, acc: 9, wMax: 11, prep: 3.2, recoil: 7, kick: 40, ret: 420, prepMs: SHOCK_CHARGE_MS, shake: 2.4, shakeMs: 260 },
  // 狙击塔：转得慢而稳（预警 0.5 秒里炮管跟着目标慢慢摆正），开火后坐很深、回位很慢，塔台只轻轻一颤
  sniper: { w: 1.7, acc: 7, wMax: 8, prep: 0.8, recoil: 9, kick: 35, ret: 520, prepMs: 120, shake: 0.9, shakeMs: 200 },
};

export interface AimState {
  /** 当前地面角、角速度（弧度 / 秒） */
  a: number;
  v: number;
}

/**
 * 推进一帧转向：最高转速 w、角加速度 acc 的梯形速度曲线（起转加速、到位前按刹车曲线减速，不过冲）。
 * until = 离下一次开火还有多少毫秒（不知道就 Infinity）：剩余角度按 w 转不完时，转速按需要提到最多 wMax（加速度同比例放大）。
 * 返回这一帧转过的角度（弧度，带符号）。
 */
export function aimStep(st: AimState, target: number, dtMs: number, sp: AimSpec, until = Infinity): number {
  const dt = Math.max(0, dtMs) / 1000;
  if (dt === 0) return 0;
  const d = wrapPi(target - st.a);
  const ad = Math.abs(d);
  let cap = sp.w;
  let acc = sp.acc;
  if (until < 1e6) {
    // 三角形速度曲线在剩余时间 T 里转完 ad：峰值 2·ad/T、加速度 4·ad/T²（多留一成余量）
    const T = Math.max(until, 16) / 1000 * 0.9;
    cap = Math.min(sp.wMax, Math.max(sp.w, (2 * ad) / T));
    acc = Math.min(sp.acc * (sp.wMax / sp.w), Math.max(sp.acc * (cap / sp.w), (4 * ad) / (T * T)));
  }
  const sg = d >= 0 ? 1 : -1;
  const vStar = sg * Math.min(cap, Math.sqrt(2 * acc * ad));
  let v = st.v;
  if (Math.sign(vStar) === Math.sign(v) && Math.abs(vStar) < Math.abs(v)) v = vStar;
  else v += Math.max(-acc * dt, Math.min(acc * dt, vStar - v));
  if (Math.abs(v) > cap) v = Math.sign(v) * cap;
  let step = v * dt;
  if (ad < 1e-4 || (Math.sign(step) === sg && Math.abs(step) >= ad)) {
    step = d;
    v = 0;
  }
  st.a = wrapPi(st.a + step);
  st.v = v;
  return step;
}

/** 开火时还没对准超过这个角度（弧度）就一次补完（并计数，perf / 冒烟里看它有多常见） */
export const SNAP_EPS = 0.06;
/** 开火这一帧：把剩余角度补完，返回补了多少（0 = 本来就对准了） */
export function aimSnap(st: AimState, target: number): number {
  const d = wrapPi(target - st.a);
  if (Math.abs(d) <= SNAP_EPS) return 0;
  st.a = wrapPi(target);
  st.v = 0;
  return d;
}

/** 没有目标时的待机：在 home 附近慢慢左右扫（周期约 4.6 秒，按编号错开），转速仍走 aimStep */
export function idleAim(home: number, nowMs: number, id: number): number {
  return home + 0.45 * Math.sin(nowMs / 730 + id * 1.7);
}

// ---------------------------------------------------------------- 开火序列

/**
 * 炮身沿炮管方向的位移（像素，负 = 往后）：since = 上次开火后多少毫秒，until = 离下次开火多少毫秒（不知道就 Infinity）。
 * 预备：开火前 prepMs 毫秒里慢慢后缩到 -prep；出手：kick 毫秒里猛地顶到 -recoil（出手快）；余势：ret 毫秒缓缓回位（收手慢）。
 * 两段重叠时取更靠后的那个，所以任何时刻都连续。
 */
export function recoilAt(since: number, until: number, sp: AimSpec): number {
  let back = 0;
  if (since >= 0 && since < sp.kick + sp.ret) {
    if (since < sp.kick) back = -sp.prep - (sp.recoil - sp.prep) * easeOutCubic(since / sp.kick);
    else back = -sp.recoil * (1 - easeInOutSine((since - sp.kick) / sp.ret));
  }
  if (until >= 0 && until < sp.prepMs) back = Math.min(back, -sp.prep * easeInOutSine(1 - until / sp.prepMs));
  return back;
}

/** 底座震动：开火后往下一压再弹回（像素，正 = 往下），一两下就停，不震屏 */
export function shakeAt(since: number, sp: AimSpec): number {
  if (since < 0 || since >= sp.shakeMs) return 0;
  const t = since / sp.shakeMs;
  return sp.shake * (1 - t) * (1 - t) * Math.cos(t * Math.PI * 3);
}

// ---------------------------------------------------------------- 火枪手

export interface MusketPose {
  /** 枪口往上抬的角度（弧度，屏幕上；0 = 平端瞄准） */
  lift: number;
  /** 通条：0 = 没拿出来，>0 时是往枪管里捅的深浅（0..1） */
  ram: number;
  /** 身体前后晃（像素，正 = 往前探） */
  lean: number;
}

/**
 * 火枪手一轮：开火后枪口一跳（后坐）→ 竖起枪装填（通条捅两下）→ 放平 → 端稳瞄准等下一枪。
 * since = 上次开火后多少毫秒，reload = 这一轮的装填总时长（毫秒，规则的冷却）；短于 500 毫秒按比例压缩，不跳姿势。
 */
export function musketPose(out: MusketPose, since: number, reload: number): MusketPose {
  out.lift = 0;
  out.ram = 0;
  out.lean = 0;
  if (!(since >= 0) || !(reload > 0)) return out;
  const R = Math.max(reload, 120);
  const t = since / R;
  if (t >= 1) return out;
  // 0–0.12 后坐跳起、0.12–0.32 竖起、0.32–0.68 通条两下、0.68–0.86 放平、之后端稳
  const kick = t < 0.12 ? Math.sin((t / 0.12) * Math.PI) * 0.35 : 0;
  let up = 0;
  if (t < 0.12) up = 0;
  else if (t < 0.32) up = easeInOutSine((t - 0.12) / 0.2);
  else if (t < 0.68) up = 1;
  else if (t < 0.86) up = 1 - easeInOutSine((t - 0.68) / 0.18);
  out.lift = kick + up * 1.05;
  if (t >= 0.32 && t < 0.68) {
    const u = (t - 0.32) / 0.36;
    out.ram = 0.15 + 0.85 * Math.abs(Math.sin(u * Math.PI * 2));
  }
  out.lean = -kick * 4 + up * -1.2 + (t >= 0.86 ? easeInOutSine((t - 0.86) / 0.14) * 0.8 : 0);
  return out;
}

// ---------------------------------------------------------------- 喷火

/** 喷火的强度包络：开喷 RISE 毫秒起势（快起）、停喷 FALL 毫秒收尾（慢收），中间持续；返回新的强度 0..1 */
export const FLAME = { rise: 140, fall: 320 } as const;
export function flameStep(level: number, on: boolean, dtMs: number): number {
  const d = Math.max(0, dtMs);
  return on ? Math.min(1, level + d / FLAME.rise) : Math.max(0, level - d / FLAME.fall);
}
/** 强度到火舌长度的比例：起势 easeOut 往外冲，收尾 easeIn 缩回（火舌从炮口那头先断） */
export function flameReach(level: number, rising: boolean): number {
  return rising ? easeOutCubic(level) : easeInQuad(level) * 0.6 + level * 0.4;
}

// ---------------------------------------------------------------- 鱼叉绳

/** 收回鱼叉用的时间（毫秒） */
export const ROPE_BACK_MS = 360;
/**
 * 鱼叉命中后收回：k = 收回进度 0..1。返回 [鱼叉头离炮口还剩多少（0..1，1 = 还在命中点）, 绳子下垂多少像素]。
 * 飞出去时绳子拉直（不下垂），命中后先一松（垂下来）再被收紧拉回，越收越快。
 */
export function ropeBack(k: number): [number, number] {
  const t = clamp01(k);
  return [1 - easeInQuad(t), 7 * Math.sin(Math.min(1, t * 1.6) * Math.PI) * (1 - t * 0.5)];
}

// ---------------------------------------------------------------- 弹道

/** 弧顶高度（屏幕像素）：dist = 起点到落点的屏幕距离；臼炮高抛、加农炮低平、子弹和鱼叉几乎直线 */
export function arcHeight(kind: string, dist: number): number {
  switch (kind) {
    case 'shock':
      return 4 + dist * 0.05;
    case 'grenade':
      return 62 + dist * 0.6;
    case 'snipe':
      return 0;
    case 'mortar':
    case 'shell':
      return 46 + dist * 0.55;
    case 'barrage':
      return 70 + dist * 0.2;
    case 'ball':
      return 8 + dist * 0.14;
    case 'keg':
    case 'dynamite':
    case 'tar':
      return 18 + dist * 0.3;
    case 'rocket':
      return 6 + dist * 0.08;
    default:
      return 0;
  }
}

/**
 * 弹道上第 k（0..1）处离地面多高：从炮口高度 e0 线性过渡到命中高度 e1，再叠一条抛物线（弧顶 h）。
 * 抛物线比正弦更像真的抛体：起落快、顶上慢。
 */
export function arcLift(k: number, e0: number, e1: number, h: number): number {
  const t = clamp01(k);
  return e0 + (e1 - e0) * t + h * 4 * t * (1 - t);
}
/** 弧线在 k 处的竖直斜率（每单位 k 升高多少像素）：朝飞行方向转的弹（火箭、鱼叉）按切线转 */
export function arcSlope(k: number, e0: number, e1: number, h: number): number {
  return e1 - e0 + h * 4 * (1 - 2 * clamp01(k));
}

/** 地面阴影随高度变小变淡：lift = 离地多高，top = 这条弹道最高离地多少。返回 [缩放, 不透明度] */
export function shadowLook(lift: number, top: number): [number, number] {
  const u = top > 1 ? clamp01(lift / top) : 0;
  return [1 - 0.55 * u, 0.42 * (1 - 0.65 * u)];
}

/** 飞行进度：规则的发射拍 t0、命中拍 t1，现在 = tick + 帧内比例 */
export function flightK(now: number, t0: number, t1: number): number {
  return clamp01((now - t0) / Math.max(1, t1 - t0));
}

/** 落点按材质出的效果 */
export type LandMat = 'water' | 'wood' | 'stone' | 'ground';
/** 落点（屏幕坐标）在岛外的沙滩上吗：岛内 0..ISLAND-1 格是草地，外面一圈是沙（和 ground.ts 的 ringOf 同一个判法） */
export function onSand(sx: number, sy: number): boolean {
  const { gx, gy } = unIso(sx, sy);
  return gx < 0 || gy < 0 || gx >= ISLAND || gy >= ISLAND;
}
void easeOutQuad;
