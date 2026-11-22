/**
 * 守岛和护航结算的「一句话原因 + 关键时刻」（纯函数，tests/tdreason.test.ts 锁住）。
 * 局内由 tdevents.ts 把宝藏丢失记进 ReasonLog，结算时 tdReason 读它和规则核心给的结果，不重算规则。
 * 文字大白话：line 目标 ≤ 26 字，key ≤ 30 字（不截断），数字用阿拉伯数字。
 */
import { BUILDINGS, TD_TROPHIES, TD2_ENEMIES, TD_ENEMY_ARMOR, TD_TOWER_DAMAGE, counterPct, isTdTowerKind, type BuildingKind, type TdArmor, type TdEnemyKind } from '../core/index.ts';

export const LINE_MAX = 26;
export const KEY_MAX = 30;

/** 缓存下来的敌人信息（escape 事件时敌人可能已经移出 s.enemies） */
interface EnemyMeta {
  kind: TdEnemyKind;
  /** 第几波（从 1 数起） */
  wave: number;
  /** 回船的登陆路（北路 / 西路…，认不出就是空串） */
  lane: string;
}

/** 一次宝藏丢失：一个敌人把 n 枚带回了船 */
export interface LossRec extends EnemyMeta {
  n: number;
  tick: number;
}

/** 护航：一次咬船（敌人 id 用来数这一波有几个敌人咬过船） */
export interface BiteRec extends EnemyMeta {
  id: number;
  dmg: number;
}

export interface ReasonLog {
  losses: LossRec[];
  /** 护航里每一口咬船（守岛不写） */
  bites: BiteRec[];
  meta: Map<number, EnemyMeta>;
  /** 英雄倒下的次数 */
  heroDown: number;
}

export function newReasonLog(): ReasonLog {
  return { losses: [], bites: [], meta: new Map(), heroDown: 0 };
}

export interface ReasonRes {
  stars: number;
  lost: number;
  goldEarned: number;
}

interface ReasonExtra {
  /** 局末没花的金币 */
  gold: number;
  /** 场上的塔（种类 + 分叉），判断护甲有没有克它的 */
  towers: ReadonlyArray<{ kind: string; branch: readonly string[] }>;
  /** 已开打到第几波（顶栏「已来 N 波」） */
  wave: number;
  /** 这局能造的塔（没限制为 undefined）：克它的塔这局根本造不了时，不拿「没有克它的塔」当原因 */
  unlocked?: readonly string[];
}

interface Reason {
  line: string;
  key: string | null;
  /** 局末没花的金币提示，单独一行（并进原因行时 360 宽会从数字中间折行） */
  idle?: string | null;
}

const ARMOR_TEXT: Readonly<Record<TdArmor, string>> = { cloth: '布衣', heavy: '重甲', wood: '木船', air: '飞禽' };

/** 余金超过整局收入这个比例才提示 */
const IDLE_GOLD_PCT = 25;

function enemyName(kind: TdEnemyKind): string {
  return TD2_ENEMIES[kind]?.name ?? '敌人';
}

function groupBy<T>(xs: readonly T[], keyOf: (x: T) => string, weight: (x: T) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(keyOf(x), (m.get(keyOf(x)) ?? 0) + weight(x));
  return m;
}

/** 权重最大的键（平手取先出现的） */
function top(m: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [k, v] of m) if (!best || v > best[1]) best = [k, v];
  return best;
}

/** 丢得最多的一波里，丢得最多的那条路和那种敌人 */
function worstMoment(losses: readonly LossRec[]): string | null {
  if (losses.length === 0) return null;
  const wave = Number(top(groupBy(losses, (l) => String(l.wave), (l) => l.n))?.[0]);
  const inWave = losses.filter((l) => l.wave === wave);
  const total = inWave.reduce((a, l) => a + l.n, 0);
  const lane = top(groupBy(inWave, (l) => l.lane, (l) => l.n))?.[0] ?? '';
  const inLane = inWave.filter((l) => l.lane === lane);
  const kind = top(groupBy(inLane, (l) => l.kind, (l) => l.n))?.[0] as TdEnemyKind;
  const count = inLane.filter((l) => l.kind === kind).length;
  const who = `${lane ? `${lane}有 ` : ''}${count} 个${enemyName(kind)}`;
  const full = `第 ${wave} 波：${who}冲过去，丢了 ${total} 枚`;
  if (full.length <= KEY_MAX) return full;
  return `第 ${wave} 波：${who}漏过去，丢 ${total} 枚`;
}

/** 丢的敌人里占一半以上的护甲（没有这样的就 null） */
function mainArmor(losses: readonly LossRec[]): TdArmor | null {
  const t = top(groupBy(losses, (l) => TD_ENEMY_ARMOR[l.kind] ?? 'cloth', (l) => l.n));
  const all = losses.reduce((a, l) => a + l.n, 0);
  return t && t[1] * 2 >= all ? (t[0] as TdArmor) : null;
}

/** 这局能不能造出克这种护甲的塔（不看分叉，分叉要 3 阶才选得到）；没限制时当能 */
function canCounter(armor: TdArmor, unlocked: ReasonExtra['unlocked']): boolean {
  if (!unlocked) return true;
  return unlocked.some((k) => isTdTowerKind(k) && counterPct(TD_TOWER_DAMAGE[k], armor, []) > 100);
}

/** 场上有没有塔对这种护甲的倍率 > 100%（克它） */
function hasCounter(armor: TdArmor, towers: ReasonExtra['towers']): boolean {
  return towers.some((t) => isTdTowerKind(t.kind) && counterPct(TD_TOWER_DAMAGE[t.kind], armor, t.branch) > 100);
}

