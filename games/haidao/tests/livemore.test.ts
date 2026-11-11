import { describe, expect, it } from 'vitest';
import { MAP_RULES } from '../src/core/index.ts';
import { mapLiveBp } from '../src/core/maplive.ts';
import {
  MAP_TIER_NOTE,
  escortLiveLine,
  liveRunBpOnExpire,
  liveRunKeep,
  netText,
  parseLiveRun,
  quotaText,
  returnPctText,
  type LiveRun,
} from '../src/view/livemore-logic.ts';

/** 护航和航线实盘的小逻辑：进度存取判断、跨天收航结算、结算文案 */
const DAY = '2026-11-09';
const start = (day = DAY): LiveRun => ({ day, tier: 'mid', state: MAP_RULES.startMap(MAP_RULES.routeOf(day)) });

describe('航线实盘进度', () => {
  it('同一天、没走完、档位对得上才留着；换天、走完、没进度、档位不同都不留', () => {
    const r = start();
    expect(liveRunKeep(r, DAY, 'mid')).toBe(true);
    expect(liveRunKeep(r, '2026-11-10', 'mid')).toBe(false);
    expect(liveRunKeep(r, DAY, 'big')).toBe(false);
    expect(liveRunKeep(null, DAY, 'mid')).toBe(false);
    expect(liveRunKeep({ day: DAY, tier: 'mid' }, DAY, 'mid')).toBe(false);
    expect(liveRunKeep({ ...r, state: MAP_RULES.goHome(r.state!) }, DAY, 'mid')).toBe(false);
  });

  it('跨天按当时已拿宝分收航结：0 宝分是 0 星的折算，进度丢了是 0', () => {
    const r = start();
    expect(liveRunBpOnExpire(r, 'mid')).toBe(mapLiveBp('mid', { stars: 0, pts: 0 }));
    const rich: LiveRun = { ...r, state: { ...r.state!, pts: 160 } };
    expect(liveRunBpOnExpire(rich, 'mid')).toBe(mapLiveBp('mid', MAP_RULES.mapFinal(MAP_RULES.goHome(rich.state!))));
    expect(liveRunBpOnExpire(rich, 'mid')).toBeGreaterThan(liveRunBpOnExpire(r, 'mid'));
    expect(liveRunBpOnExpire(null, 'mid')).toBe(0);
    expect(liveRunBpOnExpire(rich, 'small')).toBe(0);
  });

  it('本机记录读出来：坏数据和对不上日期的航线当没有；pending 只认整数', () => {
    const r = start();
    expect(parseLiveRun(JSON.stringify(r))?.state?.route.day).toBe(DAY);
    expect(parseLiveRun(null)).toBeNull();
    expect(parseLiveRun('{坏')).toBeNull();
    expect(parseLiveRun(JSON.stringify({ day: DAY, tier: 'huge' }))).toBeNull();
    expect(parseLiveRun(JSON.stringify({ ...r, day: '2026-11-08' }))?.state).toBeUndefined();
    expect(parseLiveRun(JSON.stringify({ ...r, pending: { node: 1, rest: 0 } }))?.pending).toEqual({ node: 1, rest: 0 });
    expect(parseLiveRun(JSON.stringify({ ...r, pending: { node: 'x', rest: 0 } }))?.pending).toBeUndefined();
  });
});

describe('实盘文案', () => {
  it('结算：拿回几成、筹码 ±N、护航一行', () => {
    expect(returnPctText(9500)).toBe('拿回带入的 95%');
    expect(netText(3000, 2000)).toBe('这局筹码 +1,000');
    expect(netText(500, 2000)).toBe('这局筹码 −1,500');
    expect(netText(2000, 2000)).toBe('这局筹码 +0');
    expect(escortLiveLine({ hullPct: 62, cells: 14, total: 20 })).toBe('商船剩余血量 62% · 走了 14/20 格');
  });

  it('今天还剩几场：满了写明每天几场、明天再来，不写"不够"', () => {
    expect(quotaText('escort', 3, 4)).toEqual({ text: '今天还能护 3 场（每天 4 场）', full: false });
    expect(quotaText('escort', 0, 4)).toEqual({ text: '今天的护航实盘打完了（每天 4 场），明天再来', full: true });
    expect(quotaText('map', 1, 1).full).toBe(false);
    expect(quotaText('map', 0, 1)).toEqual({ text: '今天的航线实盘打完了（每天 1 趟），明天再来', full: true });
    for (const s of [MAP_TIER_NOTE, quotaText('map', 0, 1).text, quotaText('escort', 0, 4).text]) expect(s).not.toMatch(/不够|余额不足/);
  });
});
