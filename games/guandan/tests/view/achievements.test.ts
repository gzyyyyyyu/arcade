import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, EMPTY_ACH, evaluate, loadAch, recordAch, sanitize, type AchState, type AchSummary } from '../../src/view/common/achievements.ts';
import { DdzSession } from '../../src/view/doudizhu/session.ts';
import { Session } from '../../src/view/guandan/session.ts';

const fresh = (): AchState => ({ ...EMPTY_ACH, unlocked: [] });
const run = (s: AchState, ...ms: AchSummary[]): { s: AchState; all: string[] } => {
  const all: string[] = [];
  for (const m of ms) {
    const r = evaluate(s, m);
    s = r.next;
    all.push(...r.newly);
  }
  return { s, all };
};
const gdGame = (won: boolean, passedA = false): AchSummary => ({ kind: 'gd-game', won, passedA });
const ddzDeal = (o: Partial<Extract<AchSummary, { kind: 'ddz-deal' }>>): AchSummary => ({ kind: 'ddz-deal', landlord: false, won: false, bid: 1, spring: null, rocket: false, ...o });

describe('成就表', () => {
  it('id 不重复，掼蛋和斗地主各一半', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS).toHaveLength(16);
    expect(ACHIEVEMENTS.filter((a) => a.group === 'gd')).toHaveLength(8);
  });
});

describe('evaluate：掼蛋', () => {
  it('第一场赢解锁初战告捷，输了不解锁', () => {
    expect(run(fresh(), gdGame(false)).all).toEqual([]);
    expect(run(fresh(), gdGame(true)).all).toEqual(['gd-first-win']);
  });
  it('连赢 3 场解锁三连胜，中间输一场重新数', () => {
    expect(run(fresh(), gdGame(true), gdGame(true), gdGame(true)).all).toContain('gd-streak3');
    expect(run(fresh(), gdGame(true), gdGame(true), gdGame(false), gdGame(true)).all).not.toContain('gd-streak3');
    expect(run(fresh(), gdGame(true), gdGame(true), gdGame(false), gdGame(true), gdGame(true), gdGame(true)).all).toContain('gd-streak3');
  });
  it('过 A、同花顺、炸弹 3 个、双下', () => {
    expect(run(fresh(), gdGame(true, true)).all).toContain('gd-pass-a');
    expect(run(fresh(), gdGame(true, false)).all).not.toContain('gd-pass-a');
    expect(run(fresh(), { kind: 'gd-deal', sf: true, bombs: 1, doubleDown: false }).all).toEqual(['gd-sf']);
    expect(run(fresh(), { kind: 'gd-deal', sf: false, bombs: 2, doubleDown: false }).all).toEqual([]);
    expect(run(fresh(), { kind: 'gd-deal', sf: false, bombs: 3, doubleDown: true }).all.sort()).toEqual(['gd-bombs3', 'gd-double-down']);
  });
  it('累计 10 场（赢输都算）解锁牌桌常客', () => {
    const ms = Array.from({ length: 10 }, (_, i) => gdGame(i % 2 === 0));
    expect(run(fresh(), ...ms.slice(0, 9)).all).not.toContain('gd-games10');
    expect(run(fresh(), ...ms).all).toContain('gd-games10');
  });
  it('每日挑战打完解锁每日一练，且不动场数和连胜', () => {
    const r = run(fresh(), { kind: 'gd-daily' });
    expect(r.all).toEqual(['gd-daily']);
    expect(r.s.gdGames).toBe(0);
  });
});

