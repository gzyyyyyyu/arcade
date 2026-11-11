/** 过场条里不碰 DOM 的部分（view/cutin-spec.ts）：时长表、出手方向、配色档、横幅转种类 */
import { describe, expect, test } from 'vitest';
import {
  CUTIN_KINDS,
  cutinFrom,
  cutinHeight,
  cutinKindOfBanner,
  cutinMs,
  cutinTier,
  cutinStreakFont,
  cutinStreakHeight,
  cutinTop,
  cutinWord,
  streakParticles,
  streakTier,
  streakWord,
} from '../src/view/cutin-spec.ts';

describe('过场条', () => {
  test('时长：碰吃 500、杠立直 650、胡自摸 800；快速档减半；减少动态效果统一短', () => {
    expect(CUTIN_KINDS.map((k) => cutinMs(k, false))).toEqual([500, 500, 650, 800, 800, 650]);
    expect(CUTIN_KINDS.map((k) => cutinMs(k, true))).toEqual([250, 250, 325, 400, 400, 325]);
    expect(cutinMs('hu', false, true)).toBe(600);
    expect(cutinMs('hu', true, true)).toBe(300);
  });
  test('方向：我和上家从左进，下家和对家从右进；每个座位都有位置，我的那条不压到手牌区', () => {
    expect([0, 1, 2, 3].map(cutinFrom)).toEqual(['left', 'right', 'right', 'left']);
    expect([0, 1, 2, 3].map(cutinTop).every((t) => t >= 0 && t <= 60)).toBe(true);
  });
  test('配色档', () => {
    expect(cutinTier('zimo')).toBe('gold');
    expect(cutinTier('hu')).toBe('gold');
    expect(cutinTier('kan')).toBe('redgold');
    expect(cutinTier('pon')).toBe('jade');
    expect(cutinTier('chi')).toBe('jade');
    expect(cutinTier('riichi')).toBe('blue');
  });
  test('高度：不超过画面 22%（有下限）、不超过 150', () => {
    expect(cutinHeight(400)).toBe(88);
    expect(cutinHeight(1200)).toBe(150);
    expect(cutinHeight(100)).toBe(48);
  });
  test('文字和横幅转种类', () => {
    expect(cutinWord('自摸！')).toBe('自摸');
    expect(cutinWord('一炮双响！')).toBe('一炮双响');
    expect(cutinKindOfBanner('碰！', 'pon')).toBe('pon');
    expect(cutinKindOfBanner('吃！', 'pon')).toBe('chi');
    expect(cutinKindOfBanner('双立直！', 'riichi')).toBe('riichi');
    expect(cutinKindOfBanner('顺时针', 'swap')).toBeNull();
    expect(cutinKindOfBanner('流局')).toBeNull();
  });

  test('血流成河连胡：字、档、时长、高度、粒子逐次加码', () => {
    expect([1, 2, 3, 4, 7].map(streakTier)).toEqual([0, 1, 2, 3, 3]);
    expect([1, 2, 3, 4, 6].map(streakWord)).toEqual([null, '连胡', '三连胡', '血流成河×4', '血流成河×6']);
    const ms = [1, 2, 3, 4].map((n) => cutinMs('hu', false, false, n));
    expect(ms).toEqual([800, 1000, 1150, 1300]);
    // 减少动态效果只淡入淡出，不因连胡拖长
    expect(cutinMs('hu', false, true, 4)).toBe(600);
    const hs = [1, 2, 3, 4].map((n) => cutinStreakHeight(500, n));
    expect(hs.every((h, i) => i === 0 || h > hs[i - 1]!)).toBe(true);
    expect(cutinStreakHeight(300, 4)).toBeLessThanOrEqual(108);
    const ps = [1, 2, 3, 4].map(streakParticles);
    expect(ps.every((p, i) => i === 0 || p > ps[i - 1]!)).toBe(true);
    // 字号：不超过带子高，窄屏上长字不出界
    expect(cutinStreakFont(140, 6, 4, 360)).toBeLessThanOrEqual(Math.floor((360 * 0.62) / 6));
    expect(cutinStreakFont(100, 2, 2, 1000)).toBeGreaterThan(cutinStreakFont(100, 3, 3, 1000));
  });
});
