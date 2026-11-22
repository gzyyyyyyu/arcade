/** 牌桌各座位的锚点（世界坐标）。座位 0 我在下，1 下家在右，2 对家在上，3 上家在左（逆时针出牌）。 */
export interface SeatAnchor {
  /** 头像中心 */
  ax: number;
  ay: number;
  /** 头像直径 */
  size: number;
  /** 出牌区锚点：align 决定牌从这里向哪边排 */
  px: number;
  py: number;
  align: 'left' | 'center' | 'right';
  /** 气泡位置与尾巴方向 */
  bx: number;
  by: number;
  bdir: 'left' | 'right' | 'up' | 'down';
}

export const TOPBAR_H = 56;

/** 世界比 1280 宽时桌子两边各让出多少（art-v3：露出远景的暗室）；背景和左右两家的座位共用 */
export function tableSide(W: number): number {
  return Math.max(0, Math.round((W - 1280) * 0.3));
}
export const BUTTON_Y = 412;

/**
 * partnerMinX：对家头像中心最少在哪（手机上顶栏左边的云朵、邀请按钮要 44 CSS 像素宽，头像得让开，0.10.0）。
 * 对家的气泡放在头像左边（尾巴朝右）：右边是剩余张数和记牌条，放右边会把记牌条最左几列盖住。
 * 头像让开以后离桌心近了，名牌会压住居中摆的出牌，这时出牌改成从头像右边往右排。
 */
export function seatAnchors(W: number, partnerMinX = 0): SeatAnchor[] {
  const p = Math.max(W / 2 - 250, partnerMinX);
  // 左右两家坐在桌沿以内（宽屏时桌子往里让了）
  const d = tableSide(W);
  const shifted = p > W / 2 - 250;
  return [
    { ax: 60, ay: 396, size: 72, px: W / 2, py: 294, align: 'center', bx: 132, by: 330, bdir: 'down' },
    { ax: W - d - 86, ay: 262, size: 96, px: W - d - 200, py: 262, align: 'right', bx: W - d - 150, by: 176, bdir: 'down' },
    { ax: p, ay: 112, size: 90, px: shifted ? p + 64 : W / 2, py: 196, align: shifted ? 'left' : 'center', bx: p - 64, by: 104, bdir: 'right' },
    { ax: d + 86, ay: 262, size: 96, px: d + 200, py: 262, align: 'left', bx: d + 150, by: 176, bdir: 'down' },
  ];
}

/** 三人桌左右两家比四人桌往上挪多少：上方没有对家，挪上去给我头像上的"地主"牌和气泡让地方 */
const SIDE_LIFT_3 = 48;

/**
 * 三人桌（斗地主）：座位 0 我在下，1 下家在右，2 上家在左；左右两家取四人桌的位置再往上挪，桌子上方空出来放底牌和倍数
 */
export function seatAnchors3(W: number): SeatAnchor[] {
  const a = seatAnchors(W);
  const lift = (s: SeatAnchor): SeatAnchor => ({ ...s, ay: s.ay - SIDE_LIFT_3, py: s.py - SIDE_LIFT_3, by: s.by - SIDE_LIFT_3 });
  return [a[0]!, lift(a[1]!), lift(a[3]!)];
}

// ───────── 两个玩法共用：手牌、顶栏图标、发牌和出牌特效（质量清单 #17 收进来的） ─────────

/**
 * 掼蛋、斗地主共用的牌桌布局数字：手牌区、牌桌场景骨架（顶栏图标、状态条、发牌牌背）、两个出牌特效文件里的坐标和尺寸（世界坐标，高 720）。
 * 为什么单拎出来：这些数字原来散在 hand.ts、TableSceneBase.ts 和两个 play-fx.ts 里，两个玩法各写一遍同样的值，改一处容易漏另一处。
 * 这里只放数字，不依赖 Phaser、DOM；颜色、字号（TYPE）、节奏（PACE）不放这里。
 * 带 Ms 的是毫秒：注释里写了的才经过 dur() 换算，没写的是真实时间，不随设置里的动画速度变。
 */

/** 发牌：牌背从桌心上方这个纵坐标飞出（手牌飞向我、牌背飞向对手共用） */
export const DEAL_ORIGIN_Y = 250;

/** 手牌飞入时的起始姿态：缩小并斜着，飞到位置再摆正（牌背飞向对手也用同一个角度） */
export const DEAL_FLY = { startScale: 0.6, angle: -12 };

