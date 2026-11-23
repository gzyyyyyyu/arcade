/**
 * 立直麻将的新手引导和规则页内容（役种表、立直和振听）；外壳（页签、弹窗）在 view/guide.ts。
 */
import { el } from '../../dom.ts';
import { YAKU_NAME, type YakuId } from '../../../core/variants/riichi/index.ts';
import { renderDex, type DexRow } from '../../dex.ts';
import { RED5, S, T, tilesRow, W, Z, type Groups, type Tab } from '../../guide-kit.ts';

/** 立直的引导：怎么胡、立直、必须有役、振听 */
export const RC_PAGES: [string, string[], Groups][] = [
  ['怎么胡', ['手里 14 张凑成 4 组（三张顺子或三张一样）加 1 对，就胡了。七个对子、十三种幺九牌也能胡。', '别人打的牌：只能吃上家的，碰、杠谁都行；点数不用算，打完一局会列清楚。'], [W(1, 2, 3), T(4, 5, 6), S(7, 8, 9), W(2, 3, 4), Z(1, 1)]],
  ['立直', ['没吃碰的时候，手里 13 张只差一张就胡了，可以喊“立直”：放 1,000 点的棒，之后只能摸什么打什么。', '立直本身 1 番，胡牌后还会翻开“里宝牌”，多赚几番。'], [W(1, 2, 3), W(4, 5, 6), T(7, 8, 9), S(2, 3), Z(1, 1)]],
  ['必须有役', ['光凑齐了不能胡，还要有至少一个“役”：立直、断幺九（没有 1、9 和字牌）、役牌（白发中、自己的风）……', '宝牌只加番，不算役；赤宝牌（红五）也一样。'], [W(2, 3, 4), T(3, 4, 5), S(6, 7, 8), T(5, 5), [RED5('w'), RED5('t'), RED5('s')]]],
  ['振听', ['自己打过的牌里有你要胡的牌，就不能胡别人打的牌，只能自摸。', '放过一次可以胡的牌，到你下次摸牌前也不能胡别人打的牌；立直以后放过，这一局都不能。提示条会写“振听：只能自摸”。'], [W(1, 2, 3), T(4, 5, 6), S(7, 8, 9), Z(5, 5), W(4, 7)]],
];

