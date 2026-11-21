import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { createRun, dispatch, type Action, type GameState, type RunSetup } from '../../src/core/index.ts';
import { REPLAY_GOLDEN } from '../fixtures/replay-golden.ts';

/**
 * 合成行情（不给行情段：离线、数据加载失败时的兜底）的回放基准，只当当前版本的回归基准，不保证跨版本。
 * 基准 tests/fixtures/replay-golden.ts：5 个人设 × 第 1、4、8 级 × normal / smart 的操作序列，加上按当前代码回放得到的
 * 每次开盘后的账户轨迹指纹和终局指纹。规则真的改了才用 `UPDATE_REPLAY_GOLDEN=1 npx vitest run tests/core/replay-golden.test.ts`
 * 重新生成，diff 里说明为什么变（操作序列不动；某个操作在新规则下不合法时换掉那一局）。
 */
const UPDATE = process.env.UPDATE_REPLAY_GOLDEN === '1';
const FIXTURE = 'tests/fixtures/replay-golden.ts';
interface Run {
  seed: string;
  setup: RunSetup;
  bot: string;
  actions: string;
  account: number;
  phase: string;
  trail: string;
  final: string;
}

const fixture = REPLAY_GOLDEN as unknown as { runs: Run[] };

function dec(code: string): Action {
  const [a = '', b] = code.slice(1).split('.');
  const slot = b === undefined ? undefined : Number(b);
  switch (code[0]) {
    case 'o':
      return { type: 'open' };
    case 'b':
      return slot === undefined ? { type: 'buy', rec: Number(a) } : { type: 'buy', rec: Number(a), slot };
    case 's':
      return { type: 'sell', slot: Number(a) };
    case 'p':
      return slot === undefined ? { type: 'pickReward', index: Number(a) } : { type: 'pickReward', index: Number(a), slot };
    case 'k':
      return { type: 'skipReward' };
    case 'c':
      return { type: 'choose', option: Number(a) };
  }
  throw new Error(`坏操作 ${code}`);
}

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 终局指纹：只取合成行情下会动的数值字段。 */
function snap(s: GameState): unknown {
  const st = s.stats;
  return {
    phase: s.phase,
    month: s.month,
    dayIndex: s.dayIndex,
    account: s.account,
    mood: s.mood,
    slots: s.slots.map((h) => h && [h.stockId, h.value, h.boughtDay, h.todayRet]),
    items: s.items,
    friends: s.friends.map((f) => [f.id, f.hits, f.total]),
    themes: s.themeIds.map((id) => [id, s.themes[id]?.heat, s.themes[id]?.stage, s.themes[id]?.left]),
    stats: [st.days, st.buys, st.sells, st.limitUpDays, st.maxBoards, st.chains, st.peakAccount, st.billsPaid, st.trades.length, st.monthRets, st.crashRet],
    bill: s.bill.amount,
    reward: s.reward?.cards.map((c) => c.id) ?? null,
    event: s.event?.id ?? null,
  };
}

describe('合成行情回放基准（当前版本）', () => {
  afterAll(() => {
    if (!UPDATE) return;
    const rows = fixture.runs.map((r) => `    ${JSON.stringify(r)},`).join('\n');
    writeFileSync(FIXTURE, `/** 合成行情的回放基准（当前版本），见 tests/core/replay-golden.test.ts。不要手改：UPDATE_REPLAY_GOLDEN=1 重新生成。 */\nexport const REPLAY_GOLDEN = {\n  runs: [\n${rows}\n  ],\n};\n`);
  });

  it('基准覆盖 5 个人设 × 第 1、4、8 级', () => {
    const keys = new Set(fixture.runs.map((r) => `${r.setup.persona}:${r.setup.difficulty}`));
    expect(keys.size).toBe(15);
  });

  for (const run of fixture.runs) {
    it(`${run.seed}（${run.bot}，${run.phase}）`, () => {
      // 0.3 合成行情模式：不给行情段
      let s = createRun(run.seed, run.setup, { segment: null }).state;
      expect(s.real).toBeNull();
      const trail: unknown[] = [];
      for (const code of run.actions.split(',')) {
        const a = dec(code);
        const r = dispatch(s, a, { events: false });
        expect(r.error, code).toBeNull();
        s = r.state;
        if (a.type === 'open') trail.push([s.account, s.dayIndex, s.month, s.phase]);
      }
      const got = { phase: s.phase, account: s.account, trail: fnv(JSON.stringify(trail)), final: fnv(JSON.stringify(snap(s))) };
      if (UPDATE) Object.assign(run, got);
      expect(got).toEqual({ phase: run.phase, account: run.account, trail: run.trail, final: run.final });
    });
  }
});