/** 手牌区（hand.ts）。叠放的高度上限、上抬等已有名字的留在 hand.ts */
export const HAND_LAYOUT = {
  /** 手牌离画面左右沿的最小边距 */
  margin: 26,
  /** 列间距上限 = 牌宽加这么多（牌之间留一道缝） */
  spacingExtra: 6,
  /** 同一列里相邻两张最多错开多少 */
  stackStepMax: 40,
  /** 深度：第一列第一张从这里起，列与列之间、同列相邻两张的递增 */
  depthBase: 100,
  depthPerCol: 10,
  /** 摆位补间时长（毫秒，经 dur）：选中或悬停的牌动得慢一点，其余的利落 */
  moveMs: { lifted: 140, rest: 100 },
  /** 调试/冒烟：可点位置离牌左上角多远（落在露出的那一条里） */
  tapInset: { x: 22, y: 14 },
};

/** 顶栏右边那一组图标（TableSceneBase.buildTopIcons、聊天按钮样式） */
export const TOP_ICONS = {
  /** 图标中心的纵坐标、图标直径 */
  y: 28,
  size: 46,
  /** 图标间距最少多少 */
  pitchMin: 56,
  /** 最右一个离屏幕右沿最少多少（点按区不伸出去） */
  edgeMin: 34,
  /** 点按区向下伸多深至少多少 */
  deepMin: 54,
  /** 最左一个的点按区离 leftLimit 留的空 */
  leftGap: 8,
  /** 手机上聊天圆钮：比顶栏矮多少、最小直径、图标占圆钮的比例 */
  chat: { inset: 10, minSize: 20, iconRatio: 0.62 },
};

/** 牌桌状态条（setStatus）：圆角胶囊 */
export const STATUS_PILL = { padX: 32, halfH: 16, h: 32, r: 16 };

/** 出错提示浮在操作按钮上方多少 */
export const ERROR_TOAST_DY = 92;

/** 联机倒计时刷新间隔（毫秒，真实时间，不经 dur：倒计时是房间给的截止时间） */
export const CLOCK_TICK_MS = 250;

/** 发牌时飞向对手的牌背（TableSceneBase.dealToOthers） */
export const DEAL_BACK = {
  w: 46,
  h: 64,
  depth: 180,
  /** 落到座位时缩成多大（乘以原本的缩放） */
  endScale: 0.7,
  /** 毫秒，经 dur：不同座位的牌背错开多久、单张飞行时长 */
  seatDelayMs: 20,
  flyMs: 300,
};

/** 天王炸 / 王炸的特效（两个玩法同一套）：闪光、震屏、火花 */
export const KING_BOMB = {
  /** 闪光的不透明度 */
  flashAlpha: 0.75,
  shakeMs: 600,
  shakeAmp: 0.018,
  sparks: 60,
  sparkSpeed: [200, 620] as [number, number],
  sparkLifeMs: 1200,
  /** 大字字号 */
  wordSize: 96,
};

/** 炸弹光芒（rays）的中心纵坐标：天王炸、王炸共用 */
export const BOMB_RAYS_Y = 330;

/** 炸弹的烟（两个玩法同一套参数） */
export const BOMB_SMOKE = {
  count: 8,
  speed: [40, 120] as [number, number],
  lifeMs: 900,
  gravity: -40,
  scale: [1.4, 2.4] as [number, number],
};

/** 掼蛋：炸上炸的"名场面"提示条的纵坐标 */
export const BOMB_ON_BOMB_TOAST_Y = 300;

/** 斗地主：炸弹大字播完后再停多久，顶栏倍数才跟着变（毫秒，经 wait 里的 dur） */
export const DDZ_BOMB_TAIL_MS = 60;

/** 掼蛋进贡 / 还贡的飞牌（flyTribute） */
export const TRIBUTE_FLY = {
  /** 牌停在桌心的纵坐标；说明字在它上方多少 */
  midY: 280,
  tagDy: 112,
  /** 说明字、飞牌的深度（盖过一切出牌） */
  depth: 2500,
  /** 别人之间的牌背：宽度、起始缩放 */
  backW: 92,
  backScale: 0.5,
  /** 飞到桌心时放大到多少；飞向收牌人时缩到多少、淡到多透 */
  midScale: 1.5,
  endScale: 0.4,
  endAlpha: 0.2,
  /** 说明字淡入、淡出（毫秒，经 dur） */
  tagInMs: 120,
  /** 说明字的深色底：左右、上下留白，底的不透明度 */
  tagPadX: 18,
  tagPadY: 6,
  tagBgAlpha: 0.72,
  tagOutMs: 160,
};

