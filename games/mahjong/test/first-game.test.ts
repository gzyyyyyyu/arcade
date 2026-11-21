/** 新手第一局的几处（0.46.0 前五分钟）：碰杠胡也给推荐、名场面记在刚打完的那一局、结算页头一行说为什么 */
import { describe, expect, it, vi } from 'vitest';
import { view, type XzView } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { xuezhanPage } from '../src/view/variants/sichuan-xuezhan/page.ts';
import { verdictWhy } from '../src/view/variants/sichuan-xuezhan/summary.ts';
import { xuezhanUi } from '../src/view/variants/sichuan-xuezhan/ui.ts';
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
  it('没输没赢、流水里没有自己付的：不说', () => {
    expect(verdictWhy(v([0, 0, 0, 0], [], []), 0, NAMES)).toBeNull();
  });
});
