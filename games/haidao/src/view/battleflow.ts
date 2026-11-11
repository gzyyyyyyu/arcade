import { battleResult, createBattle, stepBattle, type BattleAction, type BattleEvent, type BattleResult, type BattleSetup, type BattleState } from '../core/index.ts';

/**
 * 画面逐拍推进时每一拍要交给规则核心的操作：先排好的电脑操作（botAct，按 t 升序）到点就进，
 * 再加上玩家这一拍点的（pending）。纯函数，BattleScene.stepOnce 和下面的 driveBattle 共用，保证顺序一致。
 */
export function takeActions(botAct: ReadonlyArray<BattleAction>, botI: number, pending: ReadonlyArray<BattleAction>, tick: number): { acts: BattleAction[]; botI: number } {
  const acts = pending.slice();
  while (botI < botAct.length && botAct[botI]!.t <= tick) acts.push(botAct[botI++]!);
  return { acts, botI };
}

/** 画面处理事件的顺序 = 规则核心给出的数组顺序；这里按拍分好，供测试锁住 */
export interface TickEvents {
  tick: number;
  events: BattleEvent[];
}

/**
 * 回放驱动：给定 setup 和操作，按画面一样的方式逐拍推进，返回每一拍的事件和最终状态。
 * 画面里 pending 为空（玩家没点）时与规则核心的 runBattle 逐位一致。
 */
export function driveBattle(setup: BattleSetup, actions: ReadonlyArray<BattleAction>): { state: BattleState; result: BattleResult; ticks: TickEvents[] } {
  const s = createBattle(setup);
  const bot = actions.map((a, i) => ({ a, i })).sort((p, q) => p.a.t - q.a.t || p.i - q.i).map((x) => x.a);
  let botI = 0;
  const ticks: TickEvents[] = [];
  while (!s.over) {
    const t = takeActions(bot, botI, [], s.tick);
    botI = t.botI;
    const tick = s.tick;
    ticks.push({ tick, events: stepBattle(s, t.acts) });
  }
  return { state: s, result: battleResult(s), ticks };
}
