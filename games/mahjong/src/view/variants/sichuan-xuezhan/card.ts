/**
 * 川麻·血战到底的战绩分享卡（docs/social.md 1.1）：图上只有公开的、自己的东西，别人的手牌、牌墙一律不进图。
 * 通用的部分（颁奖卡、每日卡、预画）在 view/share.ts。
 */
import type { ShareCard } from 'arcade-kit/share';
import type { XzView } from '../../../core/variants/sichuan-xuezhan/index.ts';
import type { Highlight } from '../../../game/banter.ts';
import { GAME_NAME, HIGHLIGHT_NAME, signed, TITLE_NAME } from '../../text.ts';

/** 卡的主题色：牌桌的墨绿呢子 */
const ACCENT = '#0f5a41';

export interface CardInput {
  /** 这一张是什么："娱乐·新手 · 8 局"、"实盘小档 · 8 局"、"好友房 · 娱乐 · 8 局" */
  title: string;
  /** 实盘写"筹码"，娱乐写"分" */
  unit: string;
  name: string;
  fame: readonly Highlight[];
}

/** 自己这一场的战绩图数据（没打完、旁观的没有） */
export function cardOf(v: XzView, o: CardInput): ShareCard | null {
  const me = v.me?.seat;
  const r = me === undefined ? undefined : v.result?.seats[me];
  if (me === undefined || !r) return null;
  const st = v.seats[me]!.stats;
  const titles = r.stats.titles ?? [];
  const badge = titles[0] === undefined ? undefined : TITLE_NAME[titles[0]];
  // 名场面挑自己胡的最后一个（一场里往往是最响的那下）。一炮多响记在点炮的人头上，不拿来晒；没有就说拿到的称号
  const h = o.fame.filter((x) => x.seat === me && !FEEDER.has(x.id)).at(-1);
  const line = h ? `第 ${h.round + 1} 局 ${HIGHLIGHT_NAME[h.id]}` : badge ? `这一场拿到「${badge}」` : undefined;
  return {
    game: GAME_NAME,
    title: o.title,
    accent: ACCENT,
    big: { value: signed(r.net), label: o.unit },
    stats: [
      { label: '胡牌', value: `${st.wins} 局` },
      { label: '最大', value: `${r.stats.max?.xz_fan ?? 0} 番` },
      { label: '杠', value: `${st.gangs} 个` },
    ],
    ...(line ? { line } : {}),
    player: { name: o.name, ...(badge ? { badge } : {}) },
  };
}

/** 名场面里记在点炮的人头上的（一炮双响、三响） */
const FEEDER = new Set<Highlight['id']>(['multi2', 'multi3']);
