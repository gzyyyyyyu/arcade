import { describe, expect, it } from 'vitest';
import type { TdEnemy } from '../src/core/index.ts';
import { bossOf, foeTier } from '../src/view/tdboss.ts';

const foe = (id: number, kind: TdEnemy['kind'], maxHp: number, mode: TdEnemy['mode'] = 'in'): TdEnemy => ({ id, kind, maxHp, hp: maxHp, mode }) as TdEnemy;

describe('守岛的首领和精英', () => {
  it('船长、海盗王是首领，水手长、大副是精英，其余普通', () => {
    expect(foeTier('captain')).toBe(2);
    expect(foeTier('king')).toBe(2);
    expect(foeTier('bosun')).toBe(1);
    expect(foeTier('mate')).toBe(1);
    expect(foeTier('sailor')).toBe(0);
    expect(foeTier('gunboat')).toBe(0);
  });
  it('顶栏跟场上最大血量的首领；死了、走了的不算；一样大跟先来的', () => {
    expect(bossOf([foe(1, 'sailor', 90), foe(2, 'bosun', 360)])).toBeNull();
    expect(bossOf([foe(3, 'captain', 1600), foe(4, 'king', 3600)])?.id).toBe(4);
    expect(bossOf([foe(4, 'king', 3600, 'dead'), foe(3, 'captain', 1600)])?.id).toBe(3);
    expect(bossOf([foe(7, 'captain', 1600, 'out'), foe(5, 'captain', 1600)])?.id).toBe(5);
    expect(bossOf([foe(8, 'captain', 1600, 'gone')])).toBeNull();
  });
});
