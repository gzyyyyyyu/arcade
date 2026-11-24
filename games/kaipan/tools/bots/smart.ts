/** smart / oracle 机器人本体（SmartBot）、道具估值和五个流派。 */
import {
  BALANCE,
  ITEMS,
  canSell,
  credibility,
  turnOf,
  dirOf,
  effectiveDH,
  feelOf,
  flipDir,
  fx,
  marketRulesFor,
  totalDays,
  recCredibility,
  rngFor,
  rulesOf,
  stageDays,
  stockById,
  stocksOf,
  canShortNow,
  realDH,
  tapeIndex,
  validate,
  type Action,
  type GameState,
  type MarketRules,
  type Role,
  type Rules,
  type Stage,
  type ThemeId,
} from '../../src/core/index.ts';
import { type Bot, emptySlot, sellableSlots, themeOfStock, heldThemes, buyable, pickRewardBy } from './common.ts';
import { nextBillOf, reviewOf, crashRisk, CrashMemory } from './normal.ts';
import { MAXAGE, SI, type Dist, newDist, idx, normalize, stageMass, predict, dHRange, meanDEff, uniformStart, mixCrash, observe, type Claim, applyMessages, turnCredOf, projectDH, expectedDH, type Outlook, HORIZON, REAL_MSG, REC_SIGNAL, SMART_FILL, stockOutlook } from './smart-belief.ts';

// ---------------------------------------------------------------- smart 本体

interface SmartOptions {
  name: string;
  /** 同一题材最多持有几只 */
  maxPerTheme: number;
  /** 每多一只同题材持仓的加分（集中流用） */
  sameThemeBonus: number;
  /** 最多同时持有几个题材（集中流为 1） */
  maxThemes?: number;
  /** 用真实信息（oracle） */
  oracle: boolean;
  /** oracle 是否知道今天的热度变化（false 时只知道真实阶段） */
  oracleToday?: boolean;
  /** 诊断用：偷看今天的热度变化（相当于消息全中、覆盖全部题材） */
  peek?: boolean;
  /** 诊断用：只偷看今天有消息的题材 */
  peekMsg?: boolean;
  /** 诊断用：不看消息（推荐照常） */
  ignoreMsg?: boolean;
  /** 诊断用：不把推荐当信号 */
  ignoreRec?: boolean;
  /** 诊断用：消息的方向全部换成真相（只知道涨 / 横 / 跌，不知道幅度） */
  trueDir?: boolean;
  /** 诊断用：只有拐点题材的消息换成真相 */
  trueDirTurn?: boolean;
  /** 诊断用：只偷看今天处在拐点的题材（拐点消息价值的上限） */
  peekTurn?: boolean;
  /** 往空格里买入的最低价值（缺省 SMART_FILL）；oracle 信息完整，可以更积极 */
  fill?: number;
  /** 满仓时换股的最低价值差（缺省 1.8） */
  swap?: number;
  /** 只买这些角色（成就"价值投资"：只买白马） */
  roles?: readonly Role[];
  /** 一个道具都不拿（成就"裸考"） */
  noItems?: boolean;
  /** 仓位玩法：能押跌时也押跌（期望为负的推荐押它跌） */
  short?: boolean;
}

/** smart 领奖励时对道具的估值（拍脑袋的经验值，再加流派偏好；与第二轮相同）。 */
const ITEM_VALUE: Record<string, number> = {
  extra_slot: 6,
  double_buy: 4,
  margin: 5,
  ipo: 6,
  credit: 4,
  longtou: 3,
  genfeng: 2,
  baima: 2,
  yaogu: 3,
  lianban: 2,
  dixi: 2.5,
  zhisun: 3,
  zhiying: 2.5,
  paid_group: 4,
  notebook: 3,
  mood_meter: 6,
  hot_money: 2.5,
  value_eye: 2,
  fan_qunzhu: 3,
  diversify: 2,
  fomo: 3,
  night_review: 4,
  crowd_fund: 5,
  rumor_mill: 3,
  contrarian: 3,
  hold_tight: 2,
  dip_buyer: 1,
  early_bird: 1,
};

