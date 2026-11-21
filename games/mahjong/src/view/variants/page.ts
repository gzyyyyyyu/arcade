/**
 * 玩法的页面层钩子（DESIGN.md 3.6）：核心层有 Variant（规则）、牌桌层有 VariantUi（牌桌上的组件），
 * 页面和流程层（选桌页、主页、单机和好友房的结算、分享、颁奖、每日挑战……）按玩法不同的东西都收在这里，
 * 页面代码只调 `pageOf(id).xxx`，不再自己判断 `variant === ...`、不手工挑 `rc ? a : b` 这样成对的函数。
 * 每个玩法在 view/variants/<id>/page.ts 实现一份，在 view/variants/pages.ts 登记。
 *
 * 这个文件只放类型，不 import 任何玩法，也不 import 登记处：页面钩子可以 import 本玩法的 view 文件和 core，
 * 玩法之间不互相 import。加新玩法要实现的就是下面的 VariantPage。
 */
import type { ShareCard } from 'arcade-kit/share';
import type { FunEvent } from 'arcade-kit/fun-logic';
import type { RcOpts } from '../../core/variants/riichi/index.ts';
import type { XzOpts } from '../../core/variants/sichuan-xuezhan/index.ts';
import type { PublicTally } from '../../game/awards.ts';
import type { Highlight } from '../../game/banter.ts';
import type { DailyVariant } from '../../game/daily.ts';
import type { FeedMoment } from '../../game/feed.ts';
import type { LadderMode } from '../../game/ladder.ts';
import type { DexVariant } from '../../game/dex.ts';
import type { RuleSpec } from '../../game/rule-spec.ts';
import type { SoloAction, SoloState } from '../../solo.ts';
import type { OptsOf, ViewOf } from '../../core/variants/index.ts';
import type { Groups, Tab } from '../guide-kit.ts';
import type { TableUi } from '../table.ts';

/** 各玩法的视图、规则设置、牌桌类型不同；页面层只当"一局的视图"用，具体玩法在自己的 page.ts 里收窄 */
export type AnyView = ViewOf;
export type AnyOpts = OptsOf;
// biome-ignore lint/suspicious/noExplicitAny: TableUi 的视图参数各玩法是各自的牌桌视图（XzView、RcTable），动作参数在 send 里逆变，联合类型赋不进去；要改得先给牌桌拆出统一的视图接口
export type AnyTable = TableUi<any, any>;
export type FunMoment = Extract<FunEvent, { kind: 'moment' }>;

/**
 * 偏好（localStorage 的 mahjong.prefs）里存规则设置的位置：川麻的在 opts、立直的在 rc。
 * 存储格式沿用，不另起键；玩法页面钩子通过 rulesOf / setRules / loadRules 读写自己那一份
 */
export interface RulesStore {
  opts: XzOpts;
  rc: RcOpts;
}

/** 主页"快速一局"下面的玩法切换项（血流成河是川麻的一个选项，但主页把它当第三个玩法摆） */
export interface HomeChoice {
  id: string;
  /** 切换按钮上的字 */
  chip: string;
  /** 主页大标题下面的玩法名 */
  name: string;
  /** 主页那一句玩法介绍 */
  pitch: string;
  /** 茶馆擂台里这种打法的号和一桌的规则（娱乐短局，默认规则，大家一样） */
  ladder?: { mode: LadderMode; opts: () => AnyOpts };
}

/** 新手引导和规则小册子的内容（外壳在 view/guide.ts） */
export interface GuideSpec {
  /** 新手引导看过没有的存储键 */
  key: string;
  /** 弹窗根节点要加的类（带前导空格，没有就空串） */
  cls: string;
  /** 引导的每一屏：标题、几句话、一排示意的牌 */
  pages: [string, string[], Groups][];
  /** 规则小册子的页签，第二个是默认页 */
  tabs: readonly Tab[];
  /** 图鉴、成就按哪一边算 */
  dex: DexVariant;
  rulesPage(page: HTMLElement, tab: Tab): void;
  dexPage(page: HTMLElement): void;
}

