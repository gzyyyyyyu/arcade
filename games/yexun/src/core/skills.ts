/**
 * 角色的主动技能（DESIGN.md 3.7）。
 * 规则：`step(w, dir, choice, skill)` 的 skill 位为 1 且冷却完了才放；冷却、持续存在 `w.skill`（进指纹），效果走事件（Ev.SkillUse / SkillBeat / SkillEnd），
 * 画面和声音只读事件。全程不用随机（定向、固定扇面），数学只用方向表和 fsqrt。
 * 这个文件不 import step.ts（step 反过来 import 它）：要借 step 里的伤害、发子弹，由 step 传一份 SkillOps 进来。
 */
import { CHAR_FX, PERK_FX, type CharacterId } from '../content/meta.ts';
import { PICKUP, PLAYER } from '../content/player.ts';
import { WEAPONS, weaponStats, type WeaponId, type WeaponStats } from '../content/weapons.ts';
import { dcos, dsin, fsqrt } from './fmath.ts';
import type { Grid } from './grid.ts';
import { ENEMIES } from '../content/enemies.ts';
import { Ev } from './events.ts';
import { Drop, MAX_DROPS, MAX_ENEMIES, Shot, TICKS_PER_SECOND, type World } from './state.ts';

const S = TICKS_PER_SECOND;

export interface SkillDef {
  /** 技能名（HUD 提示、图鉴用） */
  name: string;
  /** 一句话说明 */
  text: string;
  /** 基础冷却（拍）：从放出去那一拍算起，包含持续的时间 */
  cd: number;
  /** 持续（拍）；0 = 瞬发 */
  dur: number;
  /** 事件里的编号，按 SKILL_IDS 的顺序 */
  code: number;
  /** HUD 按钮的图标（图集里的 key，art/skills.ts 画的专用图 sk_*） */
  icon: string;
}

/** 每个技能的数值（改数值要跑模拟器，DESIGN.md 第 8 节） */
export const SKILL_FX = {
  /** 剑气纵横：伤害 = 桃木剑的几倍；扇形半径和半角（cos 值：75°） */
  sweep: { mul: 4, r: 340, cosHalf: 0.2588, knock: 70 },
  /** 万符齐发：几张、每张的爆开半径、飞行速度、转向、最多飞几拍、找目标的范围、出手时扇开的角度 */
  volley: { n: 12, r: 70, speed: 16, turn: 0.3, life: 90, find: 560, spread: 10 },
  /** 御剑突进：冲多远、分几步查碰撞、每步查多宽、穿过的怪挨飞剑的几倍、冲完无敌几拍 */
  dash: { dist: 320, steps: 10, r: 66, mul: 3, invuln: 12 },
  /** 铁布衫：挨打只掉的比例；结束时震开的半径和力道 */
  iron: { hurtMul: 0.2, r: 240, knock: 80 },
  /** 梆子声声：每几拍敲一次、多远的怪退并受伤、退多远；伤害 = 底 + 每级 × 等级 */
  clapper: { every: 2 * S, r: 260, knock: 50, dmg: 12, perLevel: 2 },
  /** 回春：立刻回的血占上限的比例、之后每秒回的比例、身边多大范围的怪走得慢一半 */
  spring: { burst: 0.35, perSec: 0.03, slowR: 120 },
  /** 剪纸成军：剪几个、从主角身边什么距离冒出来（纸兵的伤害、寿命随纸兵法器；寿命 8 秒 = 纸兵法器的"持续"以外另算，见 life） */
  paper: { n: 4, life: 8 * S, ring: 46 },
  /** 横江一渡：水域半径、里面主角的速度倍数（怪慢 40%：记 1 档减速，实际 ×0.62） */
  // dmg、perLevel：水域里的怪每秒挨一下 dmg + perLevel × 等级（采药女药香圈的两倍）
  ferry: { r: 190, speed: 1.3, dmg: 16, perLevel: 4 },
  /**
   * 角色技能钩子：小道士手上剑类 ≥ 2 件时身后补一刀；符师每多一件符类多飞几张、封顶；
   * 剑侠冲刺打倒精英当场转好；胖师叔挡下的伤害 × storeMul 在结束时震出去；采药女回春每秒伤药香圈里的怪（底 + 每级 × 等级）
   */
  hooks: { backSlashAt: 2, fuPer: 3, fuMax: 21, storeMul: 2, herbDmg: 8, herbPerLevel: 2 },
  /** 招财进宝：打倒的怪多掉几枚铜钱 */
  fortune: { extra: 1 },
  /** 定阵：阵的半径、布阵那一刻定住几拍（之后在阵里的怪慢 40%，同样记 1 档减速） */
  array: { r: 200, bind: 45 },
} as const;

