/**
 * 基地手感的纯逻辑（不依赖 Phaser / DOM，tests/basefeel.test.ts 锁住）：
 * 升级面板的"当前 → 下一级"、花费差多少、摆放时每一格能不能放和原因、快捷键、电脑右键菜单的项、菜单贴在鼠标旁的位置、
 * 拖到屏幕边缘时镜头平移的速度、升级演出和落地演出的时间线。画面层（BaseScene、upfx.ts）只按这里算出的结果画。
 */
import { BUILDINGS } from '../content/index.ts';
import { ISLAND, type BuildingKind, type Res } from '../core/types.ts';
import { clamp01, riseScale, easeInQuad, easeOutBack, easeOutCubic, easeOutQuad, easeInOutSine } from './motion.ts';

// ---------------------------------------------------------------- 升级面板

type StatKey = 'hp' | 'rate' | 'cap' | 'dmg' | 'range' | 'splash' | 'boats' | 'boatCap';

interface StatRow {
  key: StatKey;
  label: string;
  cur: number;
  /** 下一级的值；满级时为 null */
  next: number | null;
  /** next - cur（满级为 0） */
  delta: number;
  /** 显示用的单位后缀 */
  unit: string;
}

/** 面板上各项数值的叫法：容量对仓库和主寨是"加多少上限"，对产出建筑是"自己最多存多少" */
function statLabel(kind: BuildingKind, key: StatKey): string {
  const cat = BUILDINGS[kind].category;
  switch (key) {
    case 'hp': return '血量';
    case 'rate': return '每小时产量';
    case 'cap': return cat === 'storage' || kind === 'hq' ? '仓库容量' : '最多存';
    case 'dmg': return '伤害';
    case 'range': return '射程';
    case 'splash': return '溅射';
    case 'boats': return '船数';
    case 'boatCap': return '每船人数';
  }
}
const UNIT: Record<StatKey, string> = { hp: '', rate: '', cap: '', dmg: '', range: ' 格', splash: ' 格', boats: ' 条', boatCap: ' 人' };
const ORDER: StatKey[] = ['hp', 'rate', 'cap', 'dmg', 'range', 'splash', 'boats', 'boatCap'];

/**
 * 某座建筑 level 级的数值和下一级的对比：只列这种建筑有的项（当前或下一级不为 0）。
 * 数值全部读内容表，不在画面层另算。
 */
export function statDiff(kind: BuildingKind, level: number): StatRow[] {
  const def = BUILDINGS[kind];
  const cur = def.levels[level - 1];
  if (!cur) return [];
  const nx = level < def.maxLevel ? def.levels[level] : undefined;
  const out: StatRow[] = [];
  for (const key of ORDER) {
    const a = (cur[key] as number | undefined) ?? 0;
    const b = nx ? ((nx[key] as number | undefined) ?? 0) : null;
    if (!a && !b) continue;
    out.push({ key, label: statLabel(kind, key), cur: a, next: b, delta: b === null ? 0 : b - a, unit: UNIT[key] });
  }
  return out;
}

interface CostItem {
  k: 'gold' | 'wood';
  need: number;
  have: number;
  /** 还差多少（够了是 0） */
  short: number;
}

/** 花费逐项：不够的那项写差多少（面板标红用） */
export function costGap(cost: Res, have: Res): CostItem[] {
  const out: CostItem[] = [];
  for (const k of ['gold', 'wood'] as const) {
    if (!cost[k]) continue;
    out.push({ k, need: cost[k], have: have[k], short: Math.max(0, cost[k] - have[k]) });
  }
  return out;
}

/** 资源不够的统一说法："还差 12 金币，3 木材"；够了返回空串。全模块只用这一种，不写"不足 / 不够" */
export function lackText(cost: Res, have: Res): string {
  const parts: string[] = [];
  const f = (n: number): string => Math.floor(n).toLocaleString('en-US');
  if (cost.gold > have.gold) parts.push(`${f(cost.gold - have.gold)} 金币`);
  if (cost.wood > have.wood) parts.push(`${f(cost.wood - have.wood)} 木材`);
  return parts.length ? `还差 ${parts.join('，')}` : '';
}

