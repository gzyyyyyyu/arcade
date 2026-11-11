import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailySetup, flashSetup, liveSetup, shortSetup, weeklySetup, type RunSetup, type Segment } from '../../src/core/index.ts';
import { botByName, playRun, useExt, useMarket } from '../../tools/bots.ts';
import { segmentIndex, loadSegment } from '../../tools/segments-disk.ts';

/**
 * 规则核心的整局指纹锁：同种子、同机器人，整局的事件流、每个月末的完整状态、终局状态逐个和 fixtures/fingerprint.json 比。
 * 拆分、重构 src/core/engine 之前先有它，改完指纹必须逐位不变；规则或数值真的改了才用 UPDATE_FINGERPRINT=1 重新生成并说明原因。
 */
const FIXTURE = 'tests/fixtures/fingerprint.json';

/** 确定性序列化：键排序，undefined / NaN / 无穷 / Map / Set 都有固定写法。 */
function canon(v: unknown): string {
  if (v === undefined) return '"~u"';
  if (typeof v === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? '"~-0"' : String(v)) : `"~${v}"`;
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (v instanceof Map) return `{"~map":${canon([...v.entries()])}}`;
  if (v instanceof Set) return `{"~set":${canon([...v.values()])}}`;
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(',')}}`;
}

const sha = (text: string): string => createHash('sha256').update(new TextEncoder().encode(text)).digest('hex').slice(0, 16);

interface Spec {
  id: string;
  seed: string;
  bot: string;
  setup: RunSetup | null;
  /** 行情段序号（行情段目录里的第几个）；null = 合成行情 */
  seg: number | null;
  ext: boolean;
}

const daily = dailySetup('2026-03-09');
const flash = flashSetup('2026-03-10');
const weekly = weeklySetup('2026-W44');

const SPECS: Spec[] = [
  // 合成行情：难度 × 机器人 × ext
  { id: 'syn-normal-d1', seed: 'fp-1', bot: 'normal', setup: null, seg: null, ext: false },
  { id: 'syn-normal-d1-ext', seed: 'fp-2', bot: 'normal', setup: null, seg: null, ext: true },
  { id: 'syn-smart-d1', seed: 'fp-3', bot: 'smart', setup: { persona: 'newbie', difficulty: 1 }, seg: null, ext: false },
  { id: 'syn-smart-d8-ext', seed: 'fp-4', bot: 'smart', setup: { difficulty: 8 }, seg: null, ext: true },
  { id: 'syn-normal-d8', seed: 'fp-5', bot: 'normal', setup: { difficulty: 8 }, seg: null, ext: false },
  { id: 'syn-normal-d4-items', seed: 'fp-6', bot: 'normal', setup: { difficulty: 4, items: ['double_buy', 'extra_slot'] }, seg: null, ext: true },
  { id: 'syn-chaser-d3', seed: 'fp-7', bot: 'chaser', setup: { difficulty: 3 }, seg: null, ext: false },
  { id: 'syn-random-d2', seed: 'fp-8', bot: 'random', setup: { difficulty: 2 }, seg: null, ext: true },
  { id: 'syn-gambler-d6', seed: 'fp-9', bot: 'gambler', setup: { difficulty: 6 }, seg: null, ext: true },
  { id: 'syn-shorter-d5', seed: 'fp-10', bot: 'shorter', setup: { difficulty: 5 }, seg: null, ext: true },
  { id: 'syn-ipo-only', seed: 'fp-11', bot: 'ipo-only-half', setup: { difficulty: 2 }, seg: null, ext: true },
  // 真实行情
  { id: 'real0-normal-d1', seed: 'fp-r1', bot: 'normal', setup: null, seg: 0, ext: false },
  { id: 'real0-smart-d8-ext', seed: 'fp-r2', bot: 'smart', setup: { difficulty: 8 }, seg: 0, ext: true },
  { id: 'real1-normal-d4-ext', seed: 'fp-r3', bot: 'normal', setup: { difficulty: 4 }, seg: 1, ext: true },
  { id: 'real1-smart-d2', seed: 'fp-r4', bot: 'smart', setup: { difficulty: 2 }, seg: 1, ext: false },
  { id: 'real2-smart-d6-ext', seed: 'fp-r5', bot: 'smart', setup: { difficulty: 6 }, seg: 2, ext: true },
  // 打新只在真实行情 + ext 下开，溢价只落在中签的格子上：只打新的机器人三档各跑一段，锁住申购、抽签、上市溢价
  { id: 'real0-ipo-only', seed: 'fp-i1', bot: 'ipo-only', setup: { difficulty: 3 }, seg: 0, ext: true },
  { id: 'real1-ipo-only-half', seed: 'fp-i2', bot: 'ipo-only-half', setup: { difficulty: 2 }, seg: 1, ext: true },
  { id: 'real2-ipo-only-heavy', seed: 'fp-i3', bot: 'ipo-only-heavy', setup: { difficulty: 5 }, seg: 2, ext: true },
  // 每日挑战、闪电盘、本周市场、短局、实盘（含杠杆）
  { id: 'daily', seed: daily.seed, bot: 'normal', setup: daily.setup, seg: 0, ext: true },
  { id: 'flash', seed: flash.seed, bot: 'smart', setup: flash.setup, seg: 1, ext: true },
  { id: 'weekly', seed: weekly.seed, bot: 'normal', setup: weekly.setup, seg: 2, ext: true },
  { id: 'short', seed: 'fp-s1', bot: 'normal', setup: shortSetup('newbie', 3), seg: null, ext: true },
  { id: 'live-small', seed: 'fp-l1', bot: 'smart', setup: liveSetup('small'), seg: 0, ext: true },
  { id: 'live-mid-gear', seed: 'fp-l2', bot: 'normal', setup: liveSetup('mid', 'newbie', 2), seg: 1, ext: true },
];

interface Print {
  id: string;
  phase: string;
  events: number;
  eventsHash: string;
  months: string[];
  final: string;
}

function run(spec: Spec, segs: Segment[]): Print {
  const seg = spec.seg === null ? null : (segs[spec.seg] as Segment);
  useMarket(seg ? () => seg : null);
  useExt(spec.ext);
  try {
    const evs: string[] = [];
    let events = 0;
    const months: string[] = [];
    let last = 0;
    let lastDay = -1;
    const final = playRun(spec.seed, botByName(spec.bot), spec.setup, (state, batch) => {
      for (const e of batch) {
        evs.push(canon(e));
        events++;
      }
      // 月份变了（含最后一步收盘）就记下这一刻的完整状态；playRun 原地改状态，必须当场算
      if (state.month !== last || state.phase === 'won' || state.phase === 'lost') {
        if (state.month !== last || state.dayIndex !== lastDay) months.push(`${state.month}:${sha(canon(state))}`);
        last = state.month;
      }
      lastDay = state.dayIndex;
    });
    return { id: spec.id, phase: final.phase, events, eventsHash: sha(evs.join('\n')), months, final: sha(canon(final)) };
  } finally {
    useMarket(null);
    useExt(false);
  }
}

describe('规则核心整局指纹（同种子同操作，逐位不变）', () => {
  const idx = segmentIndex().segments;
  const segs = [0, 1, 2].map((i) => loadSegment((idx[Math.floor((i * idx.length) / 3)] as { id: string }).id));
  const update = process.env.UPDATE_FINGERPRINT === '1';
  const stored: Record<string, Print> = !update && existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
  const fresh: Record<string, Print> = {};

  for (const spec of SPECS) {
    it(spec.id, () => {
      const p = run(spec, segs);
      fresh[spec.id] = p;
      if (update) return;
      expect(p.events, '事件数').toBeGreaterThan(0);
      expect(p).toEqual(stored[spec.id]);
    });
  }

  it('指纹和局数对得上', () => {
    if (update) {
      writeFileSync(FIXTURE, `${JSON.stringify(fresh, null, 1)}\n`);
      return;
    }
    expect(Object.keys(stored).sort()).toEqual(SPECS.map((s) => s.id).sort());
  });
});
