/** 界面用到的护航内容和结算都从这里拿（规则在 core，界面不自己算） */
import { ESCORT_LEVELS } from '../core/index.ts';

export { ESCORT_LEVELS, escortResultOf, escortSetup, escortUnlocked, settleEscort } from '../core/index.ts';
export type { EscortReward } from '../core/index.ts';

/** 是不是护航的关卡 id（`<图>-<难度>`） */
export const isEscortId = (id: string): boolean => ESCORT_LEVELS.some((l) => l.id === id);
