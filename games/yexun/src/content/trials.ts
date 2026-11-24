/**
 * 试炼（docs/design-play.md 2.6）：12 关手工设计的固定关，全服一样。规则核心只认 `Setup.trial`，
 * `normalizeSetup` 按这张表展开成地图、角色、危险、咒印、夜事（玩家自己的加成、锦囊、开局配置都不带）；
 * 新词缀（法器白名单、不给新法器、怪死爆裂、不掉肉包）和目标在核心里按这里的数算。改数值要跑 `npm run sim -- --trial all`。
 * id 是排行榜名的一部分（`trial-<id>`，平台登记过），定了不改；内容和档位可以配平。
 */
import { fmtClock } from './clock.ts';
import type { RaidTemplateId } from './explore.ts';
import { SCHOOLS, type SchoolId } from './guide.ts';
import type { MapId } from './maps.ts';
import type { CharacterId, CurseId } from './meta.ts';
import type { Danger } from './waves.ts';
import type { WeeklyId } from './weekly.ts';

export type TrialId = 'chuye' | 'zhanzha' | 'dumu' | 'kuye' | 'fencheng' | 'yuehei' | 'tanbao' | 'wuyuan' | 'fushi' | 'xueyue' | 'guiye' | 'gujian';
/** 顺序 = 试炼页的排列（三档各 4 关） */
export const TRIAL_IDS: readonly TrialId[] = ['chuye', 'zhanzha', 'dumu', 'kuye', 'fencheng', 'yuehei', 'tanbao', 'wuyuan', 'fushi', 'xueyue', 'guiye', 'gujian'];

/** 档：0 入门、1 进阶、2 噩梦 */
export type TrialTier = 0 | 1 | 2;
export const TRIAL_TIERS: readonly { name: string; coins: number; title: string }[] = [
  { name: '入门', coins: 300, title: '试炼新人' },
  { name: '进阶', coins: 800, title: '试炼好手' },
  { name: '噩梦', coins: 2000, title: '试炼宗师' },
];
/** 前一档通几关开下一档 */
export const TRIAL_OPEN_NEED = 2;

/**
 * 目标：
 * - dawn：撑到天亮；
 * - slay：by 秒前打倒 foe（mid = 这张图的中期首领，8:00 来；boss = 尸王，14:00 来），打倒就收工算赢，过点算输；
 * - nobun：不掉肉包，撑到 until 秒就赢；
 * - loot：夜探撤出、带出价值 ≥ value。
 */
export type TrialGoal = { kind: 'dawn' } | { kind: 'slay'; foe: 'mid' | 'boss'; by: number } | { kind: 'nobun'; until: number } | { kind: 'loot'; value: number };

export interface TrialDef {
  id: TrialId;
  tier: TrialTier;
  name: string;
  mode: 'vigil' | 'raid';
  map: MapId;
  /** 夜探的镇子（mode 为 raid 时必有） */
  raid?: RaidTemplateId;
  character: CharacterId;
  danger: Danger;
  curses?: readonly CurseId[];
  weekly?: WeeklyId;
  /** 新法器只出这个流派单子上的（不看角色法器池）；手上已有的照常升级 */
  only?: SchoolId;
  /** 不给新法器：只升起手那件（被动照常） */
  noNew?: boolean;
  /** 普通怪死后炸开，离得近会挨一下（精英、首领不炸） */
  burst?: boolean;
  goal: TrialGoal;
}

/** 新词缀的数 */
export const TRIAL_FX = {
  /** 怪死爆裂：半径（世界单位）、伤害（挨打照常乘危险档、护甲） */
  burstR: 70,
  burstDmg: 3,
};

