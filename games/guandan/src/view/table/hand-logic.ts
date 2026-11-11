/**
 * 手牌的纯逻辑（不依赖 Phaser，单测直接测）：鼠标按下是选、是取消还是不理；斗地主"横排一行"的位置怎么排。
 * HandView 只管执行：按这里算出的结果改选中集合、摆牌。
 */
import type { Card } from '../../variants/guandan/core/index.ts';

/** 按下以后要做的事 */
export type DownAct =
  | { kind: 'none' }
  /** 取消全部选中（右键点空白处） */
  | { kind: 'clear' }
  /** 取消这一张的选中（右键点手牌） */
  | { kind: 'deselect'; card: Card }
  /** 进贡 / 还贡只能选一张：把选中集合换成这些 */
  | { kind: 'set'; cards: Card[] }
  /** 左键开始拖选：这一张按 on 设，后面滑过的牌跟着同一个方向 */
  | { kind: 'drag'; card: Card; on: boolean };

/**
 * 鼠标按下手牌区该怎么办。右键从不选牌（Phaser 的 pointerdown 不分按键，不判断右键就会被当成左键选上）：
 * 点在牌上取消这张，点在空白处取消全部；不允许选的牌（进贡时被压暗的）不理。
 */
export function downAction(o: {
  right: boolean;
  hit: Card | null;
  selected: ReadonlySet<Card>;
  allowed: ReadonlySet<Card> | null;
  single: boolean;
}): DownAct {
  const { hit } = o;
  if (o.right) {
    if (hit === null) return o.selected.size > 0 ? { kind: 'clear' } : { kind: 'none' };
    if (o.allowed && !o.allowed.has(hit)) return { kind: 'none' };
    return o.selected.has(hit) ? { kind: 'deselect', card: hit } : { kind: 'none' };
  }
  if (hit === null) return { kind: 'none' };
  if (o.allowed && !o.allowed.has(hit)) return { kind: 'none' };
  const on = !o.selected.has(hit);
  if (o.single) return { kind: 'set', cards: on ? [hit] : [] };
  return { kind: 'drag', card: hit, on };
}

/** 横排每张牌之间至少露出多少（世界坐标）：低于它就不再给"分组空隙"让位 */
export const FLAT_MIN_STEP = 32;

/**
 * 斗地主手牌横排（一行放下全部）：groups 是每一组的张数（按点数一组、按牌型一组），组与组之间留 gap 的空隙。
 * 先按"一行铺满可用宽度"算相邻两张的间距 step（不超过 maxStep，张数少时不拉得太开）；
 * 间距因为空隙被压到 FLAT_MIN_STEP 以下，就取消空隙、把宽度都给牌。返回每张牌的中心 x（按手牌顺序）和实际的间距、空隙。
 * 20 张在最窄的世界宽度 1280 上间距约 60，手机横屏 667×375 上约 31 CSS 像素，每张都点得中。
 */
export function flatLayout(
  groups: readonly number[],
  W: number,
  o: { cardW: number; margin: number; maxStep: number; gap: number },
): { xs: number[]; step: number; gap: number } {
  const n = groups.reduce((a, b) => a + b, 0);
  if (n === 0) return { xs: [], step: 0, gap: 0 };
  const avail = W - o.margin * 2 - o.cardW;
  const seams = Math.max(0, groups.length - 1);
  const fit = (gap: number): number => (n <= 1 ? 0 : Math.min(o.maxStep, (avail - seams * gap) / (n - 1)));
  let gap = o.gap;
  let step = fit(gap);
  if (step < FLAT_MIN_STEP) {
    gap = 0;
    step = fit(0);
  }
  const total = step * (n - 1) + seams * gap;
  const x0 = W / 2 - total / 2;
  const xs: number[] = [];
  let k = 0;
  groups.forEach((size, gi) => {
    for (let j = 0; j < size; j++) xs.push(x0 + k++ * step + gi * gap);
  });
  return { xs, step, gap };
}