/** 掼蛋"上一墩"回看弹窗（showPrevTrick） */
export const PREV_TRICK = {
  modalW: 640,
  /** 弹窗高度 = 头尾固定部分 + 每行高度 × 行数 */
  chromeH: 210,
  /** 一行最高多少、所有行加起来最多多高 */
  rowMax: 68,
  rowsMaxH: 400,
  /** 牌宽最大多少；行高减掉这么多后按牌的宽高比算牌宽 */
  cardMaxW: 46,
  rowPad: 6,
  cardAspect: 1.4,
  /** 同一手里相邻两张牌错开牌宽的这个比例 */
  overlap: 0.52,
  /** 第一行中心离弹窗顶多少 */
  firstRowDy: 70,
  /** "看好了"按钮：中心离弹窗底、宽、高 */
  okDy: 56,
  okW: 180,
  okH: 56,
  /** 一行里三块的横坐标：座位名（左起）、牌（左起）、牌型说明（右对齐） */
  nameX: -280,
  cardX: -150,
  labelX: 280,
};

/** 斗地主：结算面板右上角的"春天 / 反春"印章 */
export const SPRING_SEAL = {
  x: 322,
  y: -118,
  r: 50,
  ringR: 48,
  innerR: 40,
  /** 章上字号；盖下来时先放大到几倍 */
  size: 34,
  startScale: 3,
  /** 盖章补间时长和延迟（毫秒，经 dur） */
  ms: 260,
  delayMs: 180,
};

/** 斗地主：地主帽（挂在地主头像上沿的"地主"牌） */
export const LANDLORD_HAT = { depth: 320, gap: 6, halfH: 15, h: 30, padX: 24 };

/** 斗地主：摊开的手牌（残局里的农民、明牌的地主） */
export const OPEN_HAND = {
  cardW: 44,
  /** 相邻两张最多错开多少；一排最长多少（20 张时挤一点，角标仍露得出） */
  stepMax: 26,
  lenMax: 400,
  /** 左家的牌排最左不越过这里（我的头像和"地主"牌子在更左边） */
  leftMin: 130,
  /** 牌排中心比头像中心低多少、深度 */
  dy: 118,
  depth: 60,
};

// ───────── 掼蛋牌桌（TableScene、guandan/table-ui、guandan/actions） ─────────

/**
 * 掼蛋牌桌（TableScene、guandan/table-ui.ts、guandan/actions.ts）里的布局坐标、尺寸和时长。
 * 为什么单拎出来：这些数字原来散写在三个文件里，改一处要靠记忆找另一处；起名后同一个数字只有一个出处。
 * 只放数字，不依赖 Phaser、DOM；值与原来写死的完全一样（毫秒数没经过 dur() 的仍然不经，经过的由调用处照旧套）。
 */

/** 提示条（toast）的纵坐标：在按钮行上方 92，"没有能压过的牌""要出对子"这类一句话原因都冒在这里 */
export const TOAST_Y = BUTTON_Y - 92;

/** 结算页"还在等谁"那一行的位置和行距 */
export const SETTLE_WAIT_AT = { y: 190, gap: 60 } as const;

/** 对家头像中心离顶栏左侧控件（"大厅"、邀请）右缘再让开的距离：头像半径加空隙 */
export const PARTNER_AVATAR_CLEAR = 49;

/** 好友房"再来一场"开好新房间后多久过去：我开的 400 毫秒，跟着别人开的留 2.5 秒让大家看清提示（不经 dur） */
export const FOLLOW_AGAIN_MS = { mine: 400, others: 2500 } as const;

/** 关掉弹窗后多久重新推进牌局（不经 dur） */
export const PUMP_AFTER_CLOSE_MS = 10;

/** 头像上的表情默认停留时长（毫秒） */
export const MOOD_MS = 2200;

/** "房间断开了"弹窗：尺寸、各行纵坐标、正文换行宽度、按钮 */
export const DISCONNECT_MODAL = { w: 640, h: 300, titleY: -60, bodyY: -10, wrap: 560, btnY: 80, btnW: 240, btnH: 64 } as const;

