/**
 * 倒下的单位怎么和活人区分（纯函数，tests/tddmg.test.ts 锁住）：
 * 一倒下就压暗一点，后半段很快淡出消失，扎堆时活人一眼能挑出来。深度压低半档（比同格活人低）见 anim.ts。
 */
export const DYING_DEPTH_DROP = 0.6;

/** k = 倒下进度 0..1，返回要乘到原透明度上的系数 */
export function dyingDim(k: number): number {
  if (k <= 0) return 0.8;
  if (k >= 0.9) return 0;
  const t = Math.max(0, (k - 0.35) / 0.55);
  const s = t * t * (3 - 2 * t);
  return 0.8 * (1 - s);
}