/** 立直的役种表：名字、番数（副露减番的写在括号里）、一句话；有的配一手牌例。只写字和程序画的牌面 */
const RC_YAKU: [YakuId | string, string, string, Groups?][] = [
  ['riichi', '1', '没吃碰、听牌时宣告，放 1,000 点棒'],
  ['ippatsu', '1', '立直后一巡内胡牌'],
  ['tsumo', '1', '没吃碰，自己摸到胡牌'],
  ['pinfu', '1', '四组全是顺子、对子不是役牌、两头听', [W(2, 3, 4), W(5, 6, 7), T(2, 3, 4), S(6, 7, 8), T(9, 9)]],
  ['tanyao', '1', '全是 2 到 8 的数牌，吃碰也行', [W(2, 3, 4), T(3, 4, 5), S(6, 7, 8), S(4, 5, 6), W(5, 5)]],
  ['iipeikou', '1', '没吃碰，有两组一模一样的顺子', [W(2, 3, 4), W(2, 3, 4), T(5, 6, 7)]],
  ['yakuhai', '1', '白、发、中，或者场风、自风的三张一样', [Z(5, 5, 5), Z(6, 6, 6), Z(7, 7, 7)]],
  ['rinshan', '1', '杠完补的牌正好自摸'],
  ['chankan', '1', '别人加杠的那张，你正好胡'],
  ['haitei', '1', '摸最后一张自摸；和最后一张打出的牌也是 1 番'],
  ['double_riichi', '2', '第一巡就立直'],
  ['chiitoi', '2', '七个不同的对子', [W(1, 1), W(3, 3), T(5, 5), T(8, 8), S(2, 2), Z(1, 1), Z(7, 7)]],
  ['sanshoku', '2（吃碰 1）', '万筒索各有一组同样数字的顺子', [W(3, 4, 5), T(3, 4, 5), S(3, 4, 5)]],
  ['ittsu', '2（吃碰 1）', '同一门里 123、456、789 三组', [W(1, 2, 3), W(4, 5, 6), W(7, 8, 9)]],
  ['chanta', '2（吃碰 1）', '每组和对子都带 1、9 或字牌，有顺子', [W(1, 2, 3), T(7, 8, 9), Z(1, 1, 1), S(1, 1)]],
  ['toitoi', '2', '四组全是三张一样的', [W(2, 2, 2), T(5, 5, 5), S(8, 8, 8), Z(3, 3, 3), W(9, 9)]],
  ['sanankou', '2', '三组没吃碰、自己摸齐的三张一样'],
  ['sanshoku_pon', '2', '万筒索各有一组同样数字的三张一样'],
  ['sankantsu', '2', '开了三个杠'],
  ['shousangen', '2', '白发中里两组三张一样、一组对子'],
  ['honroutou', '2', '全是 1、9 和字牌'],
  ['ryanpeikou', '3', '没吃碰，有两对一模一样的顺子', [W(2, 3, 4), W(2, 3, 4), T(5, 6, 7), T(5, 6, 7), S(9, 9)]],
  ['junchan', '3（吃碰 2）', '每组和对子都带 1 或 9，没有字牌', [W(1, 2, 3), T(7, 8, 9), S(1, 2, 3), W(9, 9, 9), T(1, 1)]],
  ['honitsu', '3（吃碰 2）', '只有一门数牌加字牌', [W(1, 2, 3), W(5, 6, 7), W(9, 9, 9), Z(7, 7, 7), Z(1, 1)]],
  ['chinitsu', '6（吃碰 5）', '全是同一门数牌', [W(1, 1, 1), W(2, 3, 4), W(5, 6, 7), W(8, 8, 8), W(9, 9)]],
];
const RC_YAKUMAN: [YakuId, string, Groups?][] = [
  ['kokushi', '十三种幺九牌各一张，再加其中一张当对子', [W(1, 9), T(1, 9), S(1, 9), Z(1, 2, 3, 4, 5, 6, 7), W(1)]],
  ['daisangen', '白、发、中各一组三张一样', [Z(5, 5, 5), Z(6, 6, 6), Z(7, 7, 7)]],
  ['suuankou', '四组没吃碰、自己摸齐的三张一样'],
  ['shousuushii', '风牌里三组三张一样、一组对子'],
  ['daisuushii', '东南西北四组三张一样'],
  ['tsuuiisou', '全是字牌', [Z(1, 1, 1), Z(3, 3, 3), Z(5, 5, 5), Z(7, 7, 7), Z(2, 2)]],
  ['ryuuiisou', '全是绿色的牌（2、3、4、6、8 条和发）'],
  ['chinroutou', '全是 1、9 的数牌'],
  ['chuuren', '一门里 1112345678999 再加一张'],
  ['suukantsu', '开了四个杠'],
  ['tenhou', '庄家起手就胡'],
  ['chiihou', '子家第一次摸牌就自摸'],
];

/** 图鉴：行的名字、番数、说明和牌例都取自役种表，不另写一份 */
export function dexPage(page: HTMLElement): void {
  const draw = (ex?: Groups) => (ex ? (p: HTMLElement) => tilesRow(p, ex) : undefined);
  const yaku: DexRow[] = RC_YAKU.map(([id, han, desc, ex]) => ({ id, name: id === 'yakuhai' ? '役牌' : YAKU_NAME[id as YakuId], han: `${han} 番`, desc, draw: draw(ex) }));
  const big: DexRow[] = RC_YAKUMAN.map(([id, desc, ex]) => ({ id, name: YAKU_NAME[id], han: '役满', desc, draw: draw(ex) }));
  renderDex(page, 'rc', [{ rows: yaku }, { title: '役满', rows: big }]);
}

