/**
 * 立直麻将的页面层钩子（VariantPage，见 view/variants/page.ts）：规则设置、主页和选桌页的字、结算、分享、名场面、引导。
 * 页面和流程代码不直接 import 这里，一律经 view/variants/pages.ts 的 pageOf。
 */
import type { RcAction, RcOpts, RcView } from '../../../core/variants/riichi/index.ts';
import { DEFAULT_OPTS } from '../../../core/variants/riichi/index.ts';
import { DAILY_RC_LENGTH } from '../../../game/daily.ts';
import type { RuleSpec } from '../../../game/rule-spec.ts';
import { RC_FIRST_OPTS, RC_LENGTH_NAME, RC_RULES } from '../../../game/riichi/rules.ts';
import { rcFeedMomentsOf, rcFunMoments, rcHighlightsOf, rcKansOf, rcTally, rcWinsOf } from '../../../game/riichi/fun.ts';
import type { SoloState } from '../../../solo.ts';
import { TableUi, type CommonAct } from '../../table.ts';
import type { AnyOpts, VariantPage } from '../page.ts';
import { RC_PAGES, dexPage, rulesPage } from './guide.ts';
import { riichiOpen } from './gate.ts';
import { cardOf, matchSummary, roundSummary } from './summary.ts';
import { lengthName, roundName } from './text.ts';
import { resetRiichiUi, riichiUi, toRcAction } from './ui.ts';
import { tableView } from './view.ts';

const ID = 'riichi';

/** 刚打完的这一局有人和了：和牌亮牌（役一条条弹出来）要多摆一会儿 */
const hasWins = (v: RcView): boolean => !!v.history.at(-1)?.wins.length;

export const riichiPage: VariantPage = {
  id: ID,
  name: () => '立直麻将',
  // 立直入口收起来时（gate.ts 的 RIICHI_GATED）一律不进选择项，存着的选择留着不动
  open: () => riichiOpen(),

  loadRules(raw) {
    // 没存过的（第一次来）按新手的默认：东风战（game/riichi/rules.ts）；存着怪值的也回到它
    const length = raw.rc?.length && Object.hasOwn(RC_LENGTH_NAME, raw.rc.length) ? raw.rc.length : RC_FIRST_OPTS.length;
    return { rc: { ...DEFAULT_OPTS, length } };
  },
  rulesOf: (store) => store.rc,
  setRules(store, opts) {
    store.rc = opts as RcOpts;
  },
  // 实盘一局一结
  realOpts: (opts) => ({ ...(opts as RcOpts), length: 'ikkyoku' }),
  quick: (store) => ({ opts: { ...store.rc, length: 'ikkyoku' } }),
  daily: { variant: ID, opts: () => ({ ...DEFAULT_OPTS, length: DAILY_RC_LENGTH }), lengthText: '东风战', cardName: '立直东风战' },

  homeChoices: [{ id: ID, chip: '立直', name: '立直麻将', pitch: '立直、鸣牌、必须有役，门清更值钱', ladder: { mode: 'rc', opts: () => ({ ...DEFAULT_OPTS, length: 'ikkyoku' }) } }],
  homeId: () => ID,
  homePick(store) {
    store.variant = ID;
  },
  rulesLink: '规则和役种表',
  matchTag: '立直 · ',
  rules: RC_RULES as RuleSpec<AnyOpts>,
  lengthText: (opts) => lengthName((opts as RcOpts).length),
  progress(state: SoloState) {
    const s = state as Extract<SoloState, { variant: 'riichi' }>;
    return `${lengthName(s.opts.length)} · ${roundName(s.wind, s.hand)}`;
  },

  mountTable(parent, send) {
    resetRiichiUi();
    const table = new TableUi(parent, riichiUi, (a: CommonAct | RcAction) => send(toRcAction(a)));
    // 根节点打上 rc：立直的样式（view/variants/riichi/riichi.css）都限定在 .table.rc 下
    table.root.classList.add('rc');
    return table;
  },
  tableView: (v) => tableView(v as RcView),

  roundSummary: (v, names) => roundSummary(v as RcView, names),
  matchSummary: (v, names, unit) => matchSummary(v as RcView, names, unit),
  soloEndMs: (v) => (hasWins(v as RcView) ? 1_900 : 1_000),
  roomEndMs: (v) => (hasWins(v as RcView) ? 2_600 : 0),
  // 立直的小计没有杠数，不评杠王（game/riichi/fun.ts）
  tally: (v) => rcTally((v as RcView).seats.map((x) => x.stats)),
  shareCard: (v, o) => cardOf(v as RcView, o.title, o.unit, o.name),
  moments(v) {
    const x = v as RcView;
    // 和了就结这一局，所以 round 是刚打完的这一局
    const wins = rcWinsOf(x.events);
    const round = x.history.length - (x.phase === 'end' || x.phase === 'over' ? 1 : 0);
    return { hus: wins.length, found: rcHighlightsOf(wins, round), fun: () => rcFunMoments(wins, rcKansOf(x.events), round) };
  },
  feedMoments: (v, me) => rcFeedMomentsOf((v as RcView).events, me),

  guide: {
    key: 'mahjong.guide.rc',
    cls: ' rc-guide',
    pages: RC_PAGES,
    tabs: ['怎么和', '役种', '立直和振听', '电脑公平吗', '图鉴', '成就'],
    dex: 'rc',
    rulesPage,
    dexPage,
  },
};