/** 技能编号顺序（事件里的 a）；以后加角色往后加，别插队 */
export const SKILL_IDS: readonly CharacterId[] = ['xiaodao', 'fushi', 'jianxia', 'pang', 'gengfu', 'caiyao', 'zhijiang', 'baidu', 'huolang', 'yinyang'];

export const SKILLS: Record<CharacterId, SkillDef> = {
  xiaodao: { name: '剑气纵横', text: '向面前放一道大斩，伤害是桃木剑的 4 倍，砍中的怪被推开', cd: 12 * S, dur: 0, code: 0, icon: 'sk_sweep' },
  fushi: { name: '万符齐发', text: '一口气射出 12 张追踪符，各找不同的怪', cd: 12 * S, dur: 0, code: 1, icon: 'sk_volley' },
  jianxia: { name: '御剑突进', text: '沿面向冲出一段，穿过的怪挨一刀，冲的时候不挨打', cd: 10 * S, dur: SKILL_FX.dash.invuln, code: 2, icon: 'sk_dash' },
  pang: { name: '铁布衫', text: '3 秒内挨打只掉两成，结束时震开身边的怪', cd: 15 * S, dur: 3 * S, code: 3, icon: 'sk_iron' },
  gengfu: { name: '梆子声声', text: '12 秒里每 2 秒敲一次小梆，近处的怪退一步并受伤', cd: 50 * S, dur: 12 * S, code: 4, icon: 'sk_clap' },
  caiyao: { name: '回春', text: '立刻回 35% 血，再 6 秒每秒回 3%，期间身边的怪走得慢一半；满血时回不进去的血变成药香圈的伤害', cd: 40 * S, dur: 6 * S, code: 5, icon: 'sk_spring' },
  zhijiang: { name: '剪纸成军', text: '身边立刻剪出 4 个纸兵，8 秒后散，可超过纸兵的上限', cd: 22 * S, dur: 0, code: 6, icon: 'sk_paper' },
  baidu: { name: '横江一渡', text: '脚下展开一片水域 5 秒：里面你快三成，怪慢四成、每秒挨一下，跟着你走', cd: 20 * S, dur: 5 * S, code: 7, icon: 'sk_ferry' },
  huolang: { name: '招财进宝', text: '全屏魂珠和铜钱飞到身上，10 秒里打倒的怪多掉一枚铜钱', cd: 30 * S, dur: 10 * S, code: 8, icon: 'sk_fortune' },
  yinyang: { name: '定阵', text: '脚下布一座阵 6 秒：阵里的怪先定住 1.5 秒，再慢四成', cd: 20 * S, dur: 6 * S, code: 9, icon: 'sk_array' },
};

/** step.ts 借给技能用的几样东西（避免 import 回 step.ts 成环） */
export interface SkillOps {
  /** 打一只怪（不算哪件法器的伤害；暴击、克制、击杀掉落照常） */
  hit(w: World, i: number, dmg: number, kx: number, ky: number, knock: number): void;
  /** 放一颗子弹，返回槽位（满了 -1） */
  shot(w: World, kind: Shot, x: number, y: number, vx: number, vy: number, life: number, dmg: number, r: number, state: number, slot: number, idx: number): number;
  /** 把主角推出挡路的块 */
  push(w: World, p: { x: number; y: number }, r: number): void;
  /** 离 (x, y) 最近的怪（r 以内） */
  nearest(w: World, g: Grid, x: number, y: number, r: number, skip: number): number;
}

