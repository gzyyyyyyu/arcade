import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOLDEN_SHARDS, goldenJobs, readGolden, shardJobs } from './td-golden-lib.ts';

// 指纹锁的总表：只列键不打局（打局在 td-golden-<片>.test.ts，说明见 td-golden-lib.ts）
describe('守岛 2.0 指纹锁（键）', () => {
  it('清单里的键和 td-golden.json 一一对上、顺序一样，各片合起来不重不漏', () => {
    const jobs = goldenJobs();
    const keys = jobs.map((j) => j.key);
    expect(keys).toEqual(Object.keys(readGolden()));
    expect(new Set(keys).size).toBe(keys.length);
    const files = new Set<string>();
    for (let s = 0; s < GOLDEN_SHARDS; s++) for (const j of shardJobs(jobs, s)) files.add(j.key);
    expect(files.size).toBe(keys.length);
  });
  it('分片文件正好 GOLDEN_SHARDS 个', () => {
    const names = readdirSync(new URL('.', import.meta.url)).filter((n) => /^td-golden-\d+\.test\.ts$/.test(n));
    expect(names.length).toBe(GOLDEN_SHARDS);
  });
});
