/**
 * 开一局登陆战之前，把关卡 / 别人给的 setup 和开发参数拼成场景要的 BattleData（守岛那边对应的是 TdScene.ts 的 prepareTd）。
 * 入口 main.ts 只管烘素材、切场景，规则和数据的拼装都在这里。
 */
import { BUILDINGS, CAMPAIGN, TROOPS } from '../content/index.ts';
import { CAMPAIGN_FUN } from '../content/fun.ts';
import { armyFor, campaignSetup } from '../core/index.ts';
import { ISLAND, type BattleSetup, type TroopKind } from '../core/types.ts';
import { app } from './app.ts';
import type { BattleData } from './BattleScene.ts';

/** 关卡不存在、也没给 setup 时为 null */
export function battleData(levelId: string, auto: boolean, setup: BattleSetup | undefined, opts: { bounty?: boolean } | undefined, q: URLSearchParams): BattleData | null {
  const lv = CAMPAIGN.find((l) => l.id === levelId);
  if (!lv && !setup) return null;
  // 没给 setup 只有开发入口（?level、?auto）：按战役娱乐局开，打开宝箱和援军，种子每局现取（开发参数 funseed=<数> 固定种子，截图用）。
  // 今日悬赏、出海、再打一次都带着自己的 setup
  let s: BattleSetup = setup ?? { ...campaignSetup(lv!, armyFor(app.profile), Number(q.get('funseed')) || (Date.now() & 0x3fffffff) | 1), fun: { ...CAMPAIGN_FUN } };
  // 开发参数 devarmy=sailor,brute:2,…：战役局换成这几种兵各一船（冒号后是每船几个，默认 4，船长 1 个），录各兵种的动作用
  const da = q.get('devarmy');
  if (lv && !setup && da) {
    const boats = da.split(',').map((t) => t.split(':')).filter(([k]) => !!k && k in TROOPS).map(([k, n]) => ({ troop: k as TroopKind, count: k === 'captain' ? 1 : Math.max(1, Math.min(8, Number(n) || 4)), level: 2 }));
    if (boats.length) s = { ...s, army: { ...s.army, boats } };
  }
  // 开发参数 devhero=<1-8>：战役局里临时放一个宝藏箱并带驻岛英雄，截图用
  const dh = Number(q.get('devhero'));
  if (lv && !opts?.bounty && dh >= 1 && dh <= 8 && !s.layout.some((p) => p.kind === 'treasure')) {
    const used = new Set<string>();
    for (const p of s.layout) for (let i = 0; i < BUILDINGS[p.kind].size; i++) for (let j = 0; j < BUILDINGS[p.kind].size; j++) used.add(`${p.x + i},${p.y + j}`);
    const c = Math.floor(ISLAND / 2);
    let best: { x: number; y: number } | null = null;
    for (let y = 0; y < ISLAND; y++) for (let x = 0; x < ISLAND; x++) {
      if (used.has(`${x},${y}`)) continue;
      if (!best || Math.abs(x - c) + Math.abs(y - c) < Math.abs(best.x - c) + Math.abs(best.y - c)) best = { x, y };
    }
    if (best) {
      const id = s.layout.reduce((m, p) => Math.max(m, p.id), 0) + 1;
      s = { ...s, layout: [...s.layout, { id, kind: 'treasure', level: 1, ...best }], hero: dh };
    }
  }
  return { levelId, setup: s, auto, settle: !setup ? false : !auto, bounty: opts?.bounty === true, speed: q.has('fast') ? 4 : 1 };
}
