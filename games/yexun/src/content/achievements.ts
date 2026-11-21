/**
 * 成就 73 个（DESIGN.md 3.8）：给铜钱，部分带称号。条件是对"这一局的摘要 + 并入这一局之后的累计统计"的纯函数判断，
 * 不依赖 DOM 和随机数。称号写进 public/titles.json（平台战绩页按它显示），称号 id = 成就 id，两边由测试锁一致。
 * 加成就：往后加，id 不改（存档里存的是 id）；有称号的同时补 public/titles.json。
 */
import type { Records, RunSummary } from '../meta/records.ts';
import { ENEMIES, type EnemyKind } from './enemies.ts';
import { SHELVED_ACHIEVEMENTS, SHELVED_KINDS } from './foes.ts';
import { MAX_WEAPON_LEVEL, MERGES, PASSIVES, WEAPONS } from './weapons.ts';
import { TRIAL_IDS, TRIAL_TIERS, TRIALS, type TrialTier } from './trials.ts';

/** 试炼某一档的 4 关都通过了 */
const trialTierDone = (c: Records, t: TrialTier): boolean => TRIAL_IDS.filter((id) => TRIALS[id].tier === t).every((id) => c.trials.includes(id));

/** 危险 d 及以上一共撑到天亮几次 */
function winsFrom(c: Records, d: number): number {
  let n = 0;
  for (const [k, v] of Object.entries(c.winsByDanger)) if (Number(k) >= d) n += v ?? 0;
  return n;
}

export type AchievementGroup = '守夜' | '斩妖' | '怪物' | '法器' | '构筑' | '挑战';

export interface Achievement {
  id: string;
  group: AchievementGroup;
  name: string;
  /** 一句大白话：要做到什么 */
  desc: string;
  /** 铜钱奖励 */
  coins: number;
  /** 有就同时给称号（名字写在这里，titles.json 由它派生） */
  title?: string;
  test: (run: RunSummary, rec: Records) => boolean;
}

// 人皮是画皮召出来的分身，不是常规怪：只在鬼市第 8 分钟出现，算进"每种常规怪"会逼人专门去刷；红衣戏子的假身、米山、空棺是首领的附属物，同理
const regular = ENEMIES.filter((e) => !e.elite && !e.boss && !SHELVED_KINDS.includes(e.kind) && e.kind !== 'huapiskin' && e.kind !== 'hongyiclone' && e.kind !== 'ricepile' && e.kind !== 'coffin').map((e) => e.kind);
const elites = ENEMIES.filter((e) => e.elite).map((e) => e.kind);
const killed = (rec: Records, k: EnemyKind): number => rec.killed[k] ?? 0;
const nWeapons = Object.keys(WEAPONS).length;
const nPassives = Object.keys(PASSIVES).length;
const evolvedNow = (run: RunSummary): number => run.weapons.filter((o) => o.evolved).length;
// 套装标签两种：类型 / 五行的「剑3」「金3」，和流派套件的「阵法·3」（带 ·）；成就只认前一种
const has3 = (run: RunSummary): boolean => run.sets.some((s) => s.endsWith('3') && !s.includes('·'));
const finished = (run: RunSummary): boolean => run.won && !run.quit;

