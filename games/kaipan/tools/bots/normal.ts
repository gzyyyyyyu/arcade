/** normal（普通人）：看战绩、升温早期买、过热且看空就卖；以及它用到的月供、股灾、事件偏好等小件。 */
import {
  BALANCE,
  MONTHS,
  baseBill,
  feelOf,
  flipDir,
  fx,
  rulesOf,
  stockById,
  type Dir,
  type GameState,
  type Rng,
  type Role,
  type Stage,
  type ThemeId,
} from '../../src/core/index.ts';
import { type Bot, emptySlot, sellableSlots, themeOfStock, heldThemes, buyable, pickRewardBy } from './common.ts';

/** 普通玩家对道具的朴素偏好（越大越想要）。 */
export function simpleItemPref(id: string): number {
  const pref: Record<string, number> = {
    extra_slot: 3,
    ipo: 2.5,
    double_buy: 2,
    margin: 1.5,
    credit: 2,
    longtou: 1.5,
    genfeng: 1,
    baima: 1,
    yaogu: 1,
    lianban: 1,
    dixi: 1,
    zhisun: 2,
    zhiying: 1.5,
    paid_group: 2,
    notebook: 1.5,
    mood_meter: 2,
    hot_money: 1.5,
    value_eye: 1,
    fan_qunzhu: 1.5,
    diversify: 1,
    fomo: 1.5,
    night_review: 1.5,
    crowd_fund: 2.5,
    rumor_mill: 1.5,
    contrarian: 1.5,
    hold_tight: 1.5,
    dip_buyer: 1.5,
    early_bird: 1.5,
  };
  return pref[id] ?? 1;
}

/** 下个月的常规月供（估算，公开规则：基础月供 × 规则表倍数）。 */
export function nextBillOf(s: GameState): number {
  const m = Math.min(MONTHS, s.month + 1);
  return baseBill(m) * rulesOf(s).billMult * s.nextBillMult;
}

/** 熬夜复盘：今天盘前能看到哪个题材昨天收盘时的阶段。 */
export function reviewOf(s: GameState, theme: ThemeId): Stage | null {
  const r = s.review;
  return r && r.day === s.dayIndex - 1 && r.theme === theme ? r.stage : null;
}

/** 本月有股灾传闻、且还没发生（公开：lastDay.crash 收盘后揭晓）。返回今天出事的概率（0 表示不会）。 */
export function crashRisk(s: GameState, crashed: boolean): number {
  if (s.notice?.id !== 'crash' || crashed) return 0;
  const [lo, hi] = BALANCE.crash.day;
  const d = s.dayInMonth;
  if (d < lo || d > hi) return 0;
  return 1 / (hi - d + 1);
}

/** 消息对机器人来说的方向：反着信群主的消息要反过来读。 */
function readClaim(m: { claim: Dir; reverse?: boolean }): Dir {
  return m.reverse ? flipDir(m.claim) : m.claim;
}

/** 新事件的普通人选择（大致随机，偏向占小便宜）。 */
export function casualEvent(id: string, rng: Rng): number {
  const yes: Record<string, number> = {
    landlord: 0.5,
    classmate_loan: 0.5,
    side_hustle: 0.5,
    cat_keyboard: 0.5,
    red_packet: 0.8,
    quant_trial: 0.5,
    blind_box: 0.4,
    fund_manager: 0.3,
    overtime: 0.6,
    salary_advance: 0.4,
    old_trader: 0.5,
    invest_group: 0.5,
    broker_tea: 0.4,
    show_off: 0.5,
    free_eggs: 0.5,
  };
  return rng.next() < (yes[id] ?? 0.5) ? 0 : 1;
}

// ================================================================ normal

/** 机器人对股灾的记忆：收盘后公开的 lastDay.crash 记下出事的月份。 */
export class CrashMemory {
  private month = -1;
  update(s: GameState): void {
    if (s.lastDay?.crash) this.month = s.lastDay.month;
  }
  /** 本月有传闻、还没出事 */
  pending(s: GameState): boolean {
    return s.notice?.id === 'crash' && this.month !== s.month;
  }
  crashed(s: GameState): boolean {
    return this.month === s.month;
  }
}

/** 题材的公开打分（体感 + 消息 + 情绪指标）。正数看多。 */
function normalThemeScore(s: GameState, theme: ThemeId, trust: (f: string) => number, ignoreMsg = false): number {
  const t = s.themes[theme];
  if (!t) return -9;
  const feel = feelOf(t.history);
  const reveal = rulesOf(s).revealStages ? t.lastStage : reviewOf(s, theme);
  let score: number;
  if (reveal) {
    score = { cold: 0, sprout: 1.5, ferment: 1.5, rally: 0.8, climax: -1, ebb: -1.5 }[reveal];
  } else {
    score = { cold: 0, warming: t.heat < 60 ? 1.2 : 0.6, hot: 0.3, overheated: -0.5, cooling: -1 }[feel];
  }
  for (const m of ignoreMsg ? [] : s.today.messages) {
    if (m.theme !== theme) continue;
    const w = ((m.reverse ? fx('fan_qunzhu', 'acc') : trust(m.friendId)) - 0.45) * 3;
    const claim = readClaim(m);
    score += (claim === 'up' ? 1 : claim === 'down' ? -1 : -0.2) * w;
  }
  return score;
}

