import { describe, expect, it } from 'vitest';
import { mainSchools } from '../../src/content/pools.ts';
import { createWorld, fingerprint, step } from '../../src/core/index.ts';
import { dailyPlan } from '../../src/online/daily.ts';
import { rushDaily } from '../../src/online/rush.ts';
import { weeklyPlan } from '../../src/online/weekly.ts';
import { liveSetup } from '../../src/platform/live.ts';
import { fresh, loadoutSetup, reviveSave, setLoadout } from '../../src/platform/save.ts';
import { ReplayPlayer } from '../../src/replay/player.ts';
import { Recorder } from '../../src/replay/recorder.ts';
import type { ReplayRecord } from '../../src/replay/format.ts';

describe('开局配置：存档', () => {
  it('旧存档没有 loadout，读出来是空，不带任何配置', () => {
    const old = { ...fresh() } as Record<string, unknown>;
    delete old.loadout;
    const s = reviveSave(old)!;
    expect(s.loadout).toEqual({});
    expect(loadoutSetup(s, 'xiaodao')).toEqual({});
  });
  it('每个角色各记一份，往返不丢；改回默认就删掉这一项', () => {
    const s = fresh();
    const b = mainSchools('xiaodao')[1];
    setLoadout(s, 'xiaodao', { alt: true, xinfa: b! });
    setLoadout(s, 'fushi', { xinfa: mainSchools('fushi')[0]! });
    const back = reviveSave(JSON.parse(JSON.stringify(s)))!;
    expect(loadoutSetup(back, 'xiaodao')).toEqual({ startAlt: true, xinfa: b });
    expect(loadoutSetup(back, 'fushi')).toEqual({ xinfa: mainSchools('fushi')[0] });
    expect(loadoutSetup(back, 'jianxia')).toEqual({});
    setLoadout(s, 'xiaodao', { alt: false, xinfa: null });
    expect(s.loadout.xiaodao).toBeUndefined();
  });
  it('不是这个角色主修的流派、乱写的值读档时丢掉', () => {
    const s = fresh();
    const bad = { xiaodao: { alt: 'yes', xinfa: 'nope' }, fushi: { xinfa: 'wealth', alt: true }, ghost: { alt: true } };
    const r = reviveSave({ ...s, loadout: bad })!;
    expect(r.loadout.xiaodao).toBeUndefined();
    expect((mainSchools('fushi') as readonly string[]).includes('wealth')).toBe(false);
    expect(r.loadout.fushi).toEqual({ alt: true });
    expect(Object.keys(r.loadout)).not.toContain('ghost');
  });
});

describe('开局配置：开局接线', () => {
  const cfg = { startAlt: true as const, xinfa: mainSchools('xiaodao')[0]! };
  it('实盘守夜、夜探带配置；不传就不带；换成小道士的不带原角色的心法', () => {
    expect(liveSetup('small', 1, undefined, 'xiaodao', 'snow', cfg)).toMatchObject(cfg);
    expect(liveSetup('small', 1, 'guzhen', 'xiaodao', 'snow', cfg)).toMatchObject(cfg);
    const none = liveSetup('small', 1);
    expect(none.startAlt).toBeUndefined();
    expect(none.xinfa).toBeUndefined();
  });
  it('每日、每周、连战的开局不带配置', () => {
    for (const s of [dailyPlan('2026-11-06', 'vigil').setup, weeklyPlan('2026-11-06', 7).setup, rushDaily('2026-11-06').setup]) {
      expect(s.startAlt).toBeUndefined();
      expect(s.xinfa).toBeUndefined();
    }
  });
});

describe('开局配置：录像', () => {
  it('带配置的局录下来、过一遍 JSON 再回放，配置还在、结果一致', () => {
    const setup = { seed: 11, mode: 'vigil' as const, danger: 0 as const, character: 'xiaodao' as const, startAlt: true as const, xinfa: mainSchools('xiaodao')[1]! };
    const w = createWorld(setup);
    const r = new Recorder(w.setup, 1_700_000_000_000);
    for (let i = 0; i < 600 && w.phase !== 'over'; i++) {
      r.before(w, i % 33, w.phase === 'choose' ? 0 : -1);
      step(w, i % 33, w.phase === 'choose' ? 0 : -1);
    }
    const rec = r.finish(w, { won: false, quit: true, seconds: 20, kills: w.kills, level: w.level, bossKilled: false, loot: 0, daily: null }, {});
    const p = ReplayPlayer.from(JSON.parse(JSON.stringify(rec)) as ReplayRecord)!;
    expect(p.record.setup.startAlt).toBe(true);
    expect(p.record.setup.xinfa).toBe(setup.xinfa);
    expect(p.world.setup.startAlt).toBe(true);
    expect(p.world.xinfa).toBe(setup.xinfa);
    while (!p.done) p.tickOnce();
    expect(fingerprint(p.world)).toBe(fingerprint(w));
  });
});
