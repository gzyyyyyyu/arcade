import { describe, expect, it } from 'vitest';
import { CURSES, CURSE_IDS, MAX_CURSES } from '../../src/content/meta.ts';
import { MAP_EVENTS } from '../../src/content/mapEvents.ts';
import { MAPS, MAP_IDS } from '../../src/content/maps.ts';
import { nightData } from '../../src/view/ui/codexNights.ts';

describe('图鉴夜事页', () => {
  const d = nightData();
  it('列出了全部地图事件，带地图名和图标', () => {
    for (const id of MAP_IDS) {
      const e = d.events.find((x) => x.name === MAP_EVENTS[id].name)!;
      expect(e).toBeTruthy();
      expect(e.map).toBe(MAPS[id].name);
      expect(e.icon.length).toBe(1);
    }
    expect(d.eventWhen).toContain('4、8、12');
  });
  it('列出了全部咒印和高危险档', () => {
    expect(d.curses.map((c) => c.name)).toEqual(CURSE_IDS.map((id) => CURSES[id].name));
    expect(d.curseNote).toContain('25%');
    expect(d.curseNote).toContain(String(MAX_CURSES));
    expect(d.nightmare.map((n) => n.name)).toEqual(['危险 5', '噩梦 1', '噩梦 2', '噩梦 3']);
    expect(d.nightmare.every((n) => n.items.length > 0)).toBe(true);
  });
});
