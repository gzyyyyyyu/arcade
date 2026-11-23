/**
 * 「抢的是仓库」配平（base.md 第②批）：node tools/loot-sim.ts --n 30 [--hq 5] [--plus 1]
 * 典型满配的岛（tools/sample.ts fullBase，推荐布局三套）+ 宝藏箱和分叉，仓库装满（capacity）；普通机器人，种子 1..n。
 * 旧 = 仓库 × 20% × 摧毁率；新 = 同一上限按主寨 30%、仓库按容量分摊，按拆掉的算（raidLoot）。
 * 另量一组「金库木料仓挪到最外圈」（和离岛心最远的同尺寸建筑换位置）：新公式下应比推荐布局丢得多，说明藏仓库有回报。
 * 门槛：每格新 / 旧均值在 85%–115%（宁多给不少给：低于 85% 调 HQ_LOOT_PCT）。
 */
import { BUILDINGS } from '../src/content/index.ts';
import { RULES_VERSION, botActions, capacity, heroLevel } from '../src/core/index.ts';
import type { Placed, PresetStyle } from '../src/core/index.ts';
import { raidLoot, raidLoss, replayRaid } from '../src/core/pvp.ts';
import { fullBase, sampleArmy } from './sample.ts';
import { num, opt } from './args.ts';

const n = Math.max(1, num('--n', 30));
const hqs = opt('--hq') ? [Number(opt('--hq'))] : [2, 3, 4, 5, 6, 7, 8];
const plus = Math.max(0, num('--plus', 1));
const styles: PresetStyle[] = ['turtle', 'spread', 'trap'];

/** 金库木料仓和离岛心最远的同尺寸非仓库建筑换位置 */
function vaultsOut(layout: Placed[]): Placed[] {
  const out = layout.map((b) => ({ ...b }));
  const c = (b: Placed): number => {
    const h = BUILDINGS[b.kind].size;
    const dx = 2 * b.x + h - 22;
    const dy = 2 * b.y + h - 22;
    return dx * dx + dy * dy;
  };
  const used = new Set<number>();
  for (const v of out.filter((b) => b.kind === 'vault' || b.kind === 'woodyard')) {
    const size = BUILDINGS[v.kind].size;
    const far = out
      .filter((b) => b.kind !== 'vault' && b.kind !== 'woodyard' && b.kind !== 'hq' && BUILDINGS[b.kind].size === size && !used.has(b.id))
      .sort((a, b) => c(b) - c(a))[0];
    if (!far || c(far) <= c(v)) continue;
    used.add(far.id);
    [v.x, v.y, far.x, far.y] = [far.x, far.y, v.x, v.y];
  }
  return out;
}

function run(layout: Placed[], hq: number, hero: number, stash: { gold: number; wood: number }): { old: number; neu: number; pct: number } {
  const army = sampleArmy(Math.min(8, hq + plus));
  let old = 0;
  let neu = 0;
  let pct = 0;
  for (let seed = 1; seed <= n; seed++) {
    const setup = { layout, army, seed, rules: RULES_VERSION, hero };
    const r = replayRaid(setup, botActions(setup, 'normal'));
    const a = raidLoss(stash, r.result.destroyedPct);
    const b = raidLoot(layout, stash, r.buildings);
    old += a.gold + a.wood;
    neu += b.gold + b.wood;
    pct += r.result.destroyedPct;
  }
  return { old: old / n, neu: neu / n, pct: pct / n };
}

console.log(`每格 ${n} 局（种子 1..${n}），普通机器人（电脑），部队高 ${plus} 级主寨，仓库装满；单位：金币 + 木材合计`);
console.log('| 主寨 | 布局 | 摧毁率 | 旧均值 | 新均值 | 新/旧 | 仓库挪外圈：新均值 | 外圈/推荐 | 过门槛 |');
console.log('|---|---|---|---|---|---|---|---|---|');
let allOk = true;
for (const hq of hqs) {
  for (const style of styles) {
    const p = fullBase(hq, style, true);
    const stash = capacity(p);
    const hero = heroLevel(p);
    const a = run(p.base.buildings, hq, hero, stash);
    const o = run(vaultsOut(p.base.buildings), hq, hero, stash);
    const ratio = a.old > 0 ? a.neu / a.old : 1;
    const ok = ratio >= 0.85 && ratio <= 1.15;
    if (!ok) allOk = false;
    console.log(
      `| ${hq} | ${style} | ${a.pct.toFixed(0)}% | ${a.old.toFixed(0)} | ${a.neu.toFixed(0)} | ${(ratio * 100).toFixed(0)}% | ${o.neu.toFixed(0)} | ${a.neu > 0 ? ((o.neu / a.neu) * 100).toFixed(0) : '-'}% | ${ok ? '是' : '否'} |`,
    );
  }
}
console.log(allOk ? '全部过门槛' : '有格子超门槛');