/** "当作哪一手？"弹窗（逢人配多种解释）：宽、标题区高度、每个选项占的行高、第一项的起点和按钮尺寸 */
export const CHOOSE = { w: 560, headH: 180, rowH: 70, firstY: 110, btnW: 400, btnH: 58 } as const;

/** 我的头像（座位 0）：中心 x 和直径（layout.ts 的 seatAnchors 里写的是同一对数，这里用来给按钮让位） */
export const ME_AVATAR = { x: 60, size: 72 } as const;

/**
 * 按钮行（出牌区下方）：主按钮（不要 / 提示 / 出牌）居中三个、间距 dx；弱按钮（理牌 / 重选 / 上一墩）略低 subDy。
 * 手机上高度取 max(下面的值, minDrawH())，宽度取 max(下面的值, minHit())
 */
export const ACTION_ROW = {
  mainH: 60,
  subH: 52,
  mainW: 168,
  dx: 200,
  /** 理牌在中线左边、重选在右边，各偏这么多 */
  sideDx: 410,
  sortW: 138,
  clearW: 138,
  prevDx: 548,
  prevW: 112,
  subDy: 4,
  /** "我回来了""坐下"：宽高；"我回来了"在按钮行上方 backDy */
  wideW: 240,
  wideH: 60,
  backDy: 104,
  /** "轮到你"那行提示在按钮行上方多少 */
  statusDy: 50,
} as const;

/** 牌桌互动（kit 的 TableFun）：按钮和各块避让区的尺寸、间距；手机上宽高另取 max(下面的值, minHit()) */
export const FUN_UI = {
  /** "互动"和聊天按钮宽度下限 */
  iconMinW: 56,
  /** "互动"按钮框宽度下限（夹在头像和"理牌"之间，挤的时候最窄到这） */
  boxMinW: 48,
  boxMinH: 64,
  /** "互动"按钮框中心纵坐标 */
  btnCy: 390,
  /** 互动层不能盖的区域：从按钮行上沿再往上多少 */
  avoidPad: 40,
  /** 聊天按钮放顶栏左边：邀请按钮后的间隔、"大厅"右缘之后的空隙、电脑版上沿 */
  chatGap: 16,
  chatPad: 12,
  chatTopY: 4,
  chatMinH: 48,
  /** 电脑版聊天收起时的停靠框宽度 */
  dockW: 280,
  /** 弹幕区：离左右两家头像边的距离、对家名牌下沿的空隙、下沿离按钮行上沿 */
  danmakuSide: 40,
  danmakuGap: 4,
  danmakuBottom: 72,
  /** 首次提示"点头像扔道具"的位置：互动按钮右边多远、纵坐标 */
  tipDx: 20,
  tipY: 340,
  /** 单机催促检查间隔、弹窗显隐同步间隔（毫秒，不经 dur） */
  urgeTickMs: 500,
  shownTickMs: 200,
} as const;

/** "提示"按钮跳两下：放大倍数和单程时长（毫秒，经 dur） */
export const PULSE = { scale: 1.12, ms: 160 } as const;

/** 顶栏（高度见 layout.ts 的 TOPBAR_H）：中线、"大厅"、邀请、两队胶囊、中间级牌徽章 */
export const TOPBAR = {
  /** 顶栏里图标、文字的垂直中线 */
  midY: 28,
  /** "大厅"按钮：中心 x、宽、高；右缘 126 之后才能放邀请和聊天 */
  lobbyX: 70,
  lobbyW: 112,
  lobbyH: 46,
  lobbyRight: 126,
  /** 邀请按钮：离"大厅"右缘的间隔、直径 */
  inviteGap: 8,
  inviteSize: 46,
  /** 顶栏图标点按区域从上沿往下的深度下限（手机上取 max(这个, minHit())） */
  hitDeep: 54,
  /** 两队胶囊：纵坐标、宽、高、圆角、金边粗细；队名、级数、"A×n"角标离胶囊左缘的距离 */
  teamY: 8,
  teamW: 132,
  teamH: 40,
  teamR: 20,
  teamLine: 2.5,
  teamLabelDx: 16,
  teamLevelDx: 106,
  teamFailsDy: 9,
  /** 我方胶囊离中线向左多少、对方胶囊离中线向右多少（对方右缘正好到 238）；右边图标的点按区域不越过 238 */
  usDx: 238,
  themDx: 106,
  /** 中间："本副打"（右对齐）离中线、"第 N 副"电脑版离中线、手机版离中线 */
  playLabelDx: 34,
  dealNoDx: 36,
  dealNoPhoneDx: 32,
  /** 级牌徽章：左缘离中线、纵坐标、宽、高、圆角、金边粗细；级牌字的纵坐标 */
  badgeX: 26,
  badgeY: 4,
  badgeW: 52,
  badgeH: 48,
  badgeR: 8,
  badgeLine: 3,
  badgeTextY: 29,
} as const;

