/**
 * 新手指引的状态和摆放（docs/features.md 13.8）。纯函数，不碰 DOM 和存储：画面在 view/coach.ts，读写经 store.ts。
 * 两层：
 * - 走一遍（stepsFor）：第一次轮到我出手时，一步一步指着桌上真的东西讲（3 步）；走完或跳过都记下来，不再自动出；
 * - 情境提示（HINTS）：前几手里第一次遇到某件事时冒一条，每条只出一次。
 */

type HintId = 'result' | 'showdown' | 'raise' | 'pot';
export const HINTS: readonly HintId[] = ['result', 'showdown', 'raise', 'pot'];

export interface GuideState {
  v: 1;
  /** 走一遍已经走完或跳过 */
  done: boolean;
  /** 出过的情境提示 */
  seen: HintId[];
}

export const freshGuide = (): GuideState => ({ v: 1, done: false, seen: [] });

/**
 * 读出来的值整理成状态，坏了当没有。legacyDone：旧版的三页弹窗提示看过了（云存档 tips），
 * 老玩家不再被教一遍，也不再冒情境提示
 */
export function parseGuide(raw: unknown, legacyDone = false): GuideState {
  const o = raw as Partial<GuideState> | null;
  if (!o || typeof o !== 'object' || o.v !== 1 || typeof o.done !== 'boolean' || !Array.isArray(o.seen)) {
    return legacyDone ? { v: 1, done: true, seen: [...HINTS] } : freshGuide();
  }
  // 底池那条是后加的情境提示：老存档走完了的，旧版的走一遍里讲过底池，照旧算看过
  return { v: 1, done: o.done, seen: HINTS.filter((h) => (o.seen as unknown[]).includes(h) || (o.done === true && h === 'pot')) };
}

/** 走完：以后不自动出；情境提示照常 */
export const finishWalk = (g: GuideState): GuideState => ({ ...g, done: true });
/** 跳过：连情境提示也不要了 */
export const skipAll = (): GuideState => ({ v: 1, done: true, seen: [...HINTS] });
/** 从大厅"怎么玩"再来一遍：全部重置 */
export const replay = (): GuideState => freshGuide();
export const see = (g: GuideState, id: HintId): GuideState => (g.seen.includes(id) ? g : { ...g, seen: [...g.seen, id] });

/** 一手打完停着时该冒哪一条：第一次摊牌讲"为什么他赢"（也算看过"结果条"），否则第一次结果讲结果条在哪 */
export function endHint(g: GuideState, showdown: boolean): HintId | null {
  if (showdown && !g.seen.includes('showdown')) return 'showdown';
  return g.seen.includes('result') ? null : 'result';
}
/** 冒出某条提示后的状态：摊牌那条把结果条那条一起算看过 */
export const seeEnd = (g: GuideState, id: HintId): GuideState => (id === 'showdown' ? see(see(g, 'showdown'), 'result') : see(g, id));

// ---------- 走一遍的内容 ----------

/** 指的是桌上哪一块；null 是不指，居中讲 */
export type Target = 'hole' | 'board' | 'pot' | 'actions' | null;

export interface Step {
  id: string;
  target: Target;
  title: string;
  /** 一两句话 */
  lines: string[];
  /** 列表：[标签, 说明, 样式]，样式对应按钮颜色 */
  items?: [string, string, string][];
  /** 牌型表那种要宽一点 */
  wide?: true;
}

/**
 * 键盘快捷键全表（仓库根 docs/ui.md 第 9 节：帮助里要有一页）。键位以 view/actions.ts（牌桌、全下局）、view/puzzle.ts（谜题）、
 * view/lobbykeys.ts（选桌）为准，改了键位记得同步这里。手机没有键盘，这一页只有电脑上用得到
 */
const KEYS_TABLE: [string, string, string][] = [
  ['F', '牌桌：弃牌', ''],
  ['C', '牌桌：过牌 / 跟注', ''],
  ['R', '牌桌：加注（展开加注面板）', ''],
  ['回车', '牌桌：加注面板开着时确认', ''],
  ['Esc', '牌桌：收起加注面板', ''],
  ['1–5', '加注面板：最小 / 半池 / ¾池 / 满池 / 全下', ''],
  ['← → ↑ ↓', '加注面板：加减一个大盲，加 Shift 是五个', ''],
  ['滚轮', '加注面板上滚动：加减加注额', ''],
  ['A', '全下局：全下 / 跟注全下', ''],
  ['F', '全下局：弃牌', ''],
  ['1 2 3', '今日谜题：选答案（Esc 关）', ''],
  ['← →', '选桌：换档位', ''],
  ['回车', '选桌：坐下开打', ''],
];

/**
 * 走一遍的步骤：3 步；有鼠标的设备从"?"打开时多一页快捷键。底池、谁赢、加注怎么选都改成到了那个场合再弹的情境提示（HINT_TEXT），
 * 不放在开局前
 */
export const STEPS: readonly Step[] = [
  { id: 'cards', target: 'hole', title: '你的牌和公共牌', lines: ['下面两张是你的底牌，只有你看得见。', '中间的公共牌大家共用，凑出最大的 5 张。'] },
  {
    id: 'buttons',
    target: 'actions',
    title: '轮到你时选一个',
    lines: [],
    items: [
      ['弃牌', '不玩这手，已下的不退', 'fold'],
      ['过牌', '没人下注时直接过', 'call'],
      ['跟注', '补到和别人一样', 'call'],
      ['加注', '牌好或想吓人时用', 'raise'],
    ],
  },
  {
    id: 'rank',
    target: null,
    title: '牌型从大到小',
    lines: [],
    wide: true,
    items: [
      ['1 同花顺', '♠5 6 7 8 9', ''],
      ['2 四条', 'K K K K', ''],
      ['3 葫芦', 'Q Q Q 9 9', ''],
      ['4 同花', '五张同花色', ''],
      ['5 顺子', '5 6 7 8 9', ''],
      ['6 三条', '8 8 8', ''],
      ['7 两对', 'J J 5 5', ''],
      ['8 一对', 'A A', ''],
      ['9 高牌', '比最大的牌', ''],
    ],
  },
];