/** oracle 领奖励时的估值：按 --value 实测的"开局持有"价值取整（pp），不挑流派。 */
const ORACLE_ITEM_VALUE: Record<string, number> = {
  extra_slot: 0,
  double_buy: 6,
  margin: 8,
  ipo: 8,
  credit: 6,
  longtou: 3.5,
  genfeng: 1.5,
  baima: 1,
  yaogu: 4.5,
  lianban: 1.5,
  dixi: 4,
  zhisun: 6.5,
  zhiying: 0,
  paid_group: 0,
  notebook: 0,
  mood_meter: 0,
  hot_money: 3,
  value_eye: 2,
  fan_qunzhu: 0,
  diversify: 2,
  fomo: 2,
  night_review: 0,
  crowd_fund: 6,
  rumor_mill: 0,
  contrarian: 3,
  hold_tight: 2,
  dip_buyer: 1,
  early_bird: 1,
};

/** 第 8 节的五个流派（smart 每局随机倾向其中一个，领奖励时加分）。 */
export const ARCHETYPES: Record<string, readonly string[]> = {
  题材流: ['longtou', 'genfeng'],
  打板流: ['yaogu', 'lianban'],
  稳健杠杆流: ['baima', 'margin', 'ipo'],
  低吸流: ['dixi', 'mood_meter', 'zhiying'],
  消息流: ['paid_group', 'notebook'],
};

export class SmartBot implements Bot {
  name: string;
  private opt: SmartOptions;
  private beliefs = new Map<ThemeId, Dist>();
  /** 已经用观测更新到的交易日（下一天的后验已就绪） */
  private seenDay = -1;
  /** 今天开盘前的先验，按题材 */
  private priors = new Map<ThemeId, Dist>();
  private priorDay = -1;
  private archetype: string | null = null;
  private crash = new CrashMemory();

  constructor(opt: SmartOptions) {
    this.name = opt.name;
    this.opt = opt;
  }

  /** 开局：从均匀先验出发，用预跑留下的走势过滤一遍。 */
  private init(s: GameState): void {
    const mr0 = marketRulesFor(0, s.difficulty);
    for (const id of s.themeIds) {
      const t = s.themes[id];
      if (!t) continue;
      let d = uniformStart(id);
      const h = t.history;
      for (let i = 1; i < h.length; i++) {
        const heat = h[i - 1] as number;
        d = predict(d, id, heat, mr0);
        d = observe(d, id, heat, (h[i] as number) - heat, mr0, 0);
      }
      this.beliefs.set(id, d);
    }
    this.seenDay = s.dayIndex - 1;
  }

  /** 每天第一次被调用时：用昨天的结算更新，再推进到今天。 */
  private sync(s: GameState): void {
    if (this.beliefs.size === 0) this.init(s);
    const r = s.lastDay;
    if (r && r.day > this.seenDay) {
      const mrDay = marketRulesFor(r.month, s.difficulty);
      for (const tm of r.themes) {
        const prior = this.priors.get(tm.id) ?? this.beliefs.get(tm.id);
        if (!prior) continue;
        // 只用公开的热度变化（tm.stage 是隐藏信息，不读）
        const boost = this.boostSeen.get(tm.id) ?? 0;
        this.beliefs.set(tm.id, observe(prior, tm.id, tm.heatBefore, tm.dH, mrDay, boost));
      }
      this.seenDay = r.day;
    }
    if (this.priorDay !== s.today.day) {
      const mr = marketRulesFor(s.month, s.difficulty);
      const q = crashRisk(s, this.crash.crashed(s));
      for (const id of s.themeIds) {
        const t = s.themes[id];
        const post = this.beliefs.get(id);
        if (!t || !post) continue;
        this.priors.set(id, mixCrash(predict(post, id, t.heat, mr), q));
        this.boostSeen.set(id, t.boost?.dH ?? 0);
      }
      this.priorDay = s.today.day;
    }
  }

