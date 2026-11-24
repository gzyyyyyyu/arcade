import { describe, expect, it } from 'vitest';
import type { ArtPiece } from '../src/view/art/kit.ts';
import { tdEnemyFrames } from '../src/view/art/tdart.ts';
import { tdBarracksAll } from '../src/view/art/tdbarracks.ts';
import { TD_ULT_ART_IDS, tdUltArt, tdUltBaseArt, tdUltHeadPieces, tdUltRoofArt } from '../src/view/art/tdults.ts';
import { TROPHY_TIERS, trophyBadgeAll } from '../src/view/art/trophybadge.ts';

// 0.59.0 新美术还没接线：先锁住每张都画得出、key 不撞、坐标里没有 NaN，接线时不会在玩家面前退成空图
const sane = (p: ArtPiece, what: string): void => {
  expect(p.svg.length, what).toBeGreaterThan(0);
  expect(p.svg, what).not.toContain('NaN');
  expect(p.svg, what).not.toContain('undefined');
  expect(p.w > 0 && p.h > 0, what).toBe(true);
};
const uniqueKeys = (ps: ArtPiece[]): void => {
  const keys = ps.map((p) => p.key);
  expect(new Set(keys).size).toBe(keys.length);
};

describe('0.59.0 新美术', () => {
  it('每个终极塔的整张、底座、屋顶、炮头都出得来，key 互不重复', () => {
    const all: ArtPiece[] = [];
    for (const id of TD_ULT_ART_IDS) {
      const ps = [tdUltArt(id), tdUltBaseArt(id), ...tdUltHeadPieces(id)];
      const roof = tdUltRoofArt(id);
      if (roof) ps.push(roof);
      for (const p of ps) sane(p, `${id} ${p.key}`);
      all.push(...ps);
    }
    uniqueKeys(all);
  });

  it('新敌人和水兵：走 4 帧、打 3 帧，同种同尺寸', () => {
    for (const kind of ['charger', 'drummer', 'balloon', 'tyrantShip', 'tyrant', 'tyrantRun', 'marine', 'marineGun', 'marineShield', 'marineCannon'] as const) {
      const walk = tdEnemyFrames(kind, 'walk');
      const atk = tdEnemyFrames(kind, 'attack');
      expect(walk.length, kind).toBe(4);
      expect(atk.length, kind).toBe(3);
      const all = [...walk, ...atk];
      for (const p of all) sane(p, `${kind} ${p.key}`);
      expect(new Set(all.map((p) => `${p.w}x${p.h}|${p.ax},${p.ay}`)).size, kind).toBe(1);
      uniqueKeys(all);
    }
  });

  it('水手营 3 阶 + 两种分叉 + 两种终极营、段位徽章 7 档', () => {
    const bar = tdBarracksAll();
    expect(bar.length).toBe(7);
    for (const p of bar) sane(p, p.key);
    uniqueKeys(bar);
    expect(new Set(bar.map((p) => `${p.w}x${p.h}|${p.ax},${p.ay}`)).size).toBe(1);
    const badges = trophyBadgeAll();
    expect(badges.length).toBe(TROPHY_TIERS);
    for (const p of badges) sane(p, p.key);
    uniqueKeys(badges);
  });
});