const scratch = new Int32Array(MAX_ENEMIES);

export function skillOf(w: World): SkillDef {
  return SKILLS[w.setup.character ?? 'xiaodao'];
}

/**
 * 冷却的实际拍数：香炉、灵气这类冷却加成只算一半（免得香炉流技能满屏）；
 * 角色初始数值的 cd 和套装的冷却不算（它们是出手快慢，不是技能）。
 */
/** 阴阳先生·阴阳互济：血过半（含半）是阳（伤害高），不足一半是阴（技能冷却短）；别的角色 null。HUD 头像上的阴阳标读它 */
export function yinyangSide(w: World): 'yang' | 'yin' | null {
  if (w.setup.character !== 'yinyang') return null;
  return w.hp * 2 >= w.stats.hpMax ? 'yang' : 'yin';
}

export function skillCooldown(w: World): number {
  // 阴阳先生·阴阳互济：血不足一半时冷却再 −8%（和香炉一样只算一半，按放的那一刻的血算）
  const yy = yinyangSide(w) === 'yin' ? CHAR_FX.yinyangCd : 0;
  const bonus = 0.08 * (w.passives.xianglu ?? 0) + PERK_FX.lingqi * (w.setup.perks?.lingqi ?? 0) + yy;
  return Math.max(S, Math.round(skillOf(w).cd * (1 - bonus / 2)));
}

/** 能不能放：冷却完了、没在持续中、在打（HUD 的"好了"也看它） */
export function skillReady(w: World): boolean {
  return w.phase === 'play' && w.skill.cd <= 0 && w.skill.active <= 0;
}

/** 铁布衫期间挨打乘的倍数（hurt 用；平时恒为 1） */
export function skillHurtMul(w: World): number {
  return w.skill.active > 0 && w.setup.character === 'pang' ? SKILL_FX.iron.hurtMul : 1;
}

/** 回春期间身边走得慢的半径（markSlow 用；0 = 没有） */
export function skillSlowRadius(w: World): number {
  return w.skill.active > 0 && w.setup.character === 'caiyao' ? SKILL_FX.spring.slowR : 0;
}

/** 减速区（markSlow 用）：摆渡人的水域跟着主角，阴阳先生的阵钉在布阵的地方；没有回 null。怪在里面走得慢 40%（记 1 档） */
const zone = { x: 0, y: 0, r: 0 };
export function skillZone(w: World): { x: number; y: number; r: number } | null {
  if (w.skill.active <= 0) return null;
  const c = w.setup.character;
  if (c === 'baidu') {
    zone.x = w.x;
    zone.y = w.y;
    zone.r = SKILL_FX.ferry.r * w.stats.areaMul;
    return zone;
  }
  if (c === 'yinyang') {
    zone.x = w.skill.zx;
    zone.y = w.skill.zy;
    zone.r = SKILL_FX.array.r * w.stats.areaMul;
    return zone;
  }
  return null;
}

/** 主角是不是站在摆渡人的水域里（跑得快三成） */
export function skillFerrying(w: World): boolean {
  return w.skill.active > 0 && w.setup.character === 'baidu';
}

/** 货郎的招财进宝开着：打倒的怪多掉铜钱 */
export function skillFortune(w: World): boolean {
  return w.skill.active > 0 && w.setup.character === 'huolang';
}

/**
 * 乘在每一下伤害上的角色和开局配置那部分（hitEnemy 用）：
 * 摆渡人的水类法器 +50%；货郎每 100 枚铜钱 +1%（最多 +10%）；阴阳先生血过半 +8%（心法特色在 core/xinfa.ts）。
 * owner = 记功的法器（技能打的没有）
 */
export function charDmgMul(w: World, owner: WeaponId | undefined): number {
  return charPerkMul(w, owner);
}

