/** 登陆战场景共用的类型、常量和小工具（BattleScene 和拆出去的 battle*.ts 都用，不依赖场景实例） */
import Phaser from 'phaser';
import { TROOPS } from '../content/index.ts';
import type { BattleAction, BattleResult, BattleSetup, TroopKind } from '../core/types.ts';
import type { DamageStage } from './motion.ts';
import type { Rig } from './rigsprite.ts';

export interface BattleData {
  levelId: string;
  setup: BattleSetup;
  auto: boolean;
  settle: boolean;
  /** 今日悬赏（通关奖励翻倍，每天一次） */
  bounty?: boolean;
  speed: number;
  /** 异步攻防（src/view/pvp.ts）：有它时记下玩家每拍的操作，结束时交给 onFinish、不弹战役结算；replay 给了就是看防守回放 */
  pvp?: PvpHooks;
  /** 寻宝航线的一站（src/view/maproute.ts）：到 MAP_STOP_TICKS 截断，结束时交给 onFinish、不弹战役结算 */
  map?: MapStopHooks;
}

export interface MapStopHooks {
  /** 第几站（1..MAP_LAYERS）、岛名、开打前的宝分 */
  stop: number;
  name: string;
  pts: number;
  /** 这一站按眼下的摧毁率和星能拿多少宝分（规则算，画面只显示） */
  gain(res: BattleResult): number;
  /** alive 按出战船（ArmySetup.boats）下标；energyLeft = 结束时剩的旗舰能量 */
  onFinish(res: BattleResult, alive: number[], energyLeft: number): void;
}

export interface PvpHooks {
  /** 这座岛主人的海盗王阶（0 或没给 = 没有）：主寨旁立王旗，只管画面（DESIGN 2.6） */
  rank?: number;
  /** 回放：按这串操作自动打，到 end 拍停；玩家点的不算 */
  replay?: { actions: BattleAction[]; end: number };
  /** log：实际生效的操作（t = 生效的拍），endTick：停在第几拍；local：浏览器算的结果（只作显示前的参考，以服务端为准） */
  onFinish(log: BattleAction[], endTick: number, local: BattleResult): void;
}

export interface USpr {
  /** 分件骨架（rigsprite.ts），倒下演完放回对象池 */
  rig: Rig;
  px: number;
  py: number;
  cx: number;
  cy: number;
  kind: TroopKind;
  fading: boolean;
  /** 第一次画出来的时刻（毫秒，游戏时钟）；兵跳下船的小弹跳用，-1 = 还没画过 */
  born: number;
  /** 朝向过渡：-1..1 连续变（经过 0 时压扁，不瞬切） */
  face: number;
  /** 走过的世界距离（像素）：走路循环按距离推进，脚不打滑 */
  dist: number;
  /** 上一帧的位置（算走过多远用） */
  lx: number;
  ly: number;
  /** 最近一次挨打的伤害和满血：倒下时按它选被打飞还是跪倒 */
  lastDmg: number;
  maxHp: number;
  /** 挤开后的显示偏移（逻辑单位，crowd.ts 平滑追目标） */
  ox: number;
  oy: number;
}
export interface BSpr {
  img: Phaser.GameObjects.Image;
  baseX: number;
  baseY: number;
  down: boolean;
  /** 受损阶段（motion.damageStage）、下一次冒烟 / 起火的时刻 */
  stage: DamageStage;
  nextSmoke: number;
  nextFire: number;
}

/** 兵在画面上按 id 散开的半径（世界单位，1 格 = 100）：只动画面，不进规则；和规则的小道偏移叠加最多约半格 */
export const SPREAD_R = 10;

/** 血条上下错开时的缝（CSS 像素）；条的大小、显示时间见 bars.ts */
export const BAR_GAP = 2;
/** 一个攻击来回的时长（毫秒）：近战快，远程慢；循环起点按兵的编号错开，不齐步 */
/** 英雄攻击没有出手拍可对齐，按这个周期循环 */
export const HERO_ATK_MS = 700;

/** 弹道样子：核心新增的弹种（火箭、鱼叉）查不到时按普通炮弹画 */
export const PROJ_FX: Record<string, 'ball' | 'bullet' | 'shell' | 'flame' | 'rocket' | 'harpoon' | 'tar' | 'shock' | 'grenade'> = { grenade: 'grenade', shock: 'shock', ball: 'ball', shell: 'shell', barrage: 'shell', dynamite: 'ball', keg: 'shell', bullet: 'bullet', flame: 'flame', rocket: 'rocket', harpoon: 'harpoon', tar: 'tar' };
/** 要朝飞行方向转的弹种 */
export const AIMED = new Set(['rocket', 'harpoon', 'bullet']);
/** 范围弹落点的作用半径（格）：手雷 1.2、震荡炮 1（和规则表一致；画面只用来画范围圈和冲击圈） */
export const AREA: Record<string, number> = { grenade: 1.2, shock: 1 };
/** 地面上半径 1 格的圆画在等距屏幕上，横向半径多少像素（√2 × 32） */
export const CELL_RX = 45.25;
export const TITLES = ['这次没成功', '拿下了！', '漂亮！', '大获全胜！'];

export const v2 = (p: { x: number; y: number }): Phaser.Math.Vector2 => new Phaser.Math.Vector2(p.x, p.y);

export function rewardName(id: string): string {
  const [type, a, b] = id.split(':');
  if (type === 'skin') return `${TROOPS[a as TroopKind]?.name ?? a}·${b === 'gold' ? '黄金' : b === 'shadow' ? '暗影' : '皇家'}皮肤`;
  return a === 'statue' ? '海盗雕像' : a === 'flagpole' ? '骷髅旗杆' : a === 'chest' ? '藏宝箱' : id;
}
