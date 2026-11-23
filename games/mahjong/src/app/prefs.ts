/**
 * 偏好（localStorage 的 mahjong.prefs）：声音、速度、档位、难度、选着的玩法和各玩法的规则设置。
 * 各玩法的规则设置（opts、rc）怎么读、怎么改在玩法的页面钩子里（view/variants/<id>/page.ts 的 loadRules / setRules），这里只负责存取。
 */
import { platformSoundOn } from 'arcade-kit/client';
import { readJson, writeJson } from '../storage.ts';
import { LEVELS, type Level } from '../ai/venues.ts';
import { DEFAULT_VARIANT } from '../core/variants/index.ts';
import { stakesOf, type StakesId } from '../game/stakes.ts';
import type { RulesStore } from '../view/variants/page.ts';
import { allPages, findPage } from '../view/variants/pages.ts';

const PREFS_KEY = 'mahjong.prefs';

interface Prefs extends RulesStore {
  sound: boolean;
  /** 总音量 0–1（静音另算：sound 关着时一点声音都不出） */
  volume: number;
  fast: boolean;
  /** 茶馆底噪：默认开、很轻，跟着静音和音量走，声音面板里能单独关 */
  ambience: boolean;
  /** 安全牌提示（立直）：别家立直后手牌上标安全程度，默认开 */
  safeHint: boolean;
  /** 推荐出牌：单机娱乐新手、实盘小档的手牌上标一张"荐"（game/coach.ts），默认开 */
  coach: boolean;
  stakes: StakesId;
  /** 单机娱乐的难度：第一次玩默认新手 */
  level: Level;
  /** 玩法（入口收起来的玩法选不到，见 activeVariant）；各玩法的规则设置（opts、rc）见 RulesStore */
  variant: string;
  /** 已修过换三张（见 fixSwap） */
  swapFixed?: true;
}

/** 各玩法从存着的偏好里读自己的规则设置（缺的、坏的补默认） */
const rulesFrom = (raw: Partial<RulesStore>): RulesStore => Object.assign({}, ...allPages().map((pg) => pg.loadRules(raw))) as RulesStore;

/** 顶栏齿轮（设置面板）管的偏好的出厂值（loadPrefs 的缺省也是它们） */
export const SETTINGS_DEFAULTS = { sound: true, volume: 0.8, fast: false, ambience: true, safeHint: true, coach: true } as const;

/** 存着的规则设置坏到某个玩法的 loadRules 抛错：只把规则回出厂值，音量、难度这些照旧 */
function savedRules(p: Partial<Prefs>): RulesStore {
  try {
    return rulesFrom(p);
  } catch {
    return rulesFrom({});
  }
}

/**
 * 旧版本在主页切一次三人两房，存着的换三张会被写成"不换"，切回血战、血流也一直不换（单机实盘也跟着）。
 * 分不出哪些是自己关的，所以每台设备改回"换"一次、记下 swapFixed；自己关过的要再关一次。0.48.0 起删掉这段和 swapFixed。
 */
export function fixSwap(p: Prefs): Prefs {
  if (p.swapFixed) return p;
  return { ...p, opts: { ...p.opts, swap: true }, swapFixed: true };
}

function loadPrefs(): Prefs {
  const p = readJson<Partial<Prefs> | null>(PREFS_KEY, null) ?? {};
  const vol = typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : SETTINGS_DEFAULTS.volume;
  const level = LEVELS.includes(p.level as Level) ? (p.level as Level) : 'easy';
  return {
    sound: p.sound !== false,
    volume: vol,
    fast: p.fast === true,
    ambience: p.ambience !== false,
    safeHint: p.safeHint !== false,
    coach: p.coach !== false,
    stakes: stakesOf(p.stakes)?.id ?? 'fun',
    level,
    ...savedRules(p),
    variant: findPage(p.variant)?.id ?? DEFAULT_VARIANT,
    ...(p.swapFixed === true ? { swapFixed: true as const } : {}),
  };
}

export const prefs = fixSwap(loadPrefs());

/** 大厅关了声音（kit docs/sound.md）：这一次打开先静音；在这里打开、关上都只管这一次，不改存着的 prefs.sound */
const lobbyMuted = !platformSoundOn();

/** 这一次打开有没有声：平时就是 prefs.sound */
export const live = { sound: prefs.sound && !lobbyMuted };

/** 静音开关：大厅静音进来的只改这一次，平时连 prefs.sound 一起存 */
export function setLiveSound(on: boolean): void {
  live.sound = on;
  if (lobbyMuted) return;
  prefs.sound = on;
  savePrefs();
}

export function savePrefs(): void {
  // 存不上就这一次有效，不看返回值
  writeJson(PREFS_KEY, prefs);
}

/** 设置面板的恢复默认：音量、静音、茶馆声、出牌速度、安全牌提示、推荐出牌回出厂值并存回（互动、聊天另存，由面板自己复位）。返回 p 方便测试 */
export function resetSettings(p: Prefs = prefs): Prefs {
  Object.assign(p, SETTINGS_DEFAULTS);
  if (p === prefs) {
    live.sound = p.sound;
    savePrefs();
  }
  return p;
}

/** 现在选的玩法；认不得的按川麻 */
export function activeVariant(): string {
  return findPage(prefs.variant)?.id ?? DEFAULT_VARIANT;
}
