import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  LESSON,
  MIND_IDS,
  NOVICE_SEGMENTS,
  createRun,
  dispatch,
  isNoviceSetup,
  isRankedSetup,
  lessonAdvice,
  lessonSetup,
  mindMoment,
  noviceSetup,
  shortSetup,
  type GameState,
  type MindId,
} from '../../src/core/index.ts';
import { botByName, playRun, useExt, useMarket } from '../../tools/bots.ts';
import { loadSegment, segmentIndex } from '../../tools/segments-disk.ts';

/** 新手课（docs/design-lesson.md）：照建议做不亏，故意不止损、一把梭的会亏；心法的当场例子在该出的时候出。 */
function lessonRun(bot: string): GameState {
  const seg = loadSegment(LESSON.segment);
  useExt(true);
  useMarket(() => seg);
  try {
    return playRun(LESSON.seed, botByName(bot), lessonSetup());
  } finally {
    useMarket(null);
    useExt(false);
  }
}

describe('新手课', () => {
  it('一直照建议做：打完不亏（交得上开局的钱）', () => {
    const end = lessonRun('lesson');
    expect(end.phase).toBe('won');
    expect(end.stats.tradeMoney).toBeGreaterThan(0);
  });

  it('照建议买但不止损、或者一律重仓：都亏', () => {
    for (const bot of ['lesson-nostop', 'lesson-heavy']) {
      const end = lessonRun(bot);
      expect(end.phase, bot).toBe('lost');
      expect(end.stats.tradeMoney, bot).toBeLessThan(0);
    }
  });

  it('照建议做的这一局里用到了止损、看战绩、一次一口', () => {
    const end = lessonRun('lesson');
    const seg = loadSegment(LESSON.segment);
    let s = createRun(LESSON.seed, lessonSetup(), { segment: seg, ext: true }).state;
    const used = new Set<MindId>();
    for (const a of end.actions) {
      const adv = lessonAdvice(s);
      if (adv && adv.kind !== 'wait' && (a.type === 'buy' || a.type === 'sell')) used.add(adv.mind);
      s = dispatch(s, a).state;
    }
    for (const id of ['zhisun', 'zhanji', 'yibasuo'] as const) expect(used.has(id), id).toBe(true);
  });

  it('不进档案和排行；必须是短局、不和别的模式混', () => {
    expect(isRankedSetup(lessonSetup())).toBe(false);
    expect(() => createRun('x', { lesson: true })).toThrow('新手课要是短局');
    expect(() => createRun('x', { ...lessonSetup(), daily: '2026-01-01' })).toThrow();
  });

  it('建议只在盘前给', () => {
    const seg = loadSegment(LESSON.segment);
    const s = createRun(LESSON.seed, lessonSetup(), { segment: seg, ext: true }).state;
    expect(lessonAdvice(s)?.kind).toBe('buy');
    expect(lessonAdvice({ ...s, phase: 'reward' })).toBeNull();
  });
});

describe('心法的当场例子', () => {
  it('一律重仓那一局里会弹「别一把梭」，不止损那一局会弹「止损」', () => {
    const seen = (bot: string): Set<MindId> => {
      const seg = loadSegment(LESSON.segment);
      useExt(true);
      useMarket(() => seg);
      const ids = new Set<MindId>();
      try {
        playRun(LESSON.seed, botByName(bot), lessonSetup(), (s) => {
          const m = mindMoment(s);
          if (m) ids.add(m.id);
        });
      } finally {
        useMarket(null);
        useExt(false);
      }
      return ids;
    };
    expect(seen('lesson-heavy').has('yibasuo')).toBe(true);
    expect(seen('lesson-nostop').has('zhisun')).toBe(true);
  });

  it('心法表六张，id 不重复', () => {
    expect(new Set(MIND_IDS).size).toBe(6);
  });
});

describe('新号照顾', () => {
  it('开局设置只是新手档短局换了首付比例', () => {
    const s = noviceSetup('newbie');
    expect(s.difficulty).toBe(1);
    expect(s.short?.goal).toBe(BALANCE.novice.goal);
    expect(isRankedSetup(s)).toBe(true);
  });

  it('isNoviceSetup 只认 noviceSetup 开的局（重玩时从同一个段池抽）', () => {
    expect(isNoviceSetup(noviceSetup('newbie'))).toBe(true);
    expect(isNoviceSetup(shortSetup('newbie', 1))).toBe(false);
    expect(isNoviceSetup(lessonSetup())).toBe(false);
    expect(isNoviceSetup(null)).toBe(false);
  });

  it('行情段池都在段库里，没有崩盘和熊市', () => {
    const ids = new Set(segmentIndex().segments.map((x) => x.id));
    expect(NOVICE_SEGMENTS.length).toBeGreaterThan(60);
    for (const id of NOVICE_SEGMENTS) {
      expect(ids.has(id), id).toBe(true);
      expect(['crash', 'bear']).not.toContain(loadSegment(id).regime);
    }
  });
});
