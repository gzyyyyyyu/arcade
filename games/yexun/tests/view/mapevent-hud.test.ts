import { describe, expect, it } from 'vitest';
import { MAP_EVENT_AT, nextMapEvent } from '../../src/content/mapEvents.ts';

describe('地图事件 HUD 倒计时', () => {
  const setup = { mode: 'vigil', map: 'snow' as const };
  it('60 秒内出现、10 秒内变急、开始后收起、三次后不再出现', () => {
    const at = MAP_EVENT_AT[0]!;
    expect(nextMapEvent(0, setup)).toBeNull();
    expect(nextMapEvent(at - 1801, setup)).toBeNull();
    expect(nextMapEvent(at - 1800, setup)).toMatchObject({ kind: 'wind', left: 1800, urgent: false });
    expect(nextMapEvent(at - 300, setup)?.urgent).toBe(true);
    expect(nextMapEvent(at, setup)).toBeNull();
    expect(nextMapEvent(MAP_EVENT_AT[1]! - 100, setup)?.left).toBe(100);
    expect(nextMapEvent(MAP_EVENT_AT[2]!, setup)).toBeNull();
    expect(nextMapEvent(MAP_EVENT_AT[2]! + 5000, setup)).toBeNull();
  });
  it('夜探没有，实盘守夜照样有', () => {
    const t = MAP_EVENT_AT[0]! - 100;
    expect(nextMapEvent(t, { mode: 'raid', map: 'snow' })).toBeNull();
    expect(nextMapEvent(t, { ...setup, live: true })).not.toBeNull();
  });
});
