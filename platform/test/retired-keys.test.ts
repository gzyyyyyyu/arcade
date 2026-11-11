import { describe, expect, it } from 'vitest';
import { clearRetiredKeys, type KeyStore } from '../src/lib/retired-keys';

/** 最小的存储：只实现 clearRetiredKeys 用到的几样 */
function store(init: Record<string, string>): KeyStore & { keys: () => string[] } {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

describe('启动时清掉不再用的存储', () => {
  it('删 arcade.dailyStrip 和所有 arcade.trip.*，别的不动（连着几个要删的也不漏）', () => {
    const local = store({ 'arcade.trip.u1': '{}', 'arcade.trip.u2': '{}', 'arcade.sound': 'off', 'arcade.tripwire': 'x', 'kaipan.save': '1' });
    const session = store({ 'arcade.dailyStrip': '{}', 'arcade.enterFx': '1' });
    clearRetiredKeys(local, session);
    expect(local.keys()).toEqual(['arcade.sound', 'arcade.tripwire', 'kaipan.save']);
    expect(session.keys()).toEqual(['arcade.enterFx']);
  });
});
