/**
 * 名场面（0.7.1）：一副里值得说一嘴的时刻，打的时候冒一下，结算页的复盘里记一行。
 * 只用公开信息（出牌记录、名次、两队级数），不看任何人的手牌；画面座位和真实座位都行（只比队伍和座位是不是同一个）。
 */
import { isBomb, type DealResult, type Play, type PlayRecord } from '../../variants/guandan/core/index.ts';

import type { Title } from '../../variants/guandan/stake/titles.ts';

type HighlightKind = 'jokerBomb' | 'bombOnBomb' | 'bombs3' | 'comeback' | 'doubleDown' | 'quick';

export interface Highlight {
  kind: HighlightKind;
  seat: number;
  /** 炸了几次、落后几级、几手出完 */
  n?: number;
}

const team = (s: number): number => s % 2;

/** 几手以内出完算"秒走"（一个人 27 张，平常要十几手） */
const QUICK_PLAYS = 7;

/**
 * 这一手是不是"炸上炸"：用炸弹压住了对方的炸弹。history 里还没有这一手。
 * 上一手有牌的是对方的炸弹，就一定是同一墩：一墩结束后只有赢的人（或接风的队友）能领出，不会是对方
 */
export function bombOnBomb(history: readonly PlayRecord[], seat: number, play: Play): boolean {
  if (!isBomb(play)) return false;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]!;
    if (!h.play) continue;
    return isBomb(h.play) && team(h.seat) !== team(seat);
  }
  return false;
}

/** 一副结束时的名场面，按精彩程度排（最多给几条由调用方取） */
export function dealHighlights(r: DealResult, history: readonly PlayRecord[]): Highlight[] {
  const out: Highlight[] = [];
  const bombs = new Map<number, number>();
  let jokerBy = -1;
  let bob: Highlight | null = null;
  for (let i = 0; i < history.length; i++) {
    const h = history[i]!;
    if (!h.play || !isBomb(h.play)) continue;
    bombs.set(h.seat, (bombs.get(h.seat) ?? 0) + 1);
    if (h.play.type === 'jokerBomb') jokerBy = h.seat;
    if (!bob && bombOnBomb(history.slice(0, i), h.seat, h.play)) bob = { kind: 'bombOnBomb', seat: h.seat };
  }
  const head = r.order[0]!;
  const behind = r.levelsBefore[1 - r.winnerTeam]! - r.levelsBefore[r.winnerTeam]!;
  if (r.doubleDown && behind >= 3) out.push({ kind: 'comeback', seat: head, n: behind });
  if (jokerBy >= 0) out.push({ kind: 'jokerBomb', seat: jokerBy });
  if (bob) out.push(bob);
  const most = [...bombs.entries()].sort((a, b) => b[1] - a[1])[0];
  if (most && most[1] >= 3) out.push({ kind: 'bombs3', seat: most[0], n: most[1] });
  if (r.doubleDown && behind < 3) out.push({ kind: 'doubleDown', seat: head });
  const plays = history.filter((h) => h.seat === head && h.play).length;
  if (plays <= QUICK_PLAYS) out.push({ kind: 'quick', seat: head, n: plays });
  return out;
}

/**
 * 结算页"故事框"的取舍：名场面和称号常把同一个人的同一件事各写一遍（炸上炸、一副炸了 3 次、炸弹狂魔；
 * 双下、最佳搭档），五行挤在一起。同一个人的同一类事只留信息更具体的一条，再按行数封顶。
 * 评法和文字模板不动，只做挑选。电脑上最多 3 行（名场面最多 2 条，称号补满），手机各留一条。
 */
export function storyPicks(hl: readonly Highlight[], titles: readonly Title[], phone: boolean): { hl: Highlight[]; titles: Title[] } {
  let hl2 = [...hl];
  let ti2 = [...titles];
  // 炸弹类：炸上炸（具体的一次）> 炸弹狂魔（称号，带次数）> 一副炸了 N 次；同一座位只留最具体的一类。天王炸是另一件事，不并
  const bombRank = (k: string): number => (k === 'bombOnBomb' ? 0 : k === 'bomb_maniac' ? 1 : k === 'bombs3' ? 2 : -1);
  const best = new Map<number, number>();
  const note = (seat: number, rank: number): void => {
    if (rank >= 0) best.set(seat, Math.min(best.get(seat) ?? 9, rank));
  };
  for (const h of hl2) note(h.seat, bombRank(h.kind));
  for (const t of ti2) note(t.seat, bombRank(t.id));
  hl2 = hl2.filter((h) => bombRank(h.kind) < 0 || best.get(h.seat) === bombRank(h.kind));
  ti2 = ti2.filter((t) => bombRank(t.id) < 0 || best.get(t.seat) === bombRank(t.id));
  // 双下：落后 N 级的双下（带级差）> 最佳搭档 > 光写"双下"。双下一副只有一队，不用比座位
  if (hl2.some((h) => h.kind === 'comeback')) {
    hl2 = hl2.filter((h) => h.kind !== 'doubleDown');
    ti2 = ti2.filter((t) => t.id !== 'best_partner');
  } else if (ti2.some((t) => t.id === 'best_partner')) hl2 = hl2.filter((h) => h.kind !== 'doubleDown');
  const hlOut = hl2.slice(0, phone ? 1 : 2);
  const tiOut = ti2.slice(0, phone ? 1 : Math.max(0, 3 - hlOut.length));
  return { hl: hlOut, titles: tiOut };
}

/** 给人看的一句（name 把座位换成名字） */
export function highlightText(h: Highlight, name: (seat: number) => string): string {
  const who = name(h.seat);
  switch (h.kind) {
    case 'jokerBomb':
      return `${who} 的天王炸`;
    case 'bombOnBomb':
      return `${who} 炸上炸`;
    case 'bombs3':
      return `${who} 一副炸了 ${h.n} 次`;
    case 'comeback':
      return `落后 ${h.n} 级，${who} 这边打出双下`;
    case 'doubleDown':
      return `${who} 这边双下`;
    case 'quick':
      return `${who} ${h.n} 手出完`;
  }
}

/**
 * 炸弹的戏分三档（art-v3，docs/art.md 第 5 节）：1 = 四炸；2 = 五、六炸；3 = 同花顺、七炸以上、天王炸。
 * 档位只管画面和声音的大小（闪光、震屏、光圈、纸屑），不碰规则
 */
export function bombDrama(play: Pick<Play, 'type' | 'cards'>): 1 | 2 | 3 {
  if (play.type === 'jokerBomb' || play.type === 'straightFlush' || play.cards.length >= 7) return 3;
  return play.cards.length >= 5 ? 2 : 1;
}
