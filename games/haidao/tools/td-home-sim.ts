/**
 * 海盗来袭配平模拟：node tools/td-home-sim.ts [--n 200] [--hq 6,7,8] [--bots normal,greedy] [--style spread|turtle|trap] [--from 1]
 * 每个主寨等级 × 普通 / 加难两档 × 每种机器人各打 n 局（种子 from..from+n-1），岛是 tools/sample.ts 的 fullBase（推荐布局、建筑摆满升满、带宝藏箱和英雄研究）；
 * 出撑住几波（平均、四分之一、中位）和按撑住的波数折的原始奖励金币（还没按每日上限截），以及加难比普通多几成。
 * 验收（DESIGN 10.4b）：普通机器人主寨 8 级加难平均撑住 ≥ 12 波，加难的平均奖励比普通高 15%–30%。用 nice 跑。
 */
import { heroLevel, runTdBot, tdHomeRawReward, tdHomeSetup } from '../src/core/index.ts';
import type { PresetStyle, TdBotKind } from '../src/core/index.ts';
import { fullBase } from './sample.ts';
import { num, opt } from './args.ts';

const n = Math.max(1, num('--n', 50));
const from = num('--from', 1);
const hqs = (opt('--hq') ?? '6,7,8').split(',').map(Number);
const bots = (opt('--bots') ?? 'normal,greedy').split(',') as TdBotKind[];
const style = (opt('--style') ?? 'spread') as PresetStyle;

interface Cell {
  waves: number[];
  gold: number;
}

function run(hq: number, hard: boolean, bot: TdBotKind): Cell {
  const p = fullBase(hq, style, true);
  const waves: number[] = [];
  let gold = 0;
  for (let seed = from; seed < from + n; seed++) {
    const st = tdHomeSetup(p, seed, hard);
    if (!st.ok) throw new Error(`hq${hq}: ${st.error}`);
    const w = runTdBot(st.value, bot).result.waves;
    waves.push(w);
    gold += tdHomeRawReward(hq, w, hard).gold;
  }
  waves.sort((a, b) => a - b);
  return { waves, gold: gold / n };
}

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const at = (xs: number[], q: number): number => xs[Math.min(xs.length - 1, Math.floor(xs.length * q))] ?? 0;
const line = (c: Cell): string => `${avg(c.waves).toFixed(1)} / ${at(c.waves, 0.25)} / ${at(c.waves, 0.5)}`;

console.log(`每格 ${n} 局（种子 ${from}–${from + n - 1}），${style} 布局满配（英雄按研究：主寨 ${hqs.map((h) => `${h} 级 ${heroLevel(fullBase(h, style, true))}`).join('、')}）；撑住波数：平均 / 四分之一 / 中位；奖励是撑住波数折的原始金币（未按每日上限截）\n`);
console.log('| 主寨 | 机器人 | 普通 撑住 | 加难 撑住 | 普通 奖励 | 加难 奖励 | 加难多 |');
console.log('|---|---|---|---|---|---|---|');
for (const hq of hqs) {
  for (const bot of bots) {
    const a = run(hq, false, bot);
    const b = run(hq, true, bot);
    const more = a.gold > 0 ? `${Math.round((b.gold / a.gold - 1) * 100)}%` : '-';
    console.log(`| ${hq} | ${bot} | ${line(a)} | ${line(b)} | ${Math.round(a.gold)} | ${Math.round(b.gold)} | ${more} |`);
  }
}
