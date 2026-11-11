import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRun, dailySetup, rulesFor, type Segment } from '../../src/core/index.ts';
import { MONTH_THEMES, MONTH_THEME_SHORT, monthThemeById } from '../../src/core/content/monthThemes.ts';
import { SENSITIVE_WORDS } from '../../src/core/content/tales.ts';
import { SIX } from '../helpers.ts';

/** 0.29 的两个月度主题只在真实行情的普通局进抽取池：合成行情（replay-030）、每日挑战、闪电盘、本周市场、实盘的主题抽取逐位不变。 */
const NEW = ['herd_month', 'flood_month'];
const index = JSON.parse(readFileSync('public/data/segments/index.json', 'utf8')) as { segments: { file: string }[] };
const segs = index.segments.slice(0, 12).map((e) => JSON.parse(readFileSync('public/data/segments/' + e.file, 'utf8')) as Segment);

describe('0.29 新月度主题：抽取池', () => {
  it('合成行情、每日挑战、闪电盘、本周市场、实盘的 12 个月里没有', () => {
    const d = dailySetup('2026-10-27');
    const setups = [
      { name: 'daily', seed: (k: number) => `${d.seed}-${k}`, setup: d.setup },
      { name: 'flash', seed: (k: number) => `fl-${k}`, setup: { account: 1e6, themes: SIX, flash: '2026-10-27' } },
      { name: 'weekly', seed: (k: number) => `wk-${k}`, setup: { account: 1e6, themes: SIX, weekly: '2026-W44' } },
      { name: 'live', seed: (k: number) => `lv-${k}`, setup: { account: 1e6, themes: SIX, live: { months: 12, billMult: 1 } } },
    ];
    for (let k = 0; k < 40; k++) {
      const synth = createRun(`pool-${k}`, { account: 1e6, themes: SIX }, { tempo: true }).state.tempo?.plan ?? [];
      expect(synth.length).toBe(12);
      expect(synth.filter((id) => NEW.includes(id)), `synth ${k}`).toEqual([]);
      for (const s of setups) {
        const seg = segs[k % segs.length] as Segment;
        let plan: string[] = [];
        try {
          plan = createRun(s.seed(k), s.setup as never, { segment: seg }).state.tempo?.plan ?? [];
        } catch {
          continue; // 开局参数不合法的组合不在这里测
        }
        expect(plan.filter((id) => NEW.includes(id)), `${s.name} ${k}`).toEqual([]);
      }
    }
  });

  it('真实行情的普通局里抽得到；每局仍是 12 个不重复的主题', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 150; k++) {
      const plan = createRun(`pool-${k}`, { account: 1e6, themes: SIX }, { segment: segs[k % segs.length] as Segment }).state.tempo?.plan ?? [];
      expect(plan.length).toBe(12);
      expect(new Set(plan).size).toBe(12);
      for (const id of plan) if (NEW.includes(id)) seen.add(id);
    }
    expect([...seen].sort()).toEqual([...NEW].sort());
  });

  it('池子里只有这两个标了 realOnly，且都不是 boss、不需要押跌', () => {
    expect(MONTH_THEMES.filter((d) => d.realOnly).map((d) => d.id)).toEqual(NEW);
    for (const id of NEW) {
      expect(monthThemeById(id).boss).toBeFalsy();
      expect(monthThemeById(id).needsExt).toBeFalsy();
    }
  });
});

describe('0.29 新月度主题：规则和文案', () => {
  it('基金抱团月：推荐里带头大哥 ×3、小弟 ×0.5；群聊刷屏月：多 3 条消息、瞎传多 20%', () => {
    const herd = rulesFor([], 1, 'newbie', false, monthThemeById('herd_month').rules);
    expect(herd.recRoleBoost.leader).toBe(3);
    expect(herd.recRoleBoost.follower).toBe(0.5);
    const base = rulesFor([], 1, 'newbie', false);
    const flood = rulesFor([], 1, 'newbie', false, monthThemeById('flood_month').rules);
    expect(flood.extraMessages - base.extraMessages).toBe(3);
    expect(flood.msgNoise - base.msgNoise).toBeCloseTo(0.2, 5);
  });

  it('文案齐全：有短版、吐槽、小目标，不含敏感词和术语', () => {
    const banned = ['大盘', '龙头', '跟风', '月供', '群主', '喊单', '仓位', '利好', '利空'];
    for (const id of NEW) {
      const d = monthThemeById(id);
      const short = MONTH_THEME_SHORT[id];
      expect(short, id).toBeTruthy();
      expect(short?.rule.length).toBeLessThanOrEqual(8 + 4);
      expect(short?.line.length).toBeLessThanOrEqual(12);
      expect(d.goal.text).toContain('{n}');
      const all = [d.name, d.intro, d.rule, d.roast.text, d.goal.text, short?.rule ?? '', short?.line ?? ''].join('|');
      for (const w of [...SENSITIVE_WORDS, ...banned]) expect(all, `${id} ${w}`).not.toContain(w);
    }
  });
});
