/**
 * 川麻·血战到底的新手引导和规则页内容（番型表、血战规矩）；外壳（页签、弹窗）在 view/guide.ts。
 */
import { el } from '../../dom.ts';
import { FAN_NAME, FAN_TABLE } from '../../text.ts';
import { renderDex, type DexRow } from '../../dex.ts';
import { S, T, tilesRow, W, type Groups, type Tab } from '../../guide-kit.ts';
import type { FanId } from '../../../core/variants/sichuan-xuezhan/index.ts';

export const PAGES: [string, string[], Groups][] = [
  ['怎么胡', ['手里 14 张凑成 4 组（三张顺子或三张一样）加 1 对，就胡了。', '七个对子也能胡。', '别人打的牌能“碰”（你有一对）、“杠”（你有三张），不能吃。'], [W(1, 2, 3), W(4, 5, 6), T(7, 8, 9), T(2, 3, 4), S(5, 5)]],
  ['换三张、定缺', ['开局先挑三张同一门的牌换给别人。', '再定一门“缺”：这门牌一张都不要，先打干净才能胡。', '万、筒、条，只留两门。'], [S(2, 5, 9)]],
  // 新手说明第 3 页不用行话（刮风、下雨、花猪这些留在规则册里，11-21 新手试玩：第 3 页术语多、看不进去）
  ['血战到底', ['有人胡了不算完，剩下的人接着打，直到三家都胡了，或者牌摸完。', '杠了当场收钱：杠别人打的牌，打的那家给；自己摸到第 4 张，没胡的每家都给。', '牌摸完还没胡：手里还留着不要的那门，或者还没听牌，都要赔钱。'], [T(5, 5, 5, 5)]],
];

/** 番型的一手牌例；按时机算的番（杠上开花、海底这些）没有牌例 */
const FAN_EXAMPLE: Partial<Record<FanId, Groups>> = {
  ping: [W(1, 2, 3), W(4, 5, 6), T(7, 8, 9), T(2, 3, 4), S(5, 5)],
  pengpeng: [W(1, 1, 1), W(5, 5, 5), T(3, 3, 3), T(7, 7, 7), S(2, 2)],
  qing: [W(1, 2, 3), W(3, 4, 5), W(6, 7, 8), W(9, 9, 9), W(5, 5)],
  qidui: [W(1, 1), W(3, 3), W(6, 6), T(2, 2), T(5, 5), T(8, 8), T(9, 9)],
  longqidui: [W(1, 1, 1, 1), W(3, 3), W(6, 6), T(2, 2), T(5, 5), T(8, 8)],
  jiangdui: [W(2, 2, 2), W(5, 5, 5), T(2, 2, 2), T(5, 5, 5), T(8, 8)],
  yaojiu: [W(1, 2, 3), W(7, 8, 9), T(1, 2, 3), T(7, 8, 9), W(9, 9)],
  jingou: [W(1, 1, 1), W(5, 5, 5), T(3, 3, 3), T(7, 7, 7), S(2)],
  gen: [W(6, 6, 6, 6)],
};

/** 规则页签（图鉴、成就由外壳画）：怎么胡 / 番型 / 血战规矩 / 电脑公平吗 */
export function rulesPage(page: HTMLElement, at: Tab): void {
  if (at === '怎么胡') {
    el('h2', '', page, '怎么胡');
    tilesRow(page, PAGES[0]![2]);
    for (const l of PAGES[0]![1]) el('p', '', page, l);
    el('h2', '', page, '换三张、定缺');
    for (const l of PAGES[1]![1]) el('p', '', page, l);
  } else if (at === '番型') {
    el('p', 'note', page, '一把 = 底分 × 2 的番数次方，番数相加，到封顶为止。自摸每家多付一个底分。');
    const table = el('table', '', page);
    for (const [id, fan, desc] of FAN_TABLE) {
      const tr = el('tr', '', table);
      el('td', 'n', tr, FAN_NAME[id]);
      el('td', 'f', tr, fan === '封顶' || fan.startsWith('+') ? fan : `${fan} 番`);
      const d = el('td', 'd', tr, desc);
      const ex = FAN_EXAMPLE[id];
      if (ex) tilesRow(d, ex);
    }
  } else if (at === '血战规矩') {
    el('h2', '', page, '血战到底');
    for (const l of PAGES[2]![1]) el('p', '', page, l);
    el('h2', '', page, '刮风下雨');
    el('p', '', page, '直杠：点杠的人付 2 倍底分；补杠：没胡的每家付 1 倍；暗杠：没胡的每家付 2 倍。杠完打出去被胡（杠上炮），杠钱转给胡的人（呼叫转移）。');
    el('h2', '', page, '牌摸完了');
    el('p', '', page, '花猪（手里还有缺门）赔每家封顶；没听牌的赔听牌的人他能胡的最大番；没听牌的人杠钱退回（退税）。');
    el('h2', '', page, '血流成河');
    el('p', '', page, '规则设置里打开“血流成河”：胡了不下桌，接着摸牌打牌，可以胡第二次、第三次，一直打到牌墙摸完，每次胡当场算钱。');
    el('p', '', page, '胡了以后手牌锁住：只能打刚摸的那张，或者再胡、不改听牌的杠，不能碰。实盘也能开，底分减半。');
    el('h2', '', page, '三人两房');
    el('p', '', page, '主页选“三人两房”：只有 3 个人，牌只有筒子和条子（72 张），没有万字，所以不用定缺。换三张只在上家、下家之间换。');
    el('p', '', page, '两家胡了牌局就结束；牌摸完时，没听牌的人照样赔听牌的人。娱乐、实盘、好友房和快速匹配都能开。');
  } else {
    // 电脑不看牌（DESIGN.md 5.4 的测试）玩家看不见，单独一页写明；一局结束的结算里亮出所有人的牌，自己能对
    el('h2', '', page, '电脑公平吗');
    el('p', '', page, '电脑和你一样看不到别人的牌：它只知道自己的手牌和桌上打出来、碰杠亮出来的牌，牌墙也不知道。每局打完，结算里亮出所有人的牌，可以对一对。');
    el('p', '', page, '牌河里变暗的牌，是被人碰走、杠走或者胡走的。');
  }
}

/** 图鉴：行的名字、番数、说明和牌例都取自番型表，不另写一份 */
export function dexPage(page: HTMLElement): void {
  const draw = (ex?: Groups) => (ex ? (p: HTMLElement) => tilesRow(p, ex) : undefined);
  const rows: DexRow[] = FAN_TABLE.map(([id, fan, desc]) => ({ id, name: FAN_NAME[id], han: fan === '封顶' || fan.startsWith('+') ? fan : `${fan} 番`, desc, draw: draw(FAN_EXAMPLE[id]) }));
  renderDex(page, 'xz', [{ rows }]);
}
