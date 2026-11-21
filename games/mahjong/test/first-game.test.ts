/** 新手第一局的几处（0.46.0 前五分钟，0.47.0 立直跟上）：碰杠胡也给推荐、名场面记在刚打完的那一局、结算页头一行说为什么 */
import { describe, expect, it, vi } from 'vitest';
import { view, type XzView } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { xuezhanPage } from '../src/view/variants/sichuan-xuezhan/page.ts';
import { verdictWhy } from '../src/view/variants/sichuan-xuezhan/summary.ts';
import { xuezhanUi } from '../src/view/variants/sichuan-xuezhan/ui.ts';
import type { RcView } from '../src/core/variants/riichi/index.ts';
import { verdictWhy as rcWhy } from '../src/view/variants/riichi/summary.ts';
import { riichiUi } from '../src/view/variants/riichi/ui.ts';
import { act, RON, tileIn } from './xz-table.ts';

vi.stubGlobal('window', globalThis);

const NAMES = ['小周', '幺妹儿', '板凳儿', '兔头哥'];

describe('碰杠胡的推荐', () => {
  it('能胡的时候推荐胡；不在声明窗口不推荐', () => {
    const s = RON();
    expect(xuezhanUi.suggestClaim!(view(s, 1))).toBeNull();
    const r = act(s, 0, { t: 'discard', tile: tileIn(s, 0, '5p') });
    expect(xuezhanUi.suggestClaim!(view(r, 1))).toBe('ron');
    expect(xuezhanUi.suggestClaim!(view(r, 3))).toBeNull();
  });
});

describe('名场面的局号', () => {
  const hu = (seat: number) => ({ e: 'hu', seat, from: 0, tile: 0, fan: 0, items: [{ id: 'ping' }], rob: false, n: 1 });
  const base = { opts: { cap: 4, rounds: 1 }, seats: [{ won: null }, { won: {} }, { won: {} }, { won: {} }] };
  it('胡完顺带结了这一局（局号已经加过 1）：记在刚打完的那一局', () => {
    const v = { ...base, round: 1, events: [hu(1), hu(2), { e: 'end', end: 'hu' }] } as unknown as XzView;
    expect(xuezhanPage.moments(v).found).toEqual([{ id: 'multi2', seat: 0, round: 0 }]);
  });
  it('这一局还在打：就是现在这一局', () => {
    const v = { ...base, round: 2, events: [hu(1), hu(2)] } as unknown as XzView;
    expect(xuezhanPage.moments(v).found).toEqual([{ id: 'multi2', seat: 0, round: 2 }]);
  });
});

describe('结算页头一行的"为什么"', () => {
  const v = (net: number[], wins: unknown[], ledger: unknown[]) => ({ history: [{ round: 0, dealer: 0, net, wins, end: 'hu' }], ledger }) as unknown as XzView;
  it('点炮输的：说打的牌被谁胡了，给一句怎么少点炮', () => {
    const why = verdictWhy(v([-240, 120, 120, 0], [], [{ kind: 'hu', from: 0, to: 1, amount: 80 }, { kind: 'hu', from: 0, to: 2, amount: 80 }, { kind: 'zimo', from: 0, to: 3, amount: 60 }]), 0, NAMES);
    expect(why).toContain('幺妹儿、板凳儿');
    expect(why).toContain('点炮');
  });
  it('输在别人自摸上：没胡的每家都要付', () => {
    expect(verdictWhy(v([-240, 0, 0, 240], [], [{ kind: 'zimo', from: 0, to: 3, amount: 240 }]), 0, NAMES)).toBe('兔头哥 自摸了，没胡的每家都要付');
  });
  it('赢的：说胡了什么、几番（平胡只写胡了）', () => {
    const wins = [{ seat: 0, from: 1, fan: 3, items: [{ id: 'qidui' }, { id: 'gangpao' }] }];
    expect(verdictWhy(v([800, -800, 0, 0], wins, []), 0, NAMES)).toMatch(/^胡了：.+，3 番$/);
    expect(verdictWhy(v([80, -80, 0, 0], [{ seat: 0, from: 1, fan: 0, items: [{ id: 'ping' }] }], []), 0, NAMES)).toMatch(/^胡了/);
  });
  it('几局的场：流水只剩最后一局，说不准，不说', () => {
    const two = { history: [{ round: 0, dealer: 0, net: [-80, 80, 0, 0], wins: [], end: 'hu' }, { round: 1, dealer: 1, net: [-80, 80, 0, 0], wins: [], end: 'hu' }], ledger: [{ kind: 'hu', from: 0, to: 1, amount: 80 }] } as unknown as XzView;
    expect(verdictWhy(two, 0, NAMES)).toBeNull();
  });
  it('没输没赢、流水里没有自己付的：不说', () => {
    expect(verdictWhy(v([0, 0, 0, 0], [], []), 0, NAMES)).toBeNull();
  });
});

describe('立直：结算页头一行的"为什么"（看整场）', () => {
  const sc = { yaku: [{ id: 'riichi', han: 1 }], yakuman: 0, kazoe: false, han: 3, fu: 30, dora: 2, aka: 0, ura: 0, base: 0, limit: 'none' };
  const win = (seat: number, from: number | null, gain: number) => ({ seat, from, gain, score: sc, tile: 0, hand: [], melds: [], pao: null });
  const round = (delta: number[], wins: unknown[], tenpai: boolean[] | null = null) => ({ wind: 0, hand: 0, honba: 0, dealer: 0, end: wins.length ? 'ron' : 'draw', delta, wins, tenpai, dora: [], ura: [] });
  const rv = (history: unknown[]) => ({ history }) as unknown as RcView;
  it('赢的：和了几次、最大一手（役名不带宝牌）', () => {
    const why = rcWhy(rv([round([3900, -3900, 0, 0], [win(0, 1, 3900)]), round([-1000, 3000, -1000, -1000], [win(1, null, 3000)])]), 0, NAMES);
    expect(why).toBe('和了 1 次，最大一手：立直，30 符 3 番');
  });
  it('输在放铳上：说给了谁、丢多少、怎么少放铳', () => {
    const why = rcWhy(rv([round([-8000, 8000, 0, 0], [win(1, 0, 8000)]), round([-1000, -1000, 3000, -1000], [win(2, null, 3000)])]), 0, NAMES);
    expect(why).toContain('放铳 1 次（给 幺妹儿），共丢 8,000 点');
  });
  it('流局没听丢得最多：说没听牌要赔', () => {
    const why = rcWhy(rv([round([-3000, 1000, 1000, 1000], [], [false, true, true, true])]), 0, NAMES);
    expect(why).toContain('没听牌 1 次');
  });
  it('立直的推荐只在声明窗口里出', () => {
    expect(riichiUi.suggestClaim!({ me: { seat: 0 }, prompt: { discard: [] } } as unknown as Parameters<NonNullable<typeof riichiUi.suggestClaim>>[0])).toBeNull();
  });
});