  private boostSeen = new Map<ThemeId, number>();

  /** 今天各题材的展望（smart 用信念，oracle 用真实信息）。 */
  private outlook(s: GameState, rules: Rules): Outlook {
    const mr = marketRulesFor(s.month, s.difficulty);
    const nextMr = s.dayInMonth + 1 < BALANCE.monthDays[s.month - 1]! ? mr : marketRulesFor(Math.min(12, s.month + 1), s.difficulty);
    const mrs = [mr, nextMr, nextMr];
    const theme = new Map<ThemeId, number[]>();
    const rally = new Map<ThemeId, number[]>();
    const coef = BALANCE.heat.coef;
    for (const id of s.themeIds) {
      const t = s.themes[id];
      if (!t) continue;
      if (this.opt.oracle) {
        // 真实阶段 + 今天预先掷好的热度变化
        const d0 =
          this.opt.oracleToday === false
            ? meanDEff(dHRange(t.stage, id, t.heat, mr, t.boost?.dH ?? 0), t.heat)
            : effectiveDH(t.heat, s.today.plan.dH[id] ?? 0);
        // 真实行情：往后几天直接看行情段（oracle 是上限）；合成行情按真实阶段推
        const rest = s.real
          ? [1, 2].map((k) => (s.dayIndex + k < totalDays() ? realDH(s.real as NonNullable<GameState['real']>, t, tapeIndex(s.real as NonNullable<GameState['real']>, s.dayIndex + k)) : 0))
          : projectOracle(t.stage, t.left, id, t.heat + d0, mrs, t.boost);
        theme.set(id, [coef * d0, ...rest.map((x) => coef * x)]);
        rally.set(id, [t.stage === 'rally' ? 1 : 0, t.stage === 'rally' && t.left > 1 ? 1 : 0.3, 0.3]);
        continue;
      }
      if (s.real) {
        // 重新标定（真实行情）：合成行情的阶段模型在真实行情下不成立。真实行情里风口涨跌 = 行业超额收益按 smooth 均摊，
        // 所以今天的期望 ≈ (1 − smooth) × 昨天的风口涨跌（一阶自回归），再按群聊方向和群友可信度加减
        const k = 1 - BALANCE.real.smooth;
        const last = s.lastDay?.themes.find((x) => x.id === id)?.ret ?? 0;
        let shift = 0;
        for (const m of s.today.messages) {
          if (m.theme !== id || this.opt.ignoreMsg) continue;
          const claim = m.reverse ? flipDir(m.claim) : m.claim;
          const c = m.reverse ? fx('fan_qunzhu', 'acc') : credibility(s, m.friendId, id, rules);
          shift += (claim === 'up' ? 1 : claim === 'down' ? -1 : 0) * Math.max(0, c - 1 / 3) * REAL_MSG;
        }
        const e0 = k * last + shift;
        theme.set(id, [e0, k * e0, k * k * e0]);
        const f = feelOf(t.history);
        rally.set(id, [f === 'warming' || f === 'hot' ? 0.4 : 0.1, 0.2, 0.15]);
        continue;
      }
      let prior = this.priors.get(id);
      if (!prior) continue;
      const seen = rules.revealStages ? t.lastStage : reviewOf(s, id);
      if (seen) {
        // 情绪指标 / 熬夜复盘：昨天的真实阶段是公开的，先把昨天的后验收拢到那个阶段再推进
        const post = this.beliefs.get(id);
        if (post) {
          const c = newDist();
          const si = SI[seen];
          for (let a = 1; a <= MAXAGE; a++) c[idx(si, a)] = post[idx(si, a)] as number;
          let tot = 0;
          for (let i = 0; i < c.length; i++) tot += c[i] as number;
          if (tot <= 1e-9) for (let a = 1; a <= 3; a++) c[idx(si, a)] = 1;
          normalize(c);
          prior = mixCrash(predict(c, id, t.heat, mr), crashRisk(s, this.crash.crashed(s)));
        }
      }
      const claims: Claim[] = s.today.messages
        .filter((m) => m.theme === id && !this.opt.ignoreMsg)
        .map((m) =>
          this.opt.trueDir || (this.opt.trueDirTurn && turnOf(t) !== null)
            ? { claim: dirOf(effectiveDH(t.heat, s.today.plan.dH[id] ?? 0)), cred: 0.98, turnCred: 0.98 }
            : m.reverse
              ? { claim: flipDir(m.claim), cred: fx('fan_qunzhu', 'acc'), turnCred: fx('fan_qunzhu', 'acc') }
              : { claim: m.claim, cred: credibility(s, m.friendId, id, rules), turnCred: turnCredOf(s, m.friendId, id, rules) },
        );
      // 推荐也是信号：群友挑的是他觉得今天会涨的题材（打个折当作一条"涨"）
      for (const r of s.today.recs) {
        if (this.opt.ignoreRec || !r.friendId || r.friendId === 'qunzhu' || r.friendId === 'dav' || themeOfStock(r.stockId) !== id) continue;
        const c = recCredibility(s, r.friendId, id, rules);
        const rc = 0.34 + (c - 0.34) * REC_SIGNAL * BALANCE.chat.recInsight;
        claims.push({ claim: 'up', cred: rc, turnCred: rc });
      }
      const peekThis =
        this.opt.peek || (this.opt.peekMsg && s.today.messages.some((m) => m.theme === id)) || (this.opt.peekTurn && turnOf(t) !== null);
      const today = peekThis
        ? observe(prior, id, t.heat, effectiveDH(t.heat, s.today.plan.dH[id] ?? 0), mr, t.boost?.dH ?? 0)
        : applyMessages(prior, id, t.heat, mr, t.boost?.dH ?? 0, claims);
      const dh = projectDH(today, id, t.heat, mrs, t.boost, HORIZON);
      if (peekThis) dh[0] = effectiveDH(t.heat, s.today.plan.dH[id] ?? 0);
      theme.set(id, dh.map((x) => coef * x));
      const m0 = stageMass(today);
      const m1 = stageMass(predict(today, id, t.heat + (dh[0] ?? 0), nextMr));
      rally.set(id, [m0[SI.rally] as number, m1[SI.rally] as number, (m1[SI.rally] as number) * 0.7]);
    }
    let market = BALANCE.market.ret[s.mood] * BALANCE.market.persist + mr.marketAdd + crashRisk(s, this.crash.crashed(s)) * BALANCE.crash.marketHit;
    if (this.opt.oracle && this.opt.oracleToday !== false) market = s.today.plan.marketRet;
    return { theme, rally, market, mr };
  }