const ALL_ACHIEVEMENTS: readonly Achievement[] = [
  // ── 守夜 ──
  { id: 'dawn_1', group: '守夜', name: '天亮了', desc: '撑到天亮一次', coins: 30, test: (r) => finished(r) },
  { id: 'dawn_normal', group: '守夜', name: '普通的一夜', desc: '在危险 2 或更高撑到天亮', coins: 60, test: (_r, c) => winsFrom(c, 2) >= 1 },
  { id: 'dawn_hard', group: '守夜', name: '老道', desc: '在危险 4 或更高撑到天亮', coins: 150, title: '老道', test: (_r, c) => winsFrom(c, 4) >= 1 },
  { id: 'dawn_yizhuang', group: '守夜', name: '义庄过夜', desc: '在义庄撑到天亮', coins: 80, test: (_r, c) => (c.winsByMap.yizhuang ?? 0) >= 1 },
  { id: 'dawn_5', group: '守夜', name: '五夜平安', desc: '一共撑到天亮 5 次', coins: 60, test: (_r, c) => c.wins >= 5 },
  { id: 'dawn_20', group: '守夜', name: '守夜人', desc: '一共撑到天亮 20 次', coins: 150, title: '守夜人', test: (_r, c) => c.wins >= 20 },
  { id: 'survive_5', group: '守夜', name: '站稳五分钟', desc: '一局撑过 5 分钟', coins: 20, test: (r) => r.seconds >= 300 },
  { id: 'survive_10', group: '守夜', name: '十分钟不倒', desc: '一局撑过 10 分钟', coins: 40, test: (r) => r.seconds >= 600 },
  { id: 'survive_14', group: '守夜', name: '尸王来了', desc: '一局撑过 14 分钟，见到尸王', coins: 60, test: (r) => r.seconds >= 840 },
  { id: 'dawn_hard_5', group: '守夜', name: '高手常客', desc: '在危险 4 或更高撑到天亮 5 次', coins: 200, test: (_r, c) => winsFrom(c, 4) >= 5 },

  // ── 斩妖 ──
  { id: 'kills_100', group: '斩妖', name: '小试牛刀', desc: '一局斩 100 只', coins: 20, test: (r) => r.kills >= 100 },
  { id: 'kills_500', group: '斩妖', name: '斩妖五百', desc: '一局斩 500 只', coins: 40, test: (r) => r.kills >= 500 },
  { id: 'kills_1000', group: '斩妖', name: '斩妖千只', desc: '一局斩 1,000 只', coins: 80, test: (r) => r.kills >= 1000 },
  { id: 'kills_2000', group: '斩妖', name: '割草宗师', desc: '一局斩 2,000 只', coins: 150, title: '割草宗师', test: (r) => r.kills >= 2000 },
  { id: 'total_5000', group: '斩妖', name: '积少成多', desc: '一共斩 5,000 只', coins: 60, test: (_r, c) => c.kills >= 5000 },
  { id: 'total_50000', group: '斩妖', name: '万鬼克星', desc: '一共斩 50,000 只', coins: 200, title: '万鬼克星', test: (_r, c) => c.kills >= 50000 },
  { id: 'lord_kill', group: '斩妖', name: '老爷下轿', desc: '打倒纸扎老爷', coins: 60, test: (_r, c) => killed(c, 'lord') >= 1 },
  { id: 'huapi_kill', group: '斩妖', name: '揭皮', desc: '打倒画皮（鬼市第 8 分钟混在怪里）', coins: 60, test: (_r, c) => killed(c, 'huapi') >= 1 },
  { id: 'zhumu_kill', group: '斩妖', name: '竹林拔根', desc: '打倒千年竹母（竹林第 8 分钟）', coins: 60, test: (_r, c) => killed(c, 'zhumu') >= 1 },
  { id: 'shuihou_kill', group: '斩妖', name: '擒水猴', desc: '打倒水猴王（河滩第 8 分钟）', coins: 60, test: (_r, c) => killed(c, 'shuihou') >= 1 },
  { id: 'binghun_kill', group: '斩妖', name: '冰消雪融', desc: '打倒冰魄娘娘（冰湖第 8 分钟）', coins: 60, test: (_r, c) => killed(c, 'binghun') >= 1 },
  { id: 'wumian_kill', group: '斩妖', name: '佛面见真', desc: '打倒无面佛（荒庙第 8 分钟）', coins: 60, test: (_r, c) => killed(c, 'wumian') >= 1 },
  { id: 'hongyi_kill', group: '斩妖', name: '戏散人空', desc: '夜探戏楼镇打倒守门的红衣戏子', coins: 60, test: (_r, c) => killed(c, 'hongyi') >= 1 },
  { id: 'shuoshu_kill', group: '斩妖', name: '粮仓清鼠', desc: '夜探粮仓镇打倒守门的硕鼠将军', coins: 60, test: (_r, c) => killed(c, 'shuoshu') >= 1 },
  { id: 'boss_kill', group: '斩妖', name: '尸王伏诛', desc: '打倒尸王', coins: 100, title: '伏尸', test: (r) => r.bossKilled },
  { id: 'boss_hard', group: '斩妖', name: '高手伏尸', desc: '在危险 4 或更高打倒尸王', coins: 200, title: '镇尸人', test: (r) => r.bossKilled && r.danger >= 4 },
  { id: 'boss_5', group: '斩妖', name: '尸王克星', desc: '一共打倒尸王 5 次', coins: 120, test: (_r, c) => killed(c, 'boss') >= 5 },

  // ── 怪物 ──
  { id: 'seen_all', group: '怪物', name: '见多识广', desc: '见过所有种类的怪', coins: 60, test: (_r, c) => ENEMIES.every((e) => c.seen.includes(e.kind)) },
  { id: 'kill_regular_all', group: '怪物', name: '百鬼录', desc: '每种常规怪都打倒过', coins: 100, title: '百鬼录', test: (_r, c) => regular.every((k) => killed(c, k) >= 1) },
  { id: 'kill_elite_all', group: '怪物', name: '精英克星', desc: '每种精英怪都打倒过', coins: 100, title: '精英克星', test: (_r, c) => elites.every((k) => killed(c, k) >= 1) },
  { id: 'paper_300', group: '怪物', name: '剪纸匠', desc: '一共打倒 300 只纸人', coins: 30, test: (_r, c) => killed(c, 'paper') >= 300 },
  { id: 'jiangshi_100', group: '怪物', name: '跳尸克星', desc: '一共打倒 100 只跳尸', coins: 40, test: (_r, c) => killed(c, 'jiangshi') >= 100 },
  { id: 'weasel_20', group: '怪物', name: '抓贼', desc: '一共打倒 20 只黄鼠狼', coins: 30, test: (_r, c) => killed(c, 'weasel') >= 20 },
  { id: 'water_50', group: '怪物', name: '捞水鬼', desc: '一共打倒 50 只水鬼', coins: 40, test: (_r, c) => killed(c, 'water') >= 50 },
  { id: 'bone_100', group: '怪物', name: '收骨人', desc: '一共打倒 100 只枯骨', coins: 40, test: (_r, c) => killed(c, 'bone') >= 100 },

  // ── 法器 ──
  { id: 'max_1', group: '法器', name: '炼到满级', desc: '把一件法器升到满级', coins: 30, test: (r) => r.weapons.some((o) => o.level >= MAX_WEAPON_LEVEL || o.evolved) },
  { id: 'evolve_1', group: '法器', name: '初次进化', desc: '让一件法器进化', coins: 50, test: (_r, c) => c.weaponsEvolved.length >= 1 },
  { id: 'evolve_3', group: '法器', name: '三器成器', desc: '累计让 3 种法器进化过', coins: 80, test: (_r, c) => c.weaponsEvolved.length >= 3 },
  { id: 'evolve_6', group: '法器', name: '六器归位', desc: '累计让 6 种法器进化过', coins: 120, test: (_r, c) => c.weaponsEvolved.length >= 6 },
  { id: 'evolve_all', group: '法器', name: '万法归宗', desc: '累计让全部法器都进化过', coins: 300, title: '万法归宗', test: (_r, c) => c.weaponsEvolved.length >= nWeapons },
  { id: 'merge_1', group: '法器', name: '二器合一', desc: '合成一次', coins: 80, test: (_r, c) => c.merges.length >= 1 },
  { id: 'merge_all', group: '法器', name: '合成宗师', desc: `${MERGES.filter((m) => !m.dual).length} 种合成（不算双修）都做过`, coins: 200, title: '合成宗师', test: (_r, c) => MERGES.filter((m) => !m.dual).every((m) => c.merges.includes(m.id)) },
  { id: 'use_6', group: '法器', name: '兵器架', desc: '累计用过 6 种法器', coins: 30, test: (_r, c) => c.weaponsUsed.length >= 6 },
  { id: 'use_all', group: '法器', name: '十二件齐', desc: '累计用过全部法器', coins: 100, test: (_r, c) => c.weaponsUsed.length >= nWeapons },
  { id: 'max_all', group: '法器', name: '件件满级', desc: '累计把全部法器都升到过满级', coins: 200, test: (_r, c) => c.weaponsMaxed.length >= nWeapons },

  // ── 构筑 ──
  { id: 'six_weapons', group: '构筑', name: '六器在手', desc: '一局里同时拿 6 件法器', coins: 40, test: (r) => r.weapons.length >= 6 },
  { id: 'evolve_3_run', group: '构筑', name: '一夜三化', desc: '一局里让 3 件法器进化', coins: 100, test: (r) => evolvedNow(r) >= 3 },
  { id: 'set_3', group: '构筑', name: '成套成阵', desc: '凑出一个 3 件的套装', coins: 40, test: (r) => has3(r) },
  { id: 'set_sword_3', group: '构筑', name: '剑阵成', desc: '凑齐 3 件"剑"类法器', coins: 40, test: (r) => r.sets.includes('剑3') },
  { id: 'passive_1', group: '构筑', name: '宝光初现', desc: '把一个被动升到满级', coins: 30, test: (_r, c) => c.passivesMaxed.length >= 1 },
  { id: 'passive_6', group: '构筑', name: '六宝加身', desc: '累计升满过 6 种被动', coins: 80, test: (_r, c) => c.passivesMaxed.length >= 6 },
  { id: 'passive_all', group: '构筑', name: '百宝箱', desc: '累计升满过全部被动', coins: 200, test: (_r, c) => c.passivesMaxed.length >= nPassives },
  { id: 'level_30', group: '构筑', name: '三十级', desc: '一局升到 30 级', coins: 40, test: (r) => r.level >= 30 },
  { id: 'level_40', group: '构筑', name: '四十级', desc: '一局升到 40 级', coins: 100, test: (r) => r.level >= 40 },

  // ── 挑战 ──
  { id: 'no_hit', group: '挑战', name: '一尘不染', desc: '撑到天亮，一下都没挨', coins: 200, title: '不沾尘', test: (r) => finished(r) && r.hurts === 0 },
  { id: 'close_call', group: '挑战', name: '命悬一线', desc: '撑到天亮时，血只剩一成以下', coins: 100, title: '命硬', test: (r) => finished(r) && r.hpLeft <= r.hpMax * 0.1 },
  { id: 'chests_5', group: '挑战', name: '开箱达人', desc: '一局开 5 个宝箱', coins: 50, test: (r) => r.chests >= 5 },
  // ── 噩梦档（0.5.0，往后加）──
  { id: 'nightmare_1', group: '守夜', name: '入梦', desc: '在噩梦 1（危险 6）或更高撑到天亮', coins: 300, title: '入梦人', test: (_r, c) => winsFrom(c, 6) >= 1 },
  { id: 'nightmare_2', group: '守夜', name: '长夜孤灯', desc: '在噩梦 2（危险 7）或更高撑到天亮', coins: 450, title: '长夜孤灯', test: (_r, c) => winsFrom(c, 7) >= 1 },
  { id: 'nightmare_3', group: '守夜', name: '血月行者', desc: '在噩梦 3（危险 8）撑到天亮', coins: 600, title: '血月行者', test: (_r, c) => winsFrom(c, 8) >= 1 },
  { id: 'dawn_snow', group: '守夜', name: '风雪夜归', desc: '在雪原撑到天亮', coins: 80, test: (_r, c) => (c.winsByMap.snow ?? 0) >= 1 },
  { id: 'dawn_bamboo', group: '守夜', name: '竹海不迷', desc: '在竹林撑到天亮', coins: 80, test: (_r, c) => (c.winsByMap.bamboo ?? 0) >= 1 },
  { id: 'dawn_icelake', group: '守夜', name: '冰上行', desc: '在冰湖撑到天亮', coins: 80, test: (_r, c) => (c.winsByMap.icelake ?? 0) >= 1 },
  { id: 'dawn_riverbank', group: '守夜', name: '涉水而过', desc: '在河滩撑到天亮', coins: 80, test: (_r, c) => (c.winsByMap.riverbank ?? 0) >= 1 },
  { id: 'dawn_temple', group: '守夜', name: '古庙守灯', desc: '在荒庙撑到天亮', coins: 80, test: (_r, c) => (c.winsByMap.temple ?? 0) >= 1 },
  { id: 'dawn_guishi', group: '守夜', name: '鬼市散场', desc: '在鬼市撑到天亮', coins: 80, test: (_r, c) => (c.winsByMap.guishi ?? 0) >= 1 },
  // 六地行认的是最早那六张图（拿过的人称号不变），鬼市单算上面一条
  { id: 'dawn_six_maps', group: '守夜', name: '六地行', desc: '六张地图都撑到天亮过', coins: 300, title: '行脚道士', test: (_r, c) => (['snow', 'bamboo', 'icelake', 'riverbank', 'yizhuang', 'temple'] as const).every((m) => (c.winsByMap[m] ?? 0) >= 1) },
  { id: 'nightmare_boss', group: '斩妖', name: '斩梦', desc: '在噩梦档（危险 6 或更高）打倒尸王', coins: 400, title: '斩梦人', test: (r) => r.bossKilled && r.danger >= 6 },
  { id: 'nightmare_clean', group: '挑战', name: '梦中无伤', desc: '在噩梦档（危险 6 或更高）撑到天亮，这一局挨打不超过 5 次', coins: 500, title: '梦中人', test: (r) => finished(r) && r.danger >= 6 && r.hurts <= 5 },
  { id: 'nightmare_kills', group: '斩妖', name: '血月下的千斩', desc: '在噩梦 3（危险 8）一局斩 3,000 只', coins: 300, test: (r) => r.danger >= 8 && r.kills >= 3000 },
  // 试炼各档全通：称号为主（大头铜钱在每关首通时给过了），成就照例带一点铜钱
  ...([0, 1, 2] as const).map((t): Achievement => ({ id: `trial_${t}`, group: '挑战', name: `试炼${TRIAL_TIERS[t]!.name}全通`, desc: `试炼${TRIAL_TIERS[t]!.name}的 4 关都通过`, coins: [100, 200, 300][t]!, title: TRIAL_TIERS[t]!.title, test: (_r, c) => trialTierDone(c, t) })),
];
/** 收起的镇子里才拿得到的成就先不列（content/foes.ts SHELVED_ACHIEVEMENTS） */
export const ACHIEVEMENTS: readonly Achievement[] = ALL_ACHIEVEMENTS.filter((a) => !SHELVED_ACHIEVEMENTS.includes(a.id));
export const ACHIEVEMENT_BY_ID: Readonly<Record<string, Achievement>> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** 试炼全通的成就里，按累计统计已经达成的 id（records.ts recordTrial 用） */
export const trialUnlocks = (c: Records): string[] => ([0, 1, 2] as const).filter((t) => trialTierDone(c, t)).map((t) => `trial_${t}`);

/** 一批新解锁的成就一共给多少铜钱 */
export const rewardCoins = (ids: readonly string[]): number => ids.reduce((s, id) => s + (ACHIEVEMENT_BY_ID[id]?.coins ?? 0), 0);
/** 其中带称号的成就 id（称号 id = 成就 id，写进平台钱包） */
export const rewardTitles = (ids: readonly string[]): string[] => ids.filter((id) => ACHIEVEMENT_BY_ID[id]?.title);
