/**
 * 牌局的节奏常量（毫秒，1 倍速，还没经 anim.ts 的 dur() 换算）。
 * 为什么单拎出来：牌桌（TableScene、DdzScene）和估时间的模拟器（tools/ai-sim.ts、tools/ddz-stake-sim.ts）要用同一份数，
 * 改节奏只改这里，模拟器估的分钟数就跟着变。这个文件只放数字，不依赖 Phaser、DOM。
 *
 * 节奏偏快：实盘要能在碎片时间打完（实盘一场 3–6 分钟，斗地主一手 ≤ 2 分钟）。
 * 只动停顿和过场的长短，不动动画种类；设置里的"慢 / 中 / 快"仍按 SPEED_FACTOR 乘在后面，默认"中"就是下面的数。
 * 该留的戏没动：炸弹前电脑的那点犹豫（personas.ts 的 thinkTime 炸弹档）、炸弹和王炸的大字。
 */
export const PACE = {
  /** 大字（bigWord）：飞入、停留、飞出 */
  word: { in: 200, hold: 350, out: 200 },
  /** 横幅（banner）：滑入、停留、滑出 */
  banner: { in: 220, hold: 500, out: 180 },
  /** 一副开始的"第 n 副"大字停留 */
  dealTitle: 250,
  /** 发牌：每批几张、批间隔、单张飞行、翻面（一半） */
  deal: { batch: 3, step: 34, fly: 220, flip: 60 },
  /** 出牌：牌飞到桌面的时长、同一手里每张错开多久 */
  play: { fly: 150, stagger: 8 },
  /** 有人"不要"之后的停顿 */
  pass: 100,
  /** 一墩打完，让人看清是谁收了再清桌；清桌的淡出 */
  trick: { hold: 350, fade: 140 },
  /** 一副最后一手出完后，名次和最后一手留在桌上的时间，然后弹结算 */
  dealEnd: 500,
  /** 进贡 / 还贡的牌：飞到桌心、停着看清楚、飞向收牌的人 */
  tribute: { in: 300, hold: 700, out: 260 },
  /** 掼蛋炸弹大字停留：按档（1 四炸、2 五六炸、3 同花顺和七炸以上）；天王炸 */
  bomb: (tier: number): number => 520 + tier * 90,
  jokerBomb: 850,
  /** 头游大字停留 */
  first: 500,
  /** 接风大字停留 */
  jiefeng: 200,
  /** 斗地主：叫分后停多久、电脑叫分想多久、我当地主时亮底牌多久 */
  ddz: { bid: 250, bidThink: 500, bottom: 300, bomb: 560, rocket: 800, spring: 900 },
} as const;

/** 提示一句话后停多久再跳走（实盘带入没成回选档页、带回后回大厅）：留给读字的时间，不随动画速度变，不经 dur() */
export const NOTICE_MS = 1_200;

/** 发 n 张牌（含翻面）从第一张起飞到最后一张翻完要多久 */
export function dealInMs(n: number): number {
  const d = PACE.deal;
  return Math.max(0, Math.ceil(n / d.batch) - 1) * d.step + d.fly + 2 * d.flip;
}

/** 大字完整播一遍（飞入 + 停留 + 飞出） */
export const wordMs = (hold: number = PACE.word.hold): number => PACE.word.in + hold + PACE.word.out;

/** 横幅完整播一遍 */
export const bannerMs = (): number => PACE.banner.in + PACE.banner.hold + PACE.banner.out;

/** 炸弹落桌的强度：1 掼蛋四炸、2 五六炸（斗地主炸弹）、3 同花顺和七炸以上、4 天王炸（斗地主王炸）。每一项都随档位单调递增 */
export function strikeParams(tier: number): { lift: number; dip: number; rise: number; ring: number; ringWidth: number; sparks: number; dust: number; shake: number } {
  const k = Math.min(4, Math.max(1, Math.round(tier))) - 1;
  return {
    lift: [1.28, 1.4, 1.55, 1.7][k]!, // 牌组先放大到这个倍数再砸下来
    dip: [0.96, 0.94, 0.92, 0.9][k]!, // 砸到桌面时压扁到这个倍数，再回弹到 1（档越高压得越狠）
    rise: [14, 20, 28, 36][k]!, // 起手比落点高多少
    ring: [150, 210, 280, 360][k]!, // 冲击波最终半径
    ringWidth: [5, 7, 9, 12][k]!,
    sparks: [14, 24, 38, 60][k]!,
    dust: [6, 10, 16, 22][k]!,
    shake: [0.004, 0.006, 0.009, 0.013][k]!, // 落地那一下的震屏，叠在 bombFx 原有的震屏上
  };
}

/** 一次炸弹落桌用掉的时间（毫秒，1 倍速）：砸下去 + 回弹，比"炸弹"大字飞入（200）略长一点，和大字同时播、不加总时长 */
export const STRIKE_MS = { slam: 110, settle: 100 } as const;