  act(s: GameState): Action {
    this.crash.update(s);
    if (s.phase === 'reward') return this.reward(s);
    if (s.phase === 'event') return this.event(s);
    this.sync(s);
    if (s.today.ops >= 2) return { type: 'open' };
    const rules = rulesOf(s);
    const o = this.outlook(s, rules);

    // 龙头今天涨停的概率（跟风、龙头战法用）
    const holdingLeader = new Set<ThemeId>();
    for (const h of s.slots) if (h && stockById(h.stockId).role === 'leader') holdingLeader.add(stockById(h.stockId).theme);
    const leaderUpProb = new Map<ThemeId, number>();
    for (const id of s.themeIds) {
      const leader = stocksOf(id).find((d) => d.role === 'leader');
      if (!leader || !s.stocks[leader.id]) continue;
      const r = stockOutlook(s, o, rules, leader.id, { held: false, boughtToday: false, lowBuy: false, leaderUpProb: new Map(), holdingLeader });
      leaderUpProb.set(id, r.pUp);
    }

    const value = (e: number[]): number => (e[0] ?? 0) + 0.6 * (e[1] ?? 0) + 0.35 * (e[2] ?? 0);
    const held = heldThemes(s);
    // 分散投资：同题材叠加要扣分（凑够 4 个题材亏损打折）
    const sameK = s.items.includes('diversify') ? Math.min(this.opt.sameThemeBonus, -0.8) : this.opt.sameThemeBonus;
    const sameBonus = (theme: ThemeId, excludeSelf: boolean): number => {
      const n = (held.get(theme) ?? 0) - (excludeSelf ? 1 : 0);
      return sameK * Math.max(0, n);
    };

    // 持仓的价值（押跌的反过来，扣手续费）
    const fee = BALANCE.ext.shortFee;
    const holdVals: { slot: number; v: number; e0: number }[] = [];
    s.slots.forEach((h, i) => {
      if (!h) return;
      const r = stockOutlook(s, o, rules, h.stockId, { held: true, boughtToday: !canSell(s, i), lowBuy: h.lowBuy, leaderUpProb, holdingLeader });
      if (h.short) holdVals.push({ slot: i, v: -value(r.e) - 2 * fee, e0: -(r.e[0] ?? 0) - fee });
      else holdVals.push({ slot: i, v: value(r.e) + sameBonus(themeOfStock(h.stockId), true), e0: r.e[0] ?? 0 });
    });

    // 1. 卖出：期望为负的（先卖最差的）
    const sellable = new Set(sellableSlots(s));
    const bad = holdVals.filter((x) => sellable.has(x.slot) && x.v < -0.4 && x.e0 < 0).sort((a, b) => a.v - b.v);
    if (bad.length > 0) {
      // 如果还能买到更好的，就留一次操作给替换
      const first = bad[0] as (typeof bad)[number];
      return { type: 'sell', slot: first.slot };
    }

    // 2. 买入：推荐里价值最高的
    if (s.today.buysLeft > 0) {
      let best = -1;
      let bestV = -Infinity;
      s.today.recs.forEach((rec, i) => {
        if (!buyable(s, i)) return;
        const theme = themeOfStock(rec.stockId);
        if ((held.get(theme) ?? 0) >= this.opt.maxPerTheme) return;
        if (this.opt.roles && !this.opt.roles.includes(stockById(rec.stockId).role)) return;
        if (this.opt.maxThemes !== undefined && !held.has(theme) && held.size >= this.opt.maxThemes && emptySlot(s) >= 0) return;
        const feel = feelOf(s.themes[theme]?.history ?? []);
        const lowBuy = feel === 'cold' || feel === 'cooling';
        const r = stockOutlook(s, o, rules, rec.stockId, { held: true, boughtToday: true, lowBuy, leaderUpProb, holdingLeader, firstBuy: s.today.buys === 0 });
        const v = value(r.e) + sameBonus(theme, false);
        if (v > bestV) {
          bestV = v;
          best = i;
        }
      });
      if (best >= 0) {
        const e = emptySlot(s);
        // 多开的那一格：拿满之后每只的权重从 1/4 变成 1/5，新买的要比现有持仓的平均价值高才划算
        const n = holdVals.length;
        const dilute = n >= BALANCE.slots ? holdVals.reduce((a, x) => a + x.v, 0) / n : -Infinity;
        // 仓位玩法：押跌更划算时押跌（期望最负的那条推荐）
        if (this.opt.short && canShortNow(s) && e >= 0) {
          let sb = -1;
          let sv = -Infinity;
          s.today.recs.forEach((rec, i) => {
            if (!buyable(s, i) || stockById(rec.stockId).role === 'meme') return;
            const r = stockOutlook(s, o, rules, rec.stockId, { held: false, boughtToday: true, lowBuy: false, leaderUpProb, holdingLeader });
            const v = -value(r.e) - 2 * fee;
            if (v > sv) {
              sv = v;
              sb = i;
            }
          });
          if (sb >= 0 && sv > Math.max(bestV, (this.opt.fill ?? SMART_FILL) + 0.6) && validate(s, { type: 'buy', rec: sb, slot: e, short: true }) === null) {
            return { type: 'buy', rec: sb, slot: e, short: true };
          }
        }
        if (e >= 0 && bestV > (this.opt.fill ?? SMART_FILL) && bestV > dilute + 0.5) return { type: 'buy', rec: best, slot: e };
        // 满仓（或者多开的那一格不值得开）：考虑换掉最差的
        if (e < 0 || n >= BALANCE.slots) {
          const swap = holdVals.filter((x) => sellable.has(x.slot)).sort((a, b) => a.v - b.v)[0];
          if (swap && bestV - swap.v > (this.opt.swap ?? 1.8) && bestV > 1.0) return { type: 'buy', rec: best, slot: swap.slot };
        }
      }
    }
    return { type: 'open' };
  }

