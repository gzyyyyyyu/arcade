/** 机器人注册表与 playRun：行情来源、是否打开新机制这两个模块级开关只在本文件里定义。 */
import {
  createRun,
  dispatch,
  isBusy,
  rngFor,
  type Action,
  type GameEvent,
  type GameState,
  type Segment,
  type RunSetup,
} from '../../src/core/index.ts';
import { type Bot, type BotFactory, shouldCut, swanSell, swanBlocks, ipoSubscribe, touchesFrozen } from './common.ts';
import { ipoOnlyBot, randomBot, followerBot, chaserBot, xiaobaiBot, qunzhuBot, lessonBot } from './simple.ts';
import { normalBot } from './normal.ts';
import { SmartBot } from './smart.ts';
import { extBot, trackBot, dual } from './variants.ts';

/** 这些机器人要用新机制，playRun 总是给它们打开 ext。 */
const NEEDS_EXT = new Set(['heavy', 'shorter', 'gambler', 'gambler-smart', 'ipo-only', 'ipo-only-half', 'ipo-only-heavy', 'lesson', 'lesson-nostop', 'lesson-heavy']);

/** 行情来源：缺省为 0.3 的合成行情；模拟真实行情时设成"按种子给行情段"（见 tools/segments-disk.ts）。 */
let marketOf: ((seed: string) => Segment | null) | null = null;

export function useMarket(fn: ((seed: string) => Segment | null) | null): void {
  marketOf = fn;
}

/** 0.4 C：机器人的局打不打开新机制（仓位、押跌、抵押）。缺省关（0.3 玩法）；sim --ext 打开。 */
let extOn = false;

export function useExt(on: boolean): void {
  extOn = on;
}

/** 让机器人从开局一直玩到结束，返回终局状态。onStep 在每步之后收到新状态与事件。 */

export function playRun(
  seed: string,
  bot: Bot | BotFactory,
  setup: RunSetup | null = null,
  onStep?: (state: GameState, events: readonly GameEvent[], action: Action) => void,
  maxActions = 2000,
): GameState {
  const b = typeof bot === 'function' ? bot() : bot;
  const rng = rngFor(seed, 'bot', b.name);
  const swanMemo: { keep: number | null } = { keep: null };
  let state = createRun(seed, setup, { segment: marketOf?.(seed) ?? null, ext: extOn || NEEDS_EXT.has(b.name) }).state;
  for (let i = 0; i < maxActions && state.phase !== 'won' && state.phase !== 'lost'; i++) {
    let action = shouldCut(b.name, state) ? ({ type: 'deleverage' } as const) : (swanSell(b.name, state, swanMemo) ?? ipoSubscribe(b.name, state) ?? b.act(state, rng));
    if (swanBlocks(b.name, state, action) || touchesFrozen(state, action)) action = { type: 'open' };
    // 加班日不能买卖：机器人照常思考（更新信念），然后直接开盘
    if (isBusy(state) && (action.type === 'buy' || action.type === 'sell')) action = { type: 'open' };
    const r = dispatch(state, action, { events: onStep !== undefined, inPlace: true });
    if (r.error) throw new Error(`${b.name} 在种子 ${seed} 第 ${i} 步给出非法操作 ${JSON.stringify(action)}：${r.error}`);
    state = r.state;
    onStep?.(state, r.events, action);
  }
  return state;
}

export const BOTS: Record<string, BotFactory> = {
  heavy: () => extBot('heavy', normalBot(), { heavy: true }),
  shorter: () => extBot('shorter', normalBot(), { short: true }),
  gambler: () => extBot('gambler', normalBot(), { gamble: true }),
  'gambler-smart': () => extBot('gambler-smart', BOTS.smart!(), { gamble: true }),
  random: randomBot,
  follower: followerBot,
  chaser: chaserBot,
  xiaobai: xiaobaiBot,
  putong: () => ({ ...normalBot(), name: 'putong' }),
  normal: () => normalBot(),
  'normal-nomsg': () => normalBot(true),
  smart: () => dual(trackBot('smart', 'smart', normalBot()), new SmartBot({ name: 'smart', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, short: true })),
  truster: () => dual(trackBot('truster', 'truster', normalBot()), normalBot()),
  'smart-focus1': () => new SmartBot({ name: 'smart-focus1', maxPerTheme: 9, sameThemeBonus: 0.8, maxThemes: 1, oracle: false }),
  'smart-focus2': () => new SmartBot({ name: 'smart-focus2', maxPerTheme: 9, sameThemeBonus: 0.8, maxThemes: 2, oracle: false }),
  'smart-spread': () => new SmartBot({ name: 'smart-spread', maxPerTheme: 2, sameThemeBonus: -0.4, oracle: false }),
  'smart-spread1': () => new SmartBot({ name: 'smart-spread1', maxPerTheme: 1, sameThemeBonus: 0, oracle: false }),
  oracle: () => dual(trackBot('oracle', 'oracle', normalBot()), new SmartBot({ name: 'oracle', maxPerTheme: 9, sameThemeBonus: 0, oracle: true, fill: 0.2, short: true })),
  'smart-value': () => new SmartBot({ name: 'smart-value', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, roles: ['bluechip'], fill: 0.3 }),
  'smart-naked': () => new SmartBot({ name: 'smart-naked', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, noItems: true }),
  'oracle-value': () => new SmartBot({ name: 'oracle-value', maxPerTheme: 9, sameThemeBonus: 0, oracle: true, roles: ['bluechip'], fill: 0 }),
  'smart-peek': () => new SmartBot({ name: 'smart-peek', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, peek: true }),
  'smart-peekmsg': () => new SmartBot({ name: 'smart-peekmsg', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, peekMsg: true }),
  'smart-nomsg': () => new SmartBot({ name: 'smart-nomsg', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, ignoreMsg: true }),
  'smart-truedir': () => new SmartBot({ name: 'smart-truedir', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, trueDir: true }),
  'smart-truedirturn': () => new SmartBot({ name: 'smart-truedirturn', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, trueDirTurn: true }),
  'smart-peekturn': () => new SmartBot({ name: 'smart-peekturn', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, peekTurn: true }),
  'smart-norec': () => new SmartBot({ name: 'smart-norec', maxPerTheme: 2, sameThemeBonus: 0, oracle: false, ignoreRec: true }),
  'oracle-stage': () => new SmartBot({ name: 'oracle-stage', maxPerTheme: 9, sameThemeBonus: 0, oracle: true, oracleToday: false }),
  qunzhu: qunzhuBot,
  lesson: () => lessonBot(),
  'lesson-nostop': () => lessonBot('nostop'),
  'lesson-heavy': () => lessonBot('heavy'),
  'ipo-only': () => ipoOnlyBot('taste'),
  'ipo-only-half': () => ipoOnlyBot('half'),
  'ipo-only-heavy': () => ipoOnlyBot('heavy'),
};

