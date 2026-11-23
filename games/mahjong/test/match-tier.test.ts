/**
 * 快速匹配的档位：用 kit 的 matchConfigErrors 核对排队的配置和好友房的规则对得上——
 * 一桌的真人不超过座位数、每个档位的开桌选项房间的 options 都认（配错了线上就是排到了开不了桌，人人转单机）。
 */
import { matchConfigErrors } from 'arcade-kit/game';
import { describe, expect, it } from 'vitest';
import { MATCH_FUN_TIERS, MATCH_TABLE, MATCH_TIERS, tableSizeOf, matchRoomOptions, matchTierOf, stakesOfTier } from '../src/game/match.ts';
import { REAL_ROUNDS, realOpts, STAKES } from '../src/game/stakes.ts';
import { sichuanXuezhan as XZ } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { mahjongRoom } from '../src/room/rules.ts';

/** 娱乐档的排队 id（上线后不改：排队按它分桌） */
const MATCH_FUN = 'fun';
const MATCH_RC_FUN = 'rc-fun';
const MATCH_X3_FUN = 'x3-fun';
const MATCH_XL_FUN = 'xl-fun';

describe('快速匹配的档位', () => {
  it('每个档位开桌的人数和选项都合房间的规则', () => {
    expect(matchConfigErrors(mahjongRoom, MATCH_TIERS, tableSizeOf, matchRoomOptions)).toEqual([]);
  });

  it('配错了查得出来（阳性对照）', () => {
    expect(matchConfigErrors(mahjongRoom, MATCH_TIERS, (t) => tableSizeOf(t) + 1, matchRoomOptions).length).toBeGreaterThan(0);
    expect(matchConfigErrors(mahjongRoom, ['real-nope'], () => MATCH_TABLE, () => ({ variant: 'sichuan-xuezhan', stakes: 'nope' })).length).toBeGreaterThan(0);
  });

  it('娱乐一个档、实盘每档一个，来回换得回来；认不得的不开桌', () => {
    const real = STAKES.filter((s) => s.wallet).map((s) => s.id);
    expect([...MATCH_TIERS].sort()).toEqual([MATCH_FUN, MATCH_RC_FUN, ...real.map((t) => `real-${t}`), ...real.map((t) => `rc-${t}`), MATCH_X3_FUN, ...real.map((t) => `x3-${t}`), MATCH_XL_FUN, ...real.map((t) => `xl-${t}`)].sort());
    for (const s of ['fun', ...real] as const) expect(stakesOfTier(matchTierOf(s))).toBe(s);
    for (const bad of ['real-', 'real-nope', 'real-fun', 'Fun', '']) {
      expect(stakesOfTier(bad)).toBeNull();
      expect(matchRoomOptions(bad)).toBeUndefined();
    }
    expect(matchRoomOptions('real-small')?.stakes).toBe('small');
  });

  it('立直实盘四档：来回换得回来，开桌是立直实盘（一局一结），照页面的 realOpts', () => {
    for (const s of STAKES.filter((x) => x.wallet)) {
      const tier = matchTierOf(s.id, 'riichi');
      expect(tier).toBe(`rc-${s.id}`);
      expect(stakesOfTier(tier)).toBe(s.id);
      expect(matchRoomOptions(tier)).toEqual({ variant: 'riichi', stakes: s.id, rules: { length: 'ikkyoku' } });
    }
    expect(MATCH_FUN_TIERS).not.toContain('rc-small');
    expect(matchRoomOptions('rc-nope')).toBeUndefined();
    expect(matchRoomOptions('rc-fun')?.rules).toEqual({ length: 'hanchan' });
  });

  it('立直娱乐一档：开桌是立直的默认规则（半庄）、娱乐；单独部署也开', () => {
    expect(matchTierOf('fun', 'riichi')).toBe(MATCH_RC_FUN);
    expect(stakesOfTier(MATCH_RC_FUN)).toBe('fun');
    expect(matchRoomOptions(MATCH_RC_FUN)).toEqual({ variant: 'riichi', stakes: 'fun', rules: { length: 'hanchan' } });
    expect(matchRoomOptions(MATCH_FUN)?.variant).toBe('sichuan-xuezhan');
    expect(MATCH_FUN_TIERS).toEqual([MATCH_FUN, MATCH_RC_FUN, MATCH_X3_FUN, MATCH_XL_FUN]);
  });

  it('川麻实盘档一局一结，娱乐档和立直照默认', () => {
    for (const s of STAKES.filter((x) => x.wallet)) expect(matchRoomOptions(`real-${s.id}`)?.rules).toMatchObject({ rounds: 1 });
    expect(matchRoomOptions(MATCH_FUN)?.rules).toMatchObject({ rounds: 8 });
    expect(matchRoomOptions('real-small')?.rules).toEqual(realOpts(XZ.defaults));
  });

  it('realOpts 只改局数', () => {
    expect(REAL_ROUNDS).toBe(1);
    expect(realOpts({ rounds: 8, cap: 5 })).toEqual({ rounds: 1, cap: 5 });
  });

  it('三人两房：x3-fun 和实盘四档来回换得回来，开桌 three 开、不换三张，一桌 3 人', () => {
    expect(matchTierOf('fun', 'sichuan-xuezhan', { three: true })).toBe('x3-fun');
    expect(matchTierOf('fun', 'riichi', { three: true })).toBe(MATCH_RC_FUN);
    expect(matchTierOf('fun')).toBe(MATCH_FUN);
    expect(tableSizeOf('x3-fun')).toBe(3);
    expect(tableSizeOf('real-small')).toBe(MATCH_TABLE);
    expect(matchRoomOptions('x3-fun')).toMatchObject({ variant: 'sichuan-xuezhan', stakes: 'fun', rules: { three: true, swap: false, flow: false, rounds: 8 } });
    for (const s of STAKES.filter((x) => x.wallet)) {
      const tier = matchTierOf(s.id, 'sichuan-xuezhan', { three: true });
      expect(tier).toBe(`x3-${s.id}`);
      expect(stakesOfTier(tier)).toBe(s.id);
      expect(matchRoomOptions(tier)).toMatchObject({ stakes: s.id, rules: { three: true, swap: false, rounds: REAL_ROUNDS } });
    }
    expect(matchRoomOptions('x3-nope')).toBeUndefined();
    expect(MATCH_FUN_TIERS).not.toContain('x3-small');
  });

  it('血流成河：xl-fun 和实盘四档来回换得回来，开桌 flow 开、四人桌；三人两房优先', () => {
    expect(matchTierOf('fun', 'sichuan-xuezhan', { flow: true })).toBe(MATCH_XL_FUN);
    expect(matchTierOf('small', 'riichi', { flow: true })).toBe('rc-small');
    expect(matchTierOf('small', 'sichuan-xuezhan', { three: true, flow: true })).toBe('x3-small');
    expect(tableSizeOf(MATCH_XL_FUN)).toBe(MATCH_TABLE);
    expect(matchRoomOptions(MATCH_XL_FUN)).toMatchObject({ variant: 'sichuan-xuezhan', stakes: 'fun', rules: { flow: true, three: false, rounds: 8 } });
    for (const s of STAKES.filter((x) => x.wallet)) {
      const tier = matchTierOf(s.id, 'sichuan-xuezhan', { flow: true });
      expect(tier).toBe(`xl-${s.id}`);
      expect(stakesOfTier(tier)).toBe(s.id);
      expect(matchRoomOptions(tier)).toMatchObject({ stakes: s.id, rules: { flow: true, three: false, rounds: REAL_ROUNDS } });
    }
    expect(matchRoomOptions('xl-nope')).toBeUndefined();
  });
});