function charPerkMul(w: World, owner: WeaponId | undefined): number {
  switch (w.setup.character) {
    case 'baidu':
      return owner !== undefined && WEAPONS[owner].el === '水' ? CHAR_FX.baiduWater : 1;
    case 'huolang':
      return 1 + Math.min(CHAR_FX.huolangMax, CHAR_FX.huolangStep * Math.floor(w.coins / CHAR_FX.huolangPer));
    case 'yinyang':
      return yinyangSide(w) === 'yang' ? CHAR_FX.yinyangHigh : 1;
    default:
      return 1;
  }
}

/** 纸匠·巧手：纸兵寿命倍数（step 的 paperTick 用） */
export function paperLifeMul(w: World): number {
  return w.setup.character === 'zhijiang' ? CHAR_FX.zhijiangLife : 1;
}

/** 纸匠·巧手：这只纸兵倒下时要不要还一张纸兵的冷却（由拍号和纸兵槽位算的散列，两成） */
export function paperRefund(w: World, shot: number): boolean {
  if (w.setup.character !== 'zhijiang') return false;
  const h = Math.imul(w.tick + 1, 2654435761) ^ Math.imul(shot + 1, 40503);
  return ((h >>> 8) % 100) < CHAR_FX.zhijiangRefund * 100;
}

/** 手上某一类（剑 / 符 / 镇 / 灵）的法器有几件 */
function typeCount(w: World, type: string): number {
  let n = 0;
  for (const o of w.weapons) if (WEAPONS[o.id].type === type) n++;
  return n;
}

/**
 * 技能借的那件法器没拿在手上时按几级算：手上最高的法器等级（封顶那件法器的满级），第二起手的技能跟着成长走
 */
function borrowLevel(w: World, id: WeaponId): number {
  let lv = 1;
  for (const o of w.weapons) if (o.level > lv) lv = o.level;
  return Math.min(lv, WEAPONS[id].ups.length + 1);
}

/** 技能借的那件法器的数值：拿在手上的按现在的（等级、流派加成都算上），没有按 borrowLevel 级的白板数值 */
export function borrowStats(w: World, id: WeaponId): WeaponStats {
  const k = w.weapons.findIndex((o) => o.id === id);
  return k >= 0 ? w.wstats[k]! : weaponStats(id, borrowLevel(w, id), false);
}

function baseDmg(w: World, id: WeaponId): number {
  return borrowStats(w, id).dmg;
}

/**
 * 每拍一次（step 里法器出手前）：冷却走一拍，持续中的技能走一拍，按了键就放。
 * 能不能放按这一拍开始时的状态算（录像只记 step 前 skillReady 为真的按键，两边要一致）。
 */
export function skillStep(w: World, g: Grid, press: boolean, ops: SkillOps): void {
  const k = w.skill;
  const ready = press && skillReady(w);
  if (k.cd > 0) k.cd--;
  if (k.active > 0) tickSkill(w, g, ops);
  if (ready) useSkill(w, g, ops);
}

/** 放技能：定冷却，做瞬间的那部分效果，发 skillUse */
export function useSkill(w: World, g: Grid, ops: SkillOps): void {
  const id = w.setup.character ?? 'xiaodao';
  const def = SKILLS[id];
  const k = w.skill;
  // 放的这一拍已经过去了，所以再减一：冷却 N 拍 = 隔 N 拍能再放
  k.cd = skillCooldown(w) - 1;
  k.active = def.dur;
  k.uses++;
  switch (id) {
    case 'xiaodao':
      sweep(w, g, ops);
      break;
    case 'fushi':
      volley(w, g, ops);
      break;
    case 'jianxia':
      dash(w, g, ops);
      break;
    case 'pang':
      w.ev.push(Ev.SkillUse, w.x, w.y, def.code, def.dur, SKILL_FX.iron.r);
      break;
    case 'gengfu':
      w.ev.push(Ev.SkillUse, w.x, w.y, def.code, def.dur, SKILL_FX.clapper.r);
      clap(w, g, ops);
      break;
    case 'caiyao': {
      const burst = w.stats.hpMax * SKILL_FX.spring.burst;
      // 满血时回不进去的血变成药香圈的伤害——回不进去的占立刻回的那一下的几成，药香每一下就多几成（store 记千分比，满血 = 翻倍）
      k.store = Math.round((1000 * Math.max(0, burst - (w.stats.hpMax - w.hp))) / burst);
      w.ev.push(Ev.SkillUse, w.x, w.y, def.code, def.dur, SKILL_FX.spring.slowR);
      heal(w, burst);
      break;
    }
    case 'zhijiang':
      paperArmy(w, ops);
      break;
    case 'baidu':
      w.ev.push(Ev.SkillUse, w.x, w.y, def.code, def.dur, SKILL_FX.ferry.r * w.stats.areaMul);
      break;
    case 'huolang':
      w.ev.push(Ev.SkillUse, w.x, w.y, def.code, def.dur, pullAll(w));
      break;
    case 'yinyang':
      array(w, g);
      break;
  }
}

