/** 斗地主电脑这一手要算的东西：只有视图、档位、种子和选项（纯数据），后台线程（bot-worker.ts）和页面里算出来的一样 */
import { decideDdz, type DdzAction, type DdzBotOptions, type DdzLevel, type DdzView } from '../../variants/doudizhu/index.ts';

export interface DdzBotJob {
  view: DdzView;
  level: DdzLevel;
  seed: string;
  opts: DdzBotOptions;
}

export const runDdzBotJob = (j: DdzBotJob): DdzAction | null => decideDdz(j.view, j.level, j.seed, j.opts);