  private reward(s: GameState): Action {
    // 仓位玩法：会押跌的先拿押跌许可证
    if (this.opt.short && !canShortNow(s)) {
      const k = s.reward?.cards.findIndex((c) => c.kind === 'item' && c.id === 'short_permit') ?? -1;
      if (k >= 0) return { type: 'pickReward', index: k };
    }
    // 只买白马的风格：白马信仰、价值眼光（多一只白马推荐）是核心
    const valueBonus = (id: string): number => (this.opt.roles?.includes('bluechip') && (id === 'value_eye' || id === 'baima') ? 8 : 0);
    if (this.opt.oracle) {
      // oracle 是上限：不挑流派，只按实测价值拿；它已经知道真实阶段和今天的行情，消息类道具和群友对它没用
      return pickRewardBy(s, (kind, id) => {
        if (kind === 'stock' && this.opt.roles && !this.opt.roles.includes(stockById(id).role)) return -1000;
        if (kind === 'item') return (ORACLE_ITEM_VALUE[id] ?? 2) + valueBonus(id);
        if (kind === 'friend') return 0;
        return emptySlot(s) >= 0 ? 7 : 3;
      });
    }
    if (this.archetype === null) {
      const names = Object.keys(ARCHETYPES);
      this.archetype = names[rngFor(s.seed, 'archetype', this.name).int(names.length)] as string;
    }
    const want = new Set(ARCHETYPES[this.archetype] ?? []);
    const rules = rulesOf(s);
    return pickRewardBy(s, (kind, id) => {
      if (kind === 'item' && this.opt.noItems) return -1000;
      if (kind === 'stock' && this.opt.roles && !this.opt.roles.includes(stockById(id).role)) return -1000;
      if (kind === 'item') return (ITEM_VALUE[id] ?? 2) + (want.has(id) ? 4 : 0) + valueBonus(id);
      if (kind === 'friend') return id === 'neimu' ? 4 + (want.has('paid_group') ? 4 : 0) : 3;
      // 稀有股票：空格或有亏损持仓时很值
      const e = emptySlot(s);
      if (e >= 0) return 7;
      const worst = Math.min(...s.slots.map((h) => (h ? h.value : 9)));
      return worst < 0.97 ? 5.5 : rules.slots > 4 ? 4 : 3;
    });
  }

