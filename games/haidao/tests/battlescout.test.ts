import { describe, expect, it } from 'vitest';
import { CAMPAIGN, RULES_VERSION, battleFingerprint, battleResult, createBattle, stepBattle } from '../src/core/index.ts';
import type { BattleAction, BattleEvent, BattleSetup } from '../src/core/index.ts';
import { holdScout, halfLostHint, troopHpPct } from '../src/view/battlescout.ts';
import { takeActions } from '../src/view/battleflow.ts';
import { sampleArmy } from '../tools/sample.ts';

/** 侦察期（第一个操作前不推进）和局内一次性提示的纯逻辑 */
const base = { tick: 0, replay: false, botActs: 0, pending: 0 };

describe('侦察期 holdScout', () => {
  it('真人第 0 拍、还没操作：停', () => {
    expect(holdScout(base)).toBe(true);
  });
  it('玩家点了（pending 有操作）当拍放行；拍数 > 0 永不再停', () => {
    expect(holdScout({ ...base, pending: 1 })).toBe(false);
    expect(holdScout({ ...base, tick: 1 })).toBe(false);
    expect(holdScout({ ...base, tick: 900 })).toBe(false);
  });
  it('回放和机器人代打不停', () => {
    expect(holdScout({ ...base, replay: true })).toBe(false);
    expect(holdScout({ ...base, botActs: 5 })).toBe(false);
  });
  it('航线一站同样按拍数判断（站里拍数也从 0 起，规则相同）', () => {
    expect(holdScout({ ...base, tick: 0 })).toBe(true);
  });
});

function setupFor(i: number): BattleSetup {
  const lv = CAMPAIGN[i]!;
  return { layout: lv.layout, army: sampleArmy(lv.hq), seed: 7, rules: RULES_VERSION };
}

/** 模仿 BattleScene.stepOnce 的每帧：侦察期跳过，否则按 takeActions 喂操作；玩家操作在第 firstFrame 帧点下 */
function playFrames(setup: BattleSetup, mine: BattleAction[], idle: number): { fp: number; events: BattleEvent[][]; ticks: number; stars: number } {
  const s = createBattle(setup);
  const events: BattleEvent[][] = [];
  let pending: BattleAction[] = [];
  let frame = 0;
  let mi = 0;
  while (!s.over && frame < 200000) {
    // 第一个操作之前先空等 idle 帧（选卡看图），之后每拍按 t 放出玩家的操作
    if (frame >= idle) {
      while (mi < mine.length && mine[mi]!.t <= s.tick) pending.push(mine[mi++]!);
    }
    frame++;
    if (holdScout({ tick: s.tick, replay: false, botActs: 0, pending: pending.length })) continue;
    const tk = takeActions([], 0, pending, s.tick);
    pending = [];
    events.push(stepBattle(s, tk.acts));
  }
  return { fp: battleFingerprint(s), events, ticks: s.tick, stars: battleResult(s).stars };
}

describe('第一个操作前多停 N 帧不改变结果', () => {
  const setup = setupFor(1);
  const bots = (() => {
    const s = createBattle(setup);
    return s.landed.map((_, i): BattleAction => ({ t: i * 12, type: 'land', boat: i, x: -150, y: 700 + i * 60 }));
  })();
  it('N = 0 / 37 / 400：每拍事件序列、指纹、结果完全相同', () => {
    const a = playFrames(setup, bots, 0);
    expect(a.ticks).toBeGreaterThan(100);
    for (const n of [37, 400]) {
      const b = playFrames(setup, bots, n);
      expect(b.fp).toBe(a.fp);
      expect(b.ticks).toBe(a.ticks);
      expect(b.stars).toBe(a.stars);
      expect(b.events).toEqual(a.events);
    }
  });
  it('停着的时候拍数确实是 0', () => {
    const s = createBattle(setup);
    for (let i = 0; i < 50; i++) if (!holdScout({ tick: s.tick, replay: false, botActs: 0, pending: 0 })) stepBattle(s, []);
    expect(s.tick).toBe(0);
  });
});

describe('一次性提示 halfLostHint', () => {
  const army = { boats: [{ troop: 'sailor' as const, count: 4, level: 1 }, { troop: 'brute' as const, count: 2, level: 1 }], skills: [], energy: 0 };
  const hurt = [{ hp: 10, maxHp: 100 }, { hp: 0, maxHp: 100 }, { hp: 60, maxHp: 100 }];
  it('血量百分比：死的算 0', () => {
    expect(troopHpPct(hurt)).toBe(23);
    expect(troopHpPct([])).toBe(100);
  });
  it('掉过一半、壮汉还在船上：点名先上壮汉', () => {
    expect(halfLostHint(hurt, [true, false], army)).toContain('壮汉');
  });
  it('没有厚血兵种待命：只说分批', () => {
    const t = halfLostHint(hurt, [false, true], army);
    expect(t).toContain('分批');
    expect(t).not.toContain('壮汉');
  });
  it('没掉过一半 / 船都出完了 / 还没兵：不提示', () => {
    expect(halfLostHint([{ hp: 51, maxHp: 100 }], [true, false], army)).toBeNull();
    expect(halfLostHint(hurt, [true, true], army)).toBeNull();
    expect(halfLostHint([], [false, false], army)).toBeNull();
  });
});
