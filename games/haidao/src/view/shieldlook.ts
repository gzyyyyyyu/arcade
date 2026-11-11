/**
 * 盾兵的盾怎么摆、挡住时怎么晃（纯函数，tests/content2-fx.test.ts 锁住；Phaser 一侧在 rigsprite.ts）。
 * 规则给的盾朝向是世界坐标 (gx, gy)（单位向量 × 100），画面按等距投影换成屏幕方向，盾摆在身体朝那个方向的一侧：
 * 朝屏幕下方（对着玩家）的盾宽而完整，朝左右的盾侧着看变窄，朝屏幕上方的盾藏到身体后面只露边。
 * 转身时 gx / gy 变了，盾就绕着身体换边（rigsprite.ts 把朝向过渡成连续的，不瞬切）。
 */

/** 挡住一发之后盾晃多久（毫秒） */
export const GUARD_MS = 260;

/** 盾在身体上的摆法（设计单位，原点 = 脚底，x 往屏幕右为正） */
export interface ShieldPlace {
  /** 盾心的位置 */
  x: number;
  y: number;
  /** 盾的横向缩放（侧着看变窄） */
  sx: number;
  /** 在身体后面（朝屏幕上方）还是前面 */
  behind: boolean;
  /** 盾面的单位朝向（屏幕上）：晃动时顺着它推 */
  nx: number;
  ny: number;
  /** 倾斜（弧度，往外倒一点） */
  rot: number;
}

/** 盾离身体中心的横向、纵向距离（设计单位） */
export const SHIELD_REACH = { x: 11, y: 5 };
/** 盾心的基准高度（设计单位，负为向上） */
export const SHIELD_Y = -17;

/** 世界朝向 (gx, gy)（没朝向 / 全 0 当作朝右下）→ 盾的摆法，写进 out（不新建对象） */
export function shieldPlace(gx: number, gy: number, out: ShieldPlace): ShieldPlace {
  let vx = gx - gy;
  let vy = (gx + gy) / 2;
  if (vx === 0 && vy === 0) {
    vx = 1;
    vy = 0.5;
  }
  const l = Math.hypot(vx, vy);
  out.nx = vx / l;
  out.ny = vy / l;
  out.x = out.nx * SHIELD_REACH.x;
  out.y = SHIELD_Y + out.ny * SHIELD_REACH.y;
  out.sx = 0.38 + 0.62 * Math.abs(out.ny);
  out.behind = out.ny < -0.25;
  out.rot = out.nx * 0.12;
  return out;
}

/** 转身过渡：摆法每个量往目标走 k（0..1，按帧间隔算），盾沿着身体绕过去，不瞬间跳边 */
export function lerpPlace(cur: ShieldPlace, want: ShieldPlace, k: number): ShieldPlace {
  cur.x += (want.x - cur.x) * k;
  cur.y += (want.y - cur.y) * k;
  cur.sx += (want.sx - cur.sx) * k;
  cur.nx += (want.nx - cur.nx) * k;
  cur.ny += (want.ny - cur.ny) * k;
  cur.rot += (want.rot - cur.rot) * k;
  cur.behind = cur.ny < -0.25;
  return cur;
}

/** 一次格挡的盾晃：沿盾面朝向往身体里一顿再弹回（阻尼振荡），顺带小幅摆角和一点点变大 */
export interface GuardKick {
  /** 推的距离（设计单位，沿 -n 方向） */
  push: number;
  rot: number;
  scale: number;
  /** 0..1：撞击那一瞬的亮闪强度，火花同步用 */
  flash: number;
}
const KICK: GuardKick = { push: 0, rot: 0, scale: 1, flash: 0 };

/** since = 挡住之后过了多少毫秒；减弱动态（still）只给一下很小的亮闪，不晃 */
export function guardKick(since: number, still = false, out: GuardKick = KICK): GuardKick {
  if (since < 0 || since >= GUARD_MS) {
    out.push = 0;
    out.rot = 0;
    out.scale = 1;
    out.flash = 0;
    return out;
  }
  const k = since / GUARD_MS;
  const decay = (1 - k) * (1 - k);
  out.flash = Math.max(0, 1 - k * 4);
  if (still) {
    out.push = 0;
    out.rot = 0;
    out.scale = 1;
    return out;
  }
  const osc = Math.sin(k * Math.PI * 3);
  out.push = 4.2 * decay * Math.max(0, osc) + 1.2 * decay * osc;
  out.rot = 0.28 * decay * osc;
  out.scale = 1 + 0.12 * decay;
  return out;
}
