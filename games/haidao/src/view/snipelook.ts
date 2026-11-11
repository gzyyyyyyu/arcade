/**
 * 狙击塔预警的样子（纯函数，tests/content2-fx.test.ts 锁住；Phaser 一侧在 snipefx.ts）：
 * 规则在锁定目标时推 aim 事件（带 fireAt 开火拍），从那一刻到开火的 SNIPE_WARN（10 拍 = 0.5 秒）里，
 * 炮口到目标画一条红线、目标脚下一个红准星，越接近开火线越粗越实、准星越收越紧，最后一小段亮成近白的红。
 */
import { SNIPE_WARN } from '../core/combat.ts';

/** 预警总时长（毫秒） */
export const SNIPE_WARN_MS = SNIPE_WARN * 50;

/** 预警进度 0..1：fireAt - vt = 离开火还剩几拍（vt 是带帧内比例的规则时间） */
export function warnK(fireAt: number, vt: number): number {
  return Math.max(0, Math.min(1, 1 - (fireAt - vt) / SNIPE_WARN));
}

export interface SnipeLook {
  /** 瞄准线：不透明度、线宽（屏幕像素）、颜色 */
  lineA: number;
  lineW: number;
  color: number;
  /** 准星：圆环半径（水平方向，像素；脚下的等距椭圆竖向减半）、不透明度、十字伸出长度 */
  ringR: number;
  ringA: number;
  cross: number;
  /** 红线中间的白芯（越近开火越亮） */
  coreA: number;
}

const LOOK: SnipeLook = { lineA: 0, lineW: 0, color: 0, ringR: 0, ringA: 0, cross: 0, coreA: 0 };

/**
 * k = 预警进度；now = 毫秒时钟（用来做起初几下闪烁，让人一眼注意到）；still = 减弱动态（不闪、不收缩，只随 k 变实）。
 * 结果写进共用对象（不新建）。
 */
export function snipeLook(k: number, now: number, still = false, out: SnipeLook = LOOK): SnipeLook {
  const e = k * k;
  // 前 60% 轻轻闪（亮暗交替），后面稳住；越接近开火越实
  const flick = still || k > 0.6 ? 1 : 0.72 + 0.28 * Math.sin(now / 38);
  out.lineA = (0.16 + 0.84 * k ** 1.4) * flick;
  out.lineW = 1 + 2.6 * e;
  out.color = k > 0.82 ? 0xff5a4a : 0xff2a2a;
  out.ringR = still ? 13 : 20 - 8 * k;
  out.ringA = (0.3 + 0.7 * k) * flick;
  out.cross = out.ringR + 5 + 4 * k;
  out.coreA = Math.max(0, (k - 0.55) / 0.45) * 0.9;
  return out;
}