  private event(s: GameState): Action {
    const e = s.event;
    if (!e) return { type: 'choose', option: 1 };
    const bad = rulesOf(s).eventBadMult;
    // 坏结果更坏（第 8 级）时，花钱碰运气的都不碰
    if (bad > 1 && ['side_hustle', 'fund_manager', 'blind_box', 'red_packet', 'course', 'lottery', 'classmate_loan'].includes(e.id)) {
      return { type: 'choose', option: 1 };
    }
    // 量化软件只对看不到真实阶段的人有用
    if (e.id === 'quant_trial' && this.opt.oracle) return { type: 'choose', option: 1 };
    // 仓位玩法：押跌体验卡（会押跌的收下）；银行经理、爸妈的电话不借钱、说实话；丈母娘发红包
    if (e.id === 'bear_live') return { type: 'choose', option: this.opt.short ? 0 : 1 };
    if (e.id === 'bank_manager' || e.id === 'parents_call') return { type: 'choose', option: 1 };
    if (e.id === 'mother_in_law') return { type: 'choose', option: 0 };
    // 只买白马 / 不拿道具的风格：不收来路不明的股票和道具
    if (this.opt.roles && (e.id === 'cousin' || e.id === 'cat_keyboard')) return { type: 'choose', option: 1 };
    if (this.opt.noItems && (e.id === 'course' || e.id === 'blind_box' || e.id === 'quant_trial')) return { type: 'choose', option: 1 };
    switch (e.id) {
      case 'cousin':
        return { type: 'choose', option: 1 };
      case 'livestream': {
        const t = e.theme ? s.themes[e.theme] : undefined;
        return { type: 'choose', option: e.theme && heldThemes(s).has(e.theme) && (t?.heat ?? 100) < 80 ? 0 : 1 };
      }
      case 'course':
        return { type: 'choose', option: s.items.filter((id) => ITEMS.find((d) => d.id === id)?.kind === 'tactic').length < 2 ? 0 : 1 };
      case 'lottery':
        return { type: 'choose', option: 1 };
      case 'landlord':
        return { type: 'choose', option: (e.amount ?? 0) * bad < nextBillOf(s) * (fx('landlord', 'billMult') - 1) * bad ? 1 : 0 };
      case 'classmate_loan':
      case 'cat_keyboard':
        return { type: 'choose', option: 1 };
      case 'red_packet':
        return { type: 'choose', option: rulesOf(s).eventBadMult > 1 ? 1 : 0 };
      case 'side_hustle':
      case 'fund_manager':
        return { type: 'choose', option: s.account - (e.amount ?? 0) > nextBillOf(s) * 1.6 ? 0 : 1 };
      case 'blind_box':
        return { type: 'choose', option: s.account - (e.amount ?? 0) > nextBillOf(s) * 1.4 ? 0 : 1 };
      default:
        return { type: 'choose', option: 0 };
    }
  }
}

