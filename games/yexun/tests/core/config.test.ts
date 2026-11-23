// 开局配置：A 第二件起手、B 心法
import { describe, expect, it } from 'vitest';
import { createWorld, fingerprint, step, normalizeSetup, type Setup, type World } from '../../src/core/index.ts';
import { ALT_START_FIX, altStart, mainSchools, SCHOOL_CORE, XINFA_MUL } from '../../src/content/pools.ts';
import { SCHOOLS } from '../../src/content/guide.ts';
import { ROUTES } from '../../tools/bots.ts';
import type { PassiveId, WeaponId } from '../../src/content/weapons.ts';

const base: Setup = { seed: 20261106, mode: 'vigil', danger: 2, map: 'snow', character: 'xiaodao' };
const dirOf = (t: number): number => (t * 7) % 16;

function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks && w.phase !== 'over'; t++) step(w, dirOf(t), w.phase === 'choose' ? 0 : -1);
}

describe('开局配置：没开的局不变', () => {
  it('不带 / startAlt:false 逐位一致', () => {
    const a = createWorld(base);
    const b = createWorld({ ...base, startAlt: false });
    for (const w of [a, b]) run(w, 3000);
    expect(fingerprint(b)).toBe(fingerprint(a));
  });
});

describe('录像回放', () => {
  it('带配置的 Setup 固定输入跑两遍指纹相同', () => {
    const s: Setup = { ...base, danger: 0, character: 'yinyang', startAlt: true, xinfa: 'ghost' };
    const a = createWorld(normalizeSetup(s));
    const b = createWorld(normalizeSetup(s));
    run(a, 3000);
    run(b, 3000);
    expect(a.tick).toBeGreaterThan(300);
    expect(fingerprint(b)).toBe(fingerprint(a));
  });
});

describe('A：第二件起手', () => {
  it('手上是 altStart(角色)', () => {
    for (const ch of ['zhijiang', 'yinyang', 'xiaodao', 'pang'] as const) {
      const w = createWorld({ ...base, character: ch, startAlt: true });
      expect(w.weapons.map((o) => o.id)).toEqual([altStart(ch)]);
    }
    // 按规则选的核心件开不了局的三件换掉（ALT_START_FIX），其余是另一主修的核心件
    for (const ch of ['zhijiang', 'yinyang', 'xiaodao'] as const) expect(altStart(ch), ch).toBe(ALT_START_FIX[ch]);
    expect(altStart('pang')).toBe(SCHOOL_CORE.array);
  });
});

describe('B：心法', () => {
  // 权重 ×XINFA_MUL 加保底（保底单独见 picks60.test.ts）
  it('同种子升级三选一里心法流派卡出现得更多', () => {
    const count = (xinfa?: Setup['xinfa']): number => {
      const school = SCHOOLS.wood;
      let n = 0;
      let seen = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const w = createWorld({ ...base, seed, ...(xinfa ? { xinfa } : {}) });
        // 直接记一次待选的升级，推一拍就弹三选一
        w.level = 2;
        w.pendingLevels = 1;
        step(w, 0, -1);
        if (w.phase !== 'choose') continue;
        seen++;
        for (const c of w.choices) if ((c.kind === 'weapon' && school.weapons.includes(c.id as WeaponId)) || (c.kind === 'passive' && school.passives.includes(c.id as PassiveId))) n++;
      }
      expect(seen).toBeGreaterThan(30);
      return n;
    };
    expect(XINFA_MUL).toBeGreaterThan(1);
    expect(count('wood')).toBeGreaterThan(count());
  });
});

describe('normalizeSetup', () => {
  it('删掉非法心法和非 true 的 startAlt', () => {
    expect(normalizeSetup({ ...base, xinfa: 'ghost' }).xinfa).toBeUndefined();
    expect(normalizeSetup({ ...base, xinfa: 'wood' }).xinfa).toBe('wood');
    expect(normalizeSetup({ ...base, startAlt: false }).startAlt).toBeUndefined();
    expect(normalizeSetup({ ...base, startAlt: true }).startAlt).toBe(true);
  });
  it('首领连战：起手配置删掉，心法照配装（没配装补「稳」那套）', () => {
    const s = normalizeSetup({ ...base, rush: true, startAlt: true, xinfa: 'wood' });
    expect(s.startAlt).toBeUndefined();
    expect(s.rushLoadout).toBeDefined();
    expect(s.xinfa).toBe(s.rushLoadout!.xinfa);
    expect(normalizeSetup({ ...base, rushLoadout: s.rushLoadout, rushHexes: ['fast'] }).rushLoadout).toBeUndefined();
  });
  it('主修表非空', () => {
    expect(mainSchools('xiaodao')).toContain('sword');
  });
});

describe('核心件', () => {
  it('SCHOOL_CORE 和机器人路线第一件一致', () => {
    for (const [school, core] of Object.entries(SCHOOL_CORE)) expect(ROUTES[school as keyof typeof ROUTES]![0], school).toBe(core);
  });
});
