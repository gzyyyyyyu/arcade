/**
 * 川麻·血战到底的页面层钩子（VariantPage，见 view/variants/page.ts）：规则设置、主页和选桌页的字、结算、分享、名场面、引导。
 * 页面和流程代码不直接 import 这里，一律经 view/variants/pages.ts 的 pageOf。
 */
import type { XzAction, XzOpts, XzState, XzView } from '../../../core/variants/sichuan-xuezhan/index.ts';
import { DEFAULT_OPTS } from '../../../core/variants/sichuan-xuezhan/index.ts';
import { DAILY_ROUNDS } from '../../../game/daily.ts';
import { feedMomentsOf } from '../../../game/feed.ts';
import { funMoments, highlightsOf, momentsOf } from '../../../game/banter.ts';
import { realOpts } from '../../../game/stakes.ts';
import { el, button } from '../../dom.ts';
import { ruleRow } from '../../rule-row.ts';
import { TableUi, type CommonAct } from '../../table.ts';
import { MINUTES_PER_ROUND } from '../../text.ts';
import type { LobbyRules, VariantPage } from '../page.ts';
import { cardOf } from './card.ts';
import { dexPage, PAGES, rulesPage } from './guide.ts';
import { matchSummary, roundSummary } from './summary.ts';
import { xuezhanUi } from './ui.ts';

const ID = 'sichuan-xuezhan';
/** 主页把血流成河（川麻的一个选项）当作第三个玩法摆，它在主页的切换项 id */
const FLOW = 'flow';
/** 三人两房（opts.three）在主页的切换项 id */
const THREE = 'three';

/** 选桌页的规则设置：局数、封顶、换三张、自摸、呼叫转移、血流成河、三人两房（各档都能开） */
function lobbyRules(store: { opts: XzOpts }): LobbyRules {
  const opts: XzOpts = { ...store.opts };
  let flowRow: HTMLElement | null = null;
  let threeRow: HTMLElement | null = null;
  const paintFlow = (): void => {
    if (!flowRow) return;
    flowRow.replaceChildren();
    el('span', 'label', flowRow, '血流成河');
    for (const [text, val] of [['开', true], ['关', false]] as const) {
      button(`chip${!!opts.flow === val ? ' on' : ''}`, flowRow, text, () => {
        opts.flow = val;
        if (val) opts.three = false;
        paintFlow();
        paintThree();
      });
    }
    el('small', 'flow-note', flowRow, opts.flow ? '胡了不下桌，接着摸打，能连胡' : '');
  };
  // 三人两房：开了就不能同时开血流成河
  const paintThree = (): void => {
    if (!threeRow) return;
    threeRow.replaceChildren();
    el('span', 'label', threeRow, '三人两房');
    for (const [text, val] of [['开', true], ['关', false]] as const) {
      button(`chip${!!opts.three === val ? ' on' : ''}`, threeRow, text, () => {
        opts.three = val;
        if (val) opts.flow = false;
        paintThree();
        paintFlow();
      });
    }
    el('small', 'flow-note', threeRow, opts.three ? '三人打，只用筒条，不定缺' : '');
  };
  return {
    opts: () => opts,
    // 三人两房摸得快：8 局约 8–9 分钟（DESIGN.md 4.1），一局按 1.1 分钟算
    minutes: () => (opts.rounds === 1 ? (opts.three ? 2 : 3) : Math.max(5, Math.round(((opts.three ? 1.1 : MINUTES_PER_ROUND) * opts.rounds) / 5) * 5)),
    render(more, repaint) {
      // 实盘固定一局，这里选的只管娱乐；局数改了，卡片上的"约多久"跟着变
      ruleRow(more, '局数', [1, 4, 8, 16].map((n) => [`${n} 局`, () => opts.rounds === n, () => { opts.rounds = n as 1 | 4 | 8 | 16; repaint(); }]));
      ruleRow(more, '封顶', [3, 4, 5].map((n) => [`${n} 番`, () => opts.cap === n, () => (opts.cap = n as 3 | 4 | 5)]));
      ruleRow(more, '换三张', [
        ['换', () => opts.swap, () => (opts.swap = true)],
        ['不换', () => !opts.swap, () => (opts.swap = false)],
      ]);
      ruleRow(more, '自摸', [
        ['加底', () => opts.zimo === 'di', () => (opts.zimo = 'di')],
        ['加番', () => opts.zimo === 'fan', () => (opts.zimo = 'fan')],
      ]);
      ruleRow(more, '呼叫转移', [
        ['开', () => opts.transfer, () => (opts.transfer = true)],
        ['关', () => !opts.transfer, () => (opts.transfer = false)],
      ]);
      // 血流成河：胡了不下桌、接着打；三人两房只打筒条，两项二选一
      flowRow = el('div', 'opt flow-opt', more);
      paintFlow();
      threeRow = el('div', 'opt flow-opt', more);
      paintThree();
    },
  };
}

