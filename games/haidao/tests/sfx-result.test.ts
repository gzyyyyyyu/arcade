import { describe, expect, it } from 'vitest';
import { MIN_GAP_MS, Throttle } from '../src/view/audio/mix.ts';
import { crumbleSound, hitSound, isBigBuilding, towerFire, upgradeSound } from '../src/view/audio/pick.ts';
import { resultBeats, resultTimes, resultTiming, STAR_GAP, STAR_PITCH_STEP } from '../src/view/audio/result.ts';
import { SFX_META } from '../src/view/audio/synth.ts';

describe('结算时间轴', () => {
  it('三星：横幅一声，三颗星音高递增且最后一颗是号角，不再叠 win', () => {
    const b = resultBeats({ kind: 'battle', stars: 3, win: true, roll: true });
    expect(b[0]).toMatchObject({ name: 'land', at: resultTiming('battle', true).bannerHit });
    const stars = b.filter((x) => x.name === 'star' || x.name === 'star3');
    expect(stars.map((x) => x.name)).toEqual(['star', 'star', 'star3']);
    expect(stars[1]!.pitch).toBeCloseTo(STAR_PITCH_STEP);
    expect(stars[1]!.at - stars[0]!.at).toBe(STAR_GAP.battle);
    expect(b.some((x) => x.name === 'win' || x.name === 'lose')).toBe(false);
    expect(b.filter((x) => x.name === 'coin')).toHaveLength(4);
  });
  it('画面用的时刻和声音是同一组：星星、滚动、飞入、淡入', () => {
    for (const kind of ['battle', 'td'] as const) for (const stars of [0, 1, 2, 3]) {
      const win = stars > 0;
      const tm = resultTimes(kind, stars, win);
      const b = resultBeats({ kind, stars, win, roll: true });
      b.filter((x) => x.name.startsWith('star')).forEach((x, i) => expect(x.at).toBe(tm.starAt(i)));
      expect(tm.sd).toBeGreaterThan(tm.starAt(Math.max(0, stars - 1)));
      expect(tm.flyAt).toBeGreaterThan(tm.rollAt);
      expect(tm.fin).toBeGreaterThan(tm.rollAt);
    }
  });
  it('一二星最后一句 win；失败更慢更低，没有星声', () => {
    expect(resultBeats({ kind: 'td', stars: 2, win: true, roll: false }).at(-1)!.name).toBe('win');
    const lose = resultBeats({ kind: 'battle', stars: 0, win: false, roll: true });
    expect(lose.some((x) => x.name.startsWith('star'))).toBe(false);
    expect(lose.some((x) => x.name === 'lose')).toBe(true);
    expect(resultTiming('battle', false).bannerHit).toBeGreaterThan(resultTiming('battle', true).bannerHit);
    expect(resultTiming('battle', false).pitch).toBeLessThan(1);
    expect(lose.filter((x) => x.name === 'coin').every((x) => x.pitch < 1)).toBe(true);
  });
  it('大声音（star3、win、lose）不会在同一结算里叠放', () => {
    for (const stars of [0, 1, 2, 3]) {
      const b = resultBeats({ kind: 'battle', stars, win: stars > 0, roll: true });
      const big = b.filter((x) => SFX_META[x.name].group === 'stinger');
      for (let i = 1; i < big.length; i++) expect(big[i]!.at - big[i - 1]!.at).toBeGreaterThanOrEqual(SFX_META[big[i - 1]!.name].dur * 1000);
      expect(big.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('同名限频', () => {
  it('间隔内丢掉，间隔外放行；0 间隔不限', () => {
    const t = new Throttle();
    expect(t.allow('cry', 0, MIN_GAP_MS.cry!)).toBe(true);
    expect(t.allow('cry', 100, MIN_GAP_MS.cry!)).toBe(false);
    expect(t.allow('cry', 460, MIN_GAP_MS.cry!)).toBe(true);
    expect(t.allow('x', 0, 0)).toBe(true);
    expect(t.allow('x', 0, 0)).toBe(true);
  });
  it('受击叫的间隔比命中声长得多', () => {
    expect(MIN_GAP_MS.cry!).toBeGreaterThan(MIN_GAP_MS.hit! * 5);
  });
});

describe('事件到声音', () => {
  it('塔按种类，命中按材质，建筑按大小', () => {
    expect(towerFire('gunTower')).toBe('musket');
    expect(towerFire('harpoon')).toBe('harpoon');
    expect(towerFire(undefined)).toBe('cannon');
    expect(hitSound('building', 'goldmine')).toBe('hitWood');
    expect(hitSound('building', 'hq')).toBe('hitStone');
    expect(hitSound('building', 'wall', 1)).toBe('hitWood');
    expect(hitSound('building', 'wall', 4)).toBe('hitStone');
    expect(hitSound('unit', 'brute')).toBe('hitMetal');
    expect(hitSound('unit', 'sailor')).toBe('hit');
    expect(isBigBuilding('hq', 4)).toBe(true);
    expect(isBigBuilding('goldmine', 2)).toBe(false);
    expect(crumbleSound(true)).toBe('crumbleBig');
    expect(upgradeSound(false)).toBe('upgrade');
  });
});
