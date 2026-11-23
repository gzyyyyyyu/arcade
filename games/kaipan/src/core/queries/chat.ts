/** 群聊。 */
import { flipDir, topicsOf } from '../chat.ts';
import { friendById, themeById } from '../content/index.ts';
import { validate } from '../engine/index.ts';
import { DIR_LABEL } from '../labels.ts';
import { rulesOf } from '../market.ts';
import type { Dir, GameState, ThemeId, TurnTalk } from '../types.ts';
import { type StockCard, stockCard } from './cards.ts';

// ================================================================ 群聊

export interface FriendView {
  id: string;
  name: string;
  title: string;
  desc: string;
  hits: number;
  total: number;
  /** 「说中 3/5」 */
  record: string;
  /** 擅长的题材名（大V为"当前最热"，群主为"全部"） */
  topics: string;
}

export function friendView(s: Readonly<GameState>, id: string): FriendView {
  const def = friendById(id);
  const f = s.friends.find((x) => x.id === id);
  const hits = f?.hits ?? 0;
  const total = f?.total ?? 0;
  let topics: string;
  if (def.topics === 'hottest') topics = '当前最热的风口';
  else if (def.topics === 'all') topics = '全部';
  else topics = (f ? topicsOf(s, f) : []).map((t) => themeById(t).name).join('、') || '（本局没有）';
  if (def.memes) topics += topics ? '、过山车股' : '过山车股';
  return { id, name: def.name, title: def.title, desc: def.desc, hits, total, record: total === 0 ? '新来的' : `说对 ${hits}/${total}`, topics };
}

export function friendsView(s: Readonly<GameState>): FriendView[] {
  return s.friends.map((f) => friendView(s, f.id));
}

export interface MessageView {
  index: number;
  friend: FriendView;
  theme: ThemeId;
  themeName: string;
  claim: Dir;
  claimLabel: string;
  text: string;
  /** 老王的小本本：这条必中 */
  certain: boolean;
  /** 拐点说法（要起飞了 / 差不多到顶了 / 该跑了），普通消息为 null */
  turn: TurnTalk | null;
  /** 反着信群主（道具）：这条按反方向读，readAs 是反过来的方向 */
  reverse: boolean;
  readAs: Dir | null;
  readAsLabel: string | null;
  /** 本周市场「反向群聊」：这条是反话，claim 就是他说的，要自己反着听 */
  liar: boolean;
}

export interface RecView {
  index: number;
  /** 推荐人；关闭群聊（模拟用）时为 null */
  friend: FriendView | null;
  text: string;
  stock: StockCard;
  taken: boolean;
  /** 现在能不能买（放进第一个空格）；不能时给原因 */
  error: string | null;
  /** 唱空的群友建议押它跌 */
  short: boolean;
  /** 本周市场「反向群聊」：这条推荐是反话 */
  liar: boolean;
}

export interface ChatView {
  messages: MessageView[];
  recs: RecView[];
  buysLeft: number;
}

export function chatView(s: Readonly<GameState>): ChatView {
  const rules = rulesOf(s);
  return {
    messages: s.today.messages.map((m, index) => ({
      index,
      friend: friendView(s, m.friendId),
      theme: m.theme,
      themeName: themeById(m.theme).name,
      claim: m.claim,
      claimLabel: DIR_LABEL[m.claim],
      text: m.text,
      // 只有道具指定的"必中"（credOverride ≥ 1）才标；其余可信度都封顶在 BALANCE.chat.credMax
      certain: (rules.credOverride[m.friendId] ?? 0) >= 1,
      turn: m.turn ?? null,
      reverse: !!m.reverse,
      readAs: m.reverse ? flipDir(m.claim) : null,
      readAsLabel: m.reverse ? DIR_LABEL[flipDir(m.claim)] : null,
      liar: !!m.liar,
    })),
    recs: s.today.recs.map((r, index) => ({
      index,
      friend: r.friendId ? friendView(s, r.friendId) : null,
      text: r.text,
      stock: stockCard(s, r.stockId),
      taken: r.taken,
      error: validate(s, { type: 'buy', rec: index }),
      short: !!r.short,
      liar: !!r.liar,
    })),
    buysLeft: s.today.buysLeft,
  };
}

/** 买入第 rec 条推荐放进 / 替换第 slot 格是否可行（不可行时给原因）。 */
export function buyError(s: Readonly<GameState>, rec: number, slot?: number): string | null {
  return validate(s, slot === undefined ? { type: 'buy', rec } : { type: 'buy', rec, slot });
}