export const xuezhanPage: VariantPage = {
  id: ID,
  name: (opts) => (opts?.three ? '川麻·三人两房' : opts?.flow ? '川麻·血流成河' : '川麻·血战到底'),
  open: () => true,

  loadRules: (raw) => ({ opts: { ...DEFAULT_OPTS, ...(raw.opts ?? {}) } }),
  rulesOf: (store) => store.opts,
  setRules(store, opts) {
    store.opts = opts as XzOpts;
  },
  realOpts: (opts) => realOpts(opts as XzOpts),
  // 快速一局照上次的档位（血战、血流、三人两房都开实盘）
  quick: (store) => ({ opts: realOpts(store.opts) }),
  daily: { variant: ID, opts: () => ({ ...DEFAULT_OPTS, rounds: DAILY_ROUNDS }), lengthText: `${DAILY_ROUNDS} 局`, cardName: `川麻 ${DAILY_ROUNDS} 局` },

  homeChoices: [
    { id: ID, chip: '血战到底', name: '川麻·血战到底', pitch: '胡了下桌，打到只剩一家或牌墙摸完', ladder: { mode: 'xz', opts: () => ({ ...DEFAULT_OPTS, rounds: 1, flow: false }) } },
    { id: FLOW, chip: '血流成河', name: '川麻·血流成河', pitch: '胡了不下桌，接着摸打，能连胡', ladder: { mode: 'xl', opts: () => ({ ...DEFAULT_OPTS, rounds: 1, flow: true }) } },
    // 三人两房的擂台和快速一局一样：一局一结、不换三张
    { id: THREE, chip: '三人两房', name: '川麻·三人两房', pitch: '三个人打，只有筒子和条子，不用定缺，两家胡了就结束', ladder: { mode: 'x3', opts: () => ({ ...DEFAULT_OPTS, rounds: 1, flow: false, three: true, swap: false }) } },
  ],
  homeId: (store) => (store.opts.three ? THREE : store.opts.flow ? FLOW : ID),
  // 血流是川麻的 opts.flow，记在 mahjong.prefs 的规则里，没有新的存储键
  homePick(store, choiceId) {
    store.variant = ID;
    store.opts = choiceId === THREE ? { ...store.opts, three: true, swap: false, flow: false } : { ...store.opts, three: false, flow: choiceId === FLOW };
  },
  rulesLink: '规则和番型表',
  lobbyChip: '血战到底',
  matchTag: '',
  newLobbyRules: lobbyRules,
  ruleParts(rules) {
    const r = rules as XzOpts;
    return [`${r.rounds} 局`, `封顶 ${r.cap} 番`, r.swap ? '换三张' : '不换', r.zimo === 'fan' ? '自摸加番' : '自摸加底', r.transfer ? '呼叫转移' : '', r.flow ? '血流成河' : '', r.three ? '三人两房' : ''].filter(Boolean);
  },
  lengthText: (opts) => `${(opts as XzOpts).rounds} 局`,
  progress(state, daily) {
    const s = state as XzState;
    return `${daily ? '每日挑战 · ' : ''}第 ${Math.min(s.round + 1, s.opts.rounds)}/${s.opts.rounds} 局`;
  },

  mountTable: (parent, send) => new TableUi<XzView, XzAction>(parent, xuezhanUi, (a: CommonAct | XzAction) => send(a as XzAction)),
  tableView: (v) => v,

  roundSummary: (v, names, unit) => roundSummary(v as XzView, names, unit),
  matchSummary: (v, names, unit) => matchSummary(v as XzView, names, unit),
  soloEndMs: () => 1_000,
  roomEndMs: () => 0,
  tally: (v) => (v as XzView).seats.map((x) => x.stats),
  shareCard: (v, o) => cardOf(v as XzView, o),
  moments(v) {
    const x = v as XzView;
    return {
      hus: x.events.filter((e) => e.e === 'hu').length,
      found: highlightsOf(x.events, x.round, x.opts.cap),
      fun: () => funMoments(momentsOf(x.events), x.seats.map((s) => !s.won), x.round),
    };
  },
  feedMoments: (v, me) => feedMomentsOf((v as XzView).events, me),

  guide: {
    key: 'mahjong.guide',
    cls: '',
    pages: PAGES,
    tabs: ['怎么胡', '番型', '血战规矩', '电脑公平吗', '图鉴', '成就'],
    dex: 'xz',
    rulesPage,
    dexPage,
  },
};
