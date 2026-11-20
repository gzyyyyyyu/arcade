import { describe, expect, it } from 'vitest';
import { BLD_ACT, beatGap, coinBeat, firstBeat, idHash, inView, patrolAim, sawFrame, swingAngle } from '../src/view/bldact.ts';
import { bldFxPoints, buildingArt, hangArt, sawSpinFrames, SAW_FRAMES } from '../src/view/art/buildings.ts';
import { TURRET_KINDS } from '../src/view/aim.ts';

describe('基地建筑的标志动作（bldact.ts）', () => {
  it('每种经济、功能建筑和会转的防御塔都有一个动作，炮台全是巡视', () => {
    for (const k of ['goldmine', 'vault', 'armory', 'sawmill', 'dock', 'woodyard', 'tar', 'fogTower'] as const) expect(BLD_ACT[k], k).toBeDefined();
    for (const k of TURRET_KINDS) expect(BLD_ACT[k], k).toBe('patrol');
    expect(BLD_ACT.hq).toBeUndefined();
  });
  it('节奏确定、在平均间隔 ±35% 里错开，手机更稀', () => {
    expect(idHash(7, 3)).toBe(idHash(7, 3));
    for (let id = 1; id < 40; id++) {
      for (let n = 1; n < 12; n += 2) {
        const g = beatGap('glint', id, n, false);
        expect(g).toBe(beatGap('glint', id, n, false));
        expect(g).toBeGreaterThanOrEqual(2600 * 0.65 - 1);
        expect(g).toBeLessThanOrEqual(2600 * 1.35 + 1);
        expect(beatGap('glint', id, n, true)).toBeGreaterThan(g);
      }
      expect(firstBeat(id)).toBeGreaterThanOrEqual(300);
      expect(firstBeat(id)).toBeLessThanOrEqual(2100);
    }
    // 军械所两下一组：组内很短
    expect(beatGap('sparks', 3, 0, false)).toBe(260);
    expect(beatGap('sparks', 3, 1, false)).toBeGreaterThan(1000);
    // 每 3 下蹦一次金币
    expect([0, 1, 2, 3, 4, 5].filter((n) => coinBeat(4, n)).length).toBe(2);
  });
  it('同种建筑不齐步：几座的第一下不全在同一时刻', () => {
    expect(new Set([1, 2, 3, 4, 5].map(firstBeat)).size).toBeGreaterThan(3);
  });
  it('锯轮帧在 0..帧数-1 里依次往前走', () => {
    let last = sawFrame(0, 5, SAW_FRAMES, false);
    for (let t = 90; t < 2000; t += 90) {
      const f = sawFrame(t, 5, SAW_FRAMES, false);
      expect(f).toBe((last + 1) % SAW_FRAMES);
      last = f;
    }
  });
  it('吊着的东西摆角有界、连续（相邻 16 毫秒的变化很小）', () => {
    for (const id of [1, 9, 33]) {
      let prev = swingAngle(0, id);
      let max = 0;
      for (let t = 16; t < 20000; t += 16) {
        const a = swingAngle(t, id);
        max = Math.max(max, Math.abs(a));
        expect(Math.abs(a)).toBeLessThan(0.24 * 1.45 + 1e-9);
        // 换周期时幅度会变，允许稍大一点的一步
        expect(Math.abs(a - prev)).toBeLessThan(0.15);
        prev = a;
      }
      expect(max).toBeGreaterThan(0.1);
    }
  });
  it('巡视：一段时间里停着，隔一阵换方向，偏离待机朝向不超过 1.1', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 60000; t += 250) {
      const a = patrolAim(0.6, t, 3);
      expect(Math.abs(a - 0.6)).toBeLessThanOrEqual(1.1 + 1e-9);
      seen.add(Math.round(a * 100));
    }
    expect(seen.size).toBeGreaterThan(3);
    // 停着：相邻 250 毫秒大多相同
    let same = 0;
    for (let t = 0; t < 60000; t += 250) if (patrolAim(0.6, t, 3) === patrolAim(0.6, t + 250, 3)) same++;
    expect(same).toBeGreaterThan(200);
  });
  it('镜头内外判断带外扩', () => {
    const v = { x: 0, y: 0, width: 100, height: 50 };
    expect(inView(50, 25, v, 0)).toBe(true);
    expect(inView(-10, 25, v, 0)).toBe(false);
    expect(inView(-10, 25, v, 20)).toBe(true);
  });
});

describe('标志动作的素材和建筑图对得上', () => {
  it('放粒子的点都在建筑图范围里', () => {
    for (const k of ['goldmine', 'vault', 'armory', 'tar', 'fogTower'] as const) {
      for (const lv of [1, 3, 5, 8]) {
        const p = buildingArt(k, lv);
        const pts = bldFxPoints(k, lv);
        expect(pts.length, `${k} ${lv}`).toBeGreaterThan(0);
        for (const [x, y] of pts) {
          expect(p.ax + x).toBeGreaterThan(0);
          expect(p.ax + x).toBeLessThan(p.w);
          expect(p.ay + y).toBeGreaterThan(0);
          expect(p.ay + y).toBeLessThan(p.h);
        }
      }
    }
  });
  it('锯轮帧 4 张各不相同、尺寸和锚点一样；吊点在建筑图上方的范围里', () => {
    for (const lv of [1, 2, 3, 5, 7]) {
      const fs = sawSpinFrames(lv);
      expect(fs.length).toBe(SAW_FRAMES);
      expect(new Set(fs.map((f) => f.svg)).size).toBe(SAW_FRAMES);
      for (const f of fs) expect([f.w, f.h, f.ax, f.ay]).toEqual([fs[0]!.w, fs[0]!.h, fs[0]!.ax, fs[0]!.ay]);
    }
    for (const k of ['dock', 'woodyard'] as const) {
      for (const lv of [1, 3, 5, 7]) {
        const { art, at } = hangArt(k, lv);
        const p = buildingArt(k, lv);
        expect(art.key.startsWith('bfx.')).toBe(true);
        expect(p.ax + at[0]).toBeGreaterThan(0);
        expect(p.ax + at[0]).toBeLessThan(p.w);
        expect(p.ay + at[1]).toBeGreaterThan(0);
        expect(at[1]).toBeLessThan(0);
      }
    }
  });
});