/** 规则页签（图鉴、成就由外壳画）：怎么胡 / 役种 / 立直和振听 / 电脑公平吗 */
export function rulesPage(page: HTMLElement, tab: Tab): void {
  if (tab === '怎么胡') {
    el('h2', '', page, '怎么胡');
    tilesRow(page, RC_PAGES[0]![2]);
    for (const l of RC_PAGES[0]![1]) el('p', '', page, l);
    el('h2', '', page, '一场怎么打');
    el('p', '', page, '每人 25,000 点起，打东风局和南风局（东风战只打东风局）。庄家连着胡牌或流局时听牌，就连庄、本场加一。有人点数低于 0 就提前结束。');
    el('p', '', page, '打完按点数排名：加上顺位马（+20、+10、−10、−20），第一名再拿头名奖，和 30,000 点比出“得分”，换成筹码。');
    el('h2', '', page, '宝牌');
    tilesRow(page, [[RED5('w'), RED5('t'), RED5('s')]]);
    el('p', '', page, '宝牌指示牌翻开的那张，下一个数的牌就是宝牌；赤宝牌是三张红五（5 万、5 筒、5 条各一张）；立直胡牌后翻开里宝牌。每张宝牌 1 番，但不算役。');
  } else if (tab === '役种') {
    el('p', 'note', page, '番数越多点数越高：5 番起是满贯，6–7 番跳满，8–10 番倍满，11–12 番三倍满，13 番起算役满。括号里是吃碰过的番数。');
    const table = el('table', '', page);
    for (const [id, han, desc, ex] of RC_YAKU) {
      const tr = el('tr', '', table);
      el('td', 'n', tr, id === 'yakuhai' ? '役牌' : YAKU_NAME[id as YakuId]);
      el('td', 'f', tr, `${han} 番`);
      const d = el('td', 'd', tr, desc);
      if (ex) tilesRow(d, ex);
    }
    el('h2', '', page, '役满');
    const big = el('table', '', page);
    for (const [id, desc, ex] of RC_YAKUMAN) {
      const tr = el('tr', '', big);
      el('td', 'n', tr, YAKU_NAME[id]);
      el('td', 'f', tr, '役满');
      const d = el('td', 'd', tr, desc);
      if (ex) tilesRow(d, ex);
    }
  } else if (tab === '立直和振听') {
    el('h2', '', page, '立直');
    tilesRow(page, RC_PAGES[1]![2]);
    for (const l of RC_PAGES[1]![1]) el('p', '', page, l);
    el('p', '', page, '立直的条件：没吃碰（暗杠可以）、听牌、手里至少 1,000 点、牌墙还剩 4 张以上。喊立直打出的那张横放；要是正好被人胡了，立直不成立，不扣棒。');
    el('h2', '', page, '必须有役');
    for (const l of RC_PAGES[2]![1]) el('p', '', page, l);
    el('h2', '', page, '振听');
    tilesRow(page, RC_PAGES[3]![2]);
    for (const l of RC_PAGES[3]![1]) el('p', '', page, l);
    el('p', '', page, '三种原因：舍张（自己打过要胡的牌）、同巡（放过一张要胡的牌）、立直后（立直后放过）。');
    el('p', '', page, '听牌了不一定胡得了：没有役就不能胡（别人打的胡不了）。选牌打出去之后，听牌提示旁会写“只能自摸，或者立直”（门清，自摸有门前清自摸和）或“没有役，胡不了”（副露了）。立直之后不再提示。');
    el('h2', '', page, '安全牌角标');
    el('p', '', page, '别家立直后，轮到你打牌时，手牌下沿会有小标：绿底“安”是现物，对每个立直的人都不会点炮；黄色虚线框“较”是较安全（筋牌、场上见得多的字牌这类），不是绝对安全；没有标记的有风险。只按桌上公开的牌算，顶栏齿轮（设置）里能关掉“安全牌提示”。');
  } else {
    el('h2', '', page, '电脑公平吗');
    el('p', '', page, '电脑和你一样看不到别人的牌：它只知道自己的手牌和桌上打出来、鸣出来的牌，牌墙也不知道。每局打完，胡了、听牌的人把牌亮出来，可以对一对。');
    el('p', '', page, '牌河里变暗的牌，是被人吃、碰、杠走或者和走的。');
  }
}
