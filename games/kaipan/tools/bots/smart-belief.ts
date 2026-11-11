/** smart 的题材阶段贝叶斯滤波，以及个股期望收益（stockOutlook）。 */
import {
  BALANCE,
  STAGES,
  coldPull,
  credibility,
  topicsOf,
  effectiveDH,
  failChance,
  fx,
  stageDH,
  stageDays,
  stockById,
  type Dir,
  type GameState,
  type MarketRules,
  type Rules,
  type Stage,
  type ThemeId,
} from '../../src/core/index.ts';

// ================================================================ smart：题材阶段的贝叶斯滤波

const NS = STAGES.length;
export const MAXAGE = 16;
export const SI: Record<Stage, number> = { cold: 0, sprout: 1, ferment: 2, rally: 3, climax: 4, ebb: 5 };

export type Dist = Float64Array;

export function newDist(): Dist {
  return new Float64Array(NS * MAXAGE);
}

export function idx(stage: number, age: number): number {
  return stage * MAXAGE + Math.min(MAXAGE, age) - 1;
}

export function normalize(d: Dist): void {
  let t = 0;
  for (let i = 0; i < d.length; i++) t += d[i] as number;
  if (t <= 0) {
    d.fill(1 / d.length);
    return;
  }
  for (let i = 0; i < d.length; i++) d[i] = (d[i] as number) / t;
}

export function stageMass(d: Dist): number[] {
  const m = new Array<number>(NS).fill(0);
  for (let s = 0; s < NS; s++) for (let a = 1; a <= MAXAGE; a++) m[s] = (m[s] as number) + (d[idx(s, a)] as number);
  return m;
}

/** 阶段持续天数服从 [lo, hi] 上的均匀分布：已持续 age 天后今天结束的概率。 */
function hazard(theme: ThemeId, stage: Stage, age: number): number {
  const [lo, hi] = stageDays(stage, theme);
  if (age < lo) return 0;
  if (age >= hi) return 1;
  return 1 / (hi - age + 1);
}

/** 开盘前推进一天（与引擎 advanceStage 的规则一致）。heat 为今天开盘前的热度。 */
export function predict(prev: Dist, theme: ThemeId, heat: number, mr: MarketRules): Dist {
  const out = newDist();
  const top = heat >= BALANCE.heat.max;
  const sproutChance = Math.min(1, mr.sprout + (mr.sproutTheme[theme] ?? 0));
  for (let si = 0; si < NS; si++) {
    const stage = STAGES[si] as Stage;
    for (let a = 1; a <= MAXAGE; a++) {
      const m = prev[idx(si, a)] as number;
      if (m <= 0) continue;
      if (top && (stage === 'sprout' || stage === 'ferment' || stage === 'rally')) {
        out[idx(SI.climax, 1)] = (out[idx(SI.climax, 1)] as number) + m;
        continue;
      }
      if (top && stage === 'climax') {
        out[idx(SI.ebb, 1)] = (out[idx(SI.ebb, 1)] as number) + m;
        continue;
      }
      const h = hazard(theme, stage, a);
      const end = m * h;
      let stay = m - end;
      if (stage === 'cold' && sproutChance > 0) {
        const early = stay * sproutChance;
        stay -= early;
        out[idx(SI.sprout, 1)] = (out[idx(SI.sprout, 1)] as number) + early;
      }
      out[idx(si, a + 1)] = (out[idx(si, a + 1)] as number) + stay;
      if (end > 0) {
        switch (stage) {
          case 'cold':
            out[idx(SI.sprout, 1)] = (out[idx(SI.sprout, 1)] as number) + end;
            break;
          case 'sprout': {
            const f = failChance('sprout', theme, mr);
            out[idx(SI.cold, 1)] = (out[idx(SI.cold, 1)] as number) + end * f;
            out[idx(SI.ferment, 1)] = (out[idx(SI.ferment, 1)] as number) + end * (1 - f);
            break;
          }
          case 'ferment': {
            const f = failChance('ferment', theme, mr);
            out[idx(SI.ebb, 1)] = (out[idx(SI.ebb, 1)] as number) + end * f;
            out[idx(SI.rally, 1)] = (out[idx(SI.rally, 1)] as number) + end * (1 - f);
            break;
          }
          case 'rally':
            out[idx(SI.climax, 1)] = (out[idx(SI.climax, 1)] as number) + end;
            break;
          case 'climax':
            out[idx(SI.ebb, 1)] = (out[idx(SI.ebb, 1)] as number) + end;
            break;
          case 'ebb':
            out[idx(SI.cold, 1)] = (out[idx(SI.cold, 1)] as number) + end;
            break;
        }
      }
    }
  }
  return out;
}

