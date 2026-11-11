/**
 * 驻岛英雄、宝藏箱、分叉进攻防前后的配平（DESIGN 10.6）：node tools/raid-sim.ts --n 200 [--hq 5] [--style trap] [--plus 1]
 * 典型布局 = tools/sample.ts 的 fullBase（推荐布局三套 × 主寨 3、5、7 级，建筑按名额摆满升满）；部队 = sampleArmy；普通机器人。
 * 前 = 规则版本 5、没有宝藏箱和分叉；后 = 规则版本 6、宝藏箱摆满、确定性分叉、英雄等级 = heroLevel。种子 1..n。
 * --plus 1：进攻方用高一级主寨的部队（匹配允许主寨差 1 级；同级部队打满配的岛基本拿不到星，看不出差别）。
 * 门槛：平均星数降 ≤ 0.3、胜率（≥ 1★）降 ≤ 10 个百分点。
 */
import { botActions, heroLevel } from '../src/core/index.ts';
import type { BattleSetup, PresetStyle } from '../src/core/index.ts';
import { replayRaid } from '../src/core/pvp.ts';
import { fullBase, sampleArmy } from './sample.ts';

const args = process.argv.slice(2);
const opt = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const n = Math.max(1, Number(opt('--n')) || 200);
const hqs = opt('--hq') ? [Number(opt('--hq'))] : [3, 5, 7];
const plus = Math.max(0, Number(opt('--plus')) || 0);
const styles: PresetStyle[] = opt('--style') ? [opt('--style') as PresetStyle] : ['turtle', 'spread', 'trap'];

function measure(setupOf: (seed: number) => BattleSetup): { stars: number; win: number; pct: number; dist: number[] } {
  let stars = 0;
  let wins = 0;
  let pct = 0;
  const dist = [0, 0, 0, 0];
  for (let seed = 1; seed <= n; seed++) {
    const setup = setupOf(seed);
    const r = replayRaid(setup, botActions(setup, 'normal')).result;
    stars += r.stars;
    pct += r.destroyedPct;
    if (r.stars > 0) wins++;
    dist[r.stars] = (dist[r.stars] ?? 0) + 1;
  }
  return { stars: stars / n, win: (wins * 100) / n, pct: pct / n, dist };
}

console.log(`每格 ${n} 局（种子 1..${n}），普通机器人${plus ? `，部队高 ${plus} 级主寨` : ''}`);
console.log('| 主寨 | 布局 | 英雄 | 前：星 / 胜率 / 摧毁率 | 后：星 / 胜率 / 摧毁率 | 星降 | 胜率降 | 过门槛 |');
console.log('|---|---|---|---|---|---|---|---|');
let allOk = true;
for (const hq of hqs) {
  const army = sampleArmy(Math.min(8, hq + plus));
  for (const style of styles) {
    const plain = fullBase(hq, style, false).base.buildings;
    const tdp = fullBase(hq, style, true);
    const hero = heroLevel(tdp);
    const a = measure((seed) => ({ layout: plain, army, seed, rules: 5 }));
    const b = measure((seed) => ({ layout: tdp.base.buildings, army, seed, rules: 6, hero }));
    const ds = a.stars - b.stars;
    const dw = a.win - b.win;
    const ok = ds <= 0.3 && dw <= 10;
    if (!ok) allOk = false;
    console.log(`| ${hq} | ${style} | ${hero} 级 | ${a.stars.toFixed(2)}★ / ${a.win.toFixed(0)}% / ${a.pct.toFixed(0)}% | ${b.stars.toFixed(2)}★ / ${b.win.toFixed(0)}% / ${b.pct.toFixed(0)}% | ${ds.toFixed(2)} | ${dw.toFixed(0)} | ${ok ? '是' : '否'} |`);
  }
}
console.log(allOk ? '全部过门槛' : '有格子超门槛');
