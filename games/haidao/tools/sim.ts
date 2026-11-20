/**
 * 配平模拟：node tools/sim.ts --n 200
 * 每关打 n 局（种子 1..n，最多 200），分别用小白和普通机器人，部队按该关主寨等级的典型玩家编成。
 * --fun 开宝箱和援军。打印平均星数、胜率（≥1 星）、平均时长（游戏内秒）、平均掠夺（金币 / 木材），
 * 以及共用难度线（src/content/difficulty.ts）的目标：普通三星率、小白过关率，偏出容差的标 ↑（太易）/ ↓（太难）。
 * --level c10 只跑一关；--def 70 把这一次跑的关的 defPct 换成 70（逐关拟合用）；--drop barrage 不带这个旗舰技能（法术对照用）。
 */
import { diffTarget, offMark, progressOf } from '../src/content/difficulty.ts';
import { CAMPAIGN_FUN } from '../src/content/fun.ts';
import { CAMPAIGN, battleResult, botActions, campaignSetup, createBattle, stepBattle } from '../src/core/index.ts';
import type { BattleSetup } from '../src/core/index.ts';
import { flag, num, opt } from './args.ts';
import { sampleArmy } from './sample.ts';

const n = Math.min(200, num('--n', 50));
const only = opt('--level');
/** --fun：开着宝箱和援军打（战役娱乐局的真实设置，DESIGN 15） */
const fun = flag('--fun');
const def = opt('--def') !== undefined ? Number(opt('--def')) : undefined;
const drop = opt('--drop');

function pad(s: string | number, w: number): string {
  return String(s).padEnd(w, ' ');
}

console.log(`每关 ${n} 局${def !== undefined ? `，defPct=${def}` : ''}${drop ? `，不带 ${drop}` : ''}；时长为游戏内秒（不含玩家思考）；掠夺 = 关卡 loot × 摧毁率`);
console.log(`${pad('关', 5)}${pad('主寨', 5)}${pad('def', 5)}${pad('岛', 10)}| 小白: 星 胜率 秒 掠夺金/木均值 | 普通: 星 胜率 秒 掠夺金/木均值 | 普通星分布 0/1/2/3 | 普通3★ / 目标 | 小白过关 / 目标`);
CAMPAIGN.forEach((lv, i) => {
  if (only && lv.id !== only) return;
  const level = def !== undefined ? { ...lv, defPct: def } : lv;
  const cols: string[] = [];
  let dist = [0, 0, 0, 0];
  let noviceWin = 0;
  for (const style of ['novice', 'normal'] as const) {
    let stars = 0;
    let wins = 0;
    let ticks = 0;
    let gold = 0;
    let wood = 0;
    const d = [0, 0, 0, 0];
    for (let seed = 1; seed <= n; seed++) {
      const base = campaignSetup(level, sampleArmy(lv.hq), seed);
      const army = drop ? { ...base.army, skills: base.army.skills.filter((k) => k.kind !== drop) } : base.army;
      const setup: BattleSetup = { ...base, army, ...(fun ? { fun: { ...CAMPAIGN_FUN } } : {}) };
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
    cols.push(`${(stars / n).toFixed(2)} ${pad(`${Math.round((wins * 100) / n)}%`, 5)} ${pad(Math.round(ticks / n / 20), 4)} ${Math.round(gold / n)}/${Math.round(wood / n)}`);
    if (style === 'normal') dist = d;
    else noviceWin = (wins * 100) / n;
  }
  const t = diffTarget(progressOf(i, CAMPAIGN.length));
  const s3 = ((dist[3] ?? 0) * 100) / n;
  const aim = `${pad(`${Math.round(s3)}% / ${Math.round(t.steady3)}%${offMark(s3, t.steady3)}`, 14)}| ${Math.round(noviceWin)}% / ${Math.round(t.novice1)}%${offMark(noviceWin, t.novice1)}`;
  console.log(`${pad(lv.id, 5)}${pad(lv.hq, 5)}${pad(level.defPct ?? 100, 5)}${pad(lv.name, 10)}| ${pad(cols[0] ?? '', 28)}| ${pad(cols[1] ?? '', 28)}| ${pad(dist.join('/'), 18)}| ${aim}`);
});
