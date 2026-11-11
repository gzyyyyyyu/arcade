/**
 * 残局闯关的关卡表（docs/doudizhu.md「残局闯关」）：三家手牌全部公开，玩家是地主（0 号）先出，两家农民用最优应对。
 * 每关都由 tests/ddz/ddz-puzzles.test.ts 用求解器验过"地主有必胜的出法"，改牌就要重跑它。
 */
import { type Card, BIG_JOKER, SMALL_JOKER, makeCard } from '../../../core/cards.ts';

export interface DdzPuzzle {
  id: string;
  name: string;
  /** 一句提示，不剧透具体出法 */
  tip: string;
  /** 三家手牌：0 地主（玩家），1 地主的下家农民，2 地主的上家农民；每家升序 */
  hands: readonly (readonly Card[])[];
}

const RANKS: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14, '2': 2 };
const SUITS = 'shcd';

/**
 * 读一串牌：'BJ SJ 2 2 A 10 7h'。大王 BJ、小王 SJ，其余是点数，后面可跟一个花色字母（s 黑桃 h 红桃 c 梅花 d 方块）。
 * 没写花色的从还没用过的花色里按顺序给（黑桃、红桃、梅花、方块），所以关卡里只写点数就行。
 * `used` 在一关的三家之间共用，保证一副牌里同一张不出现两次。
 */
export function parseCards(text: string, used: Set<Card> = new Set()): Card[] {
  const out: Card[] = [];
  const explicit: { rank: number; suit: number }[] = [];
  const loose: number[] = [];
  for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
    if (tok === 'BJ') out.push(makeCard(BIG_JOKER, 0));
    else if (tok === 'SJ') out.push(makeCard(SMALL_JOKER, 0));
    else {
      const suit = SUITS.indexOf(tok[tok.length - 1]!);
      const body = suit >= 0 ? tok.slice(0, -1) : tok;
      const rank = RANKS[body] ?? Number(body);
      if (!Number.isInteger(rank) || rank < 2 || rank > 14) throw new Error(`看不懂的牌：${tok}`);
      if (suit >= 0) explicit.push({ rank, suit });
      else loose.push(rank);
    }
  }
  for (const { rank, suit } of explicit) out.push(makeCard(rank, suit));
  for (const c of out) {
    if (used.has(c)) throw new Error(`牌重复了：${c}`);
    used.add(c);
  }
  for (const rank of loose) {
    const suit = [0, 1, 2, 3].find((s) => !used.has(makeCard(rank, s)));
    if (suit === undefined) throw new Error(`点数 ${rank} 超过 4 张`);
    const c = makeCard(rank, suit);
    used.add(c);
    out.push(c);
  }
  return out;
}

function puzzle(id: string, name: string, tip: string, hands: readonly [string, string, string]): DdzPuzzle {
  const used = new Set<Card>();
  const parsed = hands.map((h) => parseCards(h, used));
  return { id, name, tip, hands: parsed.map((h) => h.sort((a, b) => a - b)) };
}

