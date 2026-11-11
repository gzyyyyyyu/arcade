import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/core/balance.ts';
import { credibility } from '../../src/core/chat.ts';
import { BLAME_LINES, BRAG_LINES, FRIENDS, HAND_TAILS, MESSAGE_LINES, REC_LINES, TURN_LINES, friendById } from '../../src/core/content/index.ts';
import { createRun, dailySetup, dispatch, rulesOf, type GameState, type Segment } from '../../src/core/index.ts';
import { SIX } from '../helpers.ts';

/** 量化小哥：月度奖励的新群友卡，只在真实行情的非每日局进抽取池（同 events.ts 的 realOnly）：合成行情（replay-030）和每日挑战的奖励抽取不能变。 */
const seg = JSON.parse(readFileSync('public/data/segments/' + JSON.parse(readFileSync('public/data/segments/index.json', 'utf8')).segments[0].file, 'utf8')) as Segment;

function friendCards(s0: GameState): string[] {
  let s = s0;
  for (let i = 0; i < 40 && s.phase === 'premarket'; i++) s = dispatch(s, { type: 'open' }, { inPlace: true, events: false }).state;
  return s.phase === 'reward' ? (s.reward?.cards ?? []).filter((c) => c.kind === 'friend').map((c) => c.id) : [];
}

describe('量化小哥：抽取池', () => {
  it('合成行情和每日挑战的奖励池里没有；真实行情的普通局里有', () => {
    const d = dailySetup('2026-10-27');
    let real = 0;
    for (let k = 0; k < 150; k++) {
      expect(friendCards(createRun(`quant-${k}`, { account: 1e6, themes: SIX }).state), `synth ${k}`).not.toContain('quant');
      expect(friendCards(createRun(`${d.seed}-${k}`, d.setup, { segment: seg }).state), `daily ${k}`).not.toContain('quant');
      real += friendCards(createRun(`quant-${k}`, { account: 1e6, themes: SIX }, { segment: seg }).state).filter((id) => id === 'quant').length;
    }
    expect(real).toBeGreaterThan(0);
  });

  it('不是开局群友，标了 realOnly；其余群友没有这个标记', () => {
    const q = friendById('quant');
    expect(q.name).toBe('量化小哥');
    expect(q.founding).toBe(false);
    expect(q.realOnly).toBe(true);
    expect(FRIENDS.filter((f) => f.realOnly).map((f) => f.id)).toEqual(['quant']);
  });
});

describe('量化小哥：台词和靠谱程度', () => {
  it('每张台词表都有他的词；三个方向、三种拐点都够多', () => {
    for (const d of ['up', 'down', 'flat'] as const) {
      expect(MESSAGE_LINES.quant?.[d]?.length ?? 0, `message ${d}`).toBeGreaterThanOrEqual(8);
      expect(BRAG_LINES.quant?.[d]?.length ?? 0, `brag ${d}`).toBeGreaterThanOrEqual(6);
    }
    for (const k of ['start', 'top', 'ebb'] as const) expect(TURN_LINES.quant?.[k]?.length ?? 0, k).toBeGreaterThanOrEqual(5);
    expect(REC_LINES.quant?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(BLAME_LINES.quant?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(HAND_TAILS.quant?.hot.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(HAND_TAILS.quant?.cold.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('靠谱程度 0.65：真实行情在每局浮动（±0.05）内，合成行情就是 0.65；和别的群友不同档', () => {
    expect(BALANCE.intel.cred.quant).toEqual([0.65, 0.65]);
    expect(BALANCE.cred.quant).toEqual([0.65, 0.65]);
    const others = Object.entries(BALANCE.intel.cred).filter(([id]) => id !== 'quant').map(([, v]) => v[0]);
    expect(others).not.toContain(0.65);
    const synth = createRun('quant-cred', { account: 1e6, themes: SIX, friends: ['quant'] }).state;
    expect(credibility(synth, 'quant', synth.themeIds[0]!, rulesOf(synth))).toBeCloseTo(0.65, 9);
    for (let k = 0; k < 20; k++) {
      const s = createRun(`quant-cred-${k}`, { account: 1e6, themes: SIX, friends: ['quant'] }, { segment: seg }).state;
      const c = credibility(s, 'quant', s.themeIds[0]!, rulesOf(s));
      expect(Math.abs(c - 0.65)).toBeLessThanOrEqual(BALANCE.chat.form.cred + BALANCE.intel.diffStep * 8 + 1e-9);
    }
  });
});
