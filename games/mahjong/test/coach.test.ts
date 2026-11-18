/**
 * 推荐出牌（game/coach.ts 开在哪、ai/coach.ts 按什么打）：只开在单机娱乐新手和实盘小档；推荐的是这一家视图下普通玩家会打的那张，
 * 一定是能打的牌，同一个视图推荐同一张；模拟器的普通玩家和推荐用同一份参数（配平量的就是这个水平）。
 */
import { describe, expect, test } from 'vitest';
import { COACH_STYLE, discardOf, NORMAL_PLAYER } from '../src/ai/coach.ts';
import { AIS } from '../src/ai/index.ts';
import { fixedStyle } from '../src/ai/style.ts';
import { decideAs } from '../src/ai/xuezhan.ts';
import { sichuanXuezhan as XZ, view, type XzState } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { coachAllowed } from '../src/game/coach.ts';
import { PLAYER } from '../scripts/play.ts';
import { KEY } from './helpers.ts';

describe('推荐出牌开在哪', () => {
  test('娱乐只开新手；实盘只开小档', () => {
    expect(coachAllowed({ stakes: 'fun', level: 'easy' })).toBe(true);
    expect(coachAllowed({ stakes: 'fun' })).toBe(true);
    expect(coachAllowed({ stakes: 'fun', level: 'normal' })).toBe(false);
    expect(coachAllowed({ stakes: 'fun', level: 'hard' })).toBe(false);
    expect(coachAllowed({ stakes: 'small' })).toBe(true);
    for (const st of ['mid', 'big', 'lux'] as const) expect(coachAllowed({ stakes: st })).toBe(false);
  });
  test('每日挑战、擂台有榜单，不开', () => {
    expect(coachAllowed({ stakes: 'fun', level: 'easy', daily: '2026-11-18' })).toBe(false);
    expect(coachAllowed({ stakes: 'fun', level: 'easy', ladder: { mode: 'xz', table: 0 } })).toBe(false);
  });
});

describe('推荐按普通玩家的打法', () => {
  test('模拟器的普通玩家就是这一份参数，推荐只是不故意打错', () => {
    expect(PLAYER).toBe(NORMAL_PLAYER);
    expect(COACH_STYLE).toEqual({ ...fixedStyle(NORMAL_PLAYER), slip: 0 });
  });

  test('一整局里每次轮到打牌：推荐的牌能打、同一个视图推荐同一张', () => {
    let s = XZ.begin(KEY, XZ.defaults, ['ai', 'ai', 'ai', 'ai'], { share: 2_000, base: 80, personas: [0, 1, 2, 3], tunes: [0, 1, 2, 3].map((i) => ({ mood: 1_000 + i, soft: 0 })) }) as XzState;
    let checked = 0;
    for (let k = 0; k < 400 && !XZ.over(s); k++) {
      const act = XZ.actors(s);
      if (!act) break;
      const seat = act.seats[0]!;
      const v = view(s, seat);
      if (v.prompt?.discard && !v.prompt.claim) {
        const rec = discardOf(decideAs(v, COACH_STYLE));
        if (rec !== null) {
          expect(v.prompt.discard).toContain(rec);
          expect(discardOf(decideAs(view(s, seat), COACH_STYLE))).toBe(rec);
          checked++;
        }
      }
      s = XZ.apply(s, seat, XZ.auto(s, seat, AIS[XZ.id]!)) as XzState;
    }
    expect(checked).toBeGreaterThan(10);
  });

  test('不是打牌的一步不推荐', () => {
    expect(discardOf({ t: 'zimo' })).toBeNull();
    expect(discardOf({ t: 'kan', tile: 3 })).toBeNull();
    expect(discardOf({ t: 'discard', tile: 3 })).toBe(3);
  });
});
