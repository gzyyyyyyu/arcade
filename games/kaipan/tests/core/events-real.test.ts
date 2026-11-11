import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRun, dailySetup, eventById, eventView, fx, itemById, rngFor, type GameState, type Segment } from '../../src/core/index.ts';
import { SENSITIVE_WORDS } from '../../src/core/content/tales.ts';
import { SIX, must } from '../helpers.ts';

/** 0.20 的两个事件只在真实行情的非每日局里出现：合成行情的事件池不变（replay-030 逐位一致），每日挑战同一天上线前后是同一局。 */
const seg = JSON.parse(readFileSync('public/data/segments/' + JSON.parse(readFileSync('public/data/segments/index.json', 'utf8')).segments[0].file, 'utf8')) as Segment;

function atEvent(id: string, seed = 'evt-real'): GameState {
  let s = createRun(seed, { account: 1e6, themes: SIX }, { segment: seg }).state;
  for (let i = 0; i < 10 && s.phase === 'premarket'; i++) s = must(s, { type: 'open' }).state;
  const data = eventById(id).prepare({ state: s, rng: rngFor(seed, 'prep', id), month: s.month });
  if (!data) throw new Error(`${id} 现在不会出现`);
  s.reward = null;
  s.phase = 'event';
  s.event = { ...data, id, month: s.month };
  return s;
}

describe('0.20 真实行情局事件', () => {
  it('合成行情局里不进池；12 月不出现', () => {
    const synth = createRun('evt-synth', { account: 1e6, themes: SIX }).state;
    for (const id of ['salary_advance', 'old_trader', 'invest_group', 'broker_tea', 'show_off', 'free_eggs']) {
      expect(eventById(id).prepare({ state: synth, rng: rngFor('x'), month: 3 }), id).toBeNull();
      const real = createRun('evt-synth', { account: 1e6, themes: SIX }, { segment: seg }).state;
      expect(eventById(id).prepare({ state: real, rng: rngFor('x'), month: 3 }), id).not.toBeNull();
      expect(eventById(id).prepare({ state: real, rng: rngFor('x'), month: 12 }), id).toBeNull();
    }
  });

  it('每日挑战局里不进池（真实行情也不进）', () => {
    const d = dailySetup('2026-10-27');
    const daily = createRun(d.seed, d.setup, { segment: seg }).state;
    expect(daily.real).toBeTruthy();
    for (const id of ['salary_advance', 'old_trader', 'invest_group', 'broker_tea', 'show_off', 'free_eggs']) expect(eventById(id).prepare({ state: daily, rng: rngFor('x'), month: 3 }), id).toBeNull();
  });

  it('预支工资：选预支账户 +3%、下月月供 ×1.1；不预支什么都不变', () => {
    const s = atEvent('salary_advance');
    const amount = Math.round((s.account * fx('salary_advance', 'pct')) / 100);
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.account).toBeCloseTo(s.account + amount, 0);
    const no = must(atEvent('salary_advance'), { type: 'choose', option: 1 }).state;
    // 月供按 100 取整，所以只比大小关系
    expect(yes.bill.amount).toBeGreaterThan(no.bill.amount);
    expect(yes.bill.amount / no.bill.amount).toBeCloseTo(fx('salary_advance', 'billMult'), 1);
    expect(no.account).toBeCloseTo(s.account, 0);
  });

  it('楼下老股民：陪聊得到一个临时战法、下个交易日不能买卖；婉拒什么都没有', () => {
    const s = atEvent('old_trader');
    const id = s.event?.itemId as string;
    expect(itemById(id).kind).toBe('tactic');
    expect(s.items).not.toContain(id);
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.items).toContain(id);
    expect(yes.expiring).toContainEqual({ id, month: s.month + 1 });
    expect(yes.busyDay).toBe(yes.today.day);
    const no = must(atEvent('old_trader'), { type: 'choose', option: 1 }).state;
    expect(no.items).not.toContain(id);
    expect(no.busyDay).not.toBe(no.today.day);
  });

  it('投资群：进群得到临时的小道消息、下个交易日没空；不进账户小赚；已有小道消息不出现', () => {
    const s = atEvent('invest_group');
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.items).toContain('rumor_mill');
    expect(yes.expiring).toContainEqual({ id: 'rumor_mill', month: s.month + 1 });
    expect(yes.busyDay).toBe(yes.today.day);
    const no = must(atEvent('invest_group'), { type: 'choose', option: 1 }).state;
    expect(no.items).not.toContain('rumor_mill');
    expect(no.account).toBeCloseTo(s.account + Math.round((s.account * fx('invest_group', 'pct')) / 100), 0);
    const has = { ...s, items: [...s.items, 'rumor_mill'] };
    expect(eventById('invest_group').prepare({ state: has, rng: rngFor('x'), month: 3 })).toBeNull();
  });

  it('券商喝茶：付一笔钱、下月月供 ×0.9；不喝什么都不变', () => {
    const s = atEvent('broker_tea');
    const amount = Math.round((s.account * fx('broker_tea', 'pct')) / 100);
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.account).toBeCloseTo(s.account - amount, 0);
    const no = must(atEvent('broker_tea'), { type: 'choose', option: 1 }).state;
    expect(no.account).toBeCloseTo(s.account, 0);
    expect(yes.bill.amount / no.bill.amount).toBeCloseTo(fx('broker_tea', 'billMult'), 1);
  });

  it('朋友圈晒收益：晒了账户小赚、下月月供 ×1.06；不晒什么都不变', () => {
    const s = atEvent('show_off');
    const amount = Math.round((s.account * fx('show_off', 'pct')) / 100);
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.account).toBeCloseTo(s.account + amount, 0);
    const no = must(atEvent('show_off'), { type: 'choose', option: 1 }).state;
    expect(no.account).toBeCloseTo(s.account, 0);
    expect(yes.bill.amount / no.bill.amount).toBeCloseTo(fx('show_off', 'billMult'), 1);
  });

  it('营业部送鸡蛋：排队领账户小赚、下个交易日没空；不领什么都不变', () => {
    const s = atEvent('free_eggs');
    const amount = Math.round((s.account * fx('free_eggs', 'pct')) / 100);
    const yes = must(s, { type: 'choose', option: 0 }).state;
    expect(yes.account).toBeCloseTo(s.account + amount, 0);
    expect(yes.busyDay).toBe(yes.today.day);
    const no = must(atEvent('free_eggs'), { type: 'choose', option: 1 }).state;
    expect(no.account).toBeCloseTo(s.account, 0);
    expect(no.busyDay).not.toBe(no.today.day);
  });

  it('文案齐全，不含敏感词', () => {
    for (const id of ['salary_advance', 'old_trader', 'invest_group', 'broker_tea', 'show_off', 'free_eggs']) {
      const s = atEvent(id);
      const v = eventView(s);
      const all = [v?.text ?? '', ...(v?.options ?? [])];
      for (const o of [0, 1]) {
        const r = must(atEvent(id), { type: 'choose', option: o });
        const res = r.events.find((e) => e.type === 'eventResolved');
        all.push(res && res.type === 'eventResolved' ? res.text : '');
      }
      for (const t of all) {
        expect(t.length, id).toBeGreaterThan(4);
        for (const w of SENSITIVE_WORDS) expect(t, `${id} ${w}`).not.toContain(w);
      }
    }
  });
});
