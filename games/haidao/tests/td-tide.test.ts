import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RULES_VERSION, TD2_ENEMIES, TD2_LOSE_AT, TIDE_MAPS, beijingIsoWeek, createTd, runTdBot, stepTd, tdFingerprint, tideBoardId, tideDecode, tideLine, tideMap, tidePick, tideScore, tideSeed, tideRules, tideSetup, weekLabel,
} from '../src/core/index.ts';
import type { IsoWeek, TdEnemyKind, TdSetup, TdWave } from '../src/core/index.ts';
import { TIDE_BOSS_EVERY, tideBudget, tideHpPct, tideWave } from '../src/content/tdtide.ts';
import { readTide, recordTide, submitTide, tideBest } from '../src/net/tide.ts';
import { BUILDINGS } from '../src/content/index.ts';
import { tdRoute } from '../src/core/tdquery.ts';

/** 平台 platform/src/weekly.ts 的 beijingIsoWeek 原样抄一份（用 Date 求年份）：核心里的整数算法必须和它逐个时刻对齐 */
function platformWeek(ms: number): string {
  const DAY = 24 * 60 * 60 * 1000;
  const day = Math.floor((ms + 8 * 60 * 60 * 1000) / DAY);
  const thursday = day - ((day + 3) % 7) + 3;
  const year = new Date(thursday * DAY).getUTCFullYear();
  const jan1 = Math.floor(Date.UTC(year, 0, 1) / DAY);
  return `${year}-W${String(Math.floor((thursday - jan1) / 7) + 1).padStart(2, '0')}`;
}
const bj = (y: number, m: number, d: number, h = 0, mi = 0): number => Date.UTC(y, m - 1, d, h - 8, mi);

describe('北京时间 ISO 周', () => {
  it('年底年初：按周四算年份', () => {
    expect(weekLabel(beijingIsoWeek(bj(2026, 12, 28)))).toBe('2026-W53'); // 2026 年有 53 周
    expect(weekLabel(beijingIsoWeek(bj(2027, 1, 1)))).toBe('2026-W53');
    expect(weekLabel(beijingIsoWeek(bj(2027, 1, 3, 23, 59)))).toBe('2026-W53');
    expect(weekLabel(beijingIsoWeek(bj(2027, 1, 4)))).toBe('2027-W01');
    expect(weekLabel(beijingIsoWeek(bj(2024, 12, 30)))).toBe('2025-W01'); // 周一在 2024 年，但周四在 2025 年
    expect(weekLabel(beijingIsoWeek(bj(2021, 1, 3)))).toBe('2020-W53');
    expect(weekLabel(beijingIsoWeek(bj(2021, 1, 4)))).toBe('2021-W01');
    expect(weekLabel(beijingIsoWeek(bj(2026, 1, 1)))).toBe('2026-W01');
  });
  it('周一北京时间 0 点换周（差一毫秒还是上一周）', () => {
    const mon = bj(2026, 10, 26);
    expect(weekLabel(beijingIsoWeek(mon))).toBe('2026-W44');
    expect(weekLabel(beijingIsoWeek(mon - 1))).toBe('2026-W43');
    expect(beijingIsoWeek(mon)).toEqual({ year: 2026, week: 44 });
  });
  it('2019–2034 每 3 小时一个时刻，都和平台的算法一样', () => {
    for (let t = bj(2019, 1, 1); t < bj(2034, 1, 1); t += 3 * 3600 * 1000) {
      const w = beijingIsoWeek(t);
      if (weekLabel(w) !== platformWeek(t)) throw new Error(`${t}: ${weekLabel(w)} != ${platformWeek(t)}`);
    }
  }, 60_000);
  it('榜名：week-<YYYY>-W<ww>-tide', () => {
    expect(tideBoardId({ year: 2026, week: 44 })).toBe('week-2026-W44-tide');
    expect(tideBoardId({ year: 2027, week: 3 })).toBe('week-2027-W03-tide');
  });
});

