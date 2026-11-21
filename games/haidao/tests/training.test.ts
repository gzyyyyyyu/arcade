import { describe, expect, it } from 'vitest';
import { BUILDINGS, TROOP_KINDS, botActions, createTd, newProfile, runBattle, stepTd, tdBotActions, tdResult } from '../src/core/index.ts';
import type { BattleAction, Profile } from '../src/core/index.ts';
import { TRAIN_BY_ID, TRAIN_LESSONS } from '../src/content/training.ts';
import { TRAIN_SEED, TRAIN_TD_OPENER, claimTrain, nextLesson, trainFinish, trainOpen, trainSetup, trainTdSetup } from '../src/core/training.ts';
import { ISLAND } from '../src/core/types.ts';

const lesson = (id: string) => TRAIN_BY_ID.get(id)!;
const withHq = (lv: number): Profile => {
  const p = newProfile();
  return { ...p, base: { ...p.base, buildings: p.base.buildings.map((b) => (b.kind === 'hq' ? { ...b, level: lv } : b)) } };
};
const land = (boat: number, t: number, x: number, y: number): BattleAction => ({ t, type: 'land', boat, x, y });
const west = (boat: number, t: number, y: number) => land(boat, t, -150, y);
const north = (boat: number, t: number, x: number) => land(boat, t, x, -150);
const stars3 = (id: string, acts: BattleAction[], n = 20): number => {
  let k = 0;
  for (let seed = 1; seed <= n; seed++) if (runBattle(trainSetup(lesson(id), seed)!, acts).result.stars === 3) k++;
  return k / n;
};

describe('训练营关卡表', () => {
  it('每个兵种一关，id 不重复；排兵三关都在', () => {
    const troops = TRAIN_LESSONS.filter((l) => l.kind === 'troop').map((l) => l.troop);
    expect(new Set(troops)).toEqual(new Set(TROOP_KINDS));
    expect(new Set(TRAIN_LESSONS.map((l) => l.id)).size).toBe(TRAIN_LESSONS.length);
    expect(TRAIN_LESSONS.filter((l) => l.kind !== 'troop').map((l) => l.kind)).toEqual(['front', 'counter', 'td']);
  });
  it('岛上建筑不出界、不重叠，兵种关的船里有教的那个兵', () => {
    for (const l of TRAIN_LESSONS) {
      if (l.kind === 'td') continue;
      const used = new Set<string>();
      for (const b of l.layout!) {
        const sz = BUILDINGS[b.kind].size;
        expect(b.x >= 0 && b.y >= 0 && b.x + sz <= ISLAND && b.y + sz <= ISLAND, `${l.id} ${b.kind}`).toBe(true);
        for (let i = 0; i < sz; i++) for (let j = 0; j < sz; j++) {
          const k = `${b.x + i},${b.y + j}`;
          expect(used.has(k), `${l.id} 重叠在 ${k}`).toBe(false);
          used.add(k);
        }
      }
      if (l.troop) expect(l.boats!.some((b) => b.troop === l.troop)).toBe(true);
    }
  });
});

describe('训练营好过（宁简勿难）', () => {
  it('登陆战每关：两种机器人用游戏里的种子都能拿到 1 星', () => {
    for (const l of TRAIN_LESSONS) {
      if (l.kind === 'td') continue;
      const s = trainSetup(l, TRAIN_SEED)!;
      const best = Math.max(...(['novice', 'normal'] as const).map((st) => runBattle(s, botActions(s, st)).result.stars));
      expect(best, l.id).toBeGreaterThanOrEqual(1);
    }
  });
  it('前排后排：先放壮汉三星，先放火枪手基本拿不到三星', () => {
    expect(stars3('f-front', [west(0, 0, 1000), west(1, 50, 1150), west(2, 50, 850)])).toBe(1);
    expect(stars3('f-front', [west(1, 0, 1150), west(2, 0, 850), west(0, 50, 1000)])).toBeLessThan(0.2);
  });
  it('兵克塔：壮汉去拆臼炮、火枪手去打大炮三星，反过来拿不到', () => {
    expect(stars3('f-counter', [north(0, 0, 1500), west(1, 0, 1750), west(2, 0, 1450)])).toBe(1);
    expect(stars3('f-counter', [north(1, 0, 1650), north(2, 0, 1350), west(0, 0, 1600)])).toBe(0);
  });
  it('塔放哪：只打前几波，按圈出来的木台造塔的机器人守得住；机器人开局也先造这两块', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = createTd(trainTdSetup(seed));
      const bot = tdBotActions('guided', seed);
      const first: number[] = [];
      while (!s.over) {
        const a = bot(s);
        for (const x of a) if (x.type === 'build' && first.length < 2) first.push(x.slot);
        stepTd(s, a);
      }
      expect(tdResult(s).stars).toBeGreaterThan(0);
      expect(first).toEqual(TRAIN_TD_OPENER.map((o) => o.slot));
    }
  });
});

