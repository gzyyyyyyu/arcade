import { describe, expect, it } from 'vitest';
import { CAMPAIGN, RULES_VERSION, battleFingerprint, botActions, newProfile, runBattle } from '../src/core/index.ts';
import type { BBuilding, BattleAction, BattleResult, BattleSetup } from '../src/core/index.ts';
import { adviceLines, beachPts, dockGain, SIDE_NAME } from '../src/view/battleadvice.ts';
import { driveBattle, takeActions } from '../src/view/battleflow.ts';
import { lossStreakOf, NO_EXTRA, settleOutcome } from '../src/view/battlesettle.ts';
import { sampleArmy } from '../tools/sample.ts';

/** BattleScene 拆出来的纯逻辑：逐拍喂操作、事件顺序、失败建议、结算拼装。不依赖 Phaser 和 DOM */
function setupFor(i: number, seed = 1): BattleSetup {
  const lv = CAMPAIGN[i]!;
  return { layout: lv.layout, army: sampleArmy(lv.hq), seed, rules: RULES_VERSION };
}

describe('逐拍喂操作 takeActions', () => {
  const bot: BattleAction[] = [
    { t: 0, type: 'land', boat: 0, x: -150, y: 1000 },
    { t: 5, type: 'land', boat: 1, x: -150, y: 900 },
    { t: 5, type: 'skill', skill: 'barrage', x: 1, y: 1 },
    { t: 9, type: 'land', boat: 2, x: -150, y: 800 },
  ];
  it('到点才进，同一拍的按原顺序，已进的不再进', () => {
    let r = takeActions(bot, 0, [], 0);
    expect(r.acts.map((a) => a.t)).toEqual([0]);
    expect(r.botI).toBe(1);
    r = takeActions(bot, r.botI, [], 3);
    expect(r.acts).toEqual([]);
    r = takeActions(bot, r.botI, [], 5);
    expect(r.acts.map((a) => a.type)).toEqual(['land', 'skill']);
    expect(r.botI).toBe(3);
  });
  it('玩家这一拍点的排在电脑操作前面；不改入参', () => {
    const mine: BattleAction[] = [{ t: 5, type: 'land', boat: 3, x: -150, y: 700 }];
    const r = takeActions(bot, 1, mine, 5);
    expect(r.acts.map((a) => (a.type === 'land' ? a.boat : -1))).toEqual([3, 1, -1]);
    expect(mine).toHaveLength(1);
  });
  it('错过的拍也会补上（慢机器一次追几拍）', () => {
    expect(takeActions(bot, 0, [], 100).acts).toHaveLength(4);
  });
});

describe('回放驱动 driveBattle', () => {
  for (const i of [0, 5, 9]) {
    it(`关 ${i}：与 runBattle 的事件数、指纹、结果一致`, () => {
      const setup = setupFor(i, 7);
      const acts = botActions(setup, 'normal');
      const a = driveBattle(setup, acts);
      const b = runBattle(setup, acts);
      expect(battleFingerprint(a.state)).toBe(battleFingerprint(b.state));
      expect(a.result).toEqual(b.result);
      expect(a.ticks.reduce((n, t) => n + t.events.length, 0)).toBe(b.events);
    });
  }
  it('事件顺序：拍号连续；先登陆后开火；end 只出现一次且是最后一个事件', () => {
    const setup = setupFor(5, 3);
    const { ticks, state } = driveBattle(setup, botActions(setup, 'normal'));
    expect(ticks.map((t) => t.tick)).toEqual(ticks.map((_, k) => k));
    const flat = ticks.flatMap((t) => t.events.map((e) => ({ tick: t.tick, e })));
    expect(flat.filter((x) => x.e.type === 'end')).toHaveLength(1);
    expect(flat[flat.length - 1]!.e.type).toBe('end');
    expect(ticks[ticks.length - 1]!.tick).toBe(state.tick - 1);
    const firstLand = flat.findIndex((x) => x.e.type === 'land');
    const firstUnitShot = flat.findIndex((x) => x.e.type === 'shoot' && x.e.from === 'unit');
    expect(firstLand).toBeGreaterThanOrEqual(0);
    expect(firstUnitShot).toBeGreaterThan(firstLand);
    // 同一个建筑的 destroy 只一次，且在它最后一次被 hit 之后
    const down = new Map<number, number>();
    flat.forEach((x, k) => {
      if (x.e.type === 'destroy') {
        expect(down.has(x.e.id)).toBe(false);
        down.set(x.e.id, k);
      }
    });
    flat.forEach((x, k) => {
      if (x.e.type === 'hit' && x.e.target === 'building' && down.has(x.e.id)) expect(k).toBeLessThanOrEqual(down.get(x.e.id)!);
    });
    expect(down.size).toBeGreaterThan(0);
  });
  it('同一拍里的事件顺序固定：同 setup 同操作两次一模一样', () => {
    const setup = setupFor(9, 2);
    const acts = botActions(setup, 'novice');
    expect(driveBattle(setup, acts).ticks).toEqual(driveBattle(setup, acts).ticks);
  });
  it('没有操作：一直耗到时间到，只有最后一拍有 end', () => {
    const { ticks } = driveBattle(setupFor(0), []);
    expect(ticks).toHaveLength(3600);
    expect(ticks.slice(0, -1).every((t) => t.events.every((e) => e.type !== 'end'))).toBe(true);
    expect(ticks[3599]!.events.map((e) => e.type)).toEqual(['end']);
  });
});

