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
import type { RuleSpec } from '../../../game/rule-spec.ts';
import { XZ_FIRST_OPTS, XZ_RULES } from '../../../game/xuezhan-rules.ts';
import { TableUi, type CommonAct } from '../../table.ts';
import type { AnyOpts, VariantPage } from '../page.ts';
import { cardOf } from './card.ts';
import { dexPage, PAGES, rulesPage } from './guide.ts';
import { matchSummary, roundSummary } from './summary.ts';
import { xuezhanUi } from './ui.ts';

const ID = 'sichuan-xuezhan';
/** 主页把血流成河（川麻的一个选项）当作第三个玩法摆，它在主页的切换项 id */
const FLOW = 'flow';
/** 三人两房（opts.three）在主页的切换项 id */
const THREE = 'three';

export const xuezhanPage: VariantPage = {
  id: ID,
  name: (opts) => (opts?.three ? '川麻·三人两房' : opts?.flow ? '川麻·血流成河' : '川麻·血战到底'),
  open: () => true,

  // 没存过的（第一次来）按新手的默认：4 局（game/xuezhan-rules.ts）
  loadRules: (raw) => ({ opts: { ...XZ_FIRST_OPTS, ...(raw.opts ?? {}) } }),
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
  rules: XZ_RULES as RuleSpec<AnyOpts>,
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