describe('evaluate：斗地主', () => {
  it('地主赢、农民赢、叫 3 分赢、春天', () => {
    expect(run(fresh(), ddzDeal({ landlord: true, won: true, bid: 2 })).all).toEqual(['ddz-landlord-win']);
    expect(run(fresh(), ddzDeal({ won: true })).all).toEqual(['ddz-farmer-win']);
    expect(run(fresh(), ddzDeal({ landlord: true, won: true, bid: 3 })).all.sort()).toEqual(['ddz-bid3-win', 'ddz-landlord-win']);
    expect(run(fresh(), ddzDeal({ landlord: true, won: false, bid: 3 })).all).toEqual([]);
    expect(run(fresh(), ddzDeal({ landlord: true, won: true, spring: 'spring' })).all).toContain('ddz-spring');
    // 反春（农民赢）不是"打出春天"
    expect(run(fresh(), ddzDeal({ won: true, spring: 'anti' })).all).toEqual(['ddz-farmer-win']);
  });
  it('王炸不论输赢都算', () => {
    expect(run(fresh(), ddzDeal({ rocket: true })).all).toEqual(['ddz-rocket']);
  });
  it('一场：赢、累计 10 场、每日挑战', () => {
    expect(run(fresh(), { kind: 'ddz-game', won: true, daily: false }).all).toEqual(['ddz-first-win']);
    expect(run(fresh(), { kind: 'ddz-game', won: false, daily: true }).all).toEqual(['ddz-daily']);
    const ms = Array.from({ length: 10 }, () => ({ kind: 'ddz-game', won: false, daily: false }) as const);
    expect(run(fresh(), ...ms).all).toEqual(['ddz-games10']);
  });
});

describe('不重复解锁、不改传入状态', () => {
  it('同一个成就只给一次', () => {
    const a = run(fresh(), gdGame(true), gdGame(true));
    expect(a.all).toEqual(['gd-first-win']);
    expect(a.s.unlocked).toEqual(['gd-first-win']);
  });
  it('evaluate 不改 prev', () => {
    const prev = fresh();
    evaluate(prev, gdGame(true));
    expect(prev).toEqual(EMPTY_ACH);
  });
});

describe('存储', () => {
  let mem: Record<string, string>;
  beforeEach(() => {
    mem = {};
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => (mem[k] = v), removeItem: (k: string) => delete mem[k] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('坏数据当空', () => {
    for (const raw of ['{坏的', 'null', '"x"', '[]', '{"v":2,"unlocked":["gd-sf"]}', '{"v":1,"unlocked":"x","gdGames":-3,"ddzGames":"a"}']) {
      mem['guandan.achievements'] = raw;
      expect(loadAch()).toEqual(EMPTY_ACH);
    }
  });
  it('认不得的 id 和重复的 id 丢掉，坏计数归零', () => {
    expect(sanitize({ v: 1, unlocked: ['gd-sf', 'gd-sf', 'nope', 3], gdGames: 'x', ddzGames: 4.7, gdStreak: -1 })).toEqual({ v: 1, unlocked: ['gd-sf'], gdGames: 0, ddzGames: 4, gdStreak: 0 });
  });
  it('recordAch 写回，再记同一个不重复', () => {
    expect(recordAch(gdGame(true))).toEqual(['gd-first-win']);
    expect(JSON.parse(mem['guandan.achievements']!)).toMatchObject({ v: 1, unlocked: ['gd-first-win'], gdGames: 1, gdStreak: 1 });
    expect(recordAch(gdGame(true))).toEqual([]);
  });
  it('没有 localStorage 也不抛', () => {
    vi.unstubAllGlobals();
    expect(() => recordAch(gdGame(true))).not.toThrow();
  });

  it('掼蛋单机会话：代打（调试）时不记成就', () => {
    const ses = Session.fresh('ach-a', undefined, 'novice');
    ses.autoplay = true;
    ses.achieve(gdGame(true));
    expect(ses.takeUnlocked()).toEqual([]);
    expect(loadAch()).toEqual(EMPTY_ACH);
    ses.autoplay = false;
    ses.achieve(gdGame(true));
    expect(ses.takeUnlocked()).toEqual(['gd-first-win']);
  });

  it('斗地主单机会话：一场打完记 1 场', () => {
    const ses = DdzSession.fresh('ach-d', 'normal' as never, { deals: 1 }, false);
    for (let i = 0; i < 2000 && ses.state.phase !== 'gameOver'; i++) {
      if (ses.state.phase === 'dealEnd') { ses.apply({ type: 'next' }); continue; }
      const a = ses.botAction(ses.state.turn);
      if (!a) break;
      ses.apply(a);
    }
    expect(ses.state.phase).toBe('gameOver');
    expect(loadAch().ddzGames).toBe(1);
    expect(ses.takeUnlocked().length).toBe(loadAch().unlocked.length);
    expect(ses.takeUnlocked()).toEqual([]);
  });
});
