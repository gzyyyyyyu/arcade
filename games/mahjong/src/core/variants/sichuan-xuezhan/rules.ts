/**
 * 川麻·血战到底的规则（DESIGN.md 第 2 节）：状态、动作、每一步怎么走。纯函数，浏览器（单机）和房间（好友房）共用。
 *
 * 一局的流程：发牌 →（换三张）→ 定缺 → 庄家先打 → 摸打、碰杠胡 → 三家胡了或牌墙摸完 → 结算（流局查花猪、查大叫、退税）。
 * 血流成河（opts.flow）：胡了不下桌，手牌锁在 13 张接着摸打、再胡，牌墙摸完才结束；已胡的人不参加查花猪、查大叫、退税。
 * 三人两房（opts.three）：3 个人，只用筒、条两门 72 张，不定缺（换三张照选项）；血战两家胡了就结束。座位数一律按 seatsOf(opts)，四人局不变。
 * 一场：固定局数，或者有人筹码打光、赢满 3 份，这一局打完散场。
 *
 * 声明窗口（别人打出一张、或补杠可以被抢）的公平做法见 DESIGN.md 第 6 节：
 * 名单一律是所有还没胡的别家，真人的回答是 kit 的不轮流操作（free），电脑和托管的回答带 bot 标记、答完离开名单；
 * 有选择的人都答完就裁决，没选择的人当"过"。
 *
 * 所有改动都在 applyMut 里原地做（模拟器直接用它，省掉每步复制）；对外的 apply 先复制一份再改。
 */
export { RULES_VERSION, SEATS, SHAPE, SUITED_KINDS, TILESET, TILESET_THREE, VARIANT, DEFAULT_OPTS, KAN_PAY, seatsOf } from './types.ts';
export type { Claim, Phase, RoundSummary, SeatStats, Win, XzAction, XzEvent, XzOpts, XzPlayer, XzState } from './types.ts';
export { hasQue, isFlow, tenpaiKinds, winsOf } from './util.ts';
export { begin, resumeMut } from './round.ts';
export { applyMut, canZimo, discardChoices, discardOptions, kanOptions } from './actions.ts';
export { actorsOf, restakeMut, seatedMut } from './seats.ts';