/** 局末余金提示；不到整局收入的 25% 返回 null */
export function idleGoldText(gold: number, earned: number): string | null {
  return earned > 0 && gold > 0 && gold * 100 >= earned * IDLE_GOLD_PCT ? `还有 ${gold.toLocaleString('en-US')} 金没花` : null;
}

export function tdReason(log: ReasonLog, res: ReasonRes, extra: ReasonExtra): Reason {
  const losses = log.losses;
  const lostN = losses.reduce((a, l) => a + l.n, 0);
  const idle = idleGoldText(extra.gold, res.goldEarned);
  const key = worstMoment(losses);

  // 一枚没丢：夸一句，最危险的一刻用英雄倒下代替（别的数据没有就没有）
  if (lostN === 0 && res.lost === 0) {
    const line = res.stars >= 3 ? '一枚没丢，守得很稳' : `打到第 ${extra.wave} 波，宝藏一枚没丢`;
    const danger = log.heroDown > 0 ? `英雄倒下过 ${log.heroDown} 次，还是守住了` : null;
    return { line, key: danger, idle };
  }

  let line: string;
  const armor = mainArmor(losses);
  const lanes = groupBy(losses, (l) => l.lane, (l) => l.n);
  const laneTop = top(lanes);
  const kindTop = top(groupBy(losses, (l) => l.kind, (l) => l.n));
  if (armor && extra.towers.length > 0 && !hasCounter(armor, extra.towers) && canCounter(armor, extra.unlocked)) {
    line = `漏的多是${ARMOR_TEXT[armor]}，没造克它的塔`;
  } else if (extra.towers.length === 0) {
    line = '一座塔都没造，宝藏被搬空了';
  } else if (laneTop && laneTop[0] !== '' && laneTop[1] * 100 >= lostN * 60 && lanes.size > 0) {
    line = laneTop[1] === lostN ? `${laneTop[0]}守不住，${lostN} 枚全从这漏` : `${laneTop[0]}守不住，${lostN} 枚里 ${laneTop[1]} 枚从这漏`;
  } else if (kindTop) {
    line = `${enemyName(kindTop[0] as TdEnemyKind)}漏得最多，共丢 ${lostN} 枚`;
  } else {
    line = `共丢了 ${res.lost} 枚`;
  }

  // 不截断（截掉会把数字截一半）：上限是文案设计的目标，单测按典型局面锁住，真超了结算框自己换行
  return { line, key, idle };
}

/** 失败时「打到第 X 波时失守」，和顶栏「已来 N 波」对得上 */
export function lostAtText(wave: number): string {
  return `打到第 ${wave} 波时失守`;
}

const CHAPTER_DONE = ['', '第一章通关', '第二章通关', '第三章通关', '远洋通关', '第五章通关'];

/** 这一局送的章节纪念装饰（settleTd 的 trophies，按章号排）：「第一章通关、第二章通关！得到装饰「小风车」「小灯塔」，在收藏里摆到岛上」 */
export function trophyText(ids: readonly string[]): string {
  const chs = ids.map((id) => Number(Object.keys(TD_TROPHIES).find((c) => TD_TROPHIES[Number(c)] === id)));
  const names = ids.map((id) => `「${BUILDINGS[id.slice('deco:'.length) as BuildingKind].name}」`).join('');
  return `${chs.map((c) => CHAPTER_DONE[c]).join('、')}！得到装饰${names}，在收藏里摆到岛上`;
}

/** 输了（0 星）时宝藏那一行：写丢了几枚，和「宝藏被抢光了」对得上 */
export function lostTreasureText(lost: number): string {
  return `丢了 ${lost} 枚宝藏`;
}

/**
 * 护航的关键时刻：船血掉得最多的那一波，那一波里咬得最狠的那种敌人有几个、一共咬掉百分之几的血。
 * 掉的不到满血 1% 就不写（没什么好说的）。hull 是满血。
 */
export function escortMoment(bites: readonly BiteRec[], hull: number): string | null {
  if (bites.length === 0 || hull <= 0) return null;
  const wave = Number(top(groupBy(bites, (b) => String(b.wave), (b) => b.dmg))?.[0]);
  const inWave = bites.filter((b) => b.wave === wave);
  // 咬沉那一口按整口记、不按剩的血截，修过船的一波也会咬掉超过一船的血：写出来封顶 100%
  const pct = Math.min(100, Math.floor((inWave.reduce((a, b) => a + b.dmg, 0) * 100) / hull));
  if (pct < 1) return null;
  const kind = top(groupBy(inWave, (b) => b.kind, (b) => b.dmg))?.[0] as TdEnemyKind;
  const count = new Set(inWave.filter((b) => b.kind === kind).map((b) => b.id)).size;
  return `第 ${wave} 波：${count} 个${enemyName(kind)}咬住船，掉了 ${pct}% 血`;
}

/** 护航：丢的是船血。到港夸一句，沉了说沉没，撤退照实说，误潮说没赶上；关键时刻是船血掉得最多的那一波 */
export function escortReason(r: { arrived: boolean; sunk: boolean; hullPct: number; stars: number; retreated?: boolean }, bites: readonly BiteRec[] = [], hull = 0): Reason {
  const key = r.arrived && r.hullPct >= 100 ? null : escortMoment(bites, hull);
  if (r.arrived) return { line: r.hullPct >= 100 ? '到港了，船一点没伤' : `到港了，船还剩 ${r.hullPct}% 血`, key };
  if (r.sunk) return { line: '船被海盗咬沉了', key };
  if (r.retreated) return { line: '中途撤退，商船没到港', key };
  return { line: '没赶在潮退前到港', key };
}
