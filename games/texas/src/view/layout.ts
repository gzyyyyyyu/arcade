import { must } from '../must.ts';
/**
 * 舞台和座位的位置（docs/screens.md 8.2）。舞台高固定 540 个设计单位，宽随屏幕在 860–1170 之间变（4:3 平板到 19.5:9 手机都铺满），
 * 再整体缩放到看得见的区域。座位按"离我第几个"排在椭圆桌边，我永远在正下方。
 */
const STAGE_H = 540;
export const STAGE_MIN_W = 860;
export const STAGE_MAX_W = 1170;

export interface Pt {
  x: number;
  y: number;
}

/**
 * 竖屏：手机竖着拿时舞台宽 540、高随屏幕在 810–1170 之间变。桌子是竖的椭圆，别人沿桌边一圈，
 * 我和操作区在下半屏（拇指够得着）；顶上两行是顶栏和"第几手、歇一手、嘲讽"。
 */
const TALL_W = 540;
const TALL_MIN_H = 810;
const TALL_MAX_H = 1170;
/**
 * 竖屏顶上只留顶栏的高度，桌子从这里往下：原来 150，因为顶栏下面还有一行"第几手、互动、聊天、补码、歇一手"，
 * 现在这一行搬到我的名牌和操作区之间（style.css 的 .stage.tall .hud），桌子往上多长 58，390×844 上桌面占屏高 55% 以上
 */
const TALL_TOP = 92;
/** 竖屏桌子下沿在我的座位点上面多少：底牌的上半截压在桌边上（原来 100，桌下沿和底牌之间空一条；操作区上提 24 后再收 10，桌子高度不变） */
const TALL_FELT_GAP = 60;
/**
 * 竖屏底下留给操作区（加注面板展开时最高）的高度：我的名牌下沿要在它上面。
 * 从 310 收到 285（截图实测：加注面板展开后顶边离我的名牌还空 40），省下来的给桌子
 */
const TALL_BOTTOM = 285 + 24;
// +24：操作区整排往上提 24 个设计单位，让开屏幕最下面那条吧台深色带（style.css 的 --lift）

/** 舞台的样子：宽、高、是不是竖屏 */
export interface Geo {
  w: number;
  h: number;
  tall: boolean;
}

/** 我的座位的点（名牌上沿往上一点，各部件按它摆，style.css 的 .seat.me） */
const meY = (g: Geo): number => (g.tall ? g.h - TALL_BOTTOM - 62 : ME_Y);

/** 桌子：椭圆的中心和半轴（设计单位） */
export function felt(g: Geo): { cx: number; cy: number; rx: number; ry: number } {
  if (!g.tall) return { cx: g.w / 2, cy: 250, rx: g.w / 2 - 120, ry: 168 };
  // 竖屏：下沿落在我的底牌中间（底牌顶到点上方约 91）
  const bottom = meY(g) - TALL_FELT_GAP;
  return { cx: g.w / 2, cy: (TALL_TOP + bottom) / 2, rx: 200, ry: (bottom - TALL_TOP) / 2 };
}

/**
 * 我的座位：底牌在上、名牌在下、头像在名牌左边，三样不叠；下注在底牌上方，再往上是池子和公共牌。
 * 座位的点是名牌上沿往上一点，各部件按它摆（style.css 的 .seat.me）
 */
const ME_Y = 470;