/**
 * 出海前的仓库提醒：这座岛打满能拿的（三星、连胜加成都算上，掉落不算）已经比仓库剩下的位置多，
 * 就提醒先回岛花掉（不然赢了也白丢：新号第三座岛三星白丢过 1,666 金）。
 */
export function roomText(loot: Res, have: Res, cap: Res): string {
  const f = (n: number): string => Math.floor(n).toLocaleString('en-US');
  const room = { gold: Math.max(0, cap.gold - have.gold), wood: Math.max(0, cap.wood - have.wood) };
  const parts: string[] = [];
  if (loot.gold > room.gold) parts.push(`${f(room.gold)} 金币`);
  if (loot.wood > room.wood) parts.push(`${f(room.wood)} 木材`);
  return parts.length ? `仓库只装得下 ${parts.join('、')}，先回岛花掉` : '';
}

/** 建造卡名额满了以后，主寨升到哪一级才有更多名额（limits 按主寨 1 级起逐级给这种建筑的名额）；到顶了返回 null */
export function nextSlotHq(limits: number[], hq: number): number | null {
  const cur = limits[hq - 1] ?? 0;
  for (let lv = hq + 1; lv <= limits.length; lv++) if ((limits[lv - 1] ?? 0) > cur) return lv;
  return null;
}

/** 建造卡上名额满了的那一句（卡上已经写着「已建 1/1」，不再重复「名额满了」，整句放得进一行） */
export function fullText(max: number, nextHq: number | null): string {
  if (max === 0) return '现在还不能建';
  return nextHq === null ? '名额满了' : `主寨 ${nextHq} 级加名额`;
}

/** 主寨庆祝框的主按钮：新开放的里有建筑就直接带去建造，否则只是收起来 */
export function celebrateGo(items: Array<{ type: string }>): 'build' | 'close' {
  return items.some((it) => it.type === 'building') ? 'build' : 'close';
}

// ---------------------------------------------------------------- 摆放

interface Foot {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
}
type CellState = 'ok' | 'out' | 'hit';
export interface PlaceCheck {
  ok: boolean;
  cells: Array<{ x: number; y: number; s: CellState }>;
  /** 不能放的原因（能放为 null）：出界优先说，其次压到哪座建筑 */
  reason: 'out' | 'hit' | null;
  /** 压到的第一座建筑（原因是 hit 时） */
  hit: BuildingKind | null;
}

/**
 * 摆放检查：占地的每一格是出界、压到建筑还是空地。和规则核心的 canPlace 判定一致（tests 对拍），
 * 多出来的是逐格的状态和原因，画面按格子涂绿 / 红并写原因。ext = 岛按主寨扩了几圈（岛是 [-ext, ISLAND+ext)）。
 */
export function placeCheck(list: Foot[], kind: BuildingKind, x: number, y: number, ext: number, ignoreId?: number): PlaceCheck {
  const size = BUILDINGS[kind].size;
  const cells: PlaceCheck['cells'] = [];
  let out = false;
  let hit: BuildingKind | null = null;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      let s: CellState = 'ok';
      if (cx < -ext || cy < -ext || cx >= ISLAND + ext || cy >= ISLAND + ext) s = 'out';
      else {
        const b = list.find((q) => q.id !== ignoreId && cx >= q.x && cx < q.x + BUILDINGS[q.kind].size && cy >= q.y && cy < q.y + BUILDINGS[q.kind].size);
        if (b) {
          s = 'hit';
          hit ??= b.kind;
        }
      }
      if (s === 'out') out = true;
      cells.push({ x: cx, y: cy, s });
    }
  }
  const ok = !out && hit === null;
  return { ok, cells, reason: ok ? null : out ? 'out' : 'hit', hit };
}

/**
 * 新建造时虚影从哪一格起步：从画面中心那一格往外一圈圈找，先找四周留一格、前方（x、y 变大的一侧，画面上靠下，高的建筑会挡住它）
 * 再多留一格的空地，找不到再放宽到四周留一格、最后只要能放。ok 是规则核心的 canPlace（这里只管"挑哪一块"，能不能放以它为准）。
 */
