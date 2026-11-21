import { ESCORT_LEVELS, createTd, escortResultOf, escortSetup, stepTd, tdFingerprint } from '../src/core/index.ts';
import { escortBotActions, type EscortBotKind } from '../src/core/escortbot.ts';
import { escortLiveSetup } from '../src/core/escortlive.ts';
import type { TdSetup } from '../src/core/index.ts';
import { LIVE_TIER_IDS } from '../src/core/live.ts';

/**
 * 护航指纹锁（只锁当前规则版本）：9 关 + 实盘 4 档 × 3 个种子 × 两种机器人，打完一局的状态指纹、拍数、护航结果必须逐位不变。
 * 守岛的 td-golden 不打护航，护航的规则、关卡数据、机器人一改就只有这里能发现；有意改动后重生成：`node tools/escort-golden.ts`。
 */
export const ESCORT_GOLDEN_FILE = new URL('./escort-golden.json', import.meta.url);
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
    for (const seed of SEEDS) for (const bot of BOTS) out.push({ key: `${name}-${bot}-${seed}`, setup: mk(seed), bot });
  };
  for (const lv of ESCORT_LEVELS) add(lv.id, (seed) => escortSetup(lv.id, seed));
  for (const t of LIVE_TIER_IDS) add(`live-${t}`, (seed) => escortLiveSetup(t, seed));
  return out;
}

export function runEscortJob(j: EscortJob): string {
  const s = createTd(j.setup);
  const bot = escortBotActions(j.bot, j.setup.seed);
  while (!s.over) stepTd(s, bot(s));
  return `${tdFingerprint(s)}|${s.tick}|${JSON.stringify(escortResultOf(s))}`;
}