/** 横屏每种人数的座位位置：[x 占舞台宽的比例, y]，第 0 个是我 */
const SLOTS: Record<number, [number, number][]> = {
  2: [[0.5, ME_Y], [0.5, 66]],
  3: [[0.5, ME_Y], [0.24, 92], [0.76, 92]],
  4: [[0.5, ME_Y], [0.085, 250], [0.5, 66], [0.915, 250]],
  5: [[0.5, ME_Y], [0.085, 280], [0.27, 82], [0.73, 82], [0.915, 280]],
  // 6 人桌右下那家 360→334（左下不动：左下的下注再往上会碰池子标签）：右下那家的名牌下沿离操作区上面的赔率条只剩 3，动作签、D、下注筹码都挤在这一带（手机横屏 10-31 试玩）
  // 两侧上面那两家 128→110：手机横屏名牌按 --ui 放大以后，下沿压到下面那家的头像（568×320 量出 10 个屏幕像素）
  6: [[0.5, ME_Y], [0.095, 360], [0.11, 110], [0.5, 66], [0.89, 110], [0.89, 334]],
  // 顶上一排离两边近的（5、7、8 人桌）往下让 12–20：贴着顶栏的那两家，底牌和头像钻到右边圆按钮、左边"在哪一桌"的字下面（牌桌互压检查）
  // 7–9 人两侧下面那两家往上让 10–19：右下那家的名牌压到操作区上面一行的赔率条
  // 7–9 人：左右各两个贴着桌边（再往下是操作区和左下角的按钮，放不下），其余排在顶上
  7: [[0.5, ME_Y], [0.08, 330], [0.12, 130], [0.36, 82], [0.64, 82], [0.88, 130], [0.92, 330]],
  8: [[0.5, ME_Y], [0.07, 314], [0.08, 175], [0.27, 78], [0.5, 60], [0.73, 78], [0.92, 175], [0.93, 314]],
  9: [[0.5, ME_Y], [0.07, 316], [0.07, 185], [0.2, 78], [0.39, 60], [0.61, 60], [0.8, 78], [0.93, 185], [0.93, 316]],
};

/**
 * 竖屏别人的座位：沿桌边一圈，从我左下方开始顺时针（和横屏同一个方向），到我右下方为止。
 * 角度 90° 是正下方（我）；别人最多从 145° 排到 395°，人少时往上收（2 人桌对面就在正上方）
 */
/**
 * 4 个以上的角度按表排（牌桌互压检查）：原来按 250° 等分，5、8、9 人桌有一家正好在桌子左右两头、和公共牌一样高，
 * 底牌朝桌心摆就压到公共牌。两侧只用公共牌上面（189°–351°）和下面靠近我的那一截（≤147°、≥33°），左右对称
 */
const TALL_DEG: Record<number, number[]> = {
  4: [145, 220, 320, 395],
  5: [145, 210, 270, 330, 395],
  6: [145, 200, 247, 293, 340, 395],
  7: [145, 190, 230, 270, 310, 350, 395],
  8: [145, 190, 213, 247, 293, 327, 350, 395],
};

/**
 * 矮竖屏（360×640、375×667 这类，舞台高约 960）：桌子比 390×844 矮 100 多，按椭圆摆 5 人以上的桌，别人的底牌、名牌、公共牌和池子互相压（0.35.x 实测 9 人桌几百处）。
 * 这时改成固定的格子：顶上一排（最多 4 家）、两侧各上下两家，每家占宽 120、高 112（头像、名牌、挨着头像露出一半的底牌），
 * 两侧只放在公共牌两边（x ≤ 131 / ≥ 409）和池子下面，不进公共牌和池子那一带。高度不到 940 放不下，仍走椭圆
 */
export const isCompact = (g: Geo): boolean => g.tall && g.h >= 940 && g.h < 1050;
/** 矮竖屏 5 人以上的桌（别人 4 家起）才用固定格子；人少椭圆放得下 */
export const isPacked = (g: Geo, size: number): boolean => isCompact(g) && size >= 5;

