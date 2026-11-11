/**
 * 把夜探的实现注册进核心的钩子表（core/raid-port.ts）。依赖方向：explore → core，核心不 import 夜探。
 * 开夜探局、重放、算夜探指纹的入口先 import 本文件；raid.ts 自己 import 它也行，但会让 raid.ts 和 guards.ts 互相拉扯，所以单独放。
 */
import { registerRaidHooks, type RaidPort } from '../core/raid-port.ts';
import { GUARD_MOVE, guardStep } from './guards.ts';
import { Raid, raidFingerprint } from './raid.ts';
import { raidMinute, raidSpawnPoint, raidZoneMul } from './spawn.ts';

// 核心拿到的 RaidPort 都是本文件 create 出来的 Raid，转回去是安全的
const R = (r: RaidPort): Raid => r as Raid;

registerRaidHooks({
  create: (setup) => new Raid(setup),
  fingerprint: (r) => raidFingerprint(R(r)),
  minute: raidMinute,
  zoneMul: (r, x, y) => raidZoneMul(R(r).map, x, y),
  spawnPoint: (r, p) => raidSpawnPoint(R(r), p),
  guardStep: (r, g, h, i, fx) => guardStep(R(r), g, h, i, fx),
  guardMove: GUARD_MOVE,
});
