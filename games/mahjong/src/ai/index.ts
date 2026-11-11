/** 各玩法的电脑（按玩法 id）。规则核心不 import 这里，由房间和单机把它交给玩法的 auto、timeout */
import { riichiAi } from './riichi.ts';
import { xuezhanAi } from './xuezhan.ts';

export const AIS = {
  'sichuan-xuezhan': xuezhanAi,
  riichi: riichiAi,
};