/** 持续中的那部分：每拍走一格，到点收尾发 skillEnd */
export function tickSkill(w: World, g: Grid, ops: SkillOps): void {
  const id = w.setup.character ?? 'xiaodao';
  const def = SKILLS[id];
  const k = w.skill;
  k.active--;
  const elapsed = def.dur - k.active;
  if (id === 'gengfu' && k.active > 0 && elapsed % SKILL_FX.clapper.every === 0) clap(w, g, ops);
  else if (id === 'caiyao' && elapsed % S === 0) {
    const n = w.stats.hpMax * SKILL_FX.spring.perSec;
    heal(w, n);
    w.ev.push(Ev.SkillBeat, w.x, w.y, def.code, SKILL_FX.spring.slowR, n);
    // 药香圈里的怪每秒受一次伤（回春从「只回血」变成也能清身边）
    hitAround(w, g, ops, SKILL_FX.spring.slowR, ((SKILL_FX.hooks.herbDmg + SKILL_FX.hooks.herbPerLevel * w.level) * (1000 + k.store)) / 1000, 0);
  }
  // 摆渡人的水域每秒打一下（横江一渡从只减速变成也能清身边）
  else if (id === 'baidu' && elapsed % S === 0) {
    const r = SKILL_FX.ferry.r * w.stats.areaMul;
    hitAround(w, g, ops, r, SKILL_FX.ferry.dmg + SKILL_FX.ferry.perLevel * w.level, 0);
    w.ev.push(Ev.SkillBeat, w.x, w.y, def.code, 0, r);
  }
  if (k.active > 0) return;
  if (id === 'caiyao') k.store = 0;
  if (id === 'pang') {
    knockAround(w, g, w.x, w.y, SKILL_FX.iron.r, SKILL_FX.iron.knock);
    // 铁布衫挡下的伤害 × storeMul 震出去（先挨打、再反打）
    if (k.store > 0) {
      hitAround(w, g, ops, SKILL_FX.iron.r * w.stats.areaMul, k.store * SKILL_FX.hooks.storeMul, SKILL_FX.iron.knock);
      k.store = 0;
    }
  }
  w.ev.push(Ev.SkillEnd, id === 'yinyang' ? w.skill.zx : w.x, id === 'yinyang' ? w.skill.zy : w.y, def.code, id === 'pang' ? SKILL_FX.iron.r : id === 'yinyang' ? SKILL_FX.array.r * w.stats.areaMul : 0);
}

/**
 * 阴阳先生·阴阳互换：血量越过一半那一拍（阳 → 阴、阴 → 阳都算），脚下定阵那么大的一圈里的怪定住 yinyangFlipBind 拍（首领除外），
 * 两个方向共用 yinyangFlipCd 的冷却。发 skillBeat（画面复用定阵的特效，头像上的阴阳字闪一下）。每拍由 step 调用
 */
