/**
 * 受击轻重和伤害类型（纯逻辑，tests/dmgkind.test.ts 锁住）。
 *
 * 规则事件里的 hit 只带伤害数，不带"被什么打的"，核心又不许加字段，所以画面自己从已有的事件推：
 * 开火（shoot）时记下弹种和落点、落点那一拍（t1）；爆炸（explode）记下中心和半径；
 * 命中（hit）时按"同一拍有没有爆炸罩住它""有没有刚好落在它身上的弹"归类。
 * 火烧是每半秒一跳的持续伤害，没有对应的开火事件，所以单位身上记一笔上次的类型，几秒内的无主伤害沿用。
 * 推不出来就返回 null，调用方退回原来的按伤害数选倒下动作（rig.ts 的 deathStyle）。
 */
type DmgKind = 'shot' | 'shell' | 'fire' | 'blast';

/** 弹种（战斗弹道 kind 或守岛塔的弹道 fx）归类为伤害类型 */
export function projDmgKind(fx: string): DmgKind | null {
  switch (fx) {
    case 'bullet':
    case 'harpoon':
    case 'snipe':
      return 'shot';
    case 'ball':
    case 'shell':
      return 'shell';
    case 'flame':
      return 'fire';
    case 'barrage':
    case 'dynamite':
    case 'keg':
    case 'grenade':
    case 'rocket':
    case 'shock':
      return 'blast';
    default:
      return null;
  }
}

/** 单次伤害占最大血量到这个比例、或绝对值到 HEAVY_ABS，算重击 */
const HEAVY_RATIO = 0.25;
export const HEAVY_ABS = 90;
export function isHeavyDmg(dmg: number, maxHp: number): boolean {
  return dmg >= HEAVY_ABS || (maxHp > 0 && dmg >= maxHp * HEAVY_RATIO);
}

const KINDS: Array<DmgKind | null> = [null, 'shot', 'shell', 'fire', 'blast'];
const kidx = (k: DmgKind | null): number => (k ? KINDS.indexOf(k) : 0);

/** 开火记录环的容量：一拍里同时落地的弹不多，32 条够用且不增长 */
const RING = 32;
/** 直射弹落点到目标位置的容许距离（世界单位，UNIT = 100）：目标在飞行中还会走动 */
const NEAR = 160;
/** 命中拍和落点拍相差多少拍内算同一发 */
const TICK_SLACK = 3;
/** 无主伤害（火烧）沿用上次类型的时长（拍，20 拍 / 秒） */
const STICKY_TICKS = 60;

export class DmgTrack {
  private readonly sx = new Float32Array(RING);
  private readonly sy = new Float32Array(RING);
  private readonly st = new Int32Array(RING);
  private readonly sk = new Uint8Array(RING);
  private n = 0;
  private ex = 0;
  private ey = 0;
  private er = 0;
  private et = -1e9;
  /** 目标 id → 上次类型和拍数（死亡时 take 掉，不会一直长） */
  private readonly last = new Map<number, { k: DmgKind; t: number }>();

  noteShoot(fx: string, x1: number, y1: number, t1: number): void {
    const k = projDmgKind(fx);
    if (!k) return;
    const i = this.n++ % RING;
    this.sx[i] = x1;
    this.sy[i] = y1;
    this.st[i] = t1;
    this.sk[i] = kidx(k);
  }

  noteExplode(x: number, y: number, r: number, tick: number): void {
    this.ex = x;
    this.ey = y;
    this.er = r;
    this.et = tick;
  }

  /** 离 (x, y) 最近、落点拍对得上的那一发的类型 */
  private shotNear(x: number, y: number, tick: number, within: number): DmgKind | null {
    let best = -1;
    let bd = within * within;
    const cnt = Math.min(this.n, RING);
    for (let i = 0; i < cnt; i++) {
      if (Math.abs(this.st[i]! - tick) > TICK_SLACK) continue;
      const dx = this.sx[i]! - x;
      const dy = this.sy[i]! - y;
      const d = dx * dx + dy * dy;
      if (d <= bd) {
        bd = d;
        best = i;
      }
    }
    return best < 0 ? null : KINDS[this.sk[best]!]!;
  }

  /** 一次命中的类型；id 是被打的单位，用来给火烧这类没有开火事件的伤害沿用上次的类型 */
  classify(id: number, x: number, y: number, tick: number): DmgKind | null {
    let k: DmgKind | null = null;
    if (tick - this.et <= 1) {
      const dx = x - this.ex;
      const dy = y - this.ey;
      if (dx * dx + dy * dy <= (this.er + 20) * (this.er + 20)) {
        // 罩住它的爆炸：看是哪发弹炸的（落在爆心附近），查不到就当爆炸
        k = this.shotNear(this.ex, this.ey, tick, this.er + NEAR) ?? 'blast';
      }
    }
    k ??= this.shotNear(x, y, tick, NEAR);
    if (k) this.last.set(id, { k, t: tick });
    else {
      const l = this.last.get(id);
      if (l && tick - l.t <= STICKY_TICKS) k = l.k;
    }
    return k;
  }

  /** 倒下那一刻取走这个单位的最后类型 */
  take(id: number): DmgKind | null {
    const l = this.last.get(id);
    this.last.delete(id);
    return l ? l.k : null;
  }
}

const tracks = new WeakMap<object, DmgTrack>();
/** 每个场景一份记录（场景重开是新对象，旧的随它回收），不用往场景类里加字段 */
export function trackOf(scene: object): DmgTrack {
  let t = tracks.get(scene);
  if (!t) {
    t = new DmgTrack();
    tracks.set(scene, t);
  }
  return t;
}
