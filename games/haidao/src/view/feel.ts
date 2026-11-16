/**
 * 打击感的规矩（纯逻辑，不依赖 Phaser / DOM，tests/feel.test.ts 锁住）：
 * 哪些事件配震屏、震几档、冷却多久，"震屏和振动"开关（存 haidao.feel，默认跟随系统的"减弱动态效果"），短振动。
 * 普通命中不震屏、不顿帧，只给局部反馈（闪白、压扁、火花）；大事件才动整个画面。
 */

export type ShakeLevel = 'light' | 'medium' | 'heavy';

/** 震屏三档：[毫秒, 镜头强度, 档位高低] */
export const SHAKE: Record<ShakeLevel, { ms: number; k: number; rank: number }> = {
  light: { ms: 90, k: 0.0014, rank: 1 },
  medium: { ms: 150, k: 0.003, rank: 2 },
  heavy: { ms: 260, k: 0.0055, rank: 3 },
};

/** 单次伤害到这个数就算重击（炮、迫击炮、爆破手一类）：数字画大、触发命中停顿；登陆战和守岛同一个门槛 */
export const HEAVY_HIT = 90;

/** 两次震屏之间至少隔这么久；冷却里只有更高一档的能打断 */
export const SHAKE_COOLDOWN_MS = 300;

/**
 * 大事件 → 震几档。表里没有的事件（小兵普通攻击、塔普通开火、普通命中、小爆炸）不震屏，也不顿帧。
 * 画面层一律先查这张表，不在调用处各写各的档位。
 */
export const BIG_EVENT = {
  /** 主寨被摧毁 */
  hqDown: { shake: 'heavy', stop: 80 },
  /** 一般建筑倒塌（墙、地雷、焦油、棕榈、石头不算） */
  buildingDown: { shake: 'medium', stop: 55 },
  /** 主寨 / 宝藏箱挨了一记重击（不是小兵的普通攻击） */
  keyHit: { shake: 'light', stop: 0 },
  /** 大爆炸（半径 ≥ 1.5 格）：炮击技能、臼炮、地雷、火药桶；连锁时一连串，靠冷却合并 */
  bigBlast: { shake: 'medium', stop: 40 },
  /** 首领登场、首领技能、海怪拍击 */
  bossEnter: { shake: 'medium', stop: 0 },
  bossSkill: { shake: 'heavy', stop: 0 },
  /** 首领被打倒 */
  bossDown: { shake: 'heavy', stop: 80 },
  /** 宝藏被抢走 */
  chestGrab: { shake: 'medium', stop: 50 },
} as const satisfies Record<string, { shake: ShakeLevel; stop: number }>;
export type BigEvent = keyof typeof BIG_EVENT;

/** 不值得震屏的建筑：墙、地雷、焦油、棕榈、石头、桶；倒塌只出烟尘碎屑 */
const MINOR = new Set(['wall', 'mine', 'tar', 'palm', 'rock', 'barrel']);
export function buildingDownEvent(kind: string): BigEvent | null {
  if (kind === 'hq') return 'hqDown';
  return MINOR.has(kind) ? null : 'buildingDown';
}

/** 主寨 / 宝藏箱被打：只有重击（炮弹、技能）才算，小兵的普通攻击不算 */
export function isKeyHit(kind: string, dmg: number, heavyAt: number): boolean {
  return (kind === 'hq' || kind === 'treasure') && dmg >= heavyAt;
}

/** 爆炸够不够大（半径按格算） */
export function isBigBlast(cells: number): boolean {
  return cells >= 1.5;
}

/** 震屏闸门：关了不震；运行中、冷却里只放行更高一档的；同一时间只取最大的 */
export class ShakeGate {
  private lastAt = -Infinity;
  private last: ShakeLevel = 'light';
  request(level: ShakeLevel, now: number, enabled: boolean): boolean {
    if (!enabled) return false;
    if (now - this.lastAt < SHAKE_COOLDOWN_MS && SHAKE[level].rank <= SHAKE[this.last].rank) return false;
    this.lastAt = now;
    this.last = level;
    return true;
  }
  reset(): void {
    this.lastAt = -Infinity;
  }
}

/** 顿帧闸门：只放行重击（stop > 0），不叠加，结束后留一小段冷却 */
export class StopGate {
  private until = -Infinity;
  private cool = -Infinity;
  trigger(ms: number, now: number): boolean {
    if (ms <= 0 || now < this.cool) return false;
    this.until = now + Math.min(80, Math.max(40, ms));
    this.cool = this.until + 140;
    return true;
  }
  active(now: number): boolean {
    return now < this.until;
  }
}

// ---------------------------------------------------------------- 开关

export const FEEL_KEY = 'haidao.feel';

/** 存过就听存的（'1' 开 / '0' 关）；没存过，系统开了"减弱动态效果"就默认关 */
export function resolveFeel(stored: string | null, reducedMotion: boolean): boolean {
  if (stored === '1') return true;
  if (stored === '0') return false;
  return !reducedMotion;
}

let cached: boolean | null = null;

function readStored(): string | null {
  try {
    return localStorage.getItem(FEEL_KEY);
  } catch {
    return null;
  }
}
/** 系统开了"减弱动态效果"（全画面层只在这里读一次）：演出压短、不晃、不飘；Node 里跑测试时没有 matchMedia，当没开 */
export const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function feelOn(): boolean {
  if (cached === null) cached = resolveFeel(readStored(), REDUCED);
  return cached;
}

export function setFeel(on: boolean): void {
  cached = on;
  try {
    localStorage.setItem(FEEL_KEY, on ? '1' : '0');
  } catch {
    /* 隐私模式写不进去：本次内存里生效 */
  }
}

/** 恢复默认：清掉存的开关，重新跟随系统的"减弱动态效果" */
export function resetFeel(): void {
  cached = null;
  try {
    localStorage.removeItem(FEEL_KEY);
  } catch {
    /* 隐私模式：本次内存里已重算 */
  }
}

// ---------------------------------------------------------------- 短振动

/** 毫秒；数组 = 振、停、振…… 都是几十毫秒的轻触，不吓人 */
export const VIBE = {
  land: 18,
  skill: 30,
  collapse: 45,
  /** 升级完成：短-停-短 */
  upgrade: [24, 40, 30],
  win: [30, 50, 70],
  lose: [70, 50, 70],
} as const satisfies Record<string, number | readonly number[]>;
export type VibeKind = keyof typeof VIBE;

interface Vibrator {
  vibrate?: (p: number | number[]) => boolean;
}

/** 开关开着、设备支持（Android Chrome）才振；iOS 没有 navigator.vibrate，直接跳过 */
export function vibrate(kind: VibeKind, enabled: boolean = feelOn(), nav: Vibrator | undefined = typeof navigator === 'undefined' ? undefined : (navigator as Vibrator)): boolean {
  if (!enabled || typeof nav?.vibrate !== 'function') return false;
  const p = VIBE[kind];
  try {
    return nav.vibrate(typeof p === 'number' ? p : [...p]);
  } catch {
    return false;
  }
}
