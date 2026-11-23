/** 掼蛋电脑的后台线程（view/common/bot-runner.ts）：收一份 BotJob，回电脑的决定 */
import { runBotJob, type BotJob } from './bot-job.ts';

self.onmessage = (e: MessageEvent<{ id: number; job: BotJob }>) => {
  self.postMessage({ id: e.data.id, action: runBotJob(e.data.job) });
};