export function yinyangFlip(w: World, g: Grid): void {
  const side = yinyangSide(w) === 'yang' ? 1 : -1;
  const f = w.flip;
  const was = f.side;
  f.side = side;
  if (was === 0 || was === side || w.tick < f.next) return;
  f.next = w.tick + CHAR_FX.yinyangFlipCd;
  const r = SKILL_FX.array.r * w.stats.areaMul;
  w.ev.push(Ev.SkillBeat, w.x, w.y, SKILLS.yinyang.code, CHAR_FX.yinyangFlipBind, r);
  const n = g.query(w, w.x, w.y, r);
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  for (let q = 0; q < n; q++) {
    const i = scratch[q]!;
    if (ENEMIES[w.eKind[i]!]!.boss) continue;
    w.eBind[i] = Math.max(w.eBind[i]!, w.tick + CHAR_FX.yinyangFlipBind);
  }
}

/** 打 r 以内所有怪一下（从主角往外推 knock） */
function hitAround(w: World, g: Grid, ops: SkillOps, r: number, dmg: number, knock: number): void {
  const n = g.query(w, w.x, w.y, r);
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  for (let q = 0; q < n; q++) {
    const i = scratch[q]!;
    ops.hit(w, i, dmg, w.eX[i]! - w.x, w.eY[i]! - w.y, knock);
  }
}

function heal(w: World, n: number): void {
  w.hp = Math.min(w.stats.hpMax, w.hp + n);
}

/** 把 (x, y) 半径 r 里的怪往外推，Boss 和稳的怪退得少（steady 在 step 的 hit 之外，这里按距离推，大怪不特别照顾） */
function knockAround(w: World, g: Grid, x: number, y: number, r: number, knock: number): void {
  const n = g.query(w, x, y, r);
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  for (let q = 0; q < n; q++) {
    const i = scratch[q]!;
    const dx = w.eX[i]! - x;
    const dy = w.eY[i]! - y;
    const d = fsqrt(dx * dx + dy * dy);
    if (d <= 0) continue;
    w.eKX[i]! += (dx / d) * (knock / 3);
    w.eKY[i]! += (dy / d) * (knock / 3);
  }
}

// ───────────────────────── 小道士：剑气纵横 ─────────────────────────

function sweep(w: World, g: Grid, ops: SkillOps): void {
  slashAt(w, g, ops, w.face);
  // 剑修成长：手上剑类法器够数，身后同样斩一刀
  if (typeCount(w, '剑') >= SKILL_FX.hooks.backSlashAt) slashAt(w, g, ops, w.face + 128);
}

/** 朝 face 方向斩一道扇形（方向表 256 个方向，+128 = 正后方） */
function slashAt(w: World, g: Grid, ops: SkillOps, face: number): void {
  const f = SKILL_FX.sweep;
  const r = f.r * w.stats.areaMul;
  const dir = face & 255;
  const fx = dcos(dir);
  const fy = dsin(dir);
  const dmg = baseDmg(w, 'sword') * f.mul;
  w.ev.push(Ev.SkillUse, w.x, w.y, SKILLS.xiaodao.code, dir, r);
  const n = g.query(w, w.x, w.y, r);
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  for (let q = 0; q < n; q++) {
    const i = scratch[q]!;
    const dx = w.eX[i]! - w.x;
    const dy = w.eY[i]! - w.y;
    const d = fsqrt(dx * dx + dy * dy);
    // 在面前的扇形里（正好叠在主角身上的也算）
    if (d > 0 && dx * fx + dy * fy < f.cosHalf * d) continue;
    ops.hit(w, i, dmg, dx, dy, f.knock);
  }
}

// ───────────────────────── 符师：万符齐发 ─────────────────────────

