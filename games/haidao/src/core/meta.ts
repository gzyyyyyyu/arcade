/** 每日悬赏和成就：纯函数，画面传天数（北京时间的天数）和档案进来 */
import { BUILDINGS, CAMPAIGN, income } from '../content/index.ts';
import { hqLevel, totalStars } from './base.ts';
import { Rng, hash32 } from './rng.ts';
import { ISLAND } from './types.ts';
import type { Placed, Profile, Res } from './types.ts';

/**
 * 每日悬赏：按天数确定性生成一座岛。取玩家当前进度附近的关卡当模板（已通关最远一关上下浮动），
 * 左右 / 上下随机翻转，掠夺翻倍（再乘收入倍率 INCOME_PCT）。同一天同一进度结果相同。
 */
export function dailyBounty(dayIndex: number, p: Profile): { levelId: string; layout: Placed[]; loot: Res; seed: number; defPct?: number } {
  let far = -1;
  CAMPAIGN.forEach((l, i) => {
    if ((p.stars[l.id] ?? 0) > 0) far = i;
  });
  const rng = new Rng(dayIndex, 'daily');
  // 最远通关的那一关，往回最多退 2 关
  const idx = Math.max(0, Math.min(CAMPAIGN.length - 1, far + 1 - rng.int(3)));
  const tpl = CAMPAIGN[idx] ?? CAMPAIGN[0]!;
  const flipX = rng.int(2) === 1;
  const flipY = rng.int(2) === 1;
  const layout = tpl.layout.map((b) => {
    const size = BUILDINGS[b.kind].size;
    // 海怪在岛外一圈，镜像后仍在 [-3, 25) 内：用 ISLAND 做对称轴
    return { ...b, x: flipX ? ISLAND - size - b.x : b.x, y: flipY ? ISLAND - size - b.y : b.y };
  });
  return {
    levelId: tpl.id,
    layout,
    loot: income({ gold: tpl.loot.gold * 2, wood: tpl.loot.wood * 2 }),
    seed: hash32('daily-seed', dayIndex),
    ...(tpl.defPct !== undefined ? { defPct: tpl.defPct } : {}),
  };
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  title?: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win', name: '初出茅庐', desc: '打赢第一场进攻', title: '新手海盗' },
  { id: 'wins_10', name: '常胜水手', desc: '累计打赢 10 场', title: '老水手' },
  { id: 'wins_50', name: '百战海盗', desc: '累计打赢 50 场', title: '百战海盗' },
  { id: 'stars_10', name: '星光初现', desc: '累计拿到 10 颗星' },
  { id: 'stars_30', name: '繁星点点', desc: '累计拿到 30 颗星', title: '星海领航' },
  { id: 'stars_60', name: '满天星斗', desc: '累计拿到 60 颗星', title: '星河船长' },
  { id: 'three_10', name: '完美主义', desc: '10 座岛打到三星', title: '完美船长' },
  { id: 'hq_3', name: '三级大寨', desc: '主寨升到 3 级' },
  { id: 'hq_5', name: '五级大寨', desc: '主寨升到 5 级', title: '寨主' },
  { id: 'hq_8', name: '海上霸主', desc: '主寨升到 8 级', title: '海上霸主' },
  { id: 'boss_1', name: '斩首行动', desc: '击败第一个首领', title: '屠首者' },
  { id: 'boss_6', name: '六大首领', desc: '击败全部 6 个首领', title: '首领克星' },
  { id: 'daily_1', name: '赏金猎人', desc: '完成一次每日悬赏', title: '赏金猎人' },
  { id: 'daily_7', name: '七日悬赏', desc: '累计完成 7 次每日悬赏', title: '悬赏大师' },
  { id: 'loot_100k', name: '金山银海', desc: '累计抢到 10 万金币', title: '大财主' },
  { id: 'clear_all', name: '海盗王', desc: '30 座岛全部通关', title: '海盗王' },
];

/** 新达成的成就 id（已在 p.achievements 里的不重复返回）；stats 缺字段按 0 */
export function checkAchievements(p: Profile, stats: Profile['stats'] = p.stats): string[] {
  const have = new Set(p.achievements ?? []);
  const stars = totalStars(p);
  const cleared = CAMPAIGN.filter((l) => (p.stars[l.id] ?? 0) > 0).length;
  const bosses = CAMPAIGN.filter((l) => l.boss && (p.stars[l.id] ?? 0) > 0).length;
  const ok: Record<string, boolean> = {
    first_win: stats.wins >= 1,
    wins_10: stats.wins >= 10,
    wins_50: stats.wins >= 50,
    stars_10: stars >= 10,
    stars_30: stars >= 30,
    stars_60: stars >= 60,
    three_10: (stats.threeStars ?? 0) >= 10,
    hq_3: hqLevel(p) >= 3,
    hq_5: hqLevel(p) >= 5,
    hq_8: hqLevel(p) >= 8,
    boss_1: bosses >= 1 || (stats.bossWins ?? 0) >= 1,
    boss_6: bosses >= 6,
    daily_1: (stats.dailyDone ?? 0) >= 1,
    daily_7: (stats.dailyDone ?? 0) >= 7,
    loot_100k: stats.lootGold >= 100000,
    clear_all: cleared >= CAMPAIGN.length,
  };
  return ACHIEVEMENTS.filter((a) => ok[a.id] && !have.has(a.id)).map((a) => a.id);
}