/** 矮竖屏别人的座位，从我左下方开始顺时针；只有 4–8 家（3 家以下椭圆本来就不挤） */
function compactSlots(m: number, g: Geo): Pt[] | undefined {
  const f = felt(g);
  const top = TALL_TOP + 12;
  // 池子那一行（最多三个池子，横着铺到 x≈83）在 y 380–412：下面一家的头像要在它下面，上面一家的名牌要在它上面
  const lb = Math.round(f.cy + f.ry - 79);
  const lt = top + 162;
  const L = 65;
  const R = g.w - 65;
  const row = (xs: number[]): Pt[] => xs.map((x) => ({ x, y: top }));
  switch (m) {
    case 8: return [{ x: L, y: lb }, { x: L, y: lt }, ...row([60, 194, 346, 480]), { x: R, y: lt }, { x: R, y: lb }];
    case 7: return [{ x: L, y: lb }, { x: L, y: lt }, ...row([100, 270, 440]), { x: R, y: lt }, { x: R, y: lb }];
    case 6: return [{ x: L, y: lb }, { x: L, y: lt }, ...row([194, 346]), { x: R, y: lt }, { x: R, y: lb }];
    case 5: return [{ x: L, y: lb }, { x: L, y: lt }, ...row([270]), { x: R, y: lt }, { x: R, y: lb }];
    case 4: return [{ x: L, y: lt }, ...row([194, 346]), { x: R, y: lt }];
    default: return undefined;
  }
}

function ringPos(k: number, n: number, g: Geo): Pt {
  if (isPacked(g, n + 1)) {
    const slot = compactSlots(n, g)?.[k];
    if (slot) return slot;
  }
  const f = felt(g);
  const span = Math.min(250, 60 * (n - 1));
  const from = 270 - span / 2;
  const deg = TALL_DEG[n]?.[k] ?? (n === 1 ? 270 : from + (k * span) / (n - 1));
  const a = (deg * Math.PI) / 180;
  // 座位的点在桌边稍往里：头像压着桌边，名牌在桌外那一侧
  // 矮竖屏舞台缩得更小、顶栏的按钮相对舞台更高：对面那家的底牌上沿别碰到顶栏下沿（360×640、4 人桌摊牌，聊天开关压到亮出的底牌）
  const y = Math.round(f.cy + (f.ry + 6) * Math.sin(a));
  return { x: Math.round(f.cx + (f.rx + 8) * Math.cos(a)), y: isCompact(g) ? Math.max(y, TALL_TOP + 14) : y };
}

/** 第 seat 号座位在舞台上的位置（me 是我坐的座位，画在正下方） */
export function seatPos(seat: number, me: number, size: number, g: Geo): Pt {
  const k = (seat - me + size) % size;
  if (g.tall) return k === 0 ? { x: g.w / 2, y: meY(g) } : ringPos(k - 1, size - 1, g);
  const [fx, y] = must(must(SLOTS[size], 'SLOTS[size]')[k], 'must(SLOTS[size], SLOTS[size])[k]');
  return { x: fx * g.w, y };
}

/** 顶上一排的座位：动作签、看对手的卡放在下面 */
export const isTop = (p: Pt, g: Geo): boolean => (g.tall ? p.y < felt(g).cy - felt(g).ry * 0.75 : p.y < 150);

