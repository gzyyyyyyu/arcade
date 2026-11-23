/**
 * 股票详情的 K 线页（画面层的示意）：收盘涨跌是真的（记录仪里已经收盘的日子），
 * 开盘、最高、最低、昨天的分时、买卖力量都是照着收盘画出来的——按「股票 + 交易日」做种子，同一天每次打开都一样，不偷看未来。
 * 图鉴「行情段」页写明了这一点。
 */

/** 一根日 K（点位，起点 100） */
export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  /** 当天涨跌（pp，真实收盘） */
  move: number;
}

/** 字符串 → 32 位种子（FNV-1a） */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 小随机流（mulberry32）：同一个 key 永远同一串 */
function stream(key: string): () => number {
  let a = hash(key);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 大涨到这个数（pp）以上按「封板」画：最高就是收盘，没有上影线；大跌同理没有下影线 */
const SEALED = 7;

/**
 * 逐日收盘涨跌 → 日 K。key 区分股票，firstDay 是第一根的交易日编号（同一天的 K 线每次打开都一样）。
 * 开盘落在昨收和今收之间、偶尔跳空一点；影线长短随当天振幅。
 */
export function candles(moves: readonly number[], key: string, firstDay: number): Candle[] {
  const out: Candle[] = [];
  let prev = 100;
  moves.forEach((m, i) => {
    const r = stream(`${key}:${firstDay + i}`);
    const c = prev * (1 + m / 100);
    const o = prev + (c - prev) * (r() * 0.6 - 0.15);
    const swing = Math.abs(c - prev) * 0.35 + prev * 0.004 * (0.5 + r());
    const h = m >= SEALED ? Math.max(o, c) : Math.max(o, c) + swing * r();
    const l = m <= -SEALED ? Math.min(o, c) : Math.min(o, c) - swing * r();
    out.push({ o, h, l, c, move: m });
    prev = c;
  });
  return out;
}

/**
 * 某一天的分时（n + 1 个点，单位 pp，从 0 走到 move）：随机游走再拉直到收盘（布朗桥）。
 * 大涨封板：碰到收盘价以后一直横着（封住）。
 */
export function intraday(move: number, key: string, n = 48): number[] {
  const r = stream(`${key}:tick`);
  const vol = Math.max(0.6, Math.abs(move) * 0.5) / Math.sqrt(n);
  const walk = [0];
  for (let k = 1; k <= n; k++) walk.push((walk[k - 1] ?? 0) + (r() * 2 - 1) * vol * 1.7);
  const end = walk[n] ?? 0;
  const path = walk.map((w, k) => w - (k / n) * end + (k / n) * move);
  if (move >= SEALED) {
    const at = path.findIndex((v) => v >= move);
    return path.map((v, k) => (at >= 0 && k >= at ? move : Math.min(v, move)));
  }
  if (move <= -SEALED) {
    const at = path.findIndex((v) => v <= move);
    return path.map((v, k) => (at >= 0 && k >= at ? move : Math.max(v, move)));
  }
  return path;
}

/**
 * 买卖力量（0..1 是买方占比）：最近 3 天的涨跌越往上越偏买，最近一天权重最大；只看已经收盘的日子。
 * 封在 0.15..0.85，不画成一边倒。
 */
export function buyPower(moves: readonly number[]): number {
  const w = [0.2, 0.3, 0.5];
  const last = moves.slice(-3);
  let x = 0;
  last.forEach((m, i) => {
    x += m * (w[i + w.length - last.length] ?? 0);
  });
  return Math.min(0.85, Math.max(0.15, 0.5 + x / 16));
}

/** 量柱高度（0..1）：按涨跌幅估（大涨大跌放量），不是真实成交量——行情段只存收盘涨跌 */
export function volumes(moves: readonly number[]): number[] {
  const raw = moves.map((m) => 1 + Math.abs(m));
  const top = Math.max(1, ...raw);
  return raw.map((v) => v / top);
}
