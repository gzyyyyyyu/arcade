/** 道具、奖励、事件。 */
import type { EventPick } from '../content/index.ts';
import { BALANCE } from '../balance.ts';
import { EVENT_BRIEF, ITEM_BRIEF, eventById, friendById, itemById, themeById } from '../content/index.ts';
import { ITEM_KIND_LABEL, RARITY_LABEL, REWARD_KIND_LABEL } from '../labels.ts';
import type { GameState, ItemKind, Rarity, RewardKind, ThemeId } from '../types.ts';
import { type StockCard, stockCard } from './cards.ts';
import { type FriendView, friendView } from './chat.ts';

// ================================================================ 道具、奖励、事件

export interface ItemView {
  id: string;
  name: string;
  kind: ItemKind;
  kindLabel: string;
  rarity: Rarity;
  rarityLabel: string;
  /** 0.3.1：一行的分类，如"道具（常见）"（kindLabel 的打法 / 工具 / 人脉只建议放在提示里） */
  tag: string;
  desc: string;
  flavor: string;
  /** 0.5 卡片短版：大数字（可缺）+ 一行（≤14 字）；desc 留在悬停详情 */
  brief: { big?: string; line: string };
}

export function itemView(id: string): ItemView {
  const d = itemById(id);
  return {
    id,
    name: d.name,
    kind: d.kind,
    kindLabel: ITEM_KIND_LABEL[d.kind],
    rarity: d.rarity,
    rarityLabel: RARITY_LABEL[d.rarity],
    tag: `${REWARD_KIND_LABEL.item}（${RARITY_LABEL[d.rarity]}）`,
    desc: d.desc(),
    flavor: d.flavor,
    brief: ITEM_BRIEF[id]?.() ?? { line: d.name },
  };
}

export interface RewardView {
  index: number;
  kind: RewardKind;
  kindLabel: string;
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  rarityLabel: string;
  /** 0.3.1：一行的分类，如"道具（常见）""新群友（稀有）""股票（传奇）" */
  tag: string;
  /** 道具卡 */
  item: ItemView | null;
  /** 群友卡 */
  friend: FriendView | null;
  /** 股票卡（所在风口这个月一定会要火） */
  stock: StockCard | null;
  /** 0.5 卡片短版：大数字（可缺）+ 一行（≤14 字）；desc 留在悬停详情 */
  brief: { big?: string; line: string };
}

export function rewardView(s: Readonly<GameState>): RewardView[] {
  if (!s.reward) return [];
  return s.reward.cards.map((c, index) => {
    const base = {
      index,
      kind: c.kind,
      kindLabel: REWARD_KIND_LABEL[c.kind],
      id: c.id,
      rarity: c.rarity,
      rarityLabel: RARITY_LABEL[c.rarity],
      tag: `${REWARD_KIND_LABEL[c.kind]}（${RARITY_LABEL[c.rarity]}）`,
    };
    if (c.kind === 'item') {
      const item = itemView(c.id);
      return { ...base, name: item.name, desc: item.desc, item, friend: null, stock: null, brief: item.brief };
    }
    if (c.kind === 'friend') {
      const def = friendById(c.id);
      const topics = def.topics === 'random2' ? '随机两个风口' : Array.isArray(def.topics) ? (def.topics as readonly ThemeId[]).map((t) => themeById(t).name).join('、') : '';
      const cred = BALANCE.cred[c.id]?.[0] ?? 0.5;
      const friend = friendView(s, c.id);
      return {
        ...base,
        name: def.name,
        desc: `${def.title}，专聊${topics}，消息很准（大约 ${Math.round(cred * 100)}% 说对）`,
        item: null,
        friend,
        stock: null,
        brief: { big: `${Math.round(cred * 100)}%准`, line: `专聊${topics}` },
      };
    }
    const stock = stockCard(s, c.id);
    return {
      ...base,
      name: stock.name,
      desc: s.real
        ? `${stock.themeName}风口的${stock.roleLabel}。内部消息说它下个月走势偏强（消息大多靠谱，但不是百分百），可以直接放进手里`
        : `${stock.themeName}风口的${stock.roleLabel}。它所在的风口这个月一定会"要火"，可以直接放进手里`,
      item: null,
      friend: null,
      stock,
      brief: { line: s.real ? '内部消息：下个月偏强' : '它的风口这个月准火' },
    };
  });
}

export interface EventView {
  id: string;
  name: string;
  text: string;
  options: [string, string];
  /** 0.5 卡片短版：一行情景（≤20 字）、两个选项（≤8 字 + 大数字）；text / options 原句留在悬停详情 */
  brief: string;
  picks: [EventPick, EventPick];
}

export function eventView(s: Readonly<GameState>): EventView | null {
  if (!s.event) return null;
  const d = eventById(s.event.id);
  const options = d.options(s.event, s);
  const b = EVENT_BRIEF[d.id];
  return {
    id: d.id,
    name: d.name,
    text: d.text(s.event, s),
    options,
    brief: b ? b.brief(s.event, s) : d.name,
    picks: b ? b.picks(s.event, s) : [{ label: options[0] }, { label: options[1] }],
  };
}