/** 下注的筹码放在座位和桌子中心之间（我的在底牌正上方） */
export function betPos(p: Pt, g: Geo, mine: boolean, packed = false): Pt {
  const f = felt(g);
  // 我的：底边在底牌上面一点（.bet.mine 按底边摆），往上长不碰底池
  if (mine) return { x: f.cx, y: p.y - 100 };
  // 竖屏桌子窄、座位挤：顶上的放在名牌正下方，两边的放在名牌朝桌心那一侧、底牌下面，不碰动作签、底牌和名牌（审阅）
  // 上半边两侧的原来按座位往下 44，正好落在公共牌上；改成公共牌上方那一条，左右让开顶上座位的下注
  if (g.tall) {
    if (isTop(p, g)) return { x: p.x, y: p.y + 104 };
    const dir = p.x < f.cx ? 1 : -1;
    // 矮竖屏的两侧：筹码从名牌旁、露出的底牌外面那一侧起摆（左边靠左对齐、右边靠右对齐），上面两家在公共牌上沿之上，下面两家在池子下面
    if (packed) return { x: p.x + dir * 100, y: p.y < f.cy ? p.y - 10 : p.y + 30 };
    // 下半边两侧的：筹码从名牌朝桌心那一侧的边沿起摆（table.ts 的 from-l / from-r，.bet 按靠座位那头对齐），几摞多宽都不压到名牌；
    // 往下放到 52，让开同一家朝桌心那边的底牌
    return p.y < f.cy ? { x: p.x + dir * 120, y: TALL_BOARD_Y(g) - 59 } : { x: p.x + dir * 96, y: p.y + 52 };
  }
  // 往桌心走 42%，但离座位 90–130 之间：只按比例时顶上的座位离桌心近，筹码贴着名牌，两边的离得远，筹码跑到桌子中间，看着不齐
  const dx = f.cx - p.x;
  const dy = f.cy - p.y;
  const dist = Math.hypot(dx, dy);
  const d = Math.min(130, Math.max(90, dist * 0.42));
  // 下半边两侧的再往下 8：几摞筹码里最高的那摞（比如 270 = 两枚 100、两枚 25、四枚 5）往上长，原来顶到桌心的"主池"标签（scenes 667×375 6 人桌）
  const low = p.y > f.cy && Math.abs(dx) > f.rx * 0.5 ? 8 : 0;
  return { x: p.x + (dx / dist) * d, y: p.y + (dy / dist) * d + 6 + low };
}

/** 庄家按钮：在下注的位置旁边偏一点 */
export function buttonPos(p: Pt, g: Geo, mine: boolean, packed = false): Pt {
  // 竖屏别人的：按下注摆会落到公共牌、别人的下注上；两侧的放在头像朝外的上角（底牌在朝桌心那边，动作签挂在名牌下面；原来贴在头像外侧正中，360 宽时被屏幕边裁掉一半），顶上的放名牌右下
  // 矮竖屏顶上一排挨得近：D 放在头像朝外的一侧、名牌上面那一行（右边的家底牌在左边，所以按桌心分左右）
  if (packed && !mine && isTop(p, g)) return { x: p.x + (p.x <= felt(g).cx ? -44 : 44), y: p.y + 6 };
  if (g.tall && !mine) return isTop(p, g) ? { x: p.x + 84, y: p.y + 62 } : { x: p.x - (p.x < felt(g).cx ? 1 : -1) * 44, y: p.y - 32 };
  const b = betPos(p, g, mine, packed);
  // 右半边的座位，下注那摞筹码是靠右对齐、往左长的（style.css 的 .bet.from-r），放在左边会压在筹码上：改放在筹码上方
  if (!mine && p.y >= 150 && p.x > felt(g).cx) return { x: b.x - 18, y: b.y - 36 };
  // 左半边的座位同理：筹码从 b.x-30 往右长，D 放在筹码左端上方
  if (!mine && p.y >= 150 && p.x < felt(g).cx) return { x: b.x - 14, y: b.y - 36 };
  // 别人的放在下注那摞筹码的左边（数字在右边），不压数字
  return mine ? { x: b.x - 96, y: b.y - 12 } : { x: b.x - 64, y: b.y };
}

/**
 * 荷官能站的地方：桌子顶边上离顶上的座位左右都够远的点，按先后试（中间、右边 32% 处、左边 32% 处）。
 * 横屏才有；7–9 人桌顶上坐满了，一个都没有。点在桌边上，荷官按它摆、牌从它上面一点发出来。
 * 还要不碰顶栏（左边"在哪一桌"的字、右边的按钮，长短随玩法变），那一步在 table.ts 按实际位置挑
 */
