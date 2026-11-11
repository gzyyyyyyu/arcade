/** 迸金币的落点（纯函数，单测只引这个；画在 burst.ts） */

/** 第 i 枚（共 n 枚）的落点：向下半圈扇形散开（牌子贴着屏幕顶，往上会被裁掉），距离交错，同参数同结果 */
export function burstTarget(i: number, n: number): { dx: number; dy: number } {
  const k = n > 1 ? i / (n - 1) : 0.5;
  const angle = Math.PI * (0.15 + 0.7 * k); // 0.15π..0.85π
  const dist = 34 + (i % 3) * 10;
  return { dx: Math.round(Math.cos(angle) * dist * 1.4), dy: Math.round(Math.sin(angle) * dist) };
}
