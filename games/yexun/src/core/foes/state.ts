/**
 * 2.0 首领留在地上的东西（竹笋、冰刺、金光圈等"先预警后落下"的圈，竹浪，冰风，浮冰）。
 * 定长数组，空位复用；和怪的数组一样随一局的 World 走，指纹按数组哈希。
 * 谁用谁填：圈由各首领的技能加，foeTick（index.ts）每拍倒数、落下时伤人。
 */
export const MAX_CIRCLES = 48;
export const MAX_WAVES = 2;
export const MAX_FLOES = 4;
/** 连战带词缀的首领同时最多几只（双煞两只，留余量） */
export const MAX_AFFIXED = 4;
/** 地上的鬼火（词缀「火」的脚印、夜漏君月牙镰留下的冷焰） */
export const MAX_FLAMES = 64;
/** 夜漏君的鼓圈同时最多几圈 */
export const MAX_DRUMS = 3;
/** 夜漏君三更的灯笼 */
export const MAX_LANTERNS = 3;

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
  /** 放这道浪的首领的招式倍数（w.eAtk） */
  readonly wAtk = new Float64Array(MAX_WAVES).fill(1);

  // 冰魄娘娘的冰风：落下前的倒数（0 = 没有）、起点、方向表下标
  windT = 0;
  windX = 0;
  windY = 0;
  windDir = 0;
  windAtk = 1;
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

  // 连战词缀（core/foes/affix.ts）：每只带词缀的首领占一格。aI 怪的下标（-1 空），aGen 占格时的 eGen（槽位换了怪就作废）；
  // aSummon / aShieldT / aWind 倒数到下一次；aShield 护盾在时的血底线（eHp 掉到它就破，-1 没盾）；aDone 1 分过身 2 狂过；
  // aPull 风还要拽几拍（负数 = 预警还剩几拍）；aHp 上一拍主角的血（吸：看是不是被它撞掉的）
  readonly aI = new Int16Array(MAX_AFFIXED).fill(-1);
  readonly aGen = new Int32Array(MAX_AFFIXED);
  readonly aSummon = new Int32Array(MAX_AFFIXED);
  readonly aShieldT = new Int32Array(MAX_AFFIXED);
  readonly aShield = new Float64Array(MAX_AFFIXED).fill(-1);
  readonly aWind = new Int32Array(MAX_AFFIXED);
  readonly aPull = new Int32Array(MAX_AFFIXED);
  readonly aDone = new Uint8Array(MAX_AFFIXED);
  readonly aHp = new Float64Array(MAX_AFFIXED);

  // 鬼火：hEnd 灭的那一拍（0 = 空），hBy 伤人记在哪种怪名下
  readonly hEnd = new Int32Array(MAX_FLAMES);
  readonly hX = new Float64Array(MAX_FLAMES);
  readonly hY = new Float64Array(MAX_FLAMES);
  readonly hR = new Float64Array(MAX_FLAMES);
  readonly hDmg = new Float64Array(MAX_FLAMES);
  readonly hBy = new Int32Array(MAX_FLAMES);

  // 夜漏君（core/foes/yelou.ts）。鼓圈：dOn、圆心、现在的半径、两个缺口的方向（方向表下标，-1 没有）、伤害
  readonly dOn = new Uint8Array(MAX_DRUMS);
  readonly dX = new Float64Array(MAX_DRUMS);
  readonly dY = new Float64Array(MAX_DRUMS);
  readonly dR = new Float64Array(MAX_DRUMS);
  readonly dGap0 = new Int16Array(MAX_DRUMS);
  readonly dGap1 = new Int16Array(MAX_DRUMS);
  readonly dDmg = new Float64Array(MAX_DRUMS);
  /** 三更的灯笼：几盏、在哪 */
  lN = 0;
  readonly lX = new Float64Array(MAX_LANTERNS);
  readonly lY = new Float64Array(MAX_LANTERNS);
  /** 三更月蚀：夜色压下来（画面按 YELOU.sight 收看得见的半径） */
  ylDark = 0;
  /** 转阶段无敌到哪一拍 */
  ylInv = 0;
  /** 下一次更签雨、召更夫鬼的拍 */
  ylRain = 0;
  ylCall = 0;
  /** 五更：夜潮的圆心、半径（0 = 没有）、下一次收的拍；滴漏到哪一拍漏尽（0 = 没开始）；漏尽后下一次加狠的拍；漏珠螺旋转到的方向 */
  tideX = 0;
  tideY = 0;
  tideR = 0;
  tideNext = 0;
  dripEnd = 0;
  ylRageNext = 0;
  ylRageN = 0;
  spiral = 0;
}
