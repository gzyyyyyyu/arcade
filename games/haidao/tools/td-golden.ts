/**
 * 重生成守岛指纹锁 tests/td-golden.json：node tools/td-golden.ts [--workers 8]
 * 改了守岛规则或配平后有意重生成；生成后 `git diff tests/td-golden.json` 只许出现预期的键变化（说明见 tests/td-golden-lib.ts）。
 * 按测试的分片开工作线程并行打（默认每核一个），合起来按清单顺序写回，和单线程逐局打出来的一字不差。
 */
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { GOLDEN_FILE, GOLDEN_SHARDS, goldenJobs, goldenText, runJob, shardJobs } from '../tests/td-golden-lib.ts';
import { num } from './args.ts';

if (!isMainThread) {
  const out: Record<string, string> = {};
  for (const j of shardJobs(goldenJobs(), workerData as number)) out[j.key] = runJob(j);
  parentPort!.postMessage(out);
} else {
  const t0 = performance.now();
  const width = Math.max(1, Math.min(GOLDEN_SHARDS, num('--workers', availableParallelism())));
  const shards = Array.from({ length: GOLDEN_SHARDS }, (_, i) => i);
  const got: Record<string, string> = {};
  const run = (shard: number): Promise<void> =>
    new Promise((ok, bad) => {
      const w = new Worker(new URL(import.meta.url), { workerData: shard });
      w.once('message', (m: Record<string, string>) => {
        Object.assign(got, m);
        ok();
      });
      w.once('error', bad);
    });
  const lanes = Array.from({ length: width }, async () => {
    for (let s = shards.shift(); s !== undefined; s = shards.shift()) await run(s);
  });
  await Promise.all(lanes);
  const all: Record<string, string> = {};
  for (const j of goldenJobs()) all[j.key] = got[j.key]!;
  writeFileSync(GOLDEN_FILE, goldenText(all));
  console.log(`写了 ${Object.keys(all).length} 个键，${Math.round((performance.now() - t0) / 1000)} 秒`);
}
