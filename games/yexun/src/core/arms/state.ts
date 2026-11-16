/**
 * 2.0 第一批法器（阵旗、勾魂锁、竹篙、长明灯）的运行状态：阵、灯、水痕，还有按怪记的定身、易伤。
 * 挂在 World.arms 上，进指纹（fingerprint.ts）；没带这些法器的局里全是空的。逻辑在 ./index.ts。
 */

/** 阵旗的一座阵：kind 0 阵旗 / 1 四象大阵 / 2 阵法四件套的小阵 */
export interface Zone {
  x: number;
  y: number;
  half: number;
  life: number;
  kind: number;
  dmg: number;
  rehit: number;
  slot: number;
  /** 错开几拍打（同一拍布的几座阵不挤在一拍） */
  off: number;
}

/** 长明灯的一盏灯：kind 0 灯 / 1 万家灯火的大灯 */
export interface Lamp {
  x: number;
  y: number;
  r: number;
  life: number;
  kind: number;
  dmg: number;
  rehit: number;
  slot: number;
}

/** 水痕：lit 为真是渡魂灯（亮着灯，会烧） */
export interface Puddle {
  x: number;
  y: number;
  r: number;
  life: number;
  lit: boolean;
}

/** 铜钱镖：phase 0 去 / 1 回；trip 第几趟（1、2）；tgt 现在追的怪（-1 没有）；last 刚打过的怪（不连打同一只） */
export interface Dart {
  x: number;
  y: number;
  tgt: number;
  last: number;
  phase: number;
  trip: number;
  hops: number;
  hopsMax: number;
  dmg: number;
  speed: number;
  evo: number;
  slot: number;
}

/** 招魂幡 */
export interface Banner {
  x: number;
  y: number;
  r: number;
  life: number;
  evo: number;
  slot: number;
}

/** 冤魂：kind 0 冤魂 / 1 鬼差（大号，撞不死、扫一排）；ret 万魂幡的冤魂撞完飞回幡旁，再来一次 */
export interface Ghost {
  x: number;
  y: number;
  kind: number;
  life: number;
  dmg: number;
  speed: number;
  evo: number;
  ret: number;
  hx: number;
  hy: number;
  slot: number;
}

/** 判官笔：对一只怪的三下，next 是下一下的拍 */
export interface BrushJob {
  tgt: number;
  left: number;
  next: number;
  dmg: number;
  evo: number;
  slot: number;
}

/** 一串爆竹：从 (x, y) 沿 (ux, uy) 每隔 gap 拍炸一响；round 2 是十响连环的第二轮 */
export interface Cracker {
  x: number;
  y: number;
  ux: number;
  uy: number;
  step: number;
  total: number;
  left: number;
  next: number;
  dmg: number;
  r: number;
  knock: number;
  evo: number;
  round: number;
  slot: number;
}

export class ArmsState {
  readonly zones: Zone[] = [];
  readonly lamps: Lamp[] = [];
  readonly puddles: Puddle[] = [];
  /** 每只怪下次能被阵旗定住的拍、被勾魂锁拉到后易伤到哪一拍、易伤倍数 */
  readonly freezeAt: Int32Array;
  readonly vulnUntil: Int32Array;
  readonly vulnMul: Float64Array;
  readonly darts: Dart[] = [];
  readonly banners: Banner[] = [];
  readonly ghosts: Ghost[] = [];
  readonly brushJobs: BrushJob[] = [];
  readonly crackers: Cracker[] = [];
  /** 算盘：每只怪记了几层账；买路符钱：贴了符的怪 */
  readonly beads: Uint8Array;
  readonly marked: Uint8Array;
  /** 锁魂幡（规则 62）：被勾魂锁拉过的怪，死了必定变冤魂 */
  readonly souled: Uint8Array;
  /** 幽冥、聚财套件档（0 / 2 / 3 / 4） */
  ghostTier = 0;
  wealthTier = 0;
  /** 幽冥 4 件：下一位鬼差在打倒第几只时召出；聚财 4 件：下一场铜钱雨的拍；买路符钱：下次贴符的拍 */
  chaiNext = 0;
  rainAt = 0;
  maibuAt = 0;
  /** 阵法套件档：0 / 2 / 3 / 4（凑到阵法单子里几件） */
  tier = 0;
  /** 4 件套下次自动布阵的拍 */
  autoAt = 0;
  /** 长明灯回血的零头 */
  healAcc = 0;

  constructor(maxEnemies: number) {
    this.freezeAt = new Int32Array(maxEnemies);
    this.vulnUntil = new Int32Array(maxEnemies);
    this.vulnMul = new Float64Array(maxEnemies);
    this.beads = new Uint8Array(maxEnemies);
    this.marked = new Uint8Array(maxEnemies);
    this.souled = new Uint8Array(maxEnemies);
  }

  /** 这一局有没有用上（没用上就不进指纹，别的局的金标准指纹不受影响） */
  live(): boolean {
    return this.zones.length > 0 || this.lamps.length > 0 || this.puddles.length > 0 || this.tier > 0 || this.autoAt > 0 || this.healAcc > 0 || this.darts.length > 0 || this.banners.length > 0 || this.ghosts.length > 0 || this.brushJobs.length > 0 || this.crackers.length > 0 || this.ghostTier > 0 || this.wealthTier > 0 || this.rainAt > 0 || this.maibuAt > 0;
  }

  /** 进指纹的数 */
  nums(): number[] {
    const out: number[] = [this.tier, this.autoAt, this.healAcc];
    for (const z of this.zones) out.push(z.x, z.y, z.half, z.life, z.kind, z.dmg);
    for (const l of this.lamps) out.push(l.x, l.y, l.r, l.life, l.kind, l.dmg);
    for (const p of this.puddles) out.push(p.x, p.y, p.r, p.life, p.lit ? 1 : 0);
    // 第二批：没用上的局这一段是空的（指纹只多一小串）
    out.push(this.ghostTier, this.wealthTier, this.chaiNext, this.rainAt, this.maibuAt);
    for (const d of this.darts) out.push(d.x, d.y, d.tgt, d.phase, d.trip, d.hops);
    for (const b of this.banners) out.push(b.x, b.y, b.life);
    for (const g of this.ghosts) out.push(g.x, g.y, g.kind, g.life, g.ret);
    for (const j of this.brushJobs) out.push(j.tgt, j.left, j.next);
    for (const c of this.crackers) out.push(c.x, c.y, c.left, c.next, c.round);
    return out;
  }

  /** 按怪记的状态（算盘的层数、贴符、锁魂）：新怪出生时清零 */
  resetEnemy(i: number): void {
    this.beads[i] = 0;
    this.marked[i] = 0;
    this.souled[i] = 0;
  }
}