/** normal 割肉线：持有亏损超过这个比例就卖。 */
const NORMAL_CUT = 0.2;
/** normal 买入的最低打分 */
const NORMAL_BUY = 0.4;
/** normal 对角色的偏好（喜欢龙头，不碰 ST） */
const NORMAL_ROLE: Record<Role, number> = { leader: 0.6, follower: 0, bluechip: -0.2, meme: 0.1, st: -1, ipo: 0 };

export function normalBot(ignoreMsg = false): Bot {
  const crash = new CrashMemory();
  return {
    name: ignoreMsg ? 'normal-nomsg' : 'normal',
    act(s, rng) {
      crash.update(s);
      const trust = (id: string): number => {
        const f = s.friends.find((x) => x.id === id);
        if (!f || f.total < 3) return 0.6;
        return f.hits / f.total;
      };
      if (s.phase === 'reward') {
        return pickRewardBy(s, (kind, id) => {
          if (kind === 'item') return 2 + simpleItemPref(id) + rng.next();
          if (kind === 'friend') return 3 + rng.next();
          const theme = themeOfStock(id);
          return emptySlot(s) >= 0 ? 4 : normalThemeScore(s, theme, trust, ignoreMsg) > 0 ? 3 : 1;
        });
      }
      if (s.phase === 'event') {
        const e = s.event;
        if (!e) return { type: 'choose', option: 1 };
        if (e.id === 'cousin') return { type: 'choose', option: rng.next() < 0.3 ? 0 : 1 };
        if (e.id === 'course' || e.id === 'lottery') return { type: 'choose', option: rng.next() < 0.25 ? 0 : 1 };
        if (e.id === 'livestream') return { type: 'choose', option: e.theme && heldThemes(s).has(e.theme) ? 0 : 1 };
        if (e.id === 'lottery_party' || e.id === 'bonus') return { type: 'choose', option: 0 };
        return { type: 'choose', option: casualEvent(e.id, rng) };
      }
      // 股灾：传闻出来时普通人将信将疑、照常操作；真跌了就吓得全卖、这个月不敢再买（割在地板上，错过反弹）
      if (crash.crashed(s)) {
        const sell = sellableSlots(s)[0];
        if (sell !== undefined && s.today.ops < 2) return { type: 'sell', slot: sell };
        return { type: 'open' };
      }
      // 卖出：过热又遇到看空消息；战绩好的群友说跌；连跌两天；亏太多割肉
      const coolTwice = (theme: ThemeId): boolean => {
        const hist = s.themes[theme]?.history ?? [];
        const n = hist.length;
        if (n < 3) return false;
        return (hist[n - 1] as number) - (hist[n - 2] as number) <= -4 && (hist[n - 2] as number) - (hist[n - 3] as number) <= -4;
      };
      if (s.today.ops < 2) {
        for (const i of sellableSlots(s)) {
          const h = s.slots[i];
          if (!h) continue;
          const theme = themeOfStock(h.stockId);
          const t = s.themes[theme];
          if (!t) continue;
          const feel = feelOf(t.history);
          const msgs = ignoreMsg ? [] : s.today.messages.filter((m) => m.theme === theme);
          const tr = (m: (typeof msgs)[number]): number => (m.reverse ? fx('fan_qunzhu', 'acc') : trust(m.friendId));
          const bearish = msgs.some((m) => readClaim(m) === 'down');
          const trustedDown = msgs.some((m) => readClaim(m) === 'down' && tr(m) >= 0.65);
          const hotNow = feel === 'overheated' || feel === 'hot';
          const cut = h.value < 1 - NORMAL_CUT;
          const seen = rulesOf(s).revealStages ? t.lastStage : reviewOf(s, theme);
          const reveal = seen === 'ebb' || seen === 'climax';
          const cooling = feel === 'cooling' && !msgs.some((m) => readClaim(m) === 'up' && tr(m) >= 0.65);
          if ((hotNow && bearish) || trustedDown || cooling || coolTwice(theme) || cut || reveal) return { type: 'sell', slot: i };
        }
      }
      // 买入：升温早期，分散在两个题材里（手里的题材凉了可以换）；没有空格时把亏钱或降温的换掉
      if (s.today.buysLeft > 0 && s.today.ops < 2) {
        const held = heldThemes(s);
        const stale = new Set<ThemeId>();
        for (const th of held.keys()) {
          const f = feelOf(s.themes[th]?.history ?? []);
          if (f === 'cooling' || f === 'cold') stale.add(th);
        }
        const fresh = [...held.keys()].filter((th) => !stale.has(th));
        let best = -1;
        let bestScore = NORMAL_BUY;
        s.today.recs.forEach((r, i) => {
          if (!buyable(s, i)) return;
          const theme = themeOfStock(r.stockId);
          if (fresh.length >= 2 && !held.has(theme)) return;
          if ((held.get(theme) ?? 0) >= 2) return;
          const def = stockById(r.stockId);
          let score = normalThemeScore(s, theme, trust, ignoreMsg) + NORMAL_ROLE[def.role];
          score += (trust(r.friendId) - 0.5) * 2;
          if (score > bestScore) {
            bestScore = score;
            best = i;
          }
        });
        if (best >= 0) {
          const e = emptySlot(s);
          if (e >= 0) return { type: 'buy', rec: best, slot: e };
          if (bestScore > 1.2) {
            const victim = sellableSlots(s).find((i) => {
              const h = s.slots[i];
              return !!h && (h.value < 0.92 || stale.has(themeOfStock(h.stockId)));
            });
            if (victim !== undefined) return { type: 'buy', rec: best, slot: victim };
          }
        }
      }
      return { type: 'open' };
    },
  };
}

