/**
 * 画面层的「可复现」开关：只在自动化浏览器里（navigator.webdriver）生效，真人玩时一切照旧。
 * 冒烟截图要求同一份代码跑两次逐像素一致，所以自动化下：
 * - 画面层的随机（金币落点、眨眼间隔、闪电……）改用固定种子的 RNG，不再用 Math.random；
 * - 按真实时间一直循环的待机动画（呼吸、浮动、眨眼、气泡轮播）不播，停在初始帧——
 *   它们停在哪一帧取决于机器当时的负载，截图拦不住。
 * 规则核心（src/core）不碰这里，随机早就走带种子的 RNG。
 */
export const AUTOMATED: boolean = typeof navigator !== 'undefined' && navigator.webdriver === true;

/**
 * 待机循环动画是否停掉：自动化下默认停；专门测待机动画的冒烟（眨眼）在地址里加 `idle=1` 打开。
 */
export const STILL: boolean = AUTOMATED && !new URLSearchParams(window.location.search).has('idle');

/** mulberry32：够用的小型带种子 RNG，画面层只求每次相同，不求统计质量 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = AUTOMATED ? seeded(0x6b61697) : Math.random;

// Phaser 自己的随机（相机抖动 Shake、粒子发射器 EmitterOp / Between）直接调 Math.random，改不了调用点；
// 自动化下整体换成固定种子的，抖动偏移和粒子散布才逐帧一致。真人玩不进这个分支。
if (AUTOMATED) Math.random = rng;

/** 画面层专用的随机数 [0,1)：真人是 Math.random，自动化是固定种子 */
export function viewRandom(): number {
  return rng();
}

/** 画面层专用的整数随机 [lo,hi]（含两端），代替 Phaser.Math.Between */
export function viewBetween(lo: number, hi: number): number {
  return lo + Math.floor(viewRandom() * (hi - lo + 1));
}