/** 实盘条（顶栏下面靠右）：纵向都是离顶栏下沿的距离 */
export const STAKE_STRIP = {
  /** 文字右缘离屏幕右边、纵向中线 */
  textRight: 22,
  cy: 22,
  /** 底板：左缘离文字左边、上沿、两边多出的宽度、高、圆角、描边粗细 */
  boxLeft: 36,
  boxTop: 6,
  boxPadW: 28,
  boxH: 32,
  boxR: 16,
  boxLine: 1.5,
  /** "结回 ›"小签：右缘离文字左边、底板上沿、两边多出的宽度、高、圆角、与点按区域的间隔 */
  tagGap: 46,
  tagTop: 8,
  tagPadW: 22,
  tagH: 28,
  tagR: 14,
  tagBgGap: 12,
  zoneGap: 14,
  /** 点按区域底边（也是记牌器上沿）、高度下限、屏幕右边留白、小签中心离点按区域左缘 */
  bottom: 44,
  hitMin: 32,
  edge: 8,
  stripDx: 30,
  /** "重新带入"按钮：右缘离文字左边、宽、高 */
  rebuyGap: 120,
  rebuyW: 150,
  rebuyH: 34,
  /** 记牌器纵坐标：没有实盘条时离顶栏下沿 */
  counterNoStrip: 6,
} as const;

/** 记牌器（纸签）：电脑版 / 手机版的格子宽、整条高；其余尺寸 */
export const COUNTER = {
  /** 左缘：离对家头像中心至少多远、离屏幕中线最多往左多少 */
  avatarDx: 104,
  centerDx: 140,
  cellW: 32,
  cellWPhone: 38,
  h: 50,
  hPhone: 60,
  /** 整条两边多出的宽度、第一格离左缘 */
  padW: 16,
  padL: 8,
  /** 顶着顶栏图标点按区域时再往下让多少 */
  clearIcons: 4,
  r: 6,
  /** 展开时的投影偏移；收起小签时的投影偏移、纸面下移 */
  shadowDx: 3,
  shadowDy: 4,
  foldShadowDx: 2,
  foldShadowDy: 5,
  foldPaperDy: 2,
  /** 收起的小签：文字离左缘、文字中线、两边多出的宽度、纸高、点按区域高度、圆角 */
  foldTextDx: 14,
  foldTextDy: 17,
  foldPadW: 28,
  foldH: 30,
  foldHitH: 34,
  /** 级牌格的高亮：内缩（左右各一份）、离上沿 */
  hiliteInset: 2,
  hiliteTop: 4,
  hiliteR: 5,
  /** 点数和张数的纵坐标：电脑版 / 手机版 */
  rankY: 14,
  rankYPhone: 17,
  leftY: 34,
  leftYPhone: 43,
} as const;

// ───────── 斗地主牌桌（DdzScene、doudizhu/table-ui）；ME_AVATAR 和掼蛋共用上面那份 ─────────

/** 斗地主牌桌（DdzScene、doudizhu/table-ui）的布局坐标、尺寸、时长。只放数字，不依赖 Phaser、DOM；值是从两个文件里原样收出来的。 */

/** 斗地主手牌横排一行，比掼蛋的分列矮一截：操作按钮那排比掼蛋的 BUTTON_Y 往下挪多少，贴近手牌 */
export const DDZ_BUTTON_DROP = 56;

