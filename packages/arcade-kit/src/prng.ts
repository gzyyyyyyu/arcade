/**
 * 单机规则核心用的确定性伪随机：sfc32 加两种种子哈希，逐位照搬各游戏原来的实现（开盘、牌馆、海岛、夜巡），
 * 收进 kit 是为了不再各抄一份；存档续玩、回放、每日题、服务端复算都靠"同一个种子出同一串数"，所以这里只能搬、不能改算法，
 * test/prng.test.ts 用从各游戏原代码算出的黄金向量钉住。
 *
 * 不保密：种子只有 32 位，看到几张牌就能反推整串。**不得用于联机发牌**，联机一律用 `arcade-kit/rng` 的 ChaCha20 `stream`。
 *
 * 只用 32 位整数运算（Math.imul、移位）和加减乘除，浏览器各内核与 Node 下结果一致；没有 DOM、没有运行时依赖。
 */

/**
 * 把若干分量混合成 32 位无符号整数（FNV-1a + murmur3 fmix32；牌馆、开盘的写法）。
 * 数字分量写成 `#n|`、字符串写成 `s|`，所以 `hashSeed(1)` 和 `hashSeed('1')` 不同。
 */
export function hashSeed(...parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = typeof part === 'number' ? `#${part}|` : `${part}|`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return fmix32(h);
}

/**
 * 字符串加种子 → 32 位无符号整数（FNV-1a，种子异或进初值，再 fmix32；海岛、夜巡的写法）。
 * 和 `hashSeed` 是两套数，同样的输入给出的值不同，不能互相替代。
 */
export function hash32(text: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return fmix32(h);
}

function fmix32(x: number): number {
  let h = x;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * sfc32 生成器。四个游戏的步进完全一样，只是 a、b、c、d 的初值不同（见 `createRng`、`streamRng`）。
 * 初值原样存，不做换算：`snapshot()` 要和原来的实现逐位相等（夜巡把它写进回放指纹）。
 */
export class Sfc32 {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(a: number, b: number, c: number, d: number, warm = 12) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    for (let i = 0; i < warm; i++) this.u32();
  }

  /** 下一个 32 位无符号整数 */
  u32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** [0, 1) 均匀分布 */
  next(): number {
    return this.u32() / 4294967296;
  }

  /** [0, n) 均匀整数，取法是 floor(next × n)（海岛用的是 `intModulo`，结果不同） */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: 空列表');
    return items[this.int(items.length)] as T;
  }

  /** 原地 Fisher–Yates 洗牌，返回同一个数组（和 `arcade-kit/rng` 的 `shuffle` 不同：那个不改原数组、用拒绝采样） */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = items[i] as T;
      items[i] = items[j] as T;
      items[j] = t;
    }
    return items;
  }

  /** 当前状态（存档、指纹用） */
  snapshot(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }
}

/** 牌馆、开盘的初始化：a、b、c 是固定常数，d 是种子，空转 12 次 */
export function createRng(seed: number): Sfc32 {
  return new Sfc32(0x9e3779b9 | 0, 0x243f6a88 | 0, 0xb7e15162 | 0, seed | 0);
}

/** 按用途分流：`rngFor(seed, 'deal', 3)` = `createRng(hashSeed(seed, 'deal', 3))`，一条流多用一次不扰动别的流 */
export function rngFor(...parts: readonly (string | number)[]): Sfc32 {
  return createRng(hashSeed(...parts));
}

/** 海岛、夜巡的初始化：a、b、c 由流名和种子经 `hash32` 得到，d 是 1，空转 12 次 */
export function streamRng(seed: number, stream: string): Sfc32 {
  return new Sfc32(hash32(stream, seed), hash32(`${stream}#b`, seed), hash32(`${stream}#c`, seed), 1);
}

/** [0, n) 整数，取法是 u32 % n（海岛的写法；n 远小于 2³² 时偏差可忽略）。和 `Sfc32.int` 结果不同，单独给出 */
export function intModulo(rng: Sfc32, n: number): number {
  return rng.u32() % n;
}