export function startSpot(list: Foot[], kind: BuildingKind, cx: number, cy: number, ext: number, ok: (x: number, y: number) => boolean): { x: number; y: number } | null {
  const size = BUILDINGS[kind].size;
  const clear = (x: number, y: number, pad: number, front: number): boolean =>
    !list.some((q) => {
      const qs = BUILDINGS[q.kind].size;
      return q.x < x + size + pad + front && q.x + qs > x - pad && q.y < y + size + pad + front && q.y + qs > y - pad;
    });
  for (const [pad, front] of [[1, 1], [1, 0], [0, 0]] as const) {
    for (let d = 0; d < ISLAND + 2 * ext; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < -ext || y < -ext || x > ISLAND + ext - size || y > ISLAND + ext - size) continue;
          if (clear(x, y, pad, front) && ok(x, y)) return { x, y };
        }
      }
    }
  }
  return null;
}

/** 摆放原因的一句话 */
export function placeReason(c: PlaceCheck): string {
  if (c.ok) return '这里能放';
  if (c.reason === 'out') return '超出岛的边界了';
  return c.hit ? `压到${BUILDINGS[c.hit].name}了` : '这里放不下';
}

/**
 * 摆放时左上角能落在哪：允许虚影探出岛外 size-1 格（这样拖到边上能看到红格和"出界"），但至少留一格在岛上，不会整个丢到海里。
 */
export function clampPlace(x: number, y: number, size: number, ext: number): { x: number; y: number } {
  const lo = -ext - (size - 1);
  const hi = ISLAND + ext - 1;
  return { x: Math.min(hi, Math.max(lo, x)), y: Math.min(hi, Math.max(lo, y)) };
}

/**
 * 拖到屏幕边缘时镜头平移的速度（CSS 像素 / 秒，正数 = 镜头往右 / 往下走）。离边 margin 以内才动，越贴边越快；
 * 鼠标不在画布上（NaN）不动。w、h 是画布的 CSS 尺寸。
 */
export function edgePan(mx: number, my: number, w: number, h: number, margin = 40, max = 520): { vx: number; vy: number } {
  if (!Number.isFinite(mx) || !Number.isFinite(my)) return { vx: 0, vy: 0 };
  const k = (d: number): number => (d >= margin ? 0 : max * easeInQuad(1 - Math.max(0, d) / margin));
  return { vx: k(w - mx) - k(mx), vy: k(h - my) - k(my) };
}

// ---------------------------------------------------------------- 快捷键和右键菜单

export type BaseKeyAction = 'upgrade' | 'info' | 'collectAll' | 'move' | 'build' | 'cancel';

/** 基地的字母快捷键（大小写都认）；键位提示写在按钮的悬停提示里 */
export const BASE_KEYS: Record<string, BaseKeyAction> = { u: 'upgrade', i: 'info', c: 'collectAll', m: 'move', b: 'build', escape: 'cancel' };
/** 动作 → 提示里显示的键名 */
const KEY_HINT: Record<BaseKeyAction, string> = { upgrade: 'U', info: 'I', collectAll: 'C', move: 'M', build: 'B', cancel: 'Esc' };

export function keyAction(key: string): BaseKeyAction | null {
  return BASE_KEYS[key.toLowerCase()] ?? null;
}

/** 悬停提示：「升级（U）」 */
export function withKey(label: string, a: BaseKeyAction): string {
  return `${label}（${KEY_HINT[a]}）`;
}

export interface MenuItem {
  id: 'upgrade' | 'info' | 'collect' | 'move';
  label: string;
  key: string;
  /** 不可用（资源不够等）：灰着，点了提示 why */
  off: boolean;
  why?: string;
  /** 升级的花费（有升级项时） */
  cost?: Res;
  /** 能升级 / 能收集：带红点 */
  dot: boolean;
}

