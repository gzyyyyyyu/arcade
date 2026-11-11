import { describe, expect, it } from 'vitest';
import { rateText, statsTabs } from '../src/pages/stats/stats-logic.ts';
import type { CareerView } from '../src/api.ts';

const c = (o: Partial<CareerView> = {}): CareerView => ({ n: 1, net: 0, wnet: 0, rounds: 0, wins: 0, best: 0, titles: [], max: {}, sum: {}, ...o }) as CareerView;
const order = (id: string) => ['kaipan', 'texas', 'mahjong'].indexOf(id);

describe('战绩页页签', () => {
  it('总览在最前，其后是玩过的游戏，按大厅顺序', () => {
    const tabs = statsTabs({ mahjong: c(), kaipan: c(), texas: c() }, order);
    expect(tabs.map((t) => t.id)).toEqual(['all', 'kaipan', 'texas', 'mahjong']);
    expect(tabs[0]!.game).toBeNull();
  });
  it('没玩过任何游戏只有总览', () => {
    expect(statsTabs({}, order).map((t) => t.id)).toEqual(['all']);
  });
  it('胜率四舍五入，没打过是破折号', () => {
    expect(rateText(c({ rounds: 1000, wins: 213 }))).toBe('21%');
    expect(rateText(c({ rounds: 25, wins: 1 }))).toBe('4%');
    expect(rateText(c())).toBe('—');
  });
});