export const TRIALS: Record<TrialId, TrialDef> = {
  chuye: { id: 'chuye', tier: 0, name: '初夜', mode: 'vigil', map: 'snow', character: 'xiaodao', danger: 3, curses: ['more'], goal: { kind: 'dawn' } },
  zhanzha: { id: 'zhanzha', tier: 0, name: '斩纸扎', mode: 'vigil', map: 'snow', character: 'xiaodao', danger: 3, goal: { kind: 'slay', foe: 'mid', by: 525 } },
  dumu: { id: 'dumu', tier: 0, name: '独木', mode: 'vigil', map: 'bamboo', character: 'pang', danger: 1, noNew: true, goal: { kind: 'dawn' } },
  kuye: { id: 'kuye', tier: 0, name: '枯夜', mode: 'vigil', map: 'yizhuang', character: 'gengfu', danger: 2, goal: { kind: 'nobun', until: 600 } },
  fencheng: { id: 'fencheng', tier: 1, name: '焚城', mode: 'vigil', map: 'luanzang', character: 'fushi', danger: 3, only: 'fire', burst: true, goal: { kind: 'dawn' } },
  yuehei: { id: 'yuehei', tier: 1, name: '月黑', mode: 'vigil', map: 'icelake', character: 'baidu', danger: 4, curses: ['elites'], weekly: 'moon', goal: { kind: 'dawn' } },
  tanbao: { id: 'tanbao', tier: 1, name: '探宝', mode: 'raid', map: 'snow', raid: 'guzhen', character: 'huolang', danger: 3, goal: { kind: 'loot', value: 350 } },
  wuyuan: { id: 'wuyuan', tier: 1, name: '无援', mode: 'vigil', map: 'riverbank', character: 'zhijiang', danger: 4, curses: ['noheal', 'fast'], goal: { kind: 'dawn' } },
  fushi: { id: 'fushi', tier: 2, name: '伏尸', mode: 'vigil', map: 'snow', character: 'jianxia', danger: 7, goal: { kind: 'slay', foe: 'boss', by: 900 } },
  xueyue: { id: 'xueyue', tier: 2, name: '血月', mode: 'vigil', map: 'temple', character: 'yinyang', danger: 4, curses: ['moon', 'rage'], goal: { kind: 'dawn' } },
  guiye: { id: 'guiye', tier: 2, name: '鬼夜', mode: 'vigil', map: 'guishi', character: 'huolang', danger: 7, curses: ['more', 'elites', 'noreroll'], goal: { kind: 'dawn' } },
  gujian: { id: 'gujian', tier: 2, name: '孤剑', mode: 'vigil', map: 'bamboo', character: 'jianxia', danger: 7, only: 'sword', goal: { kind: 'dawn' } },
};

export function isTrialId(x: unknown): x is TrialId {
  return typeof x === 'string' && Object.hasOwn(TRIALS, x);
}

/** 目标一句话（试炼卡、暂停面板、结算页共用） */
export function goalText(g: TrialGoal): string {
  if (g.kind === 'dawn') return '撑到天亮';
  // 「开局几分几秒内」：守夜顶栏是倒计时，只写「8:45 前」会被当成顶栏读数（试玩 11-23）
  if (g.kind === 'slay') return g.foe === 'boss' ? (g.by >= 900 ? '天亮前打倒尸王' : `开局 ${fmtClock(g.by)} 内打倒尸王`) : `开局 ${fmtClock(g.by)} 内打倒首领`;
  if (g.kind === 'nobun') return `没有肉包，撑满 ${fmtClock(g.until)}`;
  return `夜探撤出，带出的宝物值 ${g.value} 铜钱以上`;
}

/** 词缀一句一条（咒印、夜事的说明由界面按各自的表拼） */
export function affixTexts(t: TrialDef): string[] {
  const out: string[] = [];
  if (t.only) out.push(`新法器只出${SCHOOLS[t.only].name}一派`);
  if (t.noNew) out.push('不给新法器，只升起手那件');
  if (t.burst) out.push('怪死后炸开，别贴着打');
  return out;
}

/**
 * 成绩编码（排行榜 `trial-<id>`，越大越好）：通关 × 1e9 + 完成度。
 * 完成度：撑到天亮 / 不吃肉包 = 撑了几秒；限时打倒 = 赢了剩几秒、输了撑了几秒；夜探 = 带出价值。
 */
export function trialScore(won: boolean, progress: number): number {
  return (won ? 1e9 : 0) + Math.max(0, Math.min(999_999_999, Math.floor(progress)));
}

/** 成绩怎么写（试炼卡、好友最好；和 public/boards.json 的 trial-<id> 一致） */
export function trialScoreText(t: TrialDef, score: number): string {
  const won = score >= 1e9;
  const p = score % 1e9;
  if (t.goal.kind === 'loot') return won ? `通关 · 带出 ${p}` : `带出 ${p}`;
  if (!won) return `撑了 ${fmtClock(p)}`;
  return t.goal.kind === 'slay' ? `通关 · 剩 ${fmtClock(p)}` : '通关';
}
