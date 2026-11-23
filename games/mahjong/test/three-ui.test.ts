/** 三人两房的界面层纯逻辑：相对座位、主页切换项、实盘关掉、单机只配 2 个电脑 */
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTS } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { venueOf } from '../src/ai/venues.ts';
import { realOpts } from '../src/game/stakes.ts';
import { newSolo } from '../src/solo.ts';
import { relOf } from '../src/view/table.ts';
import { xuezhanPage } from '../src/view/variants/sichuan-xuezhan/page.ts';

vi.stubGlobal('window', globalThis);

describe('相对座位', () => {
  it('四人局：下家在右（1）、对家在上（2）、上家在左（3）', () => {
    expect([0, 1, 2, 3].map((s) => relOf(s, 1, 4))).toEqual([3, 0, 1, 2]);
  });
  it('三人局：自己 0、下家 1（右）、上家 3（左），上面（2）永远空着', () => {
    for (let me = 0; me < 3; me++) {
      const rels = [0, 1, 2].map((s) => relOf(s, me, 3));
      expect(rels[me]).toBe(0);
      expect(rels[(me + 1) % 3]).toBe(1);
      expect(rels[(me + 2) % 3]).toBe(3);
      expect(rels).not.toContain(2);
    }
  });
});

describe('主页切换项', () => {
  const store = { variant: 'sichuan-xuezhan', opts: { ...DEFAULT_OPTS, swap: true } } as never as Parameters<typeof xuezhanPage.homePick>[0];
  it('选三人两房：three 开、开局不换三张、血流关；homeId 认得出来', () => {
    xuezhanPage.homePick(store, 'three');
    expect(store.opts).toMatchObject({ three: true, flow: false });
    expect(xuezhanPage.rulesOf(store)).toMatchObject({ three: true, swap: false });
    expect(xuezhanPage.homeId(store)).toBe('three');
    expect(xuezhanPage.name(store.opts)).toBe('川麻·三人两房');
  });
  it('快速一局照上次的档位（三人两房也开实盘）', () => {
    xuezhanPage.homePick(store, 'three');
    const q = xuezhanPage.quick(store);
    expect(q.opts).toMatchObject({ three: true, rounds: 1 });
  });
  it('切回血战、血流会把三人两房关掉', () => {
    xuezhanPage.homePick(store, 'three');
    xuezhanPage.homePick(store, 'flow');
    expect(store.opts).toMatchObject({ three: false, flow: true });
    xuezhanPage.homePick(store, 'sichuan-xuezhan');
    expect(store.opts).toMatchObject({ three: false, flow: false });
  });
  it('切三人两房再切回血战、血流：换三张还是原来的选择（0.47.9 以前切回来就变成不换了），单机、实盘、开房都照它', () => {
    for (const mine of [true, false]) {
      const s = { variant: 'sichuan-xuezhan', opts: { ...DEFAULT_OPTS, swap: mine } } as never as Parameters<typeof xuezhanPage.homePick>[0];
      xuezhanPage.homePick(s, 'three');
      // 三人两房里改规则、开打后存回来（带着 playOpts 补的 swap: false）也不动四人局的选择
      xuezhanPage.setRules(s, { ...xuezhanPage.rulesOf(s), cap: 5 });
      expect(xuezhanPage.realOpts(xuezhanPage.rulesOf(s))).toMatchObject({ three: true, swap: false });
      for (const back of ['sichuan-xuezhan', 'flow']) {
        xuezhanPage.homePick(s, back);
        const o = xuezhanPage.rulesOf(s) as typeof DEFAULT_OPTS;
        expect(o).toMatchObject({ three: false, swap: mine, cap: 5 });
        expect(xuezhanPage.realOpts(o)).toMatchObject({ swap: mine, rounds: 1 });
        expect(xuezhanPage.quick(s).opts).toMatchObject({ swap: mine });
      }
    }
  });
  it('三人两房进擂台（x3，一局一结、不换三张），血战和血流照旧', () => {
    const three = xuezhanPage.homeChoices.find((c) => c.id === 'three')!;
    expect(three.ladder?.mode).toBe('x3');
    expect(three.ladder!.opts()).toMatchObject({ rounds: 1, three: true, flow: false, swap: false });
    expect(xuezhanPage.homeChoices.filter((c) => c.ladder).map((c) => c.ladder!.mode)).toEqual(['xz', 'xl', 'x3']);
  });
});

describe('实盘与单机', () => {
  it('实盘留着三人两房、一局一结；小档、中档用三人两房自己的场地行，大档、豪华照四人局', () => {
    expect(realOpts({ ...DEFAULT_OPTS, three: true, swap: true })).toMatchObject({ three: true, rounds: 1, swap: false });
    expect(realOpts({ ...DEFAULT_OPTS, swap: true })).toMatchObject({ swap: true, rounds: 1 });
    expect(venueOf('solo', 'small', true, 'easy', true)).toBe('solo:small:three');
    expect(venueOf('solo', 'mid', true, 'easy', true)).toBe('solo:mid:three');
    expect(venueOf('solo', 'big', true, 'easy', true)).toBe('solo:big');
    expect(venueOf('solo', 'small')).toBe('solo:small');
    expect(venueOf('room', 'small', true, 'easy', true)).toBe('room:small');
  });
  it('单机三人局只有 3 家，四人局不变', () => {
    vi.stubGlobal('crypto', globalThis.crypto);
    const s3 = newSolo('fun', { ...DEFAULT_OPTS, three: true }, '我', null, 2_000).state;
    expect(s3.players).toHaveLength(3);
    const s4 = newSolo('fun', DEFAULT_OPTS, '我', null, 2_000);
    expect(s4.state.players).toHaveLength(4);
    expect(s4.names).toHaveLength(4);
  });
});
