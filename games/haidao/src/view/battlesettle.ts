import { settleCampaign, type BattleResult, type Profile, type Res } from '../core/index.ts';
import { runAchievements, settleBounty, type Ach } from './meta.ts';

/** 战役结算框里的附加信息：连胜、掠夺加成、安慰奖、掉落 */
export interface Extra {
  streak: number;
  bonusPct: number;
  consolation: boolean;
  drops: Array<{ kind: 'gold' | 'wood'; amount: number } | { kind: 'cosmetic'; id: string }>;
}

export const NO_EXTRA: Extra = { streak: 0, bonusPct: 0, consolation: false, drops: [] };

/** 本页面存活期内每关连输的次数（刷新就清零，不进存档）；失败建议里"连输 N 次"用它 */
const lossStreak = new Map<string, number>();
export const lossStreakOf = (levelId: string): number => lossStreak.get(levelId) ?? 0;

export interface Outcome {
  /** 结算后的档案；没有结算（演示局）时是原档案 */
  profile: Profile;
  loot: Res;
  newStars: number;
  bonus: Res | null;
  fresh: Ach[];
  extra: Extra;
}

/**
 * 一场战役 / 悬赏打完后的档案结算：纯函数（连输计数除外），不碰 DOM 和 app。
 * 调用方拿到 profile 后自己提交；settle 为假（演示局）时不动档案。
 */
export function settleOutcome(profile: Profile, levelId: string, res: BattleResult, opts: { settle: boolean; bounty?: boolean }): Outcome {
  let loot: Res = { gold: 0, wood: 0 };
  let newStars = 0;
  let bonus: Res | null = null;
  let fresh: Ach[] = [];
  let extra: Extra = { ...NO_EXTRA, drops: [] };
  let prof = profile;
  if (opts.settle && opts.bounty) {
    // 今日悬赏：不动战役星数和连胜，按摧毁率拿 dailyBounty 的（翻倍）掠夺
    const sb = settleBounty(prof, res);
    const ar = runAchievements(sb.profile);
    prof = ar.profile;
    fresh = ar.fresh;
    loot = sb.loot;
    if (sb.done) bonus = sb.loot;
  } else if (opts.settle) {
    lossStreak.set(levelId, res.stars === 0 ? lossStreakOf(levelId) + 1 : 0);
    const out = settleCampaign(prof, levelId, res);
    const ar = runAchievements(out.profile);
    prof = ar.profile;
    fresh = ar.fresh;
    loot = out.loot;
    newStars = out.newStars;
    extra = { streak: out.streak ?? 0, bonusPct: out.streakBonusPct ?? 0, consolation: out.consolation === true, drops: out.drops ?? [] };
  }
  return { profile: prof, loot, newStars, bonus, fresh, extra };
}
