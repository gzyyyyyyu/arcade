/** 斗地主电脑的后台线程（view/common/bot-runner.ts）：收一份 DdzBotJob，回电脑的决定 */
import { runDdzBotJob, type DdzBotJob } from './bot-job.ts';

self.onmessage = (e: MessageEvent<{ id: number; job: DdzBotJob }>) => {
  self.postMessage({ id: e.data.id, action: runDdzBotJob(e.data.job) });
};
