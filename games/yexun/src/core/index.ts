/**
 * 规则核心的对外接口（DESIGN.md 5.1）：画面层、机器人、测试都从这里拿。
 */
export { createWorld, mergeReady, rushEnterMap, step, WEAPON_CODE, PASSIVE_CODE, MERGE_CODE } from './step.ts';
export { World, Drop, Pick, Shot, RULES_VERSION, normalizeSetup, TICKS_PER_SECOND, MAX_ENEMIES, MAX_SHOTS, MAX_DROPS, MAX_PROPS, type Setup, type Choice, type OwnedWeapon } from './state.ts';
export { SKILLS, SKILL_IDS, SKILL_FX, skillCooldown, skillReady, skillOf, yinyangSide, type SkillDef } from './skills.ts';
export { Ev, Events } from './events.ts';
export { fingerprint } from './fingerprint.ts';
export { INPUT_DIRS } from './fmath.ts';
export {
  LOADOUT,
  loadoutCost,
  loadoutOk,
  loadoutPassives,
  loadoutSpare,
  loadoutWeapons,
  rushPresets,
  rushResult,
  rushRoute,
  type RushEventChoice,
  type RushGood,
  type RushLoadout,
  type RushOption,
  type RushResult,
  type RushRoute,
} from './rush.ts';
export { trialResult, type TrialResult } from './trial.ts';