/**
 * 一座建筑的操作项（电脑右键菜单和手机操作环共用）：升级（满级不出）、信息、收集（金矿 / 伐木场有存量才出）、移动。
 * up = 规则核心 upgrade() 的结果（ok 或错误码），why = 错误码换成的一句话。
 */
export function buildingMenu(kind: BuildingKind, level: number, stored: number, up: { ok: true } | { ok: false; why: string } | null, cost: Res | null): MenuItem[] {
  const out: MenuItem[] = [];
  if (cost && up) out.push({ id: 'upgrade', label: '升级', key: 'U', off: !up.ok, why: up.ok ? undefined : up.why, cost, dot: up.ok });
  out.push({ id: 'info', label: '信息', key: 'I', off: false, dot: false });
  if ((kind === 'goldmine' || kind === 'sawmill') && Math.floor(stored) >= 1) out.push({ id: 'collect', label: '收集', key: 'C', off: false, dot: true });
  out.push({ id: 'move', label: '移动', key: 'M', off: false, dot: false });
  void level;
  return out;
}

/**
 * 右键菜单贴在鼠标右下方；右边或下边放不下就翻到左边 / 上边，最后夹进可见区。返回菜单左上角。
 */
export function menuPos(mx: number, my: number, w: number, h: number, area: { l: number; r: number; t: number; b: number }, gap = 6): { x: number; y: number } {
  let x = mx + gap;
  let y = my + gap;
  if (x + w > area.r) x = mx - gap - w;
  if (y + h > area.b) y = my - gap - h;
  x = Math.min(area.r - w, Math.max(area.l, x));
  y = Math.min(area.b - h, Math.max(area.t, y));
  return { x, y };
}

// ---------------------------------------------------------------- 升级演出

/** 升级演出的时间点（毫秒）。施工 → 完成，不挡操作；主寨更长更隆重；城墙一次升很多段，只放完成那一下 */
export interface UpPlan {
  /** 脚手架升起用多久 */
  rise: number;
  /** 锤子敲的时刻 */
  hits: number[];
  /** 新外观换上、脚手架散开的时刻 */
  morph: number;
  /** 全部结束 */
  end: number;
}

export function upPlan(kind: 'normal' | 'hq' | 'quick'): UpPlan {
  if (kind === 'quick') return { rise: 0, hits: [], morph: 0, end: 1000 };
  if (kind === 'hq') return { rise: 320, hits: [260, 430, 600, 770], morph: 900, end: 2000 };
  return { rise: 280, hits: [240, 400, 560], morph: 720, end: 1750 };
}

/** 某一时刻演出各部分的状态（t = 开始后的毫秒） */
interface UpFrame {
  /** 脚手架露出多少（0..1，从地面往上长） */
  scaf: number;
  /** 脚手架散开落下的进度（0 = 还立着，1 = 落完消失） */
  fall: number;
  /** 建筑本体的横向颤动（世界单位）、横纵缩放倍数 */
  dx: number;
  sx: number;
  sy: number;
  /** 本体加亮（0..1，换外观那一下闪一下） */
  glow: number;
  /** 光柱：进度（0..1）和透明度 */
  beam: number;
  beamA: number;
  /** "升级!" 字：缩放和透明度、往上飘多少（屏幕像素） */
  word: number;
  wordA: number;
  wordUp: number;
  /** 等级数字：是否已换成新等级、跳动缩放 */
  lvNew: boolean;
  lvPop: number;
  /** 旧外观残影：透明度、放大倍数 */
  ghostA: number;
  ghostS: number;
  done: boolean;
}

