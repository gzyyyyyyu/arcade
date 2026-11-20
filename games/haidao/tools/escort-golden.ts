/**
 * 重生成护航指纹锁 tests/escort-golden.json：node tools/escort-golden.ts
 * 改了护航规则、关卡或机器人后有意重生成；生成后 `git diff tests/escort-golden.json` 只许出现预期的键变化（说明见 tests/escort-golden-lib.ts）。
 */
import { writeFileSync } from 'node:fs';
import { ESCORT_GOLDEN_FILE, escortJobs, runEscortJob } from '../tests/escort-golden-lib.ts';

const t0 = performance.now();
const out: Record<string, string> = {};
for (const j of escortJobs()) out[j.key] = runEscortJob(j);
writeFileSync(ESCORT_GOLDEN_FILE, `${JSON.stringify(out, null, 1)}\n`);
console.log(`写了 ${Object.keys(out).length} 局，${((performance.now() - t0) / 1000).toFixed(0)} 秒`);
