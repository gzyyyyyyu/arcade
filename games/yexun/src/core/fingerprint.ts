/**
 * 状态指纹：把一局的全部状态哈希成一个 32 位数。重放测试逐拍比它（同种子 + 同输入 → 逐位相同，模块 AGENTS.md「规则核心」一节）。
 * 浮点按 IEEE 754 的位来哈希（Float64Array 的底层字节），差最后一位也看得出来。
 */
import { raidHooks } from './raid-port.ts';
import { MERGES } from '../content/weapons.ts';
import { CHAR_FX } from '../content/meta.ts';
import type { World } from './state.ts';

function mix(h: number, v: number): number {
  h ^= v;
  return Math.imul(h, 0x01000193) >>> 0;
}

function arr(h: number, a: ArrayBufferView): number {
  const u = new Uint32Array(a.buffer, a.byteOffset, a.byteLength >>> 2);
  for (let i = 0; i < u.length; i++) h = mix(h, u[i]!);
  // 长度不是 4 的倍数的（Uint8Array）补上尾巴
  const tail = new Uint8Array(a.buffer, a.byteOffset + (u.length << 2), a.byteLength & 3);
  for (let i = 0; i < tail.length; i++) h = mix(h, tail[i]!);
  return h;
}

const f64 = new Float64Array(1);
function num(h: number, v: number): number {
  f64[0] = v;
  return arr(h, f64);
}

export function fingerprint(w: World): number {
  let h = 0x811c9dc5;
  for (const v of [w.tick, w.x, w.y, w.hp, w.face, w.invuln, w.level, w.xp, w.pendingLevels, w.chestPicks, w.raidBoost, w.kills, w.coins, w.spawnAcc, w.nextEvent, w.regenAcc, w.slowUntil, w.calmUntil, w.mercyAt, w.revives, w.rerolls, w.bans, w.bonusCard, w.mkIndex, w.mkPhase, w.mkStall, w.mkHold, w.mightUntil, w.speedUntil, ...w.mkSold]) h = num(h, v);
  // 夜市求签：没买过时不进指纹
  if (w.omen >= 0) h = num(h, w.omen);
  // 初成的搭配：没有时不进指纹
  for (const id of w.mergeHalf) h = num(h, MERGES.findIndex((m) => m.id === id));
  h = mix(h, w.phase === 'play' ? 1 : w.phase === 'choose' ? 2 : 3);
  for (const o of w.weapons) for (const v of [o.level, o.evolved ? 1 : 0, o.timer, o.phase, o.angle]) h = num(h, v);
  for (const [k, v] of Object.entries(w.passives).sort()) h = num(h ^ k.charCodeAt(0), v ?? 0);
  for (const r of [w.rSpawn, w.rDrop, w.rUp, w.rChest, w.rAi, w.rHit, w.rWeapon, w.rProp]) for (const v of r.snapshot()) h = mix(h, v >>> 0);
  if (w.raid) h = num(h, raidHooks().fingerprint(w.raid));
  // 首领连战的进度：只在连战局进指纹（别的局的金标准指纹不变）
  if (w.rush) {
    for (const v of [w.rushStage, w.rushAt, w.rushLeft, w.rushDown, w.rushEnd]) h = num(h, v);
    h = arr(h, w.eRush);
  }
  // 2.0 第一批法器的状态：只在用上的局进指纹（别的局的金标准指纹不变）
  if (w.arms.live()) {
    for (const v of w.arms.nums()) h = num(h, v);
    h = arr(arr(arr(arr(arr(h, w.arms.freezeAt), w.arms.vulnUntil), w.arms.vulnMul), w.arms.beads), w.arms.marked);
    // 锁魂幡记下的怪：只有合了它才会有，别的局不进指纹
    if (w.merges.includes('suohun')) h = arr(h, w.arms.souled);
  }
  // 技能的冷却和持续：放过才进指纹（没按过技能键的局，指纹和有技能之前一样）
  if (w.skill.uses > 0) for (const v of [w.skill.cd, w.skill.active, w.skill.uses]) h = num(h, v);
  // 胖师叔攒的伤害：攒过才进指纹
  if (w.skill.store > 0) h = num(h, w.skill.store);
  // 阴阳先生的阴阳互换：看过才进指纹（别的局不变）
  if (w.flip.side !== 0) h = num(num(h, w.flip.side), w.flip.next);
  // 货郎攒铜钱补刷新：补过才进指纹
  if (w.rerollAt !== CHAR_FX.huolangRerollEvery) h = num(h, w.rerollAt);
  // 2.0 的首领和特色怪留在地上的东西：只在用过的局进指纹
  if (w.foe.used) {
    const f = w.foe;
    for (const v of [f.windT, f.windX, f.windY, f.windDir, f.slickUntil, f.floeWarnEnd, f.floeUntil, f.fN, f.dark, f.homeX, f.homeY, f.stageNext, f.stageN, f.stageLeft, f.stageAt, f.stageGap]) h = num(h, v);
    for (const a of [f.cT, f.cX, f.cY, f.cR, f.wOn, f.wWarn, f.wPos, f.wGap, f.fX, f.fY]) h = arr(h, a);
  }
  // 地形状态：只在有这类地形的图上进指纹（别的图的金标准指纹不变）
  if (w.blockHp.length) h = arr(h, w.blockHp);
  if (w.ice.length) {
    h = num(num(h, w.pvx), w.pvy);
    h = arr(arr(h, w.eVX), w.eVY);
  }
  for (const a of [w.eAlive, w.eKind, w.eX, w.eY, w.eKX, w.eKY, w.eHp, w.eT, w.eS, w.ePhase, w.eHitAt, w.eMark, w.sAlive, w.sKind, w.sX, w.sY, w.sVX, w.sVY, w.sLife, w.sState, w.dAlive, w.dKind, w.dX, w.dY, w.dVal, w.dPull, w.pAlive, w.pX, w.pY]) h = arr(h, a);
  return h >>> 0;
}
