/**
 * 掼蛋结算页的分享卡数据（仓库根 docs/social.md 1.1）：把这一局 / 这一场的结果整理成 kit 分享卡要的数据（纯函数，tests/view/share-card.test.ts）。
 * 卡上只有公开的东西（胜负、名次、炸了几次、称号、实盘的分），不画任何人的手牌；那句话从模板拼，不收玩家的自由文字。
 * 画和分享在 common/share-card.ts（斗地主也用）。
 */
import type { ShareCard } from 'arcade-kit/share';
import { TITLE_INFO, type MatchLog, type Title } from '../../variants/guandan/stake/titles.ts';
import { AWARD_NAME, type Award } from '../../variants/guandan/net/awards.ts';
import { SHARE_ACCENT } from '../common/share-card.ts';
import { TIER_NAME, signed } from '../common/stake-text.ts';

/** 这一张分享的是什么 */
export type ShareKind =
  /** 娱乐：整局打完（单机或好友房） */
  | { kind: 'game'; win: boolean; room: string | null; /** 赢下整局要做到的（labels.ts 的 goalWord）；不给是"过 A" */ goal?: string }
  /** 实盘：一场结算（单机或好友房）；points 是这一场的分，chips 是折成的筹码 */
  | { kind: 'stake'; tier: keyof typeof TIER_NAME; points: number; chips: number; deals: number; room: string | null };

/** 我拿的称号（一队两个人的也算我），没有就 null */
export function myTitle(titles: readonly Title[]): Title | null {
  return titles.find((t) => t.seat === 0 || (t.pair && t.seat === 2)) ?? null;
}

/** 那一句话：有称号说称号，没有按结果说一句 */
function lineOf(k: ShareKind, log: MatchLog, title: Title | null): string {
  if (title) return `${TITLE_INFO[title.id].name}：${title.why}`;
  if (log.firsts[0]! > 0) return `拿了 ${log.firsts[0]} 次头游`;
  if (k.kind === 'game') return k.win ? `和对家一路${(k.goal ?? '过 A').replace('过', '打过')}` : `差一点就${!k.goal || k.goal === '过 A' ? '过 A 了' : k.goal}，下局再来`;
  return k.points > 0 ? '赢了一场实盘' : k.points < 0 ? '这场手气差了点' : '不输不赢，打了个平手';
}

/** 好友房一场的颁奖：奖（画面座位）和按座位取名字 */
interface ShareAwards {
  awards: readonly Award[];
  name: (seat: number) => string;
}

/** 有颁奖时那句话：我拿了奖写我的奖和那句话，没拿写这一场都颁给了谁 */
function awardLine(a: ShareAwards): { line: string; badge?: string } {
  const mine = a.awards.find((x) => x.seat === 0);
  if (mine) return { line: `${AWARD_NAME[mine.id]}：${mine.line}`, badge: AWARD_NAME[mine.id] };
  return { line: a.awards.map((x) => `${AWARD_NAME[x.id]} ${a.name(x.seat)}`).join(' · ') };
}

/**
 * 卡上的数据。log 是这一局攒的数（座位按画面：0 是我）；name 是我的昵称（好友房、有平台时），单机不写名字。
 * 好友房一场打完有颁奖时（awards），那句话和我的称号换成奖
 */
export function shareCardOf(k: ShareKind, log: MatchLog, titles: readonly Title[], name: string | null, awards?: ShareAwards): ShareCard {
  const title = myTitle(titles);
  const aw = awards?.awards.length ? awardLine(awards) : null;
  const badge = aw ? aw.badge : title ? TITLE_INFO[title.id].name : undefined;
  const where = k.room ? `好友房 ${k.room}` : '单机';
  const stats = [
    { label: '打了', value: `${k.kind === 'stake' ? k.deals : log.deals} 副` },
    { label: '头游', value: `${log.firsts[0]} 次` },
    { label: '炸弹', value: `${log.bombs[0]} 个` },
  ];
  const big =
    k.kind === 'game'
      ? { value: k.win ? '胜利' : '惜败', label: k.win ? `我方先${k.goal ?? '过 A'}` : `对方先${!k.goal || k.goal === '过 A' ? '过了 A' : k.goal}` }
      : // 输赢的筹码正绿负红（kit 0.24.3 的 sign）；不输不赢不给，照旧白字
        { value: signed(k.chips), label: `筹码（${signed(k.points)} 分）`, ...(Math.sign(k.chips || k.points) ? { sign: Math.sign(k.chips || k.points) } : {}) };
  return {
    game: '掼蛋',
    title: k.kind === 'game' ? `${where} · ${k.goal && k.goal !== '过 A' ? `短局${k.goal}` : '打到 A'}` : `${where} · 实盘${TIER_NAME[k.tier]}`,
    big,
    stats,
    line: aw ? aw.line : lineOf(k, log, title),
    accent: SHARE_ACCENT,
    ...(name ? { player: { name, ...(badge ? { badge } : {}) } } : {}),
  };
}
