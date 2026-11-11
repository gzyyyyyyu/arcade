/**
 * 合并 td-live-sim.ts --json 拆片的结果：node tools/td-live-merge.ts 片1.json 片2.json ...
 * 打印和 td-live-sim.ts 同样的表（按当前 src/core/tdlive.ts 的倍数表重算期望）。
 */
import { readFileSync } from 'node:fs';
import { add, line, zero, type Raw } from './td-live-lib.ts';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('用法：node tools/td-live-merge.ts 片1.json 片2.json ...');
  process.exit(1);
}
const merged = new Map<string, Raw>();
for (const f of files) {
  for (const r of JSON.parse(readFileSync(f, 'utf8')) as Raw[]) {
    const k = `${r.tier}/${r.style}`;
    if (!merged.has(k)) merged.set(k, zero(r.tier, r.style));
    add(merged.get(k)!, r);
  }
}
console.log(`合并 ${files.length} 片；期望单位：份（结回倍数 − 1），± 2SE`);
for (const r of merged.values()) console.log(line(r));