describe('周种子和图', () => {
  const weeks: IsoWeek[] = Array.from({ length: 60 }, (_, i) => ({ year: 2026 + Math.floor(i / 52), week: (i % 52) + 1 }));
  it('同一周同一个种子和同一张图，不同周种子不同', () => {
    const a = { year: 2026, week: 44 };
    expect(tideSeed(a)).toBe(tideSeed({ year: 2026, week: 44 }));
    expect(tideSeed(a)).not.toBe(tideSeed({ year: 2026, week: 45 }));
    expect(tidePick(a)).toEqual(tidePick({ year: 2026, week: 44 }));
    expect(tideMap(a)).toEqual(tideMap({ year: 2026, week: 44 }));
  });
  it('一年里四张图都会轮到，左右两种朝向都有', () => {
    const picks = weeks.map(tidePick);
    expect(new Set(picks.map((p) => p.map)).size).toBe(TIDE_MAPS.length);
    expect(picks.some((p) => p.mirror)).toBe(true);
    expect(picks.some((p) => !p.mirror)).toBe(true);
    expect(TIDE_MAPS.length).toBeGreaterThanOrEqual(4);
  });
  it('每张图每种朝向：塔位 / 火药桶 / 障碍都摆得下，每条路都走得到宝藏箱，建筑不重叠', () => {
    // 找每种（图, 镜像）对应的周
    const seen = new Set<string>();
    for (const w of weeks) {
      const p = tidePick(w);
      const key = `${p.map}-${p.mirror}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const setup = tideSetup(w);
      const m = tideMap(w);
      const s = createTd(setup);
      expect(s.slots.length, key).toBe(m.slots.length);
      expect(s.kegs.length, key).toBe(m.kegs.length);
      expect(s.blocks.length, key).toBe(m.obstacles.length);
      for (const l of [...m.lanes, m.tide]) expect(tdRoute(s, l.x, l.y).length, `${key} ${l.x},${l.y}`).toBeGreaterThan(5);
      const used = new Set<string>();
      for (const b of setup.layout) {
        const n = BUILDINGS[b.kind].size;
        for (let dx = 0; dx < n; dx++) for (let dy = 0; dy < n; dy++) {
          const k = `${b.x + dx},${b.y + dy}`;
          expect(used.has(k), `${key} 重叠 ${b.kind} ${k}`).toBe(false);
          used.add(k);
          expect(b.x + dx >= 0 && b.y + dy >= 0 && b.x + dx < 22 && b.y + dy < 22, `${key} 出岛 ${b.kind}`).toBe(true);
        }
      }
    }
    expect(seen.size).toBe(TIDE_MAPS.length * 2);
  });
  it('常驻塔、英雄等级固定，不随玩家变', () => {
    const s = tideSetup({ year: 2026, week: 44 });
    expect(s.hero).toBe(5);
    expect(s.rules).toBe(tideRules({ year: 2026, week: 44 }));
    expect(s.level.endless).toBeTypeOf('function');
  });
});

describe('波次越来越难', () => {
  const SEED = tideSeed({ year: 2026, week: 44 });
  const wave = (w: number): TdWave => tideWave(w, SEED, 2, true);
  const threat = (w: number): number => {
    const wv = wave(w);
    let sum = 0;
    for (const g of wv.groups) {
      sum += g.n * TD2_ENEMIES[g.enemy].hp * ((wv.hpPct ?? 100) / 100);
    }
    return sum;
  };
  it('确定性：同一个波数、种子、路数生成一样的波', () => {
    for (let w = 0; w < 60; w++) expect(tideWave(w, SEED, 2, true)).toEqual(tideWave(w, SEED, 2, true));
    expect(tideWave(10, SEED, 2, true)).not.toEqual(tideWave(10, SEED + 1, 2, true));
  });
  it('预算和血量百分比随波数单调往上', () => {
    for (let w = 1; w < 80; w++) {
      expect(tideBudget(w)).toBeGreaterThan(tideBudget(w - 1));
      expect(tideHpPct(w)).toBeGreaterThan(tideHpPct(w - 1));
    }
    expect(tideHpPct(0)).toBe(100);
  });
  it('总威胁（敌人等效血量）每 8 波一段，段段往上（每段含一个首领波）；第 40 波是第 0 波的 20 倍以上', () => {
    const seg = (a: number): number => Array.from({ length: 8 }, (_, i) => threat(a + i)).reduce((x, y) => x + y, 0);
    for (const seed of [SEED, SEED + 1, SEED + 2]) {
      const th = (w: number): number => {
        const wv = tideWave(w, seed, 2, true);
        return wv.groups.reduce((sum, g) => sum + g.n * TD2_ENEMIES[g.enemy].hp * ((wv.hpPct ?? 100) / 100), 0);
      };
      const s8 = (a: number): number => Array.from({ length: 8 }, (_, i) => th(a + i)).reduce((x, y) => x + y, 0);
      for (let a = 8; a < 64; a += 8) expect(s8(a), `种子 ${seed} 波 ${a}`).toBeGreaterThan(s8(a - 8));
      expect(th(40)).toBeGreaterThan(th(0) * 20);
    }
    void seg;
  });
  it('敌人种类逐步解锁：前两波只有水手，铁甲第 3 波、小艇第 5 波、雾船第 6 波、鹦鹉第 7 波、工兵第 9 波才会出现', () => {
    const first = new Map<TdEnemyKind, number>();
    for (let w = 0; w < 80; w++) for (const g of wave(w).groups) if (!first.has(g.enemy)) first.set(g.enemy, w);
    expect(first.get('sailor')).toBe(0);
    expect([...first.entries()].filter(([k]) => k !== 'sailor' && k !== 'captain').every(([, w]) => w >= 2)).toBe(true);
    expect(first.get('ironclad')).toBe(2);
    expect(first.get('skiff')).toBeGreaterThanOrEqual(4);
    expect(first.get('fog')).toBeGreaterThanOrEqual(5);
    expect(first.get('parrot')).toBeGreaterThanOrEqual(6);
    expect(first.get('sapper')).toBeGreaterThanOrEqual(8);
    for (const k of ['ironclad', 'skiff', 'fog', 'parrot', 'sapper', 'captain'] as const) expect(first.has(k), k).toBe(true);
  });
  it('每 8 波一个首领波，只有首领波有船长；前三波只走 0、1 号路，落潮路（下标 = 路数）后面才会用到', () => {
    for (let w = 0; w < 60; w++) {
      const isBoss = w % TIDE_BOSS_EVERY === TIDE_BOSS_EVERY - 1;
      expect(wave(w).boss === true, `波 ${w}`).toBe(isBoss);
      expect(wave(w).groups.some((g) => g.enemy === 'captain'), `波 ${w}`).toBe(isBoss);
    }
    for (let w = 0; w < 3; w++) expect(wave(w).groups.every((g) => g.lane <= 1)).toBe(true);
    const laneIdx = new Set<number>();
    for (let w = 3; w < 80; w++) for (const g of wave(w).groups) laneIdx.add(g.lane);
    expect([...laneIdx].sort()).toEqual([0, 1, 2]);
    // 鹦鹉是飞的，不走落潮路
    for (let w = 0; w < 80; w++) for (const g of wave(w).groups) if (g.enemy === 'parrot') expect(g.lane).toBeLessThan(2);
  });
});

describe('大潮无尽一局', () => {
  const week: IsoWeek = { year: 2026, week: 44 };
  const play = (kind: 'novice' | 'normal', seed: number) => {
    const base = tideSetup(week);
    const setup: TdSetup = { ...base, seed, rules: RULES_VERSION };
    return runTdBot(setup, kind);
  };
  it('波次开局补到前几波，开一波补一波，不会到头', () => {
    const s = createTd(tideSetup(week));
    expect(s.level.waves.length).toBeGreaterThanOrEqual(6);
    s.next = 0;
    let guard = 0;
    while (s.wave < 12 && guard++ < 100000) {
      stepTd(s, []);
      if (s.over) break;
      expect(s.next).toBeGreaterThanOrEqual(0);
    }
    expect(s.level.waves.length).toBeGreaterThan(s.wave);
  });
  it('丢到 TD2_LOSE_AT 枚就结束；结果带击退数；两次同种子一局逐位一样', () => {
    const a = play('normal', 3);
    const b = play('normal', 3);
    expect(a.result.over).toBe(true);
    expect(a.result.lost).toBe(TD2_LOSE_AT);
    expect(a.result.stars).toBe(0);
    expect(a.result.waves).toBeGreaterThanOrEqual(5);
    expect(a.result.kills).toBeGreaterThan(50);
    expect(tdFingerprint(a.state)).toBe(tdFingerprint(b.state));
    expect(a.result.waves).toBe(b.result.waves);
    // 普通机器人的波数和得分
    expect(tideScore(a.result.waves, a.result.kills ?? 0)).toBe(a.result.waves * 10000 + Math.min(9999, a.result.kills ?? 0));
  }, 60_000);
  it('普通机器人比小白撑得久', () => {
    let n = 0;
    let p = 0;
    for (let seed = 1; seed <= 4; seed++) {
      n += play('novice', seed).result.waves;
      p += play('normal', seed).result.waves;
    }
    expect(p).toBeGreaterThan(n);
  }, 120_000);
});

describe('得分编码', () => {
  it('波数 × 10000 + 击退数（封顶 9999）', () => {
    expect(tideScore(18, 412)).toBe(180412);
    expect(tideScore(3, 12000)).toBe(39999);
    expect(tideScore(0, 0)).toBe(0);
    expect(tideScore(-1, -5)).toBe(0);
    expect(tideDecode(180412)).toEqual({ waves: 18, kills: 412 });
    expect(tideDecode(tideScore(25, 99999))).toEqual({ waves: 25, kills: 9999 });
    expect(tideLine(180412)).toBe('撑过 18 波 · 击退 412');
  });
  it('public/weekly.json 的 fields 按平台规则拆出同样的两个数', async () => {
    const { readFileSync } = await import('node:fs');
    const j = JSON.parse(readFileSync(new URL('../public/weekly.json', import.meta.url), 'utf8')) as { boards: { tide: { score: Array<{ fields: Record<string, [number, number | null]>; text: string }> } } };
    const rule = j.boards.tide.score[0]!;
    expect(rule.text).toBe('撑过 {w} 波 · 击退 {k}');
    const field = (name: string, score: number): number => {
      const [div, mod] = rule.fields[name]!;
      const v = Math.floor(score / div);
      return mod === null ? v : v % mod;
    };
    const sc = tideScore(21, 733);
    expect(field('w', sc)).toBe(21);
    expect(field('k', sc)).toBe(733);
  });
});

describe('交分和本机记录', () => {
  const store = new Map<string, string>();
  const stub = (cookie: string, fetchImpl?: (url: string, init: RequestInit) => Promise<Response>): ReturnType<typeof vi.fn> => {
    store.clear();
    vi.stubGlobal('document', { cookie });
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    const f = vi.fn(fetchImpl ?? (async () => new Response('{}')));
    vi.stubGlobal('fetch', f);
    return f;
  };
  afterEach(() => vi.unstubAllGlobals());
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('请求体和头：同域 POST /api/scores，带 X-Arcade 和同源凭证', async () => {
    const f = stub('__Host-arcade_li=1', async () => json(200, { best: 180412, improved: true }));
    const r = await submitTide('week-2026-W44-tide', 180412);
    expect(r).toEqual({ state: 'ok', best: 180412, improved: true });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/scores');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'X-Arcade': '1' });
    expect(JSON.parse(init.body as string)).toEqual({ gameId: 'haidao', boardId: 'week-2026-W44-tide', score: 180412 });
  });
  it('没刷新纪录：improved 为 false，best 是榜上原来的', async () => {
    stub('__Host-arcade_li=1', async () => json(200, { best: 200000, improved: false }));
    expect(await submitTide('week-2026-W44-tide', 100)).toEqual({ state: 'ok', best: 200000, improved: false });
  });
  it('没登录：不发请求', async () => {
    const f = stub('');
    expect(await submitTide('week-2026-W44-tide', 100)).toEqual({ state: 'skip' });
    expect(f).not.toHaveBeenCalled();
  });
  it('单独部署（501、404）、没登录（401）、过期周（422）、网断了：静默跳过', async () => {
    for (const code of [501, 404, 401, 422, 400, 409]) {
      stub('__Host-arcade_li=1', async () => json(code, { error: 'x' }));
      expect(await submitTide('week-2026-W44-tide', 100), String(code)).toEqual({ state: 'skip' });
    }
    stub('__Host-arcade_li=1', async () => {
      throw new Error('offline');
    });
    expect(await submitTide('week-2026-W44-tide', 100)).toEqual({ state: 'skip' });
    stub('__Host-arcade_li=1', async () => new Response('<html>', { status: 200 }));
    expect(await submitTide('week-2026-W44-tide', 100)).toEqual({ state: 'skip' });
  });
  it('429、503：榜单忙', async () => {
    for (const code of [429, 503]) {
      stub('__Host-arcade_li=1', async () => json(code, { error: 'busy' }));
      expect(await submitTide('week-2026-W44-tide', 100), String(code)).toEqual({ state: 'busy' });
    }
  });
  it('本机 haidao.tide：只记这周最高，换周重新算', () => {
    stub('');
    expect(tideBest('2026-W44')).toBe(0);
    expect(recordTide('2026-W44', 120300)).toEqual({ best: 120300, improved: true });
    expect(recordTide('2026-W44', 90000)).toEqual({ best: 120300, improved: false });
    expect(recordTide('2026-W44', 120300)).toEqual({ best: 120300, improved: false });
    expect(recordTide('2026-W44', 130001)).toEqual({ best: 130001, improved: true });
    expect(JSON.parse(store.get('haidao.tide')!)).toEqual({ week: '2026-W44', best: 130001 });
    expect(tideBest('2026-W45')).toBe(0);
    expect(recordTide('2026-W45', 5)).toEqual({ best: 5, improved: true });
    expect(readTide()).toEqual({ week: '2026-W45', best: 5 });
    store.set('haidao.tide', '坏的');
    expect(readTide()).toBeNull();
  });
});

describe('大潮按周定规则版本', () => {
  it('英雄自己守（规则 14）从 2026 年第 46 周换榜才进大潮，之前的周钉在 13，周中不换', () => {
    expect(tideRules({ year: 2026, week: 45 })).toBe(13);
    expect(tideSetup({ year: 2026, week: 45 }).rules).toBe(13);
    expect(tideRules({ year: 2025, week: 52 })).toBe(13);
    expect(tideRules({ year: 2026, week: 46 })).toBe(RULES_VERSION);
    expect(tideSetup({ year: 2027, week: 1 }).rules).toBe(RULES_VERSION);
  });
});