/** 快捷键那一页：只给有鼠标键盘的设备 */
const KEYS_STEP: Step = { id: 'keys', target: null, title: '键盘快捷键', lines: [], wide: true, items: KEYS_TABLE };

/**
 * 这台设备走哪几步：触屏没有键盘，不出快捷键那一页；第一次自动弹（first）也不出——新手还没出过一手，先学会打，
 * 快捷键等他点牌桌上的"?"再看（2026-11-21 新账号走查：开局连弹 4 页，最后一页是整张快捷键表）
 */
export const stepsFor = (touch: boolean, first = false): readonly Step[] => (touch || first ? STEPS : [...STEPS, KEYS_STEP]);

/** 情境提示的文字；showdown 的 {who} {kind} 由调用方填 */
export const HINT_TEXT: Record<HintId, string> = {
  result: '这手打完了：这里写谁赢、赢多少。点"下一手"接着打。',
  pot: '这是底池：大家下的筹码都在这。牌最大的人拿走；别人都弃牌，剩下的人拿走。',
  showdown: '摊牌：{who}的{kind}最大，所以赢。亮起来的是赢的那 5 张。',
  raise: '选个数再点"确认"，想全下点"全下"。',
};

// ---------- 摆放 ----------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 两个框压没压到 */
export const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const overlapArea = (a: Box, b: Box): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const grow = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
const inside = (b: Box, area: Box): boolean => b.x >= area.x && b.y >= area.y && b.x + b.w <= area.x + area.w && b.y + b.h <= area.y + area.h;

/**
 * 说明框摆哪儿：先试目标的下、上、右、左（和目标对齐，超出边就挪进来），再试可用区的四个角，要求整个框在可用区里、
 * 不压目标和 avoid 里的任何块（目标外留 gap）。都放不下就扫全区，挑压到 avoid 最少的位置。
 * target 是 null 就居中，居中压到 avoid 也同样挑位置。
 */
export function placeCoach(target: Box | null, size: { w: number; h: number }, area: Box, avoid: readonly Box[] = [], gap = 10): Box {
  const { w, h } = size;
  const center: Box = { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
  const soft = avoid.map((b) => grow(b, 2));
  // 在整个可用区里每 8 像素试一格：不压 hard（目标），压到 soft 的面积最少；没有一格能放就居中
  const scan = (hard: Box | null): Box => {
    let best: Box | null = null;
    let bestCost = Infinity;
    for (let y = area.y; y <= area.y + area.h - h + 0.5; y += 8) {
      for (let x = area.x; x <= area.x + area.w - w + 0.5; x += 8) {
        const b: Box = { x, y, w, h };
        if (hard && overlaps(b, hard)) continue;
        const cost = soft.reduce((a, k) => a + overlapArea(b, k), 0);
        if (cost < bestCost) [best, bestCost] = [b, cost];
      }
    }
    return best ?? center;
  };
  // 没有目标：居中；居中压到别的块就换个压得最少的位置
  if (!target) return soft.some((a) => overlaps(center, a)) ? scan(null) : center;
  const clampX = (x: number): number => Math.max(area.x, Math.min(x, area.x + area.w - w));
  const clampY = (y: number): number => Math.max(area.y, Math.min(y, area.y + area.h - h));
  const cx = target.x + target.w / 2 - w / 2;
  const cy = target.y + target.h / 2 - h / 2;
  const cand: Box[] = [
    { x: clampX(cx), y: target.y + target.h + gap, w, h },
    { x: clampX(cx), y: target.y - gap - h, w, h },
    { x: target.x + target.w + gap, y: clampY(cy), w, h },
    { x: target.x - gap - w, y: clampY(cy), w, h },
    { x: area.x, y: area.y, w, h },
    { x: area.x + area.w - w, y: area.y, w, h },
    { x: area.x, y: area.y + area.h - h, w, h },
    { x: area.x + area.w - w, y: area.y + area.h - h, w, h },
  ];
  const hard = grow(target, gap / 2);
  const blocks = [hard, ...soft];
  // 四边四角都不行才扫全区（空桌面比盖住座位和操作区强）
  return cand.find((b) => inside(b, area) && !blocks.some((x) => overlaps(b, x))) ?? scan(hard);
}

/**
 * 宽的放不下（手机横屏很矮，目标又在中间）就换窄一档、变高一点再试；sizeAt(最大宽) 给出这个宽度下框的实际大小。
 * 每一档都压到目标就用最窄的那一档里的最好结果
 */
export function placeBest(target: Box | null, sizeAt: (maxW: number) => { w: number; h: number }, area: Box, avoid: readonly Box[] = [], widths: readonly number[] = [300, 240, 200]): Box {
  let last: Box | null = null;
  for (const mw of widths) {
    const b = placeCoach(target, sizeAt(Math.min(mw, area.w)), area, avoid);
    last = b;
    if ((!target || !overlaps(b, target)) && !avoid.some((a) => overlaps(b, a))) return b;
  }
  return last!;
}

