/** 整数数学：开方用整数牛顿法，结果只取决于输入，不依赖引擎的 Math.sqrt */

/** floor(sqrt(n))，n 为非负整数 */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = 1;
  while (x * x <= n) x *= 2;
  for (;;) {
    const y = Math.floor((x + Math.floor(n / x)) / 2);
    if (y >= x) break;
    x = y;
  }
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}