describe('失败建议 adviceLines', () => {
  const lay = (kind: string, x: number, y: number): BBuilding => ({ kind, x, y, size: 2, id: x * 100 + y, destroyed: false, level: 1 }) as unknown as BBuilding;
  const base = { buildings: [] as BBuilding[], ext: 0, deathBy: new Map<string, number>(), landPts: [], casts: 1, hasBrute: true, streak: 0 };
  const res: Pick<BattleResult, 'destroyedPct'> = { destroyedPct: 40 };

  it('常量：四面沙滩和名字一一对应', () => {
    expect(beachPts(0)).toHaveLength(4);
    // 岛扩了两圈：参考点跟着沙滩往外挪
    expect(beachPts(2)[0]).toEqual([-3.5, 11]);
    expect(SIDE_NAME).toEqual(['左边', '下边', '右边', '上边']);
  });
  it('什么都没发生：给兜底的一句；没伤害换另一句', () => {
    expect(adviceLines(res, base)).toEqual(['再试一次：先点炮击打掉最凶的那座防御，再换个登陆点。']);
    expect(adviceLines({ destroyedPct: 2 }, base)).toEqual(['这次兵没打出伤害：换个登陆点，或先升级兵种和军械所再来。']);
  });
  it('一炮打倒大半的兵：点名那座炮并建议换到防御最少的一面', () => {
    const buildings = [lay('cannon', 0, 10), lay('cannon', 1, 12), lay('cannon', 2, 9), lay('cannon', 9, 0)];
    const out = adviceLines(res, { ...base, buildings, deathBy: new Map([['cannon', 5], ['sniper', 1]]) });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^「.+」打倒了 83% 的兵：点「炮击」再点它，或者改从(下边|右边|上边)沙滩登陆。$/);
  });
  it('喷火塔、普通防御各有各的话', () => {
    const f = adviceLines(res, { ...base, deathBy: new Map([['flame', 4]]) });
    expect(f[0]).toBe('「喷火塔」烧倒了 100% 的兵：别让兵扎堆，分两侧登陆，或先炮击它。');
    const w = adviceLines(res, { ...base, deathBy: new Map([['sniper', 4]]) });
    expect(w[0]).toMatch(/旁边倒了 100% 的兵：带壮汉顶在前面/);
  });
  it('一次炮击都没放；最多两句，连输再追加一句', () => {
    const out = adviceLines(res, { ...base, casts: 0, hasBrute: false, buildings: [lay('cannon', 0, 0), lay('cannon', 3, 0), lay('sniper', 0, 3), lay('sniper', 3, 3)], streak: 3 });
    expect(out).toHaveLength(3);
    expect(out[0]).toBe('炮击一次都没放：能量够了就点技能，再点那门最凶的炮。');
    expect(out[1]).toBe('防御不少：带壮汉顶在前面吸引火力。');
    expect(out[2]).toBe('已经连输 3 次了：换兵种搭配、换登陆点，或先去军械所升兵种。');
  });
  it('船坞没跟上主寨：连输建议指船坞（中段卡关的真正原因），跟上了照旧指军械所', () => {
    const behind = adviceLines(res, { ...base, streak: 2, dock: { have: 7, can: 8 } });
    expect(behind.at(-1)).toBe('已经连输 2 次了：先把船坞升到 8 级（多 1 条船、每船 14→16 人），比升兵种管用。');
    const even = adviceLines(res, { ...base, streak: 2, dock: { have: 8, can: 8 } });
    expect(even.at(-1)).toBe('已经连输 2 次了：换兵种搭配、换登陆点，或先去军械所升兵种。');
  });
  it('dockGain：按船坞表算多几条船、每船多几人；没造船坞、已跟上都不说', () => {
    expect(dockGain(7, 8)).toBe('多 1 条船、每船 14→16 人');
    expect(dockGain(6, 7)).toBe('每船 12→14 人');
    expect(dockGain(5, 8)).toBe('多 2 条船、每船 10→16 人');
    expect(dockGain(8, 8)).toBeNull();
    expect(dockGain(0, 4)).toBeNull();
  });
});

describe('结算拼装 settleOutcome', () => {
  const loss: BattleResult = { stars: 0, destroyedPct: 10, hqDown: false } as BattleResult;
  const win: BattleResult = { stars: 3, destroyedPct: 100, hqDown: true } as BattleResult;

  it('演示局（settle 假）：档案原样，没有战利品', () => {
    const p = newProfile();
    const o = settleOutcome(p, 'c01', loss, { settle: false });
    expect(o.profile).toBe(p);
    expect(o.loot).toEqual({ gold: 0, wood: 0 });
    expect(o.newStars).toBe(0);
    expect(o.bonus).toBeNull();
    expect(o.extra).toEqual(NO_EXTRA);
    expect(lossStreakOf('c01')).toBe(0);
  });
  it('战役：输了连输加一，赢了清零；赢了拿到星和战利品', () => {
    const p = newProfile();
    settleOutcome(p, 'c01', loss, { settle: true });
    settleOutcome(p, 'c01', loss, { settle: true });
    expect(lossStreakOf('c01')).toBe(2);
    const o = settleOutcome(p, 'c01', win, { settle: true });
    expect(lossStreakOf('c01')).toBe(0);
    expect(o.newStars).toBe(3);
    expect(o.profile).not.toBe(p);
    expect(o.bonus).toBeNull();
    expect(o.extra.drops).toBeInstanceOf(Array);
  });
  it('不改入参档案', () => {
    const p = newProfile();
    const snap = JSON.stringify(p);
    settleOutcome(p, 'c01', win, { settle: true });
    expect(JSON.stringify(p)).toBe(snap);
  });
});
