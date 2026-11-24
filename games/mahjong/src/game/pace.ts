/**
 * 牌局的节奏：单机电脑「想」多久（solo.ts 的 thinkMs，再乘性格快慢和速度设置），和流程里等一会儿的 sleep。
 * 放在 game/ 而不是 app/：solo.ts、online.ts 在 app/ 下面一层，不读 app/；页面手感时间（提示条、标题闪烁、快速倍率）留在 app/timing.ts。
 */

/** 单机电脑每一步想多久（毫秒）：看得清是谁打的就够，不拖 */
export const THINK_MS = {
  /** 摸了就打（摸切） */
  tsumogiri: 400,
  /** 从手里挑一张打 */
  discard: 650,
  /** 别家立直或已经胡了：再加 */
  tense: 350,
  /** 牌墙后半段：再加 */
  late: 200,
  /** 碰、吃、杠、立直 */
  meld: 900,
  /** 胡、和 */
  win: 1_000,
  /** 换三张、定缺这些 */
  other: 500,
} as const;

/** 等一会儿（单机电脑出牌节奏、房间电脑的出牌延迟、离座后等房间收到） */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
