/**
 * 登陆战开场节奏的纯逻辑（不依赖 Phaser / DOM；BattleScene、battleinput、funui 调用，tests/battlescout.test.ts 锁住）。
 *
 * 一、侦察期：玩家第一个操作（出船或放技能）之前，画面不调 stepBattle，拍数停在 0。
 *   等价于"第一个操作在第 0 拍"，是合法的操作序列，规则核心、回放、实盘期望都不变；
 *   画面照常动（海浪、待机、镜头），只是 3:00 不白白倒数。回放和机器人代打（botAct 里有操作）不停。
 * 二、局内一次性提示：兵团血量第一次掉过一半、还有没出的船时，提醒"分批上"。
 */
import { TROOPS } from '../content/index.ts';
import type { ArmySetup, BUnit, TroopKind } from '../core/types.ts';

/** 侦察期要看的现场：拍数、是不是回放、预排的电脑操作有几条、玩家这一拍排了几条 */
interface ScoutCtx {
  tick: number;
  replay: boolean;
  botActs: number;
  pending: number;
}

/**
 * 这一拍要不要停着不推进。只有第 0 拍、没人在操作、不是回放也没有电脑代打才停；
 * 玩家一旦点了（pending 有操作）当拍就放行，之后拍数 > 0，永远不再停。航线一站同理（拍数同样从 0 起）。
 */
export function holdScout(c: ScoutCtx): boolean {
  return c.tick === 0 && !c.replay && c.botActs === 0 && c.pending === 0;
}

/** 计时牌在侦察期的小字（没有就返回空串，样式由调用方挂） */
export const SCOUT_LABEL = '待登陆';

/** 开场俯瞰的提示合成这一条：红圈是什么、点哪里继续、什么时候开始计时；"先点船卡再点沙滩"留给俯瞰收起后的提示条，不同时出现 */
export const SCOUT_TIP = '红圈是射程、斜线暗圈是打不到的盲区 · 先点下面的船卡，再点发光的沙滩靠岸；出第一船才开始计时';
/** 新手第一场的开场提示：不讲盲区和计时，只说红圈危险、点一下开始 */
export const FIRST_TIP = '这是敌人的岛，红圈里的炮会打你的兵 · 点一下开始';

/** 每拍最多算一次兵团血量：全部登陆过的兵的当前血 / 满血 */
export function troopHpPct(units: ReadonlyArray<Pick<BUnit, 'hp' | 'maxHp'>>): number {
  let hp = 0;
  let max = 0;
  for (const u of units) {
    hp += Math.max(0, u.hp);
    max += u.maxHp;
  }
  return max > 0 ? Math.round((hp / max) * 100) : 100;
}

/** 能吃炮的厚血兵种：先上它们 */
const TANKS: readonly TroopKind[] = ['brute', 'shield'];

/**
 * 掉过一半又还有船没出时的提示文字；不满足返回 null。
 * 还有壮汉 / 盾兵没上就点名说"先上壮汉吃炮"，没有就只说分批；已经掉过一半后不再算（调用方记 done）。
 */
export function halfLostHint(units: ReadonlyArray<Pick<BUnit, 'hp' | 'maxHp'>>, landed: ReadonlyArray<boolean>, army: ArmySetup): string | null {
  if (units.length === 0 || troopHpPct(units) > 50) return null;
  const left = army.boats.filter((_, i) => landed[i] !== true);
  if (left.length === 0) return null;
  const tank = left.find((b) => TANKS.includes(b.troop));
  if (tank) return `兵快顶不住了：分批登陆，先上${TROOPS[tank.troop].name}吃炮`;
  return '兵快顶不住了：别一次放光，分批登陆';
}