/** 某阶段今天热度变化的连续范围（含日历、直播间、冷门回落）。 */
export function dHRange(stage: Stage, theme: ThemeId, heat: number, mr: MarketRules, boost: number): [number, number] {
  const [lo, hi] = stageDH(stage, theme, mr);
  const b = (mr.themeDH[theme] ?? 0) + boost + coldPull(stage, heat);
  // 震荡的噪声：两个均匀分布之和近似成一个更宽的均匀分布
  const n = mr.dHNoise;
  return [lo + b - n, hi + b + n];
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** P(实际热度变化 = d | 范围)：先在范围上均匀取值再四舍五入，最后截断到 0..100。 */
function likDEff(range: [number, number], heat: number, d: number): number {
  const [lo, hi] = range;
  const w = Math.max(1e-6, hi - lo);
  const max = BALANCE.heat.max;
  if (heat + d >= max && d > 0) return overlap(max - heat - 0.5, 1e9, lo, hi) / w;
  if (heat + d <= 0 && d < 0) return overlap(-1e9, -heat + 0.5, lo, hi) / w;
  if (heat + d >= max && d === 0 && heat >= max) return overlap(-0.5, 1e9, lo, hi) / w;
  if (heat + d <= 0 && d === 0 && heat <= 0) return overlap(-1e9, 0.5, lo, hi) / w;
  return overlap(d - 0.5, d + 0.5, lo, hi) / w;
}

/** 截断后的热度变化落在 涨 / 横 / 跌 的概率。 */
function dirProbs(range: [number, number], heat: number): [number, number, number] {
  const [lo, hi] = range;
  const w = Math.max(1e-6, hi - lo);
  const t = BALANCE.heat.dirThreshold;
  const max = BALANCE.heat.max;
  // 截断：上涨最多 max-heat，下跌最多 -heat
  const upCut = max - heat >= t ? t - 0.5 : Infinity;
  const downCut = -heat <= -t ? -t + 0.5 : -Infinity;
  const pUp = overlap(upCut, 1e9, lo, hi) / w;
  const pDown = overlap(-1e9, downCut, lo, hi) / w;
  return [pUp, Math.max(0, 1 - pUp - pDown), pDown];
}

/** 截断后热度变化的均值（数值积分）。 */
export function meanDEff(range: [number, number], heat: number): number {
  const [lo, hi] = range;
  const n = 8;
  let sum = 0;
  for (let k = 0; k < n; k++) sum += effectiveDH(heat, lo + ((hi - lo) * (k + 0.5)) / n);
  return sum / n;
}

export function uniformStart(theme: ThemeId): Dist {
  const d = newDist();
  for (let si = 0; si < NS; si++) {
    const [lo, hi] = stageDays(STAGES[si] as Stage, theme);
    for (let a = 1; a <= Math.min(MAXAGE, hi); a++) d[idx(si, a)] = (hi - lo + 1) / (hi + 1);
  }
  normalize(d);
  return d;
}

/** 股灾（公开规则）：今天以概率 q 出事，出事时萌芽 / 发酵 / 主升 / 高潮全部转入退潮第 1 天。 */
export function mixCrash(d: Dist, q: number): Dist {
  if (q <= 0) return d;
  const out = new Float64Array(d.length);
  for (let si = 0; si < NS; si++) {
    const hot = si === SI.sprout || si === SI.ferment || si === SI.rally || si === SI.climax;
    for (let a = 1; a <= MAXAGE; a++) {
      const m = d[idx(si, a)] as number;
      if (m <= 0) continue;
      out[idx(si, a)] = (out[idx(si, a)] as number) + m * (hot ? 1 - q : 1);
      if (hot) out[idx(SI.ebb, 1)] = (out[idx(SI.ebb, 1)] as number) + m * q;
    }
  }
  return out;
}

/** 用一天的观测（开盘前热度、实际热度变化）更新：先验 × 似然。 */
export function observe(prior: Dist, theme: ThemeId, heat: number, d: number, mr: MarketRules, boost: number): Dist {
  const post = newDist();
  for (let si = 0; si < NS; si++) {
    const l = likDEff(dHRange(STAGES[si] as Stage, theme, heat, mr, boost), heat, d) + 1e-4;
    for (let a = 1; a <= MAXAGE; a++) post[idx(si, a)] = (prior[idx(si, a)] as number) * l;
  }
  normalize(post);
  return post;
}

/** 一条消息：方向、平时的可信度、在拐点上的可信度（靠谱群友在擅长题材的拐点上更准）。 */
export interface Claim {
  claim: Dir;
  cred: number;
  turnCred: number;
}

export function applyMessages(prior: Dist, theme: ThemeId, heat: number, mr: MarketRules, boost: number, claims: Claim[]): Dist {
  if (claims.length === 0) return prior;
  const out = new Float64Array(prior);
  const lik = (range: [number, number], turn: boolean): number => {
    const [pu, pf, pd] = dirProbs(range, heat);
    let l = 1;
    for (const c of claims) {
      const cred = turn ? c.turnCred : c.cred;
      const wrong = (1 - cred) / 2;
      const pc = (d: Dir): number => (d === c.claim ? cred : wrong);
      l *= pu * pc('up') + pf * pc('flat') + pd * pc('down');
    }
    return l + 1e-6;
  };
  for (let si = 0; si < NS; si++) {
    const stage = STAGES[si] as Stage;
    const range = dHRange(stage, theme, heat, mr, boost);
    const l = lik(range, false);
    const lt = stage === 'sprout' || stage === 'climax' || stage === 'ebb' ? lik(range, true) : l;
    out[idx(si, 1)] = (out[idx(si, 1)] as number) * lt;
    for (let a = 2; a <= MAXAGE; a++) out[idx(si, a)] = (out[idx(si, a)] as number) * l;
  }
  normalize(out);
  return out;
}

/** 群友在拐点上的可信度（规则公开：靠谱群友在擅长题材的拐点上 + turnCred）。 */
export function turnCredOf(s: GameState, friendId: string, theme: ThemeId, rules: Rules): number {
  const c = credibility(s, friendId, theme, rules);
  const f = s.friends.find((x) => x.id === friendId);
  if (!f || (BALANCE.cred[friendId]?.[0] ?? 0) < BALANCE.chat.reliable || !topicsOf(s, f).includes(theme)) return c;
  return Math.min(1, c + BALANCE.chat.turnCred * rules.turnCredMult);
}

/** 期望热度变化：今天和之后 days−1 天（往后用期望热度近似）。 */
export function projectDH(belief: Dist, theme: ThemeId, heat: number, mrs: MarketRules[], boost: { dH: number; days: number } | null, days: number): number[] {
  const out: number[] = [];
  let d = belief;
  let h = heat;
  for (let k = 0; k < days; k++) {
    const mr = mrs[Math.min(k, mrs.length - 1)] as MarketRules;
    if (k > 0) d = predict(d, theme, h, mr);
    const b = boost && boost.days > k ? boost.dH : 0;
    out.push(expectedDH(d, theme, h, mr, b));
    h = Math.max(0, Math.min(BALANCE.heat.max, h + (out[out.length - 1] as number)));
  }
  return out;
}

/** 信念下今天的期望热度变化。 */
export function expectedDH(d: Dist, theme: ThemeId, heat: number, mr: MarketRules, boost: number): number {
  const m = stageMass(d);
  let e = 0;
  for (let si = 0; si < NS; si++) {
    const p = m[si] as number;
    if (p > 1e-9) e += p * meanDEff(dHRange(STAGES[si] as Stage, theme, heat, mr, boost), heat);
  }
  return e;
}

// ---------------------------------------------------------------- 个股期望

function phi(z: number): number {
  return Math.exp(-0.5 * z * z) / 2.5066282746310002;
}

function Phi(z: number): number {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const p = phi(z) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

interface Clip {
  mean: number;
  /** E[min(X, 0)]（亏损部分） */
  neg: number;
  pUp: number;
  pDown: number;
}

/** X ~ N(μ, σ) 截断到 [lo, hi] 后的均值、负部、触及上下限的概率。 */
function clipNormal(mu: number, sigma: number, lo: number, hi: number): Clip {
  const s = Math.max(0.05, sigma);
  const a = (lo - mu) / s;
  const b = (hi - mu) / s;
  const z0 = (0 - mu) / s;
  const Pa = Phi(a);
  const Pb = Phi(b);
  const mean = lo * Pa + hi * (1 - Pb) + mu * (Pb - Pa) + s * (phi(a) - phi(b));
  // E[min(clip(X), 0)] = lo*Pa + ∫_{a}^{z0} (μ+σz)φ dz
  const P0 = Phi(Math.min(z0, b));
  const neg = lo * Pa + mu * Math.max(0, P0 - Pa) + s * (phi(a) - phi(Math.min(z0, b)));
  return { mean, neg: Math.min(0, neg), pUp: 1 - Pb, pDown: Pa };
}

export interface Outlook {
  /** 各题材今天起的期望题材涨幅（pp），[今天, 明天, 后天] */
  theme: Map<ThemeId, number[]>;
  /** 各题材今天处于主升的概率（低吸大师用） */
  rally: Map<ThemeId, number[]>;
  /** 大盘今天的期望涨幅 */
  market: number;
  mr: MarketRules;
}

export const HORIZON = 3;
/** 真实行情下一条群聊消息（按可信度超过瞎猜的部分）对风口今天涨跌的估计（pp），sim --real 标定 */
export let REAL_MSG = 5;
export function setRealMsg(v: number): void {
  REAL_MSG = v;
}
/** 推荐当作"涨"的信号时可信度打的折扣 */
export const REC_SIGNAL = 0.9;
/** smart 往空格里买入的最低价值（3 天期望收益的折现和，pp）；空格是现金，正期望就值得买 */
export const SMART_FILL = 1.0;

/** 某只股票今天起 HORIZON 天的期望收益（含道具修正），以及今天涨停的概率。 */
export function stockOutlook(
  s: GameState,
  o: Outlook,
  rules: Rules,
  stockId: string,
  opt: {
    held: boolean;
    boughtToday: boolean;
    lowBuy: boolean;
    leaderUpProb: Map<ThemeId, number>;
    holdingLeader: ReadonlySet<ThemeId>;
    /** 今天的第一只买入（游资席位） */
    firstBuy?: boolean;
  },
): { e: number[]; pUp: number } {
  // 月底在第几天之后（价值眼光的分红）；超出视野为 -1
  const monthEndK = BALANCE.monthDays[s.month - 1]! - s.dayInMonth - 1;
  const def = stockById(stockId);
  const p = BALANCE.roles[def.role];
  const st = s.stocks[stockId];
  const items = s.items;
  const themeE = o.theme.get(def.theme) ?? [0, 0, 0];
  const beta = p.beta * (o.mr.beta[def.role] ?? 1);
  const noise = p.noise * (o.mr.noise[def.role] ?? 1) * o.mr.vol;
  const out: number[] = [];
  let pUp0 = 0;
  for (let k = 0; k < HORIZON; k++) {
    const boards = k === 0 ? (st?.boards ?? 0) : 0;
    const mm = opt.held ? rules.momentumMult : 1;
    const bm = opt.held ? rules.blowMult : 1;
    let mu = beta * (themeE[k] ?? 0) + p.market * (k === 0 ? o.market : o.market * 0.8) + boards * BALANCE.boards.momentum * mm;
    const sigma = Math.sqrt(noise * noise + (beta * 1.2) * (beta * 1.2) + (def.role === 'meme' ? p.jumpProb * 64 : 0));
    if (def.role === 'follower') mu += (opt.leaderUpProb.get(def.theme) ?? 0) * BALANCE.chain;
    const c = clipNormal(mu, sigma, -p.limit, p.limit);
    let e = c.mean;
    if (boards > 0) {
      const pb = Math.min(1, boards * BALANCE.boards.blow * bm * o.mr.blowMult);
      e = (1 - pb) * e + pb * BALANCE.boards.blowMove;
    }
    if (def.role === 'st') e = Math.min(e, 0.3) - BALANCE.st.warn * (st?.warnings ?? 0 ? 40 : 6);
    // 道具
    if (items.includes('baima') && def.role === 'bluechip') e -= c.neg * 0.5;
    if (items.includes('yaogu') && def.role === 'meme') e += c.pUp * ((BALANCE.fx.yaogu?.limitUpAs ?? 15) - p.limit);
    if (items.includes('genfeng') && def.role === 'follower') e += (opt.leaderUpProb.get(def.theme) ?? 0) * BALANCE.chain;
    if (items.includes('longtou') && def.role !== 'leader' && opt.holdingLeader.has(def.theme)) e += (opt.leaderUpProb.get(def.theme) ?? 0) * 3;
    if (items.includes('dixi') && opt.lowBuy) e += (o.rally.get(def.theme)?.[k] ?? 0) * 2;
    if (items.includes('zhisun') && !(opt.boughtToday && k === 0)) {
      const stop = BALANCE.fx.zhisun?.stop ?? -4;
      const cs = clipNormal(mu, sigma, stop, p.limit);
      e += Math.max(0, cs.mean - c.mean);
    }
    if (items.includes('value_eye') && def.role === 'bluechip' && k === monthEndK) e += fx('value_eye', 'bonus');
    if (items.includes('hot_money') && opt.firstBuy && opt.boughtToday && k === 0) e += c.pUp * fx('hot_money', 'bonus');
    if (k === 0) pUp0 = c.pUp;
    out.push(e);
  }
  return { e: out, pUp: pUp0 };
}

