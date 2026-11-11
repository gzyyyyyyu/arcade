/**
 * 2.0 首领留在地上的东西（竹笋、冰刺、金光圈等"先预警后落下"的圈，竹浪，冰风，浮冰）。
 * 定长数组，空位复用；和怪的数组一样随一局的 World 走，指纹按数组哈希。
 * 谁用谁填：圈由各首领的技能加，foeTick（index.ts）每拍倒数、落下时伤人。
 */
export const MAX_CIRCLES = 48;
export const MAX_WAVES = 2;
export const MAX_FLOES = 4;

export class FoeState {
  /** 这一局有没有用过（没用过的局指纹里不放它，别的图的金标准指纹不变） */
  used = false;

  // 先预警后落下的圈：cT 倒数到 0 落下；cVis 圈的样子（Ev.Foe 子类的个位）；cSlow 打中后主角慢多少拍
  readonly cT = new Int32Array(MAX_CIRCLES);
  readonly cX = new Float64Array(MAX_CIRCLES);
  readonly cY = new Float64Array(MAX_CIRCLES);
  readonly cR = new Float64Array(MAX_CIRCLES);
  readonly cDmg = new Float64Array(MAX_CIRCLES);
  readonly cVis = new Uint8Array(MAX_CIRCLES);
  readonly cSlow = new Int32Array(MAX_CIRCLES);

  // 竹浪：wOn 1 在场；wWarn 预警还剩几拍（墙停着）；wAxis 0 沿 x 走（墙是竖的）1 沿 y 走；wDir ±1；wPos 墙现在的位置；wEnd 走到哪算完；
  // wGap 空隙中心（墙的另一个坐标）；wGapW 空隙宽
  readonly wOn = new Uint8Array(MAX_WAVES);
  readonly wWarn = new Int32Array(MAX_WAVES);
  readonly wAxis = new Uint8Array(MAX_WAVES);
  readonly wDir = new Int8Array(MAX_WAVES);
  readonly wPos = new Float64Array(MAX_WAVES);
  readonly wEnd = new Float64Array(MAX_WAVES);
  readonly wGap = new Float64Array(MAX_WAVES);
  readonly wGapW = new Float64Array(MAX_WAVES);

  // 冰魄娘娘的冰风：落下前的倒数（0 = 没有）、起点、方向表下标
  windT = 0;
  windX = 0;
  windY = 0;
  windDir = 0;
  /** 冰面更滑到哪一拍 */
  slickUntil = 0;

  // 浮冰：裂开的预警到 floeWarnEnd，浮冰有效到 floeUntil；fN 块，每块 x, y, w, h（左上角）
  floeWarnEnd = 0;
  floeUntil = 0;
  fN = 0;
  readonly fX = new Float64Array(MAX_FLOES);
  readonly fY = new Float64Array(MAX_FLOES);
  readonly fW = new Float64Array(MAX_FLOES);
  readonly fH = new Float64Array(MAX_FLOES);

  /** 无面佛：香炉全灭（香火区外伤害加倍），和它端坐的地方 */
  dark = 0;
  homeX = 0;
  homeY = 0;

  /** 戏台：下一场开在哪一拍、已开几场、这一场还剩几个鬼影没冒、下一批冒的拍数、批间隔 */
  stageNext = 0;
  stageN = 0;
  stageLeft = 0;
  stageAt = 0;
  stageGap = 0;
}