export function botByName(name: string): BotFactory {
  const b = BOTS[name];
  if (!b) throw new Error(`未知机器人：${name}（可选：${Object.keys(BOTS).join('、')}）`);
  return b;
}

/** 机器人的角色偏好说明（--list 用）。 */
export const BOT_DESC: Record<string, string> = {
  random: '随机买卖',
  truster: '0.5 信靠谱群友：只听战绩好（带先验 ≥ 55%）的群友的推荐和消息，期望值决策；合成行情下同 normal',
  follower: '总是买推荐里的第一只，从不卖',
  chaser: '追最热的题材，热度下降就卖',
  xiaobai: '0.10.0 小白（balance.md）：追最热的题材、谁说涨都信、说跌就卖，不止损、不押跌、不抵押',
  putong: '0.10.0 普通（balance.md）：同 normal，简单合理的打法，会止损',
  normal: '普通人：看战绩、升温早期买、过热且看空就卖、两个题材',
  smart: '贝叶斯推断题材阶段 + 群友可信度，期望值决策（同题材最多 2 只）',
  'smart-focus1': 'smart，只拿 1 个题材（极端集中）',
  'smart-focus2': 'smart，集中：最多 2 个题材，同题材优先叠加',
  'smart-spread': 'smart，分散：同题材最多 2 只，偏好新题材',
  'smart-spread1': 'smart，极端分散：每个题材最多 1 只',
  oracle: '知道真实阶段和当天的热度变化（真实行情下还能看行情段往后两天）；能押跌时押跌',
  heavy: '0.4 C 重仓派：normal 的选股，买一律重仓，赚钱的有现金就加仓',
  shorter: '0.4 C 押跌派：先拿押跌许可证；过热、降温的风口押跌，转暖、被轧就平；其余像 normal',
  gambler: '0.4 C 抵押赌徒：normal 的选股，第 2 个月起能押的都押去借钱，从不主动赎回',
  'gambler-smart': '0.4 C 诊断：smart 的选股 + 能押的都押',
  qunzhu: '无脑跟群主：买群主推荐的，群主说跌就卖',
  lesson: '新手课：一直照 lessonAdvice 做（每只试一口、亏 8% 止损、过热喊跌落袋、黑天鹅预告就空仓）',
  'lesson-nostop': '新手课对照：照建议买，但从不止损',
  'lesson-heavy': '新手课对照：照建议做，但买一律重仓',
  'ipo-only': '只打新（配平用）：除了申购什么都不买，每次试一口，中签的新股上市第 2 天卖；-half / -heavy 是每次半仓 / 重仓',
  'normal-nomsg': '诊断：normal 不看消息（推荐照常）',
  'smart-peek': '诊断：smart + 偷看所有题材今天的热度变化（消息价值的上限）',
  'smart-peekmsg': '诊断：smart + 偷看今天有消息的题材',
  'smart-nomsg': '诊断：smart 不看消息（推荐照常）',
  'smart-norec': '诊断：smart 不把推荐当信号',
  'smart-truedir': '诊断：smart + 今天的消息方向全对（只有方向）',
  'smart-truedirturn': '诊断：smart + 拐点题材的消息方向全对',
  'smart-peekturn': '诊断：smart + 偷看今天处在拐点的题材',
  'oracle-stage': '诊断：oracle 只知道真实阶段，不知道今天的热度变化',
  'smart-value': '成就用：smart 只买白马（价值投资）',
  'oracle-value': '诊断：oracle 只买白马（价值投资的上限）',
  'smart-naked': '成就用：smart 一个道具都不拿（裸考）',
};
