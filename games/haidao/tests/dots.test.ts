import { describe, expect, it } from 'vitest';
import { newProfile, type Profile } from '../src/core/index.ts';
import { baseDots, upgradable } from '../src/view/dots.ts';

const poor = (p: Profile): Profile => ({ ...p, res: { gold: 0, wood: 0 } });
/** 3 颗星够主寨升 2 级 */
const rich = (p: Profile): Profile => ({ ...p, res: { gold: 99999, wood: 99999 }, stars: { c01: 3 } });
const withStored = (p: Profile, kind: string, stored: number): Profile => ({
  ...p,
  base: { ...p.base, buildings: p.base.buildings.map((b) => (b.kind === kind ? { ...b, stored } : b)) },
});

describe('基地底栏红点', () => {
  it('新号、没资源、没存量、没被打：全灭', () => {
    const p = poor(withStored(withStored(newProfile(), 'goldmine', 0), 'sawmill', 0));
    expect(baseDots(p, 0)).toEqual({ upgrade: false, collect: false, attacked: false });
  });
  it('资源够升级就亮升级点，不够就灭', () => {
    const p = newProfile();
    expect(baseDots(rich(p), 0).upgrade).toBe(upgradable(rich(p)).length > 0);
    expect(baseDots(rich(p), 0).upgrade).toBe(true);
    expect(baseDots(poor(p), 0).upgrade).toBe(false);
  });
  it('金矿或伐木场有存量才亮领取点；仓库满了领不了就不亮', () => {
    const p = poor(newProfile());
    expect(baseDots(withStored(p, 'goldmine', 0.4), 0).collect).toBe(false);
    expect(baseDots(withStored(p, 'goldmine', 30), 0).collect).toBe(true);
    expect(baseDots(withStored(p, 'sawmill', 30), 0).collect).toBe(true);
    const full = { ...withStored(p, 'goldmine', 30), res: { gold: 1_000_000, wood: 0 } };
    expect(baseDots(full, 0).collect).toBe(false);
  });
  it('有没看的防守记录就亮被打点', () => {
    expect(baseDots(newProfile(), 2).attacked).toBe(true);
    expect(baseDots(newProfile(), 0).attacked).toBe(false);
  });
});
