/**
 * 斗地主残局闯关的会话与进度（src/view/doudizhu/puzzle.ts）：提示一路打能过关并记进度、农民走 bestReply、坏存储容错、解锁规则。
 * 不起浏览器：假的 localStorage。
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DDZ_PUZZLES } from '../../src/variants/doudizhu/puzzles/puzzles.ts';
import { bestReply, rootMoves } from '../../src/variants/doudizhu/puzzles/solver.ts';
import { PuzzleSession, puzzleAfter, puzzleStatuses, puzzlesDone } from '../../src/view/doudizhu/puzzle.ts';
import { KEYS, getDdzPuzzlesDone } from '../../src/view/store.ts';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => mem.clear());

const byId = (id: string) => DDZ_PUZZLES.find((p) => p.id === id)!;

/** 玩家用提示、农民用会话给的应对，一直打到这一副结束 */
function playOut(ses: PuzzleSession): void {
  for (let i = 0; i < 200 && ses.state.phase === 'play'; i++) {
    const turn = ses.state.turn;
    const a = turn === 0 ? ses.hintAction() : ses.botAction(turn);
    expect(a, `第 ${i} 步`).not.toBeNull();
    expect(ses.apply(a!).error).toBeNull();
  }
}

describe('PuzzleSession', () => {
  it('从关卡的牌开局：我是地主先出，三家手牌就是关卡表里的', () => {
    const p = byId('p03');
    const ses = PuzzleSession.start(p);
    expect(ses.state.phase).toBe('play');
    expect(ses.state.turn).toBe(0);
    expect(ses.state.landlord).toBe(0);
    for (let s = 0; s < 3; s++) expect([...ses.hand(s)].sort((a, b) => a - b)).toEqual([...p.hands[s]!].sort((a, b) => a - b));
  });

  it('用提示一路打能过关，进度会记；不存档、不记战绩', () => {
    for (const id of ['p01', 'p10', 'p20']) {
      const ses = PuzzleSession.start(byId(id));
      playOut(ses);
      expect(ses.state.phase).toBe('dealEnd');
      expect(ses.state.results[0]!.landlordWon).toBe(true);
      expect(getDdzPuzzlesDone()).toContain(id);
    }
    expect([...mem.keys()].sort()).toEqual([KEYS.ddzPuzzles]);
  }, 60_000);

  it('农民的应对就是 bestReply；轮不到的座位没有动作', () => {
    const ses = PuzzleSession.start(byId('p05'));
    expect(ses.botAction(1)).toBeNull();
    expect(ses.apply(ses.hintAction()!).error).toBeNull();
    const turn = ses.state.turn;
    if (turn !== 0 && ses.state.phase === 'play') {
      expect(ses.isBot(turn)).toBe(true);
      expect(ses.botAction(turn)).toEqual(bestReply(ses.state));
    }
    expect(ses.isBot(0)).toBe(false);
  });

  it('走错了：提示回 null；农民先出完不记进度', () => {
    const ses = PuzzleSession.start(byId('p20'));
    const bad = rootMoves(ses.state).find((m) => !m.wins)!;
    expect(ses.apply(bad.action).error).toBeNull();
    for (let i = 0; i < 200 && ses.state.phase === 'play' && ses.state.turn !== 0; i++) {
      expect(ses.apply(ses.botAction(ses.state.turn)!).error).toBeNull();
    }
    if (ses.state.phase === 'play') expect(ses.hintAction()).toBeNull();
    // 照提示以外的路打到底，地主赢不了
    for (let i = 0; i < 200 && ses.state.phase === 'play'; i++) {
      const turn = ses.state.turn;
      const a = turn === 0 ? rootMoves(ses.state)[0]!.action : ses.botAction(turn)!;
      expect(ses.apply(a).error).toBeNull();
    }
    expect(ses.state.results[0]!.landlordWon).toBe(false);
    expect(getDdzPuzzlesDone()).toEqual([]);
  }, 60_000);

  it('非法着法报错、状态不变', () => {
    const ses = PuzzleSession.start(byId('p01'));
    const before = JSON.stringify(ses.state);
    expect(ses.apply({ type: 'pass', seat: 0 }).error).not.toBeNull();
    expect(JSON.stringify(ses.state)).toBe(before);
  });
});

describe('进度存储', () => {
  it('坏数据当空：不是 JSON、版本不对、done 不是数组、元素不是字符串', () => {
    expect(getDdzPuzzlesDone()).toEqual([]);
    for (const raw of ['{坏的', '123', 'null', '{"v":2,"done":["p01"]}', '{"v":1,"done":"p01"}', '{"v":1}']) {
      mem.set(KEYS.ddzPuzzles, raw);
      expect(getDdzPuzzlesDone(), raw).toEqual([]);
    }
    mem.set(KEYS.ddzPuzzles, JSON.stringify({ v: 1, done: ['p01', 7, null, 'p01', 'p02'] }));
    expect(getDdzPuzzlesDone()).toEqual(['p01', 'p02']);
  });

  it('关卡表里没有的 id 不算过', () => {
    mem.set(KEYS.ddzPuzzles, JSON.stringify({ v: 1, done: ['p01', 'p99', 'x'] }));
    expect([...puzzlesDone()]).toEqual(['p01']);
  });

  it('存储不可用时不抛错', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('禁用'); }, setItem: () => { throw new Error('禁用'); }, removeItem: () => {} });
    expect(getDdzPuzzlesDone()).toEqual([]);
    expect(() => PuzzleSession.start(byId('p01')).apply({ type: 'pass', seat: 0 })).not.toThrow();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  });
});

describe('解锁规则', () => {
  const ids = DDZ_PUZZLES.map((p) => p.id);
  const at = (done: string[]) => puzzleStatuses(new Set(done));

  it('一开始只开第一关，它是下一关，其余锁着', () => {
    const st = at([]);
    expect(st[0]).toBe('next');
    expect(st.slice(1).every((x) => x === 'locked')).toBe(true);
  });

  it('过了第 n 关开放第 n+1 关，过了的打勾、下一关高亮', () => {
    const st = at(ids.slice(0, 3));
    expect(st.slice(0, 3)).toEqual(['done', 'done', 'done']);
    expect(st[3]).toBe('next');
    expect(st.slice(4).every((x) => x === 'locked')).toBe(true);
  });

  it('全过了：全是 done，没有下一关', () => {
    expect(at(ids).every((x) => x === 'done')).toBe(true);
  });

  it('过关后的下一关；最后一关回 null', () => {
    expect(puzzleAfter(DDZ_PUZZLES[0]!)?.id).toBe('p02');
    expect(puzzleAfter(DDZ_PUZZLES[DDZ_PUZZLES.length - 1]!)).toBeNull();
  });
});