describe('过关记账和奖励', () => {
  it('跟兵种解锁走：主寨 1 级只开水手、火枪手和守岛关', () => {
    const p = withHq(1);
    expect(TRAIN_LESSONS.filter((l) => trainOpen(p, l)).map((l) => l.id)).toEqual(['t-sailor', 't-gunner', 'f-td']);
    expect(nextLesson(p)?.id).toBe('t-sailor');
  });
  it('第一次过关记待领，再过、没过都不再给', () => {
    const p0 = withHq(1);
    expect(trainFinish(p0, 't-sailor', false)).toEqual({ ok: true, value: { profile: p0, reward: null } });
    const r1 = trainFinish(p0, 't-sailor', true);
    expect(r1.ok && r1.value.reward).toEqual(lesson('t-sailor').reward);
    const p1 = r1.ok ? r1.value.profile : p0;
    expect(p1.train).toEqual({ done: ['t-sailor'], owed: lesson('t-sailor').reward });
    expect(nextLesson(p1)?.id).toBe('t-gunner');
    const r2 = trainFinish(p1, 't-sailor', true);
    expect(r2.ok && r2.value).toEqual({ profile: p1, reward: null });
    expect(trainFinish(p1, 'nope', true).ok).toBe(false);
  });
  it('领奖励：仓库放得下多少收多少，剩下的留着', () => {
    const p0 = withHq(1);
    const r = trainFinish(p0, 't-sailor', true);
    const p1 = r.ok ? r.value.profile : p0;
    const all = claimTrain(p1);
    expect(all.got).toEqual(lesson('t-sailor').reward);
    expect(all.profile.train).toEqual({ done: ['t-sailor'] });
    expect(all.profile.res).toEqual({ gold: p1.res.gold + all.got.gold, wood: p1.res.wood + all.got.wood });
    const cap = claimTrain(p1).profile.res;
    const full = claimTrain({ ...p1, res: { gold: cap.gold + 10_000_000, wood: 0 } });
    expect(full.got.gold).toBe(0);
    expect(full.left.gold).toBe(lesson('t-sailor').reward.gold);
    expect(full.profile.train?.owed).toEqual({ gold: lesson('t-sailor').reward.gold, wood: 0 });
    expect(claimTrain(p0).got).toEqual({ gold: 0, wood: 0 });
  });
});

describe('存档清洗', () => {
  it('只留认识的关、待领不超过已过关奖励的合计', async () => {
    const { reviveSave } = await import('../src/platform/sync.ts');
    const p = newProfile();
    const raw = { profile: { ...p, train: { done: ['t-sailor', 't-sailor', 'bogus', 7], owed: { gold: 1e9, wood: -5 } } }, lastSeen: 0 };
    expect(reviveSave(raw)!.profile.train).toEqual({ done: ['t-sailor'], owed: { gold: lesson('t-sailor').reward.gold, wood: 0 } });
    expect(reviveSave({ profile: { ...p, train: { done: [], owed: { gold: 0, wood: 0 } } }, lastSeen: 0 })!.profile.train).toEqual({ done: [] });
    expect(reviveSave({ profile: { ...p, train: 'x' }, lastSeen: 0 })!.profile.train).toBeUndefined();
  });
});
