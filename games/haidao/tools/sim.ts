/**
 * 配平模拟：node tools/sim.ts --n 50
 * 每关打 n 局（种子 1..n），分别用小白和普通机器人，部队按该关主寨等级的典型玩家编成。
 * --fun 开宝箱和援军。打印平均星数、胜率（≥1 星）、平均时长（游戏内秒）、平均掠夺（金币 / 木材）。--econ 另外估算主寨升级的天数。
 */
import { CAMPAIGN_FUN } from '../src/content/fun.ts';
import { CAMPAIGN, RULES_VERSION, battleResult, botActions, createBattle, stepBattle } from '../src/core/index.ts';
import type { BattleSetup } from '../src/core/index.ts';
import { sampleArmy } from './sample.ts';

const args = process.argv.slice(2);
const nIdx = args.indexOf('--n');
const n = Math.min(100, nIdx >= 0 ? Number(args[nIdx + 1]) || 50 : 50);
const onlyIdx = args.indexOf('--level');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;
/** --fun：开着宝箱和援军打（战役娱乐局的真实设置，DESIGN 15） */
const fun = args.includes('--fun');

function pad(s: string | number, w: number): string {
  return String(s).padEnd(w, ' ');
}

console.log(`每关 ${n} 局；时长为游戏内秒（不含玩家思考）；掠夺 = 关卡 loot × 摧毁率`);
console.log(pad('关', 5) + pad('主寨', 5) + pad('岛', 10) + '| 小白: 星 胜率 秒 掠夺金/木均值 | 普通: 星 胜率 秒 掠夺金/木均值 | 普通星分布 0/1/2/3');
for (const lv of CAMPAIGN) {
  if (only && lv.id !== only) continue;
  const cols: string[] = [];
  let dist = '';
  for (const style of ['novice', 'normal'] as const) {
    let stars = 0;
    let wins = 0;
    let ticks = 0;
    let gold = 0;
    let wood = 0;
    const d = [0, 0, 0, 0];
    for (let seed = 1; seed <= n; seed++) {
      const setup: BattleSetup = { layout: lv.layout, army: sampleArmy(lv.hq), seed, rules: RULES_VERSION, ...(fun ? { fun: { ...CAMPAIGN_FUN } } : {}) };
      const acts = botActions(setup, style);
      const state = createBattle(setup);
      // 时长算到"部队全灭"或战斗结束：没人可操作后空等到时间到不算
      let wiped = -1;
      while (!state.over) {
        stepBattle(state, acts.filter((a) => a.t === state.tick));
        if (wiped < 0 && state.landed.every(Boolean) && !state.units.some((u) => u.mode !== 'dead' && u.kind !== 'medic')) wiped = state.tick;
      }
      const result = battleResult(state);
      const endTick = wiped >= 0 ? wiped : state.tick;
      stars += result.stars;
      if (result.stars > 0) wins++;
      ticks += endTick;
      gold += Math.floor((lv.loot.gold * result.destroyedPct) / 100);
      wood += Math.floor((lv.loot.wood * result.destroyedPct) / 100);
      d[result.stars] = (d[result.stars] ?? 0) + 1;
    }
    cols.push(`${(stars / n).toFixed(2)} ${pad(Math.round((wins * 100) / n) + '%', 5)} ${pad(Math.round(ticks / n / 20), 4)} ${Math.round(gold / n)}/${Math.round(wood / n)}`);
    if (style === 'normal') dist = d.join('/');
  }
  console.log(pad(lv.id, 5) + pad(lv.hq, 5) + pad(lv.name, 10) + '| ' + pad(cols[0] ?? '', 28) + '| ' + pad(cols[1] ?? '', 28) + '| ' + dist);
}
