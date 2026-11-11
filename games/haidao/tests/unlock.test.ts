import { describe, expect, it } from 'vitest';
import { HQ_LEVELS, newProfile, nextUnlock, unlocksAt } from '../src/core/index.ts';
import type { Profile } from '../src/core/index.ts';

const names = (hq: number): string[] => unlocksAt(hq).map((i) => i.name).sort();

describe('解锁表', () => {
  it('每级主寨新开放的东西', () => {
    expect(unlocksAt(1)).toEqual([]);
    expect(names(2)).toEqual(['信号弹', '地雷', '船坞', '城墙'].sort());
    expect(names(3)).toEqual(['壮汉', '臼炮'].sort());
    expect(names(4)).toEqual(['军械所', '炸药兵'].sort());
    expect(names(5)).toEqual(['船长', '补给桶', '震荡炮'].sort());
    expect(names(6)).toEqual(['喷火塔', '掷弹兵', '狙击塔'].sort());
    expect(names(7)).toEqual(['火箭塔', '鱼叉手', '鱼叉炮', '盾兵'].sort());
    expect(names(8)).toEqual(['火炮兵', '焦油陷阱', '船医'].sort());
    expect(unlocksAt(9)).toEqual([]);
    expect(unlocksAt(2).map((i) => i.type).sort()).toEqual(['building', 'building', 'building', 'skill']);
  });
  it('nextUnlock：下一级要什么，满级为 null', () => {
    const p = newProfile();
    const n = nextUnlock(p)!;
    expect(n.hq).toBe(2);
    expect(n.needStars).toBe(3);
    expect(n.starsLeft).toBe(3);
    expect(n.cost).toEqual(HQ_LEVELS[1]!.cost);
    expect(n.items).toEqual(unlocksAt(2));
    expect(nextUnlock({ ...p, stars: { c01: 3, c02: 2 } })!.starsLeft).toBe(0);
    const top: Profile = { ...p, base: { ...p.base, buildings: p.base.buildings.map((b) => (b.kind === 'hq' ? { ...b, level: 8 } : b)) } };
    expect(nextUnlock(top)).toBeNull();
  });
});