/** oracle：已知阶段与剩余天数，往后几天的期望热度变化。 */
function projectOracle(
  stage: Stage,
  left: number,
  theme: ThemeId,
  heat: number,
  mrs: MarketRules[],
  boost: { dH: number; days: number } | null,
): number[] {
  // 用一个确定的分布：今天之后的阶段按剩余天数推进
  const out: number[] = [];
  let d = newDist();
  // 构造“已持续若干天、还剩 left−1 天”的分布：用 hazard 近似，直接把年龄设成让剩余天数最可能的值
  const [, hi] = stageDays(stage, theme);
  const age = Math.max(1, Math.min(MAXAGE, hi - (left - 1)));
  d[idx(SI[stage], age)] = 1;
  let h = heat;
  for (let k = 1; k < HORIZON; k++) {
    const mr = mrs[Math.min(k, mrs.length - 1)] as MarketRules;
    if (k === 1 && left - 1 > 0) {
      const c = newDist();
      c[idx(SI[stage], Math.min(MAXAGE, age + 1))] = 1;
      d = h >= BALANCE.heat.max ? predict(d, theme, h, mr) : c;
    } else {
      d = predict(d, theme, h, mr);
    }
    const b = boost && boost.days > k ? boost.dH : 0;
    const e = expectedDH(d, theme, h, mr, b);
    out.push(e);
    h = Math.max(0, Math.min(BALANCE.heat.max, h + e));
  }
  return out;
}
