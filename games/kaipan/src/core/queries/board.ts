import { friendById, stockById, themeById } from '../content/index.ts';
import { rngFor } from '../rng.ts';
import type { DayReport, GameState, ThemeId } from '../types.ts';

/**
 * 龙虎榜：一天收盘后涨得最多、跌得最多的各 3 只（只读已发生的收盘报告），
 * 带上当天谁在群里喊对了它所在的风口；有人上榜时挑一句他的得意话。
 */
export interface BoardEntry {
  stockId: string;
  name: string;
  theme: ThemeId;
  themeName: string;
  /** 当天涨跌（pp，已按涨跌停截断） */
  move: number;
  limit: boolean;
  /** 当天说对它这个风口方向的群友名 */
  callers: string[];
}

export interface DragonBoard {
  up: BoardEntry[];
  down: BoardEntry[];
  /** 上榜群友的一句话（没人喊对为 null） */
  brag: { name: string; text: string } | null;
}

const BRAGS: readonly string[] = ['我说什么来着？', '截图留好，以后叫我老师。', '这波我是看出来了。', '早说了，你们不听。', '运气，纯属运气（得意）。'];
const SIZE = 3;

export function dragonBoard(s: Readonly<GameState>, report: Readonly<DayReport> | null = s.lastDay): DragonBoard | null {
  if (!report || report.stocks.length === 0) return null;
  const judges = [...report.messages, ...(report.intel ?? [])].filter((j) => j.hit && j.claim !== 'flat');
  const entry = (m: DayReport['stocks'][number]): BoardEntry => {
    const def = stockById(m.id);
    const dir = m.move > 0 ? 'up' : 'down';
    const callers = [...new Set(judges.filter((j) => j.theme === def.theme && j.claim === dir).map((j) => friendById(j.friendId).name))];
    return { stockId: m.id, name: def.name, theme: def.theme, themeName: themeById(def.theme).name, move: m.move, limit: m.limitUp || m.limitDown, callers };
  };
  // 同样涨跌按股票池顺序（报告里的顺序），保证同一天同一张榜
  const moved = report.stocks.filter((m) => m.move !== 0);
  const up = moved.filter((m) => m.move > 0).sort((a, b) => b.move - a.move).slice(0, SIZE).map(entry);
  const down = moved.filter((m) => m.move < 0).sort((a, b) => a.move - b.move).slice(0, SIZE).map(entry);
  if (up.length === 0 && down.length === 0) return null;
  const names = [...new Set([...up, ...down].flatMap((e) => e.callers))];
  const rng = rngFor(s.seed, 'board', report.day);
  const name = names.length > 0 ? names[rng.int(names.length)] : undefined;
  const brag = name ? { name, text: BRAGS[rng.int(BRAGS.length)] ?? BRAGS[0] ?? '' } : null;
  return { up, down, brag };
}