/** 一步里的名场面（挂横幅、记进这一场、单机里让电脑起哄） */
export interface Moments {
  /** 这一步里和了几手（横幅等和牌的牌面放完再挂） */
  hus: number;
  found: Highlight[];
  fun(): FunMoment[];
}

export interface VariantPage {
  /** 玩法 id（同核心层的 Variant.id） */
  readonly id: string;
  /** 玩法名（顶栏、选桌页）；川麻开了血流成河（opts.flow）写"川麻·血流成河" */
  name(opts?: { flow?: boolean; three?: boolean } | null): string;

  // ---------- 偏好里的规则设置 ----------
  /** 从存着的偏好里读出自己那一份（缺的、坏的补默认），返回的字段并进 RulesStore */
  loadRules(raw: Partial<RulesStore>): Partial<RulesStore>;
  rulesOf(store: RulesStore): AnyOpts;
  setRules(store: RulesStore, opts: AnyOpts): void;
  /** 实盘用的规则（一局一结）：不看存着的规则设置 */
  realOpts(opts: AnyOpts): AnyOpts;
  /** 主页"快速一局"用的规则：规则固定一局一结 */
  quick(store: RulesStore): { opts: AnyOpts };
  /** 每日挑战：固定长度，种子按今天和玩法定 */
  readonly daily: { variant: DailyVariant; opts(): AnyOpts; lengthText: string; cardName: string };

  // ---------- 主页、选桌页 ----------
  /** 主页快速一局底下、选桌页玩法行的切换项（川麻三个：血战、血流、三人两房） */
  readonly homeChoices: readonly HomeChoice[];
  /** 现在在主页选着哪一项 */
  homeId(store: RulesStore): string;
  /** 主页点了某一项：记下玩法和相关的规则设置 */
  homePick(store: RulesStore & { variant: string }, choiceId: string): void;
  /** "规则和番型表"这个链接上的字 */
  readonly rulesLink: string;
  /** 快速匹配对话框里档位前面的玩法标记（"立直 · "），没有就空串 */
  readonly matchTag: string;
  /** 选桌页的规则表（game/rule-spec.ts）：「改规则」面板、摘要、好友房等人页的规则行都按它 */
  readonly rules: RuleSpec<AnyOpts>;
  /** 一场多长："8 局"、"半庄"（分享卡标题、颁奖标题） */
  lengthText(opts: AnyOpts): string;
  /** 存档打到哪了（主页"继续上局"底下那行），daily 是每日挑战的日期 */
  progress(state: SoloState, daily: string | undefined): string;

  // ---------- 牌桌 ----------
  /** 新建这个玩法的牌桌；send 收到的已经是玩法的动作（牌桌的通用动作由这里换算） */
  mountTable(parent: HTMLElement, send: (a: SoloAction) => void): AnyTable;
  /** 视图 → 通用牌桌要的形状 */
  tableView(v: AnyView): unknown;

  // ---------- 结算、分享、颁奖、名场面 ----------
  roundSummary(v: AnyView, names: string[], unit: string): HTMLElement;
  matchSummary(v: AnyView, names: string[], unit: string): HTMLElement;
  /** 单机：一局打完到弹结算停多久（毫秒，未乘速度） */
  soloEndMs(v: AnyView): number;
  /** 好友房：一局打完先摆多久和牌亮牌再盖结算（毫秒，未乘速度）；0 是马上弹 */
  roomEndMs(v: AnyView): number;
  /** 颁奖用的公开小计（每家的视图小计 → 胡、自摸、杠） */
  tally(v: AnyView): PublicTally[];
  /** 一场的战绩分享卡；旁观的、没打完的没有 */
  shareCard(v: AnyView, o: { title: string; unit: string; name: string; fame: readonly Highlight[] }): ShareCard | null;
  moments(v: AnyView): Moments;
  /** 娱乐局里自己胡出的、可以报好友动态的名场面 */
  feedMoments(v: AnyView, me: number): FeedMoment[];

  // ---------- 引导 ----------
  readonly guide: GuideSpec;
}
