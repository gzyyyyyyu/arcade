/** 电脑这一手要算的东西：只有视图和设置（纯数据），后台线程（bot-worker.ts）和页面里算出来的一样 */
import { decide, type BotConfig } from '../../variants/guandan/ai/index.ts';
import type { Action, PlayerView } from '../../variants/guandan/core/index.ts';

export interface BotJob {
  view: PlayerView;
  cfg: BotConfig;
}

export const runBotJob = (j: BotJob): Action | null => decide(j.view, j.cfg);
