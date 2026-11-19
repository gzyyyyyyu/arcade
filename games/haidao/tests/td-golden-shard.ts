import { describe, expect, it } from 'vitest';
import { goldenJobs, readGolden, runJob, shardJobs } from './td-golden-lib.ts';

/** 一片指纹锁：这一片的局打完，和 td-golden.json 里同名的键逐位比（说明见 td-golden-lib.ts） */
export function goldenShard(shard: number): void {
  describe(`守岛 2.0 指纹锁（第 ${shard} 片）`, () => {
    it('这一片的整局指纹逐位一致', () => {
      const want = readGolden();
      const now: Record<string, string> = {};
      const exp: Record<string, string | undefined> = {};
      for (const j of shardJobs(goldenJobs(), shard)) {
        now[j.key] = runJob(j);
        exp[j.key] = want[j.key];
      }
      expect(now).toEqual(exp);
    }, 3_000_000);
  });
}