/** 按时间线算一帧；全是纯函数，演出逐帧插值，不用补间和定时器 */
export function upFrame(p: UpPlan, t: number): UpFrame {
  const m = p.morph;
  const post = t - m;
  // 施工：脚手架升起（落地回弹），每一锤压一下、建筑跟着颤
  const scaf = p.rise > 0 ? easeOutBack(clamp01(t / p.rise)) : 0;
  let knock = 0;
  for (const h of p.hits) {
    const d = t - h;
    if (d >= 0 && d < 140) knock = Math.max(knock, 1 - d / 140);
  }
  const building = t < m && p.hits.length > 0;
  const dx = building ? Math.sin(t / 16) * (0.6 + knock * 1.4) : 0;
  let sx = 1 - knock * 0.03;
  let sy = 1 - knock * 0.06;
  // 完成：先压扁蓄力（80ms），弹高（150ms），落回带回弹（380ms）
  if (post >= 0) {
    if (post < 80) {
      const k = easeInQuad(post / 80);
      sx = 1 + 0.1 * k;
      sy = 1 - 0.16 * k;
    } else if (post < 230) {
      const k = easeOutCubic((post - 80) / 150);
      sx = 1.1 - 0.18 * k;
      sy = 0.84 + 0.4 * k;
    } else if (post < 610) {
      const k = easeOutBack((post - 230) / 380);
      sx = 0.92 + 0.08 * k;
      sy = 1.24 - 0.24 * k;
    } else {
      sx = 1;
      sy = 1;
    }
  }
  const fall = post < 0 ? 0 : clamp01(post / 520);
  const glow = post < 0 ? 0 : post < 60 ? post / 60 : Math.max(0, 1 - (post - 60) / 260);
  const beamT = clamp01(post / 900);
  const beam = post < 0 ? 0 : easeOutCubic(beamT);
  const beamA = post < 0 ? 0 : beamT < 0.15 ? beamT / 0.15 : 1 - easeInQuad((beamT - 0.15) / 0.85);
  const wordT = post - 40;
  const word = wordT < 0 ? 0 : easeOutBack(clamp01(wordT / 260));
  const tail = p.end - m - 40;
  const wordA = wordT < 0 ? 0 : wordT < tail - 300 ? 1 : 1 - clamp01((wordT - (tail - 300)) / 300);
  const wordUp = wordT < 0 ? 0 : 26 * easeOutQuad(clamp01(wordT / tail));
  const lvAt = post - 200;
  const lvPop = lvAt < 0 ? 1 : 1 + 0.6 * (1 - easeOutBack(clamp01(lvAt / 300)));
  const ghostT = clamp01(post / 340);
  return {
    scaf: post < 0 ? scaf : scaf * (1 - easeInQuad(fall)),
    fall,
    dx,
    sx,
    sy,
    glow,
    beam,
    beamA,
    word,
    wordA,
    wordUp,
    lvNew: lvAt >= 0,
    lvPop,
    ghostA: post < 0 ? 0 : 1 - easeInQuad(ghostT),
    ghostS: post < 0 ? 1 : 1 + 0.14 * easeOutQuad(ghostT),
    done: t >= p.end,
  };
}

// ---------------------------------------------------------------- 新建筑的施工

/**
 * 新建筑的施工时间线：沿用 UpPlan 的字段（rise = 脚手架升起，hits = 锤子，morph = 完工那一刻，end = 全部结束），
 * 另加 growAt / growDur：建筑本体从地面升起（riseScale）的起点和用时。升起一定在完工之前结束。
 * 总长 1.5–1.6 秒；大建筑（isBigBuilding）更隆重一点。
 */
interface BuildPlan extends UpPlan {
  growAt: number;
  growDur: number;
}

export function buildPlan(big: boolean): BuildPlan {
  if (big) return { rise: 260, hits: [200, 360, 520, 680], growAt: 260, growDur: 680, morph: 980, end: 1600 };
  return { rise: 220, hits: [180, 330, 480], growAt: 240, growDur: 560, morph: 820, end: 1500 };
}

interface BuildFrame extends UpFrame {
  /** 本体透明度：脚手架先搭，本体还没长出来之前是 0 */
  alpha: number;
}

/** 某一时刻：脚手架、锤子颤动、完工金光沿用 upFrame；本体在 growAt 之后按 riseScale 从地面长出来（完工后换回 upFrame 的压扁回弹） */
export function buildFrame(p: BuildPlan, t: number): BuildFrame {
  const f = upFrame(p, t);
  if (t >= p.morph) return { ...f, alpha: 1 };
  const k = (t - p.growAt) / p.growDur;
  if (k <= 0) return { ...f, sx: 0, sy: 0, alpha: 0 };
  const [gy, gx, a] = riseScale(k);
  return { ...f, sx: f.sx * gx, sy: f.sy * gy, alpha: a };
}