function volley(w: World, g: Grid, ops: SkillOps): void {
  const f = SKILL_FX.volley;
  const h = SKILL_FX.hooks;
  const dmg = baseDmg(w, 'talisman');
  // 手上每多一件符类法器多飞 fuPer 张（封顶 fuMax）
  const count = Math.min(h.fuMax, f.n + h.fuPer * Math.max(0, typeCount(w, '符') - 1));
  w.ev.push(Ev.SkillUse, w.x, w.y, SKILLS.fushi.code, w.face, count);
  const n = g.query(w, w.x, w.y, f.find);
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  let taken = 0;
  for (let j = 0; j < count; j++) {
    // 每张挑一只还没被挑过的最近的怪；怪不够的朝扇面里飞
    let best = -1;
    let bd = Infinity;
    for (let q = taken; q < n; q++) {
      const i = scratch[q]!;
      const dx = w.eX[i]! - w.x;
      const dy = w.eY[i]! - w.y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    let target = -1;
    if (best >= 0) {
      target = scratch[best]!;
      scratch[best] = scratch[taken]!;
      scratch[taken++] = target;
    }
    // 出手时往两边扇开，再各自拐向自己的目标
    const a = w.face + (j - (count - 1) / 2) * f.spread;
    ops.shot(w, Shot.SkillFu, w.x, w.y - 24, dcos(a) * f.speed, dsin(a) * f.speed, f.life, dmg, f.r, 0, -1, target);
  }
}

/** 一张万符的一拍：追自己的目标（没了就追最近的），碰到怪就爆开 */
export function moveSkillFu(w: World, g: Grid, i: number, ops: SkillOps): void {
  const f = SKILL_FX.volley;
  const t0 = w.sIdx[i]!;
  let t = t0 >= 0 && w.eAlive[t0] ? t0 : ops.nearest(w, g, w.sX[i]!, w.sY[i]!, 300, -1);
  if (t < 0) t = -1;
  if (t >= 0) {
    const dx = w.eX[t]! - w.sX[i]!;
    const dy = w.eY[t]! - 20 - w.sY[i]!;
    const d = fsqrt(dx * dx + dy * dy) || 1;
    w.sVX[i] = w.sVX[i]! + ((dx / d) * f.speed - w.sVX[i]!) * f.turn;
    w.sVY[i] = w.sVY[i]! + ((dy / d) * f.speed - w.sVY[i]!) * f.turn;
  }
  w.sX[i]! += w.sVX[i]!;
  w.sY[i]! += w.sVY[i]!;
  const hit = ops.nearest(w, g, w.sX[i]!, w.sY[i]! + 20, 12, -1);
  if (hit >= 0) {
    const bx = w.sX[i]!;
    const by = w.sY[i]! + 20;
    w.ev.push(Ev.Burst, bx, by, 0, f.r);
    const n = g.query(w, bx, by, f.r);
    for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
    for (let q = 0; q < n; q++) ops.hit(w, scratch[q]!, w.sDmg[i]!, w.sVX[i]!, w.sVY[i]!, 6);
    w.sAlive[i] = 0;
    w.sCount--;
    return;
  }
  if (--w.sLife[i]! <= 0) {
    w.sAlive[i] = 0;
    w.sCount--;
  }
}

// ───────────────────────── 剑侠：御剑突进 ─────────────────────────

function dash(w: World, g: Grid, ops: SkillOps): void {
  const f = SKILL_FX.dash;
  const dmg = baseDmg(w, 'flysword') * f.mul;
  const ux = dcos(w.face);
  const uy = dsin(w.face);
  const step = f.dist / f.steps;
  const x0 = w.x;
  const y0 = w.y;
  const hitList: number[] = [];
  for (let s = 0; s < f.steps; s++) {
    const nx = w.x + ux * step;
    const ny = w.y + uy * step;
    w.x = nx < 20 ? 20 : Math.min(nx, w.arenaW - 20);
    w.y = ny < 20 ? 20 : Math.min(ny, w.arenaH - 20);
    if (w.blocks.length) ops.push(w, w, PLAYER.r);
    const n = g.query(w, w.x, w.y, f.r);
    for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
    for (let q = 0; q < n; q++) {
      const i = scratch[q]!;
      if (hitList.includes(i)) continue;
      hitList.push(i);
      ops.hit(w, i, dmg, ux, uy, 20);
    }
  }
  // 冲刺打倒了精英，冷却当场转好（点杀精英、接着冲）
  if (hitList.some((i) => !w.eAlive[i] && ENEMIES[w.eKind[i]!]!.elite)) w.skill.cd = 0;
  // 冲的这段不挨打；冰上冲完不带着滑
  w.invuln = Math.max(w.invuln, f.invuln);
  w.pvx = 0;
  w.pvy = 0;
  w.ev.push(Ev.SkillUse, x0, y0, SKILLS.jianxia.code, w.face, f.dist);
  w.ev.push(Ev.SkillBeat, x0, y0, SKILLS.jianxia.code, w.x, w.y);
}

// ───────────────────────── 更夫：梆子声声 ─────────────────────────

function clap(w: World, g: Grid, ops: SkillOps): void {
  const f = SKILL_FX.clapper;
  // 梆子护身：每一梆补一层护身（没带金钟罩也有一层），挨一下挡掉
  if (w.shield < Math.max(1, w.shieldMax)) w.shield++;
  const r = f.r * w.stats.areaMul;
  const dmg = f.dmg + f.perLevel * w.level;
  w.ev.push(Ev.SkillBeat, w.x, w.y, SKILLS.gengfu.code, r, 0);
  const n = g.query(w, w.x, w.y, r);
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  for (let q = 0; q < n; q++) {
    const i = scratch[q]!;
    ops.hit(w, i, dmg, w.eX[i]! - w.x, w.eY[i]! - w.y, f.knock);
  }
}

// ───────────────────────── 纸匠：剪纸成军 ─────────────────────────

/**
 * 在主角身边围一圈剪出纸兵，不看上限；寿命吃巧手。手上有纸兵法器就挂在它的槽位上（吃它的等级、伤害、合成）；
 * 没有（第二起手、纸兵还没抽到）挂在槽位 -1 上，数值按 borrowStats（step 的 movePaper 认 -1）
 */
function paperArmy(w: World, ops: SkillOps): void {
  const f = SKILL_FX.paper;
  const k = w.weapons.findIndex((o) => o.id === 'zhibing');
  w.ev.push(Ev.SkillUse, w.x, w.y, SKILLS.zhijiang.code, f.n, f.ring);
  const life = Math.round(f.life * w.stats.durMul * paperLifeMul(w) * (1 + 0.2 * (w.passives.jiandao ?? 0)));
  const dmg = baseDmg(w, 'zhibing');
  for (let j = 0; j < f.n; j++) {
    const a = ((j * 256) / f.n) | 0;
    // 站位编号从 40 起，和平时补的纸兵（0–5）错开，各自围着主角站不同的位置
    ops.shot(w, Shot.Paper, w.x + dcos(a) * f.ring, w.y + dsin(a) * f.ring * 0.75, 0, 0, life, dmg, 20, 0, k, 40 + j);
  }
}

// ───────────────────────── 货郎：招财进宝 ─────────────────────────

/** 全屏的魂珠和铜钱一起吸过来，返回吸了几个（画面用） */
function pullAll(w: World): number {
  let n = 0;
  for (let s = 0; s < MAX_DROPS; s++) {
    if (!w.dAlive[s] || (w.dKind[s] !== Drop.Soul && w.dKind[s] !== Drop.Coin)) continue;
    if (w.dPull[s] === 0) w.dPull[s] = PICKUP.pull;
    n++;
  }
  return n;
}

// ───────────────────────── 阴阳先生：定阵 ─────────────────────────

/** 阵钉在脚下；布阵那一刻阵里的怪先定住（Boss 定不住，和捆仙绳一样） */
function array(w: World, g: Grid): void {
  const f = SKILL_FX.array;
  const r = f.r * w.stats.areaMul;
  w.skill.zx = w.x;
  w.skill.zy = w.y;
  w.ev.push(Ev.SkillUse, w.x, w.y, SKILLS.yinyang.code, SKILLS.yinyang.dur, r);
  const n = g.query(w, w.x, w.y, r);
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  for (let q = 0; q < n; q++) {
    const i = scratch[q]!;
    if (ENEMIES[w.eKind[i]!]!.boss) continue;
    w.eBind[i] = Math.max(w.eBind[i]!, w.tick + f.bind);
  }
}
