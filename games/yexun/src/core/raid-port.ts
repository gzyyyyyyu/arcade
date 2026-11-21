/**
 * 核心看夜探的窗口。依赖方向是 explore → core：核心不 import src/explore（tests/arch/core-arch.test.ts 守着），
 * 夜探的状态对象 Raid 挂在 World 上，核心只通过这里的 `RaidPort`（用到的那几个成员）和 `raidHooks`（夜探每拍要调的几个函数）碰它。
 * 夜探那边在 explore/register.ts 里把实现填进 `raidHooks`；要开夜探局（createWorld 的 mode 为 raid）或算夜探指纹的入口先 import 它。
 * 守夜的局从不碰这些钩子。
 */
import type { RaidEnemyKind } from '../content/explore.ts';
import type { EnemyKind } from '../content/enemies.ts';
import type { Rect } from '../content/maps.ts';
import type { Minute } from '../content/waves.ts';
import type { BlockIndex, RaidBlock } from './blocks.ts';
import type { GuardFx, GuardHost, RaidPlayerView, RaidSetup } from './raid-host.ts';

/** 核心用到的地图成员（夜探的 RaidMap 都有；其余同样由 explore/raid.ts 补进类型） */
export interface RaidMapPort {
  readonly size: number;
  blocks: RaidBlock[];
  readonly index: BlockIndex;
  spawn: { x: number; y: number };
  /** 戏楼镇的戏台位置 */
  stage?: { x: number; y: number };
  /** 窑镇的窑口（火区，core/fire.ts） */
  fire: Rect[];
}

/** World.raid 的类型：核心用到的成员（explore 的 Raid 都有；其余成员只有夜探、画面层、机器人读，类型上由 explore/raid.ts 补进来） */
export interface RaidPort {
  readonly setup: RaidSetup;
  readonly map: RaidMapPort;
  outcome: 'none' | 'escaped' | 'dead' | 'lost';
  tick(h: RaidPlayerView): void;
  die(tick: number): void;
  takeUpgrade(): boolean;
  takeSpawn(): number;
  guardSpawn(g: number): { kind: EnemyKind | RaidEnemyKind; x: number; y: number };
  bindGuard(g: number, i: number, h: GuardHost): void;
  guardAt(i: number, gen: number): number;
  goblinGone(g: number, tick: number): boolean;
  onKill(i: number, gen: number, elite: boolean, x: number, y: number, h: RaidPlayerView): boolean;
}

/** 夜探交给核心的函数（热路径上的几个共用返回对象，不分配） */
export interface RaidHooks {
  create(setup: RaidSetup): RaidPort;
  /** 夜探状态的指纹（混进核心指纹） */
  fingerprint(r: RaidPort): number;
  /** 每分钟一档的刷怪表 */
  minute(tick: number): Minute;
  /** 离镇中心越近怪越硬、越多（复用一个对象） */
  zoneMul(r: RaidPort, x: number, y: number): { hp: number; dmg: number; count: number };
  /** 刷怪点夹进场地、推出墙；推完还压着墙回 false */
  spawnPoint(r: RaidPort, p: { x: number; y: number }): boolean;
  /** 守卫这一拍走多远；方向写进 guardMove（own 为真时照怪自己的行为走） */
  guardStep(r: RaidPort, g: number, h: GuardHost, i: number, fx: GuardFx): number;
  readonly guardMove: { vx: number; vy: number; own: boolean };
}

let hooks: RaidHooks | null = null;

export function registerRaidHooks(h: RaidHooks): void {
  hooks = h;
}

/** 夜探的钩子；没注册就用夜探说明是入口漏了 import explore/register.ts */
export function raidHooks(): RaidHooks {
  if (!hooks) throw new Error('夜探规则没注册：先 import explore/register.ts');
  return hooks;
}
