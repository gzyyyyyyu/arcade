/**
 * 吃碰杠胡立直的"过场条"里不碰 DOM 的部分：时长表、方向、配色档、横幅文字转种类。
 * 单独成文件是为了能直接在 node 里测（cutin.ts 要 import CSS 和 DOM）。
 */

export type CutinKind = 'pon' | 'chi' | 'kan' | 'hu' | 'zimo' | 'riichi';

/** 配色档：自摸胡金、杠红金、碰吃翠、立直蓝 */
type CutinTier = 'gold' | 'redgold' | 'jade' | 'blue';

export const CUTIN_KINDS: readonly CutinKind[] = ['pon', 'chi', 'kan', 'hu', 'zimo', 'riichi'];

/** 常速下一条从滑进到滑出的总时长（毫秒）（太短一闪而过没有分量），不挡操作 */
const BASE_MS: Record<CutinKind, number> = { pon: 650, chi: 650, kan: 850, riichi: 850, hu: 1_050, zimo: 1_050 };

/** 系统"减少动态效果"时只淡入淡出一个字，不用留太久 */
const REDUCED_MS = 600;

/** 血流成河连胡档：这一家这局第几次胡（1 起）→ 0 没有加码 / 1 连胡 / 2 三连胡 / 3 四次及以上 */
export function streakTier(n: number): 0 | 1 | 2 | 3 {
  return n >= 4 ? 3 : n === 3 ? 2 : n === 2 ? 1 : 0;
}

/** 连胡加码：带子多停的毫秒、带子加高的倍数、粒子加倍的倍数（按档） */
const STREAK_MS = [0, 200, 350, 500] as const;
const STREAK_HEIGHT = [1, 1.2, 1.4, 1.6] as const;
const STREAK_PARTICLES = [1, 1.6, 2.4, 3.4] as const;

/** 连胡的大字：第二次"连胡"、第三次"三连胡"、第四次起"血流成河×n"；第一次返回 null（照常用胡 / 自摸） */
export function streakWord(n: number): string | null {
  const t = streakTier(n);
  return t === 0 ? null : t === 1 ? '连胡' : t === 2 ? '三连胡' : `血流成河×${n}`;
}

/** 粒子个数的倍数（fx.ts 的 celebrate 用） */
export function streakParticles(n: number): number {
  return STREAK_PARTICLES[streakTier(n)];
}

/** 总时长：快速档减半；减少动态效果时统一一个短时长（同样快速档减半）；连胡按档多停一会儿（减少动态效果时不加） */
export function cutinMs(kind: CutinKind, fast: boolean, reduced = false, streak = 0): number {
  const extra = reduced ? 0 : STREAK_MS[streakTier(streak)];
  return Math.round(((reduced ? REDUCED_MS : BASE_MS[kind]) + extra) * (fast ? 0.5 : 1));
}

export function cutinTier(kind: CutinKind): CutinTier {
  switch (kind) {
    case 'hu':
    case 'zimo':
      return 'gold';
    case 'kan':
      return 'redgold';
    case 'riichi':
      return 'blue';
    default:
      return 'jade';
  }
}

/** 从哪边滑进来：相对我的座位 0 我 / 1 下家(右) / 2 对家(上) / 3 上家(左)。我和左边的人从左进，右边和对家从右进 */
export function cutinFrom(rel: number): 'left' | 'right' {
  return rel === 1 || rel === 2 ? 'right' : 'left';
}

/**
 * 带子在画面里的纵向位置（占高度的百分比，顶边）：对家靠上、左右在中间偏上、我自己在中间偏下。
 * 我的那条原来顶在 52%：高 22% 再斜 4°，右端底边到 80% 上下，正好压住底部的"胡""碰""换出"一排。
 * 提到 40%，斜过去最低也在操作条上面
 */
export function cutinTop(rel: number): number {
  return [40, 34, 12, 34][((rel % 4) + 4) % 4]!;
}

/** 带子高度：画面高度的 22% 封顶，再不超过 150 设计像素 */
export function cutinHeight(layerH: number): number {
  return Math.max(48, Math.min(Math.round(layerH * 0.22), 150));
}

/** 连胡时带子更高：在 cutinHeight 的基础上按档加高，但不超过画面 36% */
export function cutinStreakHeight(layerH: number, streak: number): number {
  const base = cutinHeight(layerH);
  return Math.min(Math.round(base * STREAK_HEIGHT[streakTier(streak)]), Math.round(layerH * 0.36));
}

/** 连胡大字的字号：字越少越大，再按画面宽度封顶（"血流成河×4"别超出带子） */
export function cutinStreakFont(h: number, len: number, layerW: number): number {
  const ratio = len <= 2 ? 0.7 : len === 3 ? 0.6 : 0.5;
  // 一行里还有头像（0.78h）和间距（0.22h）：竖屏带子高，只按画面宽的 62% 封顶时"三连胡"加头像会两头出界
  const room = Math.max(layerW * 0.9 - h, layerW * 0.4);
  return Math.round(Math.min(h * ratio, Math.min(room, layerW * 0.62) / Math.max(1, len), h));
}

/** 横幅文字去掉感叹号和空白，只剩要写大的字 */
export function cutinWord(text: string): string {
  return text.replace(/[！!。\s]/g, '');
}

/** 玩法接口里 banner 的 (文字, 样式类) 转成过场条的种类；不是这几种（换牌方向、流局）返回 null */
export function cutinKindOfBanner(text: string, cls?: string): CutinKind | null {
  if (cls === 'riichi') return 'riichi';
  if (cls === 'pon') return text.startsWith('吃') ? 'chi' : 'pon';
  return null;
}

/** 自己胡了（胡 / 自摸）才加闪屏、震动 */
export function cutinIsBig(kind: CutinKind): boolean {
  return kind === 'hu' || kind === 'zimo';
}
