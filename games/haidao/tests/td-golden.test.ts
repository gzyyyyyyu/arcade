import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RULES_VERSION, TIDE_MAPS, runTdBot, tdCampaign, tdFingerprint, tdGrowthSetup, tideSetup } from '../src/core/index.ts';
import type { IsoWeek, TdBotKind, TdSetup } from '../src/core/index.ts';
import { LIVE_TIER_IDS, tdLiveSetup } from '../src/core/tdlive.ts';
import { tidePick } from '../src/core/tdtide.ts';

/**
 * 守岛 2.0 指纹锁（键名带规则版本）：战役 18 关（建议养成）、悬赏守岛四档、大潮四张图 × 3 个种子 × 三种机器人，
 * 打完一局的状态指纹加星数 / 丢失 / 波数 / 拍数必须逐位不变——规则、关卡数据、机器人任何一处改动都会让它变，
 * 所以改了守岛规则或配平后要有意重生成：`GOLDEN_UPDATE=1 npx vitest run tests/td-golden.test.ts`，并在提交说明里写清为什么。
 * 攻防（battle.ts）不读守岛的新规则，它的指纹锁在 tests/raid-rules.test.ts。
 * 规则版本 10（震荡炮、掷弹兵）、11（狙击塔、盾兵）、12（进攻寻敌，守岛不变，指纹应与 v11 同）起每一局按各个版本都打一遍：v9-、v10- 的键是升版本前录的，把 setup 的 rules 改回 9 / 10
 * 必须逐位一样（旧回放照原样放）；v12- 是新版本的锁。重生成后 diff 确认旧键一字不差，只多出新版本的键。
 * 规则版本 14（英雄自己守）只改守岛：v9–v12 的键一字不变，多出 v14- 的键（13 只改登陆战，守岛和 12 一样，不另录）。
 * 规则版本 15（守岛精英，只改战役 td07 / td10 / td14）：v9–v14 的键一字不变，多出 v15- 的键；除这三关外 v15- 和 v14- 逐个相同（tests/td-elite.test.ts 另锁大潮、悬赏守岛）。
 * 规则版本 16（章末机制，只改战役 td05 / td06 / td11 / td12 / td17 / td18）：v9–v15 的键一字不变，多出 v16- 的键；除这六关外 v16- 和 v15- 逐个相同（tests/td-mech.test.ts 另锁几关）。
 * v10 中档 0.29.1 前未开放（线上没有 v10 中档的对局），指纹随 0.29.1 的配平（hpPct 180 → 190）更新，只动了 v10-live-mid-* 9 个键。
 */
const FILE = new URL('./td-golden.json', import.meta.url);
const SEEDS = [1, 2, 3];
const BOTS: readonly TdBotKind[] = ['novice', 'normal', 'greedy'];

/** 每张大潮图（不镜像）对应的一周 */
function tideWeeks(): IsoWeek[] {
  const out: IsoWeek[] = [];
  for (let wk = 1; out.length < TIDE_MAPS.length && wk < 400; wk++) {
    const week: IsoWeek = { year: 2026 + Math.floor((wk - 1) / 52), week: ((wk - 1) % 52) + 1 };
    const p = tidePick(week);
    if (!p.mirror && !out[p.map]) out[p.map] = week;
  }
  return out;
}

function compute(rules: number): Record<string, string> {
  const out: Record<string, string> = {};
  const V = `v${rules}`;
  const one = (key: string, setup0: TdSetup, bot: TdBotKind): void => {
    const setup = { ...setup0, rules };
    const r = runTdBot(setup, bot);
    out[`${V}-${key}`] = `${tdFingerprint(r.state)} s${r.result.stars} l${r.result.lost} w${r.result.waves} t${r.result.ticks}`;
  };
  for (const lv of tdCampaign()) {
    for (const seed of SEEDS) {
      const r = tdGrowthSetup(lv.id, 'suggest', seed);
      if (!r.ok) throw new Error(`${lv.id}: ${r.error}`);
      for (const bot of BOTS) one(`${lv.id}-${bot}-${seed}`, r.value, bot);
    }
  }
  for (const tier of LIVE_TIER_IDS) for (const seed of SEEDS) for (const bot of BOTS) one(`live-${tier}-${bot}-${seed}`, tdLiveSetup(tier, seed), bot);
  tideWeeks().forEach((week, i) => {
    for (const seed of SEEDS) for (const bot of BOTS) one(`tide${i}-${bot}-${seed}`, { ...tideSetup(week, rules), seed }, bot);
  });
  return out;
}

describe('守岛 2.0 指纹锁', () => {
  it('战役 18 关、悬赏守岛四档、大潮四图的整局指纹逐位一致', () => {
    const now: Record<string, string> = {};
    for (const v of [9, 10, 11, 12, 14, 15, 16]) if (v <= RULES_VERSION) Object.assign(now, compute(v));
    if (process.env.GOLDEN_UPDATE === '1' || !existsSync(FILE)) {
      writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
      return;
    }
    expect(now).toEqual(JSON.parse(readFileSync(FILE, 'utf8')));
  }, 3_000_000);
});
