import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRun, dailySetup, dispatch, fx, itemById, itemView, type GameEvent, type GameState, type Segment } from '../../src/core/index.ts';
import { SENSITIVE_WORDS } from '../../src/core/content/tales.ts';
import { SIX, fixedDay, must, quiet, withBalance } from '../helpers.ts';

/** 这两个战法只在真实行情的非每日局进月底三选一的抽取池：合成行情的抽取不变（replay-030 逐位一致），每日挑战上线前后还是同一局。 */
const NEW = ['contrarian', 'hold_tight', 'dip_buyer', 'early_bird'];
const seg = JSON.parse(readFileSync('public/data/segments/' + JSON.parse(readFileSync('public/data/segments/index.json', 'utf8')).segments[0].file, 'utf8')) as Segment;

function offered(s0: GameState): string[] {
  let s = s0;
  const ids: string[] = [];
  for (let i = 0; i < 40 && s.phase === 'premarket'; i++) s = dispatch(s, { type: 'open' }, { inPlace: true, events: false }).state;
  if (s.phase === 'reward') for (const c of s.reward?.cards ?? []) if (c.kind === 'item') ids.push(c.id);
  return ids;
}

function triggers(events: readonly GameEvent[], id: string): GameEvent[] {
  return events.filter((e) => e.type === 'itemTriggered' && e.itemId === id);
}

describe('0.21 新战法：抽取池', () => {
  it('合成行情和每日挑战的奖励池里没有；真实行情的普通局里有', () => {
    const d = dailySetup('2026-10-27');
    let real = 0;
    for (let k = 0; k < 120; k++) {
      const synth = offered(createRun(`pool-${k}`, { account: 1e6, themes: SIX }).state);
      expect(synth.filter((id) => NEW.includes(id)), `synth ${k}`).toEqual([]);
      const daily = offered(createRun(`${d.seed}-${k}`, d.setup, { segment: seg }).state);
      expect(daily.filter((id) => NEW.includes(id)), `daily ${k}`).toEqual([]);
      real += offered(createRun(`pool-${k}`, { account: 1e6, themes: SIX }, { segment: seg }).state).filter((id) => NEW.includes(id)).length;
    }
    expect(real).toBeGreaterThan(0);
  });
});

describe('0.21 新战法：效果', () => {
  it('文案齐全，不含敏感词，卡片短版有数字', () => {
    for (const id of NEW) {
      const v = itemView(id);
      expect(v.desc.length, id).toBeGreaterThan(8);
      expect(v.flavor.length, id).toBeGreaterThan(4);
      expect(v.kindLabel).toBe('打法');
      for (const w of SENSITIVE_WORDS) expect(v.desc + v.flavor, `${id} ${w}`).not.toContain(w);
      expect(itemById(id).realOnly).toBe(true);
    }
  });

  it('逆势而上：大盘跌超线的日子，涨的股票再多涨；跌的不加；大盘没跌够不触发', () => {
    withBalance(quiet, () => {
      const set = (market: number): GameState => {
        const s = fixedDay({ items: ['contrarian'], holdings: ['ai_leader', 'ne_leader'] }, { ai: 10, newenergy: -10 });
        s.today.plan.marketRet = market;
        return s;
      };
      const bonus = fx('contrarian', 'bonus');
      const r = must(set(fx('contrarian', 'drop') - 1), { type: 'open' });
      const hs = r.state.lastDay?.holdings ?? [];
      const down = hs.find((h) => h.stockId === 'ne_leader');
      expect(triggers(r.events, 'contrarian')).toHaveLength(1);
      const t = triggers(r.events, 'contrarian')[0];
      expect(t && t.type === 'itemTriggered' ? t.delta : 0).toBeCloseTo(bonus, 1);
      expect(t && t.type === 'itemTriggered' ? t.stockId : '').toBe('ai_leader');
      expect(down?.ret ?? 0).toBeLessThan(0);
      expect(triggers(must(set(0), { type: 'open' }).events, 'contrarian')).toHaveLength(0);
    });
  });

  it('拿得住：同一只拿满天数以后每天多赚；没拿满不触发', () => {
    withBalance(quiet, () => {
      const s = fixedDay({ items: ['hold_tight'], holdings: ['ai_leader'] }, {});
      const days = fx('hold_tight', 'days');
      const h = s.slots.find((x) => x);
      expect(h).toBeTruthy();
      expect(triggers(must(structuredClone(s), { type: 'open' }).events, 'hold_tight')).toHaveLength(0);
      if (h) h.boughtDay = s.today.day - days;
      const r = must(s, { type: 'open' });
      expect(triggers(r.events, 'hold_tight')).toHaveLength(1);
    });
  });

  it('抄底侠：前一天大盘跌超线，今天新买的多涨；没跌够、不是今天买的都不触发', () => {
    withBalance(quiet, () => {
      const set = (yesterday: number | null, boughtDay?: number): GameState => {
        const s = fixedDay({ items: ['dip_buyer'], holdings: ['ai_leader'] }, {});
        if (yesterday !== null) s.lastDay = { market: { ret: yesterday } } as GameState['lastDay'];
        const h = s.slots.find((x) => x);
        if (h) h.boughtDay = boughtDay ?? s.today.day;
        return s;
      };
      const drop = fx('dip_buyer', 'drop');
      const r = must(set(drop - 0.5), { type: 'open' });
      const t = triggers(r.events, 'dip_buyer')[0];
      expect(triggers(r.events, 'dip_buyer')).toHaveLength(1);
      expect(t && t.type === 'itemTriggered' ? t.delta : 0).toBeCloseTo(fx('dip_buyer', 'bonus'), 1);
      expect(triggers(must(set(drop + 0.5), { type: 'open' }).events, 'dip_buyer')).toHaveLength(0);
      expect(triggers(must(set(null), { type: 'open' }).events, 'dip_buyer')).toHaveLength(0);
      expect(triggers(must(set(drop - 0.5, -3), { type: 'open' }).events, 'dip_buyer')).toHaveLength(0);
    });
  });

  it('早起鸟：只有月初第一个交易日新买的才多涨', () => {
    withBalance(quiet, () => {
      const set = (dayInMonth: number): GameState => {
        const s = fixedDay({ items: ['early_bird'], holdings: ['ai_leader'] }, {});
        s.dayInMonth = dayInMonth;
        const h = s.slots.find((x) => x);
        if (h) h.boughtDay = s.today.day;
        return s;
      };
      const r = must(set(0), { type: 'open' });
      const t = triggers(r.events, 'early_bird')[0];
      expect(triggers(r.events, 'early_bird')).toHaveLength(1);
      expect(t && t.type === 'itemTriggered' ? t.delta : 0).toBeCloseTo(fx('early_bird', 'bonus'), 1);
      expect(triggers(must(set(2), { type: 'open' }).events, 'early_bird')).toHaveLength(0);
    });
  });
});
