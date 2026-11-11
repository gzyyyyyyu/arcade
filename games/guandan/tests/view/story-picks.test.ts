import { describe, expect, it } from 'vitest';
import { storyPicks, type Highlight } from '../../src/view/guandan/highlights.ts';
import type { Title } from '../../src/variants/guandan/stake/titles.ts';

const maniac = (seat: number): Title => ({ id: 'bomb_maniac', seat, why: '炸了 3 次' });
const partner: Title = { id: 'best_partner', seat: 3, why: '一起双下对面', pair: true };
const scapegoat: Title = { id: 'scapegoat', seat: 0, why: '末游，这副输在这儿' };

describe('storyPicks 故事框去重', () => {
  it('同一人的炸上炸、炸了 N 次、炸弹狂魔只留炸上炸', () => {
    const hl: Highlight[] = [{ kind: 'bombOnBomb', seat: 3 }, { kind: 'bombs3', seat: 3, n: 3 }];
    const r = storyPicks(hl, [maniac(3), partner, scapegoat], false);
    expect(r.hl.map((h) => h.kind)).toEqual(['bombOnBomb']);
    expect(r.titles.map((t) => t.id)).toEqual(['best_partner', 'scapegoat']);
    expect(r.hl.length + r.titles.length).toBeLessThanOrEqual(3);
  });

  it('没有炸上炸时，称号带次数，名场面的"炸了 N 次"去掉', () => {
    const r = storyPicks([{ kind: 'bombs3', seat: 3, n: 3 }], [maniac(3)], false);
    expect(r.hl).toEqual([]);
    expect(r.titles.map((t) => t.id)).toEqual(['bomb_maniac']);
  });

  it('不同人的炸弹事不互相去掉', () => {
    const r = storyPicks([{ kind: 'bombOnBomb', seat: 1 }], [maniac(3)], false);
    expect(r.hl).toHaveLength(1);
    expect(r.titles).toHaveLength(1);
  });

  it('双下：落后双下留名场面，否则最佳搭档压过光写双下', () => {
    const a = storyPicks([{ kind: 'comeback', seat: 0, n: 3 }], [partner], false);
    expect(a.hl).toHaveLength(1);
    expect(a.titles).toEqual([]);
    const b = storyPicks([{ kind: 'doubleDown', seat: 0 }], [partner], false);
    expect(b.hl).toEqual([]);
    expect(b.titles).toHaveLength(1);
  });

  it('电脑上总共最多 3 行，手机名场面、称号各最多 1 条', () => {
    const hl: Highlight[] = [{ kind: 'jokerBomb', seat: 1 }, { kind: 'quick', seat: 0, n: 5 }];
    const ts: Title[] = [partner, scapegoat];
    const pc = storyPicks(hl, ts, false);
    expect(pc.hl.length + pc.titles.length).toBe(3);
    const ph = storyPicks(hl, ts, true);
    expect(ph.hl).toHaveLength(1);
    expect(ph.titles).toHaveLength(1);
  });
});
