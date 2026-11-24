/**
 * 黑天鹅 Boss 日：真实行情的普通娱乐局，最后一个交易日必定来一件大事（docs/design-modes.md 第 16 节）。
 * 这里只放纯函数和内容表：种类、幅度、预告和归因文案、对每只持仓的额外涨跌。
 * 哪一局有、哪一天来、预告提前几天由 engine/calendar.ts 的 swanPlan / swanNotice 定（要用开局设置和日历）。
 * 预告只说种类和怎么避险，不说幅度；幅度在 BALANCE.swan，收盘才揭晓。
 */
import { BALANCE } from './balance.ts';
import { themeById } from './content/index.ts';
import type { SwanKind, ThemeId } from './types.ts';

/** 临时开关：模拟器 `--no-swan` 和测试拿来对照"没有黑天鹅"的结果；正式游戏永远开着。 */
export const swanSwitch = { enabled: true };

export const SWAN_KINDS: readonly SwanKind[] = ['blackout', 'themeBust', 'windfall', 'flashCrash'];

interface SwanDef {
  kind: SwanKind;
  name: string;
  /** 是否针对某个题材（开局时按种子在这局登场的题材里挑一个） */
  themed: boolean;
  /** 下跌类：押跌和现金能赚或能躲 */
  down: boolean;
  /** 大字报幕的一句话 */
  shout: string;
}

export const SWAN_DEFS: Record<SwanKind, SwanDef> = {
  blackout: { kind: 'blackout', name: '大停电', themed: false, down: true, shout: '全城停电，所有股票一起挨砸' },
  themeBust: { kind: 'themeBust', name: '题材爆雷', themed: true, down: true, shout: '这个风口爆雷了' },
  windfall: { kind: 'windfall', name: '天降利好', themed: true, down: false, shout: '这个风口天降大利好' },
  flashCrash: { kind: 'flashCrash', name: '闪崩又拉回', themed: false, down: true, shout: '开盘直接闪崩，收盘又拉回一截' },
};

/** 今天对一只多头持仓额外加的涨跌（pp）：theme 是它的题材，move 是它自己今天的涨跌。 */
export function swanDelta(kind: SwanKind, hitTheme: ThemeId | null, theme: ThemeId, move: number): number {
  const b = BALANCE.swan;
  switch (kind) {
    case 'blackout':
      return -b.blackout;
    case 'themeBust':
      return theme === hitTheme ? -b.themeBust : 0;
    case 'windfall':
      return theme === hitTheme ? b.windfall : 0;
    case 'flashCrash':
      // 开盘跌停、收盘只跌几个点：今天收得比这更惨的不动，其余都被压到这个跌幅
      return move > -b.flashCrash ? -b.flashCrash - move : 0;
  }
}

/** 押跌那一格的额外收益：多头跌它赚；多头涨（天降利好）押跌的被轧，亏得更狠（倍数同涨停被轧）。 */
export function swanShortDelta(delta: number): number {
  return delta > 0 ? -delta * BALANCE.ext.squeeze : -delta;
}

/** 受影响的题材名（没有题材的种类为空串）。 */
function themeName(theme: ThemeId | null): string {
  return theme ? themeById(theme).name : '';
}

/** 预告：标题、一句话说明、避险办法。不写任何幅度。 */
export function swanWarn(kind: SwanKind, theme: ThemeId | null): { head: string; line: string; hedge: string } {
  const t = themeName(theme);
  switch (kind) {
    case 'blackout':
      return { head: '大停电', line: '传闻最后一天要大停电，手里的股票会一起挨砸', hedge: '空仓拿现金、押跌，都能躲' };
    case 'themeBust':
      return { head: '题材爆雷', line: `传闻${t}最后一天要爆雷，拿着它的会挨砸`, hedge: `换别的风口、拿现金、押跌${t}` };
    case 'windfall':
      return { head: '天降利好', line: `传闻${t}最后一天有大利好，拿着它的会赚`, hedge: `想赚就拿${t}，别押它跌（会被轧）` };
    case 'flashCrash':
      return { head: '闪崩又拉回', line: '传闻最后一天开盘先闪崩、收盘才拉回一截', hedge: '空仓拿现金、押跌，都能躲' };
  }
}

/** 收盘归因里"黑天鹅"这一项的说明（v 是这一项对这格收益的贡献）。 */
export function swanPartLabel(name: string, v: number, ret: number, short: boolean): string {
  const a = `${Math.round(Math.abs(v) * 10) / 10}%`;
  if (short) return v >= 0 ? `黑天鹅「${name}」：它被砸，你押跌多赚了 ${a}` : `黑天鹅「${name}」：它被推上去，押跌的被轧，多亏了 ${a}`;
  if (v >= 0) return ret >= 0 ? `黑天鹅「${name}」：天降好事，又多涨了 ${a}` : `黑天鹅「${name}」：帮它少跌了 ${a}`;
  return `黑天鹅「${name}」：这只股票又多跌了 ${a}`;
}
