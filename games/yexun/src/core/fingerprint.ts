/**
 * 状态指纹：把一局的全部状态哈希成一个 32 位数。重放测试逐拍比它（同种子 + 同输入 → 逐位相同，模块 AGENTS.md 第 3 节）。
 * 浮点按 IEEE 754 的位来哈希（Float64Array 的底层字节），差最后一位也看得出来。
 */
import { raidHooks } from './raid-port.ts';
import { ARMS_NEW_MERGES, MERGES } from '../content/weapons.ts';
import { MAX_ENEMIES, WEAPON_SLOTS, type World } from './state.ts';

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

/**
 * 旧录像（旧卡池）的 eHitAt：2.0 加了 15 个搭配，每只怪的槽位变多、数组变长；旧录像录的指纹是按老长度哈的。
 * 旧卡池下新搭配出不来，多出来的槽位永远是 0，按老步长取前面那截，就和老指纹对得上
 */
/** 规则 55 新增的搭配数：规则 54 的录像按没有它们的长度哈（它们在 54 里出不来，槽位永远是 0），指纹和 55 之前一样 */
const RULES55_MERGES = MERGES.filter((m) => m.since === 55).length;

function legacyHitAt(w: World, cut = ARMS_NEW_MERGES.length): Int32Array {
  const old = WEAPON_SLOTS - cut;
  const out = new Int32Array(MAX_ENEMIES * old);
  for (let i = 0; i < MAX_ENEMIES; i++) out.set(w.eHitAt.subarray(i * WEAPON_SLOTS, i * WEAPON_SLOTS + old), i * old);
  return out;
}

export function fingerprint(w: World): number {
  let h = 0x811c9dc5;
  for (const v of [w.tick, w.x, w.y, w.hp, w.face, w.invuln, w.level, w.xp, w.pendingLevels, w.kills, w.coins, w.spawnAcc, w.nextEvent, w.regenAcc, w.slowUntil, w.calmUntil, w.mercyAt, w.revives, w.rerolls, w.bans, w.bonusCard, w.mkIndex, w.mkPhase, w.mkStall, w.mkHold, w.mightUntil, w.speedUntil, ...w.mkSold]) h = num(h, v);
  // 规则 60 的求签：没买过时不进指纹，旧局的指纹不变
  if (w.omen >= 0) h = num(h, w.omen);
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
  }
  // 技能的冷却和持续：放过才进指纹（没按过技能键的局，指纹和有技能之前一样）
  if (w.skill.uses > 0) for (const v of [w.skill.cd, w.skill.active, w.skill.uses]) h = num(h, v);
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
  for (const a of [w.eAlive, w.eKind, w.eX, w.eY, w.eKX, w.eKY, w.eHp, w.eT, w.eS, w.ePhase, w.legacyPool ? legacyHitAt(w) : w.new55 ? w.eHitAt : legacyHitAt(w, RULES55_MERGES), w.eMark, w.sAlive, w.sKind, w.sX, w.sY, w.sVX, w.sVY, w.sLife, w.sState, w.dAlive, w.dKind, w.dX, w.dY, w.dVal, w.dPull, w.pAlive, w.pX, w.pY]) h = arr(h, a);
  return h >>> 0;
}
