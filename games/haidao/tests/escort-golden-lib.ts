import { ESCORT_LEVELS, createTd, escortResultOf, escortSetup, stepTd, tdFingerprint } from '../src/core/index.ts';
import { escortBotActions, type EscortBotKind } from '../src/core/escortbot.ts';
import { ESCORT_LIVE_TIERS, escortLiveSetup } from '../src/core/escortlive.ts';
import type { TdSetup } from '../src/core/index.ts';
import type { LiveTier } from '../src/core/live.ts';

/**
 * 护航指纹锁（键名带规则版本）：9 关 + 实盘 4 档 × 3 个种子 × 两种机器人，打完一局的状态指纹、拍数、护航结果必须逐位不变。
 * 守岛的 td-golden 不打护航，护航的规则、关卡数据、机器人一改就只有这里能发现；有意改动后重生成：`node tools/escort-golden.ts`。
 * 每局按各规则版本都打一遍：升版本前录的旧键，把 setup 的 rules 改回旧版本必须逐位一样（旧回放照原样放），新版本另录一组。
 * - 24：护航从这一版起进锁；
 * - 25（新手档放宽、娱乐护航开局跟随）：只改三张图的新手档，别的关和实盘 4 档 v25- 和 v24- 逐个相同（escort-golden.test.ts 另锁）。
 */
export const ESCORT_GOLDEN_FILE = new URL('./escort-golden.json', import.meta.url);
export const ESCORT_VERSIONS = [24, 25];
const SEEDS = [1, 2, 3];
const BOTS: readonly EscortBotKind[] = ['novice', 'normal'];

export interface EscortJob {
  key: string;
  setup: TdSetup;
  bot: EscortBotKind;
}

export function escortJobs(): EscortJob[] {
  const out: EscortJob[] = [];
  const add = (name: string, mk: (seed: number) => TdSetup): void => {
    for (const v of ESCORT_VERSIONS) for (const seed of SEEDS) for (const bot of BOTS) out.push({ key: `v${v}-${name}-${bot}-${seed}`, setup: { ...mk(seed), rules: v }, bot });
  };
  for (const lv of ESCORT_LEVELS) add(lv.id, (seed) => escortSetup(lv.id, seed));
  for (const t of Object.keys(ESCORT_LIVE_TIERS) as LiveTier[]) add(`live-${t}`, (seed) => escortLiveSetup(t, seed));
  return out;
}

export function runEscortJob(j: EscortJob): string {
  const s = createTd(j.setup);
  const bot = escortBotActions(j.bot, j.setup.seed);
  while (!s.over) stepTd(s, bot(s));
  return `${tdFingerprint(s)}|${s.tick}|${JSON.stringify(escortResultOf(s))}`;
}
