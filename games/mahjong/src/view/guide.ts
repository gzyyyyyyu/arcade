/**
 * 新手引导和规则（DESIGN.md 第 7 节）：第一次打开弹三屏，番型表随时能在"规则"里看。
 * 规则（docs/art.md）：规则是一本宣纸小册子，分四页签（怎么胡 / 番型 / 血战规矩 / 电脑公平吗），番型带一手牌例；引导每屏配一排示意的牌。
 * 这里只管外壳（弹窗、翻页、页签、图鉴和成就）；各玩法讲什么在 view/variants/<id>/guide.ts，由玩法的页面钩子（VariantPage.guide）给出。
 */
import { readText, writeText } from '../storage.ts';
import { button, el } from './dom.ts';
import { closeDialog, dialog } from './dialog.ts';
import './ui-help.css';
import { renderAch } from './achieve.ts';
import { tilesRow, type Tab } from './guide-kit.ts';
import { DEFAULT_VARIANT } from '../core/variants/index.ts';
import { pageOf } from './variants/pages.ts';
import { paginate } from './pager.ts';

/** 新手引导看过没有的记号：每个玩法一个 */
export const guideKey = (variant: string): string => pageOf(variant).guide.key;

/**
 * onDone：说明关掉时调（点"开打"、×、Esc、点外面都算；翻页不算）。
 * onStart：只在点最后一页的"开打"时调，关掉以后再调：主页上弹的说明靠它真的开一局，不然点了"开打"还在主页
 */
export function showGuide(parent: HTMLElement, page = 0, onDone?: () => void, variant: string = DEFAULT_VARIANT, onStart?: () => void): void {
  // 怎么关的都算看过（×、Esc、点外面也是）：只认"开打"的话，在主页点 × 关掉，一进牌桌又从第 1 页弹一遍。
  // 回调翻页时要是同一个（dialog.ts 认它判断是翻页还是被换掉），所以在这里做一次再往下传。存不上下次再看一遍，不看返回值
  const done = (): void => {
    writeText(guideKey(variant), '1');
    onDone?.();
  };
  guidePage(parent, page, done, variant, onStart);
}

function guidePage(parent: HTMLElement, page: number, done: () => void, variant: string, onStart?: () => void): void {
  const guide = pageOf(variant).guide;
  const pages = guide.pages;
  dialog(parent, `guide${guide.cls}`, (box) => {
    const [title, lines, ex] = pages[page]!;
    el('div', 'step', box, `${page + 1} / ${pages.length}`);
    el('h2', '', box, title);
    tilesRow(box, ex, page === 1 ? 'swap' : '');
    for (const l of lines) el('p', '', box, l);
    const row = el('div', 'row', box);
    if (page < pages.length - 1) button('act go', row, '下一页', () => guidePage(parent, page + 1, done, variant, onStart));
    else
      button('act go', row, '开打', () => {
        closeDialog();
        onStart?.();
      });
  }, true, undefined, done);
}

/** 电脑上的快捷键（table.ts 的 onKey、ting.ts 的 act 实现的键位，改键位时两边一起改） */
const KEYS: readonly [string[], string][] = [
  [['H'], '胡（立直里叫“和”）'],
  [['C'], '吃（只有立直能吃；能吃的不止一种时再点选哪一种）'],
  [['P'], '碰'],
  [['G'], '杠'],
  [['X'], '过'],
  [['←', '→'], '选牌：在能打的牌里左右移'],
  [['Enter', '空格', '↑'], '打出选中的牌'],
  [['Esc'], '放下选中的牌；关掉弹窗'],
  [['1', '…', '9'], '听牌速判：点第几张牌（一到九）'],
  [['Enter'], '听牌速判：提交 / 下一题'],
];

function keysPage(page: HTMLElement): void {
  el('p', '', page, '只在电脑上有用；手机直接点。弹窗开着、光标在输入框里时快捷键不管用。');
  const table = el('table', 'keys', page);
  const head = el('tr', '', el('thead', '', table));
  el('th', '', head, '按键');
  el('th', '', head, '作用');
  const body = el('tbody', '', table);
  for (const [keys, what] of KEYS) {
    const tr = el('tr', '', body);
    const td = el('td', '', tr);
    for (const k of keys) el('kbd', '', td, k);
    el('td', '', tr, what);
  }
}

export function showRules(parent: HTMLElement, tab?: Tab, variant: string = DEFAULT_VARIANT): void {
  const guide = pageOf(variant).guide;
  const tabsOf: readonly Tab[] = [...guide.tabs, '键盘'];
  const at: Tab = tab && tabsOf.includes(tab) ? tab : tabsOf[1]!;
  dialog(parent, `rules${guide.cls}`, (box) => {
    const tabs = el('div', 'tabs', box);
    tabs.setAttribute('role', 'tablist');
    for (const t of tabsOf) {
      const b = button(`tab${t === '键盘' ? ' keys' : ''}${t === at ? ' on' : ''}`, tabs, t, () => showRules(parent, t, variant));
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t === at));
    }
    const page = el('div', 'page', box);
    if (at === '图鉴') guide.dexPage(page);
    else if (at === '成就') renderAch(page, guide.dex);
    else if (at === '键盘') keysPage(page);
    else guide.rulesPage(page, at);
    // 只在第一页（怎么胡）摆：别的页把这一行的高度让给番型表、图鉴，少翻几页
    if (at === tabsOf[0]) button('act soft', box, '再看一遍新手说明', () => showGuide(parent, 0, undefined, variant));
    paginate(page);
  });
}

/** 竖屏第一次进牌桌：提示一句"横过来玩更舒服"（竖屏手牌每张只有二十几像素），3 秒自己消失，只出一次 */
const ROTATE_KEY = 'mahjong.hint.rotate';
const ROTATE_MS = 3_000;

export function rotateTip(stage: HTMLElement): void {
  if (stage.dataset.orient !== 'port') return;
  if (readText(ROTATE_KEY)) return;
  // 记不下来就不提示，免得每次进来都弹
  if (!writeText(ROTATE_KEY, '1')) return;
  const tip = el('div', 'rotate-tip', stage);
  tip.setAttribute('role', 'status');
  // 一部手机从竖着转到横着，旁边一道弧形箭头
  tip.innerHTML =
    '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="16" y="6" width="16" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="3"/>' +
    '<path d="M10 30a16 16 0 0 0 20 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M27 37l4 5-6 2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  el('span', '', tip, '横过来玩更舒服');
  window.setTimeout(() => tip.remove(), ROTATE_MS);
}