export function dealerSpots(g: Geo, size: number): Pt[] {
  if (g.tall) return [];
  const f = felt(g);
  const seats = Array.from({ length: size }, (_, k) => seatPos(k, 0, size, g)).filter((p) => p.y < 200);
  // 顶栏右边按钮多了就往里挪：有聊天开关时 68% 处碰到，再加止盈小旗子 66% 也碰到、左边 34% 碰到钱包，
  // 荷官没地方站（冒烟查出）。座位右边只有底牌，比左边的动作签窄，右边让 DEALER_ROOM_RIGHT 就够。
  // 63% 的右沿和顶栏第一个圆按钮差 1 px、62.5% 离座位正好卡在门槛上（浮点一抖就没了），所以再往里多给一档 62%
  return [0.5, 0.68, 0.32, 0.66, 0.34, 0.63, 0.625, 0.62]
    .map((fx) => g.w * fx)
    .filter((x) => seats.every((p) => Math.abs(p.x - x) >= (x > p.x ? DEALER_ROOM_RIGHT : DEALER_ROOM)))
    .map((x) => {
      const t = (x - f.cx) / f.rx;
      return { x, y: f.cy - f.ry * Math.sqrt(1 - t * t) };
    });
}
/** 荷官左右各要让出多宽（头像 60、名牌 108、旁边的底牌和动作签都算上） */
const DEALER_ROOM = 150;
/** 站在座位右边时：右边只有两张底牌（头像右侧约 80），加上荷官半个身子 */
const DEALER_ROOM_RIGHT = 112;

/**
 * 竖屏公共牌那一行的中心：比桌心低一点，上面让出一条放上半边两侧座位的下注。
 * 竖屏的公共牌也缩小了（style.css 的 .stage.tall .card.board，50 宽、间距 54）：原来 5 张两头压到左右座位的名牌（10-19 截图）
 */
const TALL_BOARD_Y = (g: Geo): number => felt(g).cy + 16;
/** 公共牌：5 张的中心（竖屏桌子窄，挨得近一点） */
export const boardPos = (g: Geo, i: number): Pt =>
  g.tall ? { x: g.w / 2 + (i - 2) * 54, y: TALL_BOARD_Y(g) } : { x: g.w / 2 + (i - 2) * 66, y: felt(g).cy - 18 };
/** 池子在公共牌下面（原来在上面，和顶上座位的下注、庄家按钮挤在一起） */
export const potPos = (g: Geo): Pt => ({ x: g.w / 2, y: g.tall ? TALL_BOARD_Y(g) + 70 : felt(g).cy + 54 });
/** 一手的结果条：公共牌和池子下面（放在上面会盖住顶上座位的庄家按钮），按上边摆；两行的结果不压我的底牌 */
export const resultPos = (g: Geo): Pt => ({ x: g.w / 2, y: g.tall ? TALL_BOARD_Y(g) + 80 : felt(g).cy + 64 });
/** 牌堆：发牌从这里出，弃的牌、收的牌飞回这里。在桌子正中（公共牌的位置） */
export const deckPos = (g: Geo): Pt => (g.tall ? { x: g.w / 2, y: TALL_BOARD_Y(g) } : { x: g.w / 2, y: felt(g).cy - 18 });

/**
 * 按看得见的区域算舞台：高比宽大 1.5 倍以上（手机竖着拿）用竖屏舞台，否则横屏（平板竖着也用横屏，上下留边）
 */
export function fit(availW: number, availH: number): Geo & { scale: number } {
  if (availH / availW >= 1.5) {
    let scale = availW / TALL_W;
    let h = availH / scale;
    if (h < TALL_MIN_H) {
      scale = availH / TALL_MIN_H;
      h = TALL_MIN_H;
    }
    return { w: TALL_W, h: Math.min(TALL_MAX_H, h), tall: true, scale };
  }
  let scale = availH / STAGE_H;
  let w = availW / scale;
  if (w < STAGE_MIN_W) {
    scale = availW / STAGE_MIN_W;
    w = STAGE_MIN_W;
  }
  return { w: Math.min(STAGE_MAX_W, w), h: STAGE_H, tall: false, scale };
}
