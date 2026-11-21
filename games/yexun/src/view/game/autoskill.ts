// 「自动放技能」：只在画面层把"该放了"当作按了技能键，规则核心和录像格式都不动。
// 录像器记的是实际送进 step 的技能键，所以自动放的和手按的在回放里一模一样。

import { skillReady, type World } from '../../core/index.ts';
import { readFlag, writeFlag } from '../audio/sfx.ts';

/** 附近有怪的范围（像素）：屏幕上看得见的近处，怪不近身就不浪费技能 */
export const AUTO_SKILL_RANGE = 360;

// 每拍都要看一眼，记在内存里，只在改的时候写存储（readFlag 每次都解析设置 JSON）
let cached: boolean | undefined;
export const autoSkillSetting = {
  get on(): boolean {
    return (cached ??= readFlag('autoSkill', false));
  },
  set on(v: boolean) {
    cached = v;
    writeFlag('autoSkill', v);
  },
};

/** 开关开着、技能就绪、范围内至少 1 只活怪，才算按了技能键 */
export function wantAutoSkill(w: World, on: boolean, range = AUTO_SKILL_RANGE): boolean {
  if (!on || !skillReady(w)) return false;
  const r2 = range * range;
  for (let i = 0; i < w.eAlive.length; i++) {
    if (!w.eAlive[i]) continue;
    const dx = w.eX[i]! - w.x;
    const dy = w.eY[i]! - w.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}