/** 操作按钮行。宽高是设计值，手机上再和 minDrawH()/minHit() 取大 */
export const DDZ_BUTTONS = {
  /** 出牌、提示、不要三个主按钮：宽、左右两个离中线多远 */
  mainW: 168,
  mainDx: 200,
  /** 主按钮最小高度；理牌、重选这类弱按钮的最小高度 */
  mainH: 60,
  weakH: 52,
  /** 理牌、重选：宽、比主按钮行低多少、离中线多远（右侧重选） */
  weakW: 138,
  weakDy: 4,
  weakDx: 410,
  /** 理牌按钮的左边界要让开互动钮：我的头像右边再留一个互动钮（最小宽 56） */
  funMinW: 56,
  /** 叫分：按钮宽、步距、整排离"理牌"右沿的间隙 */
  bidW: 160,
  bidStep: 176,
  bidGap: 24,
  /** 明牌二选一：按钮宽、左右离中线多远 */
  showW: 190,
  showDx: 110,
  /** "我回来了""坐下"的宽高，前者在按钮行上方多远 */
  backW: 240,
  backH: 60,
  backDy: 104,
  /** 状态提示文字在按钮行上方多远；提示 toast 在按钮行上方多远 */
  statusDy: 50,
  toastDy: 92,
} as const;

/** 顶栏（高度见 layout.ts 的 TOPBAR_H）里的元素：垂直中线、大厅按钮、居中文字的两侧留白 */
export const DDZ_TOPBAR = {
  midY: 28,
  lobbyX: 70,
  lobbyW: 112,
  lobbyH: 46,
  /** 大厅按钮点按区的最小高度（再和 minHit() 取大） */
  lobbyHitMinH: 54,
  /** 残局题名等居中文字：最小宽度、两边各让出多少 */
  midMinW: 240,
  midSide: 300,
  /** 右边图标区往左最远到中线右侧多远 */
  iconsLeftDx: 200,
  /** 今日残局走表每秒刷新一次（毫秒，不经 dur()） */
  clockTickMs: 1000,
} as const;

/** 顶栏中间：倍数文字、三张底牌、副数文字相对中线的位置 */
export const DDZ_TOPMID = {
  labelDx: 110,
  bottomX0: -60,
  bottomStep: 44,
  /** 底牌 CardView 的高度；背面图的显示宽高 */
  cardH: 38,
  backW: 38,
  backH: 52,
  dealDx: 90,
} as const;

/** 残局提示条（顶栏下面居中）：离顶栏、圆角药丸的高度、文字两侧留白、可用宽度要扣掉多少 */
export const DDZ_PUZZLE_TIP = { dy: 30, h: 34, padX: 48, widthCut: 360 } as const;

/** 好友房实盘条（顶栏下面靠右）和"重新带入"按钮 */
export const DDZ_STAKE_BAR = {
  /** 文字右沿离屏幕右边、中心离顶栏下沿 */
  right: 22,
  textDy: 22,
  /** 药丸：上沿离顶栏下沿、高度、左边比文字多出多少（含右边距）、宽度比文字多多少 */
  pillDy: 6,
  pillH: 32,
  pillLeft: 36,
  pillPadW: 28,
  /** 重新带入按钮：宽、高、中心离文字左沿；记牌器据此让开的左界离文字左沿 */
  rebuyW: 150,
  rebuyH: 34,
  rebuyDx: 120,
  rebuyLeftDx: 195,
} as const;

/** 记牌器（顶栏下面居中一排）。手机上格子更大 */
export const DDZ_COUNTER = {
  /** 离顶栏下沿 */
  dy: 4,
  /** 每格宽、整条高：[电脑, 手机] */
  cellW: [32, 38],
  barH: [44, 56],
  /** 整条左右各留的边 */
  padW: 16,
  pad: 8,
  /** 收成小签时：高、点按区高、文字中心 dy、文字两侧留白 */
  tabH: 30,
  tabHitH: 34,
  tabTextDy: 17,
  tabPad: 28,
  /** 牌名、剩余张数的 dy：[电脑, 手机] */
  nameDy: [12, 15],
  leftDy: [31, 40],
} as const;

/** "互动"按钮的中心 y；聊天按钮离屏幕左沿（顶栏"大厅"右边）；弹幕区离左右两家头像的间隙 */
export const DDZ_FUN = { y: 390, chatX: 126 + 12, chatDockW: 280, danmakuGap: 40 } as const;

/** 互动用的轮询：显隐每 200 毫秒检查一次（毫秒，不经 dur()） */
export const DDZ_FUN_POLL_MS = 200;

/** 结算前等其他人的提示：y、行距 */
export const DDZ_SETTLE_WAIT = { y: 200, gap: 56 } as const;

/** "房间断开了"弹窗 */
export const DDZ_CLOSED_MODAL = { w: 640, h: 300, bodyW: 560, btnW: 240, btnH: 64, btnY: 80 } as const;