// 由易到难：前几关 2–3 手；中间加炸弹、"不要"和对方的炸弹；后面几关三家各 9–10 张，要出 5–6 手。
// 题目是离线随机发牌、用求解器筛出"必胜但容易走错"的，表里只留结果；改牌后要重跑 tests/ddz/ddz-puzzles.test.ts。
export const DDZ_PUZZLES: readonly DdzPuzzle[] = [
  puzzle('p01', '压轴顺子', '容易被压住的牌，留到最后一手出。',
    ['3 4 5 6 7 J J', '4 5 6 7 8 Q', '9 10 J Q K A']),
  puzzle('p02', '飞机带翅膀', '三连张可以带上单牌一起走。',
    ['3 4 6 6 6 7 7 7 J', '5 9 10 J K A A A', '3 3 7 10 J J Q Q']),
  puzzle('p03', '拆三张', '三张不一定整着出，拆开用。',
    ['6 9 10 J J J Q K', '3 3 5 7 10 Q K', '3 5 5 7 8 9 Q']),
  puzzle('p04', '对子压对子', '先试探，大对子留着压回来。',
    ['3 3 3 4 9 9 K K', '5 6 7 9 J J', '5 8 8 8 10 10']),
  puzzle('p05', '留大对压回', '先出小对子，手里留着更大的对子。',
    ['6 8 8 8 10 10 Q Q', '3 3 5 5 6 K A', '4 4 J J J Q K']),
  puzzle('p06', '放一手', '有时候"不要"才是好牌。',
    ['4 5 6 6 7 8 10', '3 8 9 9 J J', '3 4 5 7 8 Q']),
  puzzle('p07', '按兵不动', '对方出了大牌，别硬接，等他们把先手送回来。',
    ['4 5 6 6 7 8 9 J', '3 6 9 10 Q K A', '4 5 5 6 8 J K']),
  puzzle('p08', '步步为营', '三带一先走，剩下的对子和单张等机会。',
    ['3 3 3 5 8 8 9 J', '4 5 6 8 J K A', '4 5 7 10 10 Q A']),
  puzzle('p09', '炸弹等机会', '炸弹留着，拿它抢最后的先手。',
    ['4 4 4 4 9 10 J Q', '6 7 8 8 10 Q A', '3 6 6 6 8 J J']),
  puzzle('p10', '炸弹克 A', '对方的 A 压得住单张，压不住炸弹。',
    ['6 7 7 7 7 9 10 K', '3 8 9 J Q K A', '4 4 5 5 5 6 A']),
  puzzle('p11', '炸弹收网', '先让对方把大牌打出来，再用炸弹收回先手。',
    ['3 4 4 4 4 7 J K', '8 9 10 J J Q A', '5 7 8 10 10 J A']),
  puzzle('p12', '四带二开路', '四张一样的牌，不一定要当炸弹用。',
    ['3 5 5 5 5 6 J Q K', '3 7 8 8 J J Q K', '4 6 8 9 9 10 A A']),
  puzzle('p13', '送牌留炸', '先送出一张小牌，炸弹留到后面。',
    ['5 6 6 6 6 9 10 10 K', '4 8 9 9 J J Q Q', '3 5 7 7 8 8 10 A']),
  puzzle('p14', '炸弹压对子', '对方的对子压了你，用炸弹接回来。',
    ['4 6 6 9 Q Q Q Q K', '3 4 5 7 8 10 K A', '4 5 10 J J J J A']),
  puzzle('p15', '炸弹拦路', '对方有炸弹，想好它炸过来之后怎么办。',
    ['3 5 6 7 8 9 10 K A', '3 4 4 4 4 5 10 Q', '6 8 8 9 J Q A A']),
  puzzle('p16', '顺子被炸', '顺子被炸了不一定亏，关键看后面。',
    ['4 5 6 7 8 9 Q K A', '3 6 9 10 10 10 10 Q', '3 5 5 9 J K K A']),
  puzzle('p17', '小王拦路', '对方的小王压得住你的 J，想想怎么应付。',
    ['4 5 5 6 7 8 J J K', '4 5 6 6 8 J K SJ', '3 4 6 9 10 J Q Q']),
  puzzle('p18', '引出大牌', '送一张小牌出去，看谁会用大牌来压。',
    ['5 8 10 J J J J K A', '3 3 3 5 7 7 Q Q A', '3 4 6 7 9 9 10 10 Q']),
  puzzle('p19', '沉住气', '农民的牌好，不急着出牌，让他们先走。',
    ['7 7 8 10 J J J J K', '3 3 3 5 9 9 9 10 A', '4 4 4 6 7 8 9 K A']),
  puzzle('p20', '终极残局', '三家牌都是满的，每一步都要算。',
    ['4 5 5 5 5 9 9 10 K A', '3 3 7 7 9 J K K', '8 10 10 J Q Q Q A']),
];
