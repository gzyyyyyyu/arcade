/** 引擎共用的小件：事件收集器和对外的选项、结果类型。 */
import { BALANCE } from '../balance.ts';
import type { GameEvent, GameState } from '../types.ts';

export const MONTHS = BALANCE.monthDays.length;

export interface DispatchOptions {
  /** 是否收集事件，默认 true；模拟器可关掉 */
  events?: boolean;
  /** 直接修改传入的状态而不复制（模拟器提速用） */
  inPlace?: boolean;
}

export interface DispatchResult {
  state: GameState;
  events: GameEvent[];
  /** 非法操作的原因；此时 state 为原状态 */
  error: string | null;
}

export interface Emitter {
  events: GameEvent[];
  enabled: boolean;
}

export function emit(em: Emitter, e: GameEvent): void {
  if (em.enabled) em.events.push(e);
}
