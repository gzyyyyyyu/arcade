/**
 * 分享卡（结算页"分享这一夜"，DESIGN.md 14）：只交数据，画法和系统分享都在 kit 的 `arcade-kit/share`（prepareShare），不上传。
 * 这里不 import kit：形状和 kit 的 ShareCard 一致，接线时直接把返回值交给 prepareShare。
 * 卡上只放战绩和咒印，不放自由文字。
 */
import { fmtClock } from '../content/clock.ts';
import { CURSES } from '../content/meta.ts';
import type { RunSummary } from './types.ts';
import { rushClock } from './rush.ts';
import { WEEKLIES } from '../content/weekly.ts';

export interface ShareCardData {
  game: string;
  title: string;
  big: { value: string; label: string };
  stats?: readonly { label: string; value: string }[];
  line?: string;
  accent: string;
  player?: { name: string; badge?: string };
  date?: Date;
}

const n = (x: number): string => x.toLocaleString('zh-CN');

function shareTitle(r: RunSummary): string {
  const s = r.setup;
  if (r.daily) return s.mode === 'raid' ? '每日夜探' : '每日守夜';
  // 本周夜事是固定危险档的挑战局，卡上写"守夜 · 危险2"看不出来，和结算页那行一样写这周的事件
  if (r.weekly && s.weekly) return `本周夜事 · ${WEEKLIES[s.weekly].name}`;
  if (s.mode === 'raid') return `夜探 · 危险${s.danger}`;
  return `${s.endless ? '无尽' : '守夜'} · ${s.danger >= 6 ? `噩梦${s.danger - 5}` : `危险${s.danger}`}`;
}

export function buildShareCard(r: RunSummary, player?: { name: string; badge?: string }): ShareCardData {
  // 首领连战（每日或自由）：大字写「天亮」或 N/M，下面写用时；自由连战写危险档
  if (r.rush) {
    const x = r.rush;
    return {
      game: '夜巡',
      title: r.daily ? '每日连战' : `自由连战 · 危险${r.setup.danger}`,
      big: x.cleared ? { value: '天亮', label: `${x.total} 只首领 · 用时 ${rushClock(x.ticks)}` } : { value: `${x.down}/${x.total}`, label: '连战' },
      stats: [
        { label: '连战', value: `${x.down}/${x.total}` },
        { label: '用时', value: rushClock(x.ticks) },
        { label: '斩', value: n(r.kills) },
      ],
      line: r.build?.slice(0, 3).join(' · ') ?? '',
      accent: '#6b2c2c',
      ...(player ? { player } : {}),
    };
  }
  const raid = r.setup.mode === 'raid';
  const big = raid
    ? { value: n(r.loot), label: r.won || r.loot > 0 ? '带出铜钱' : '没能撤出' }
    : r.won
      ? { value: '天亮', label: `守了 ${fmtClock(r.seconds)}` }
      : { value: fmtClock(r.seconds), label: '撑了' };
  const stats = [
    { label: '斩', value: n(r.kills) },
    { label: '等级', value: `${r.level}` },
    { label: raid ? '用时' : '铜钱', value: raid ? fmtClock(r.seconds) : n(r.coins) },
  ];
  const parts: string[] = [];
  if (r.setup.curses?.length) parts.push(`咒印：${r.setup.curses.map((c) => CURSES[c].label).join('、')}`);
  if (r.bossKilled) parts.push('斩了尸王');
  else if (r.build?.length) parts.push(r.build.slice(0, 3).join(' · '));
  return { game: '夜巡', title: shareTitle(r), big, stats, line: parts.join('；'), accent: '#2c3a6b', ...(player ? { player } : {}) };
}