/** 城墙的短版：不搭架子，只从地面升起一下（用 riseScale） */
export const WALL_RISE_MS = 380;

// ---------------------------------------------------------------- 落地

/** 落地演出总长（毫秒） */
export const DROP_MS = 520;

/** 放下建筑：从上面落下（越落越快）→ 着地压扁 → 回弹站直。返回 [往上抬的世界单位, 横向缩放, 纵向缩放, 透明度]；k = t / DROP_MS */
export function dropPose(k: number): [number, number, number, number] {
  const t = clamp01(k);
  const fallEnd = 0.36;
  if (t < fallEnd) {
    const f = easeInQuad(t / fallEnd);
    return [34 * (1 - f), 0.96, 1.05, Math.min(1, 0.4 + t * 4)];
  }
  const q = (t - fallEnd) / (1 - fallEnd);
  // 压扁：着地后 1/4 段压到最扁，再回弹
  if (q < 0.25) {
    const s = easeOutQuad(q / 0.25);
    return [0, 1 + 0.12 * s, 1 - 0.2 * s, 1];
  }
  const r = easeOutBack((q - 0.25) / 0.75);
  return [0, 1.12 - 0.12 * r, 0.8 + 0.2 * r, 1];
}

/** 摆放虚影的上下浮动（世界单位）：让人看出它是"拿在手上"的 */
export function hoverBob(ms: number): number {
  return -3 - 3 * easeInOutSine((ms % 1400) / 700 > 1 ? 2 - (ms % 1400) / 700 : (ms % 1400) / 700);
}

// ---------------------------------------------------------------- 开面板时镜头让开

export interface ScreenRect { l: number; t: number; r: number; b: number }
export interface CamView { cx: number; cy: number; z: number }

/**
 * 开建筑面板时镜头该去哪：把建筑（box，画布上的 CSS 像素框，按当前镜头 cam 算的）挪到可见区 area（面板以外、顶栏底栏以内）的正中；
 * 建筑在可见区里太小（宽高都不到可见区的 fill）就拉近一点，最多放大 1.8 倍、不超过 maxZ，不会拉远。vw、vh 是画布的 CSS 尺寸。
 * 镜头的约定和 CamCtl 一样：屏幕 x = (世界 x - cx) * z + vw / 2。
 */
export function panelFocus(box: ScreenRect, area: ScreenRect, cam: CamView, vw: number, vh: number, maxZ: number, fill = 0.4): CamView {
  const bw = Math.max(1, box.r - box.l);
  const bh = Math.max(1, box.b - box.t);
  const aw = Math.max(1, area.r - area.l);
  const ah = Math.max(1, area.b - area.t);
  const want = Math.min((aw * fill) / bw, (ah * fill) / bh);
  const z = want > 1 ? Math.max(cam.z, Math.min(maxZ, cam.z * Math.min(1.8, want))) : cam.z;
  const wx = cam.cx + ((box.l + box.r) / 2 - vw / 2) / cam.z;
  const wy = cam.cy + ((box.t + box.b) / 2 - vh / 2) / cam.z;
  return { cx: wx - ((area.l + area.r) / 2 - vw / 2) / z, cy: wy - ((area.t + area.b) / 2 - vh / 2) / z, z };
}

/** 两个镜头之间插值（缩放按比例插，拉近拉远看着匀） */
export function camLerp(a: CamView, b: CamView, k: number): CamView {
  const t = clamp01(k);
  return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, z: a.z * (b.z / a.z) ** t };
}

/** 木材不够整支船队时核心自动少带兵（trimArmy），出海后提示一句，免得玩家以为兵丢了 */
export const trimText = (n: number, need: Res, have: Res): string => `满编${lackText(need, have)}，这次少带 ${n} 个兵`;
