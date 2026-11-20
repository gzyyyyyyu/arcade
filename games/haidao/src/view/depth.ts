/**
 * 画面层的 setDepth 层级表。三个场景（基地、进攻、守岛）和特效共用同一张表，换层级只改这里。
 *
 * 建筑、兵、英雄按格子的等距深度排（见 depthOf，约 0–60，再加几个百分位的零头），所以：
 *   - 负数和个位数 = 铺在地上、被所有建筑和兵盖住的东西；
 *   - 3999–7002 = 压在建筑上的标记、预览、范围圈；
 *   - 8000 以上 = 特效、弹道、飘字（从下往上数）；
 *   - 9000 以上 = 血条、迷雾、顶层提示。
 * 数值之间的先后就是画面上的前后，改动时只许整体平移，不要调换顺序。
 */
export const DEPTH = {
  // 地面
  /** 整张铺地图 */
  ground: -100,
  /** 第四章岛上的水面（水道、火口湖）和水面上的桥 */
  water: -62,
  /** 第五章的断崖（岩块，tdcliff.ts）：和水面一样铺在地上，岛上的东西都盖在它上面；高台的栏杆另按木台的深度画 */
  cliff: -61.5,
  bridge: -61,
  /** 守岛大潮的水面、浪边、浪头 */
  tide: -60,
  /** 浪边上的航道名 */
  tideLabel: -56,
  tideEdge: -58,
  tideWave: -57,
  /** 地上的格子线、路线条、可落兵范围 */
  floorOverlay: -50,
  floorChevron: -49,
  floorHover: -48,
  /** 英雄脚下的圈（跟着英雄再加零头时另算） */
  heroRing: 0,
  fire: 1,
  /** 守岛的路线、护航船的轨迹 */
  lane: 3,
  escortTrack: 4,
  escortWake: 5,
  /** 地面上的光环 */
  groundRing: 7,
  /** 弹道落地影：进攻 / 守岛 */
  shotShadowBattle: 1.5,
  shotShadowTd: 3.5,

  // 压在建筑上的标记
  baseSelect: 3999,
  baseHover: 4000,
  baseBubble: 5000,
  aimPreview: 6500,
  tdHover: 6900,
  /** 红圈、落点环、打击标记（同层按 7000/7001/7002 排前后） */
  marker: 7000,
  markerMid: 7001,
  markerTop: 7002,

  // 特效和弹道
  shotRope: 8095,
  rocketTrail: 8090,
  shot: 8100,
  chipBurst: 8000,
  hitFx: 8200,
  impactFx: 8300,
  muzzleLow: 8349,
  muzzle: 8350,
  smokePuff: 8360,
  /** 基地建筑标志动作的粒子（basebldfx.ts）：全放在同一层、压在所有建筑上面，才能合成一批画；插在建筑之间每颗都会打断合批，手机放大时掉一档帧率 */
  bldFx: 8380,
  fxHigh: 8400,
  puffHigh: 8405,
  dropChip: 8410,
  ember: 8420,
  splinterLow: 8430,
  splinter: 8435,
  coinBurstLow: 8439,
  burstHigh: 8440,
  coinBurst: 8445,
  coin: 8446,
  particle: 8450,

  // 顶层
  glow: 8900,
  fx: 9000,
  upgradeText: 9050,
  fogRing: 9099,
  fogMist: 9100,
  tdOverlay: 9150,
  jam: 9200,
  hudFx: 9300,
  slowMark: 9400,
  bars: 9500,
  /** 守岛里点中的叉 */
  cross: 9600,
  dragDiamond: 9998,
  dragGhost: 9999,
};
