import { describe, expect, it } from 'vitest';
import { Ev } from '../../src/core/events.ts';
import { newNightLog, nightItems, noteNight } from '../../src/view/ui/eventIcons.ts';

describe('今晚小结计数', () => {
  it('预告不算，开始才算；全 0 没有项', () => {
    const l = newNightLog();
    noteNight(l, Ev.MapEvent, 0, 'wind');
    noteNight(l, Ev.BloodMoon, 0);
    expect(nightItems(l)).toEqual([]);
    for (const a of [0, 1, 2]) noteNight(l, Ev.MapEvent, a, 'wind');
    noteNight(l, Ev.MapEvent, 1, 'wind');
    for (const a of [0, 1, 2]) noteNight(l, Ev.BloodMoon, a);
    noteNight(l, Ev.EliteRage, 0);
    noteNight(l, Ev.EliteRage, 0);
    expect(nightItems(l).map((i) => `${i.icon}${i.n}`)).toEqual(['风2', '月1', '怒2']);
  });
});
