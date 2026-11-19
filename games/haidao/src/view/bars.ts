/**
 * 血条的显示规矩（纯逻辑，不依赖 Phaser / DOM，tests/bars.test.ts 锁住）：
 * 满血不显示；掉血后显示 BAR_SHOW_MS，最后一小段淡出，再掉血重新计时；
 * 挨得很近的血条上下错开，不叠成一团；兵的条小而细，建筑的稍大。
 */

/** 掉血后显示多久（毫秒） */
export const BAR_SHOW_MS = 3000;
/** 最后多久淡出（毫秒） */
export const BAR_FADE_MS = 500;

/** 条的尺寸（CSS 像素，屏幕上恒定）：[宽, 高] */
export const BAR_SIZE = {
  unit: [20, 3],
  /** 守岛的精英：比小兵宽、和墙一样粗，左边挂金菱形 */
  elite: [30, 5],
  /** 守岛的首领：最宽，左边挂王冠（顶栏另有粗血条） */
  boss: [40, 6],
  building: [34, 5],
} as const;

/** 现在这条血条的不透明度：到时间前 1，最后 BAR_FADE_MS 线性淡到 0（淡出是视觉用的，不属于规则） */
export function barAlpha(now: number, until: number): number {
  const left = until - now;
  if (left <= 0) return 0;
  return left >= BAR_FADE_MS ? 1 : left / BAR_FADE_MS;
}

/**
 * 记录每个对象最近一次掉血的时刻：满血或没掉过血不显示；血量比上次少就重新计时。
 * 血量变多（治疗）不触发显示，但会更新基准，下次掉血才对得上。
 */
export class BarTracker {
  private seen = new Map<string | number, { hp: number; until: number; gen: number }>();
  private gen = 0;

  /** 每帧开头调一次，帧末 sweep 会清掉这一帧没出现的对象 */
  begin(): void {
    this.gen++;
  }

  /** 返回不透明度（0 = 不画）。hp >= maxHp 一律 0 */
  alpha(key: string | number, hp: number, maxHp: number, now: number): number {
    let s = this.seen.get(key);
    if (!s) {
      s = { hp, until: -Infinity, gen: this.gen };
      this.seen.set(key, s);
    } else {
      s.gen = this.gen;
      if (hp < s.hp) s.until = now + BAR_SHOW_MS;
      s.hp = hp;
    }
    if (hp >= maxHp) return 0;
    return barAlpha(now, s.until);
  }

  /** 清掉这一帧没出现的（死了、拆了的）对象，免得表越攒越大 */
  sweep(): void {
    for (const [k, s] of this.seen) if (s.gen !== this.gen) this.seen.delete(k);
  }

  get size(): number {
    return this.seen.size;
  }
}

export interface BarSlot {
  x: number;
  y: number;
  /** 条宽（世界单位，和 x 同一坐标系） */
  w: number;
}

// stackBars 的临时数组：同步用完即清，每帧不再新建两个数组
const orderBuf: BarSlot[] = [];
const placedBuf: BarSlot[] = [];

/**
 * 把挨得近的血条上下错开：按 y 从下到上依次放，和已放下的条在横向有重叠、竖向间距不到 gap 的，就往上挪到不重叠为止。
 * 原地改 slots 的 y，返回同一个数组。gap = 条高加一点缝（世界单位）。
 */
export function stackBars(slots: BarSlot[], gap: number): BarSlot[] {
  if (slots.length < 2) return slots;
  const order = orderBuf;
  const placed = placedBuf;
  order.length = 0;
  placed.length = 0;
  for (let i = 0; i < slots.length; i++) order.push(slots[i]!);
  order.sort((a, b) => b.y - a.y);
  for (const s of order) {
    let moved = true;
    for (let guard = 0; moved && guard < 12; guard++) {
      moved = false;
      for (const p of placed) {
        if (Math.abs(p.x - s.x) < (p.w + s.w) / 2 && Math.abs(p.y - s.y) < gap) {
          s.y = p.y - gap;
          moved = true;
        }
      }
    }
    placed.push(s);
  }
  order.length = 0;
  placed.length = 0;
  return slots;
}

// crowdBars 的计数表：同步用完即清
const cellCount = new Map<number, number>();

/**
 * 扎堆时少画几条：小条（兵 / 敌人 / 英雄）按 cell 见方的格子分组，每格最多留 max 条，血最少的先留；
 * 大条（墙、拒马）全留。一群敌人涌进同一小片时，十几条错开的血条会叠成一根柱子盖住人，比不画更难读。
 * 原地重排、截短 items，返回同一个数组；cell 用世界单位（屏幕像素 / 缩放）。
 */
export function crowdBars(items: BarItem[], cell: number, max: number): BarItem[] {
  if (items.length <= max) return items;
  items.sort((a, b) => (a.big === b.big ? a.f - b.f : a.big ? -1 : 1));
  let n = 0;
  for (const it of items) {
    if (!it.big) {
      const k = Math.floor(it.x / cell) * 65536 + Math.floor(it.y / cell);
      const c = cellCount.get(k) ?? 0;
      if (c >= max) continue;
      cellCount.set(k, c + 1);
    }
    items[n++] = it;
  }
  items.length = n;
  cellCount.clear();
  return items;
}

/** 一条待画的血条（BarList 里复用的对象） */
export interface BarItem extends BarSlot {
  f: number;
  col: number;
  a: number;
  big: boolean;
  /** 0 = 普通，1 = 精英（金菱形），2 = 首领（王冠）；只有守岛用 */
  mark: number;
}

/** 每帧要画的血条清单：对象和数组都复用，只在条数变多时才新建对象（登陆战和守岛共用） */
export class BarList {
  private pool: BarItem[] = [];
  readonly items: BarItem[] = [];

  begin(): void {
    this.items.length = 0;
  }

  push(x: number, y: number, w: number, f: number, col: number, a: number, big: boolean, mark = 0): void {
    const n = this.items.length;
    let it = this.pool[n];
    if (!it) {
      it = { x, y, w, f, col, a, big, mark };
      this.pool[n] = it;
    } else {
      it.x = x;
      it.y = y;
      it.w = w;
      it.f = f;
      it.col = col;
      it.a = a;
      it.big = big;
      it.mark = mark;
    }
    this.items.push(it);
  }
}
