/**
 * 确定性随机数：实现是 arcade-kit/prng 的 sfc32（逐位等于这里原来那份，kit 和 tests/core/rng.test.ts 的向量钉着），这里只包一层，
 * 让规则核心照旧从 core/rng 取、对外的名字不变。
 *
 * 按用途分流：发牌、首出、电脑决策各自一条流，改一处不扰动其他。种子只有 32 位、不保密，只给单机和电脑的种子派生用；
 * 联机发牌用 arcade-kit/rng 的 ChaCha20（tests/architecture.test.ts 守着别处不许直接引 prng）。
 */
import { createRng as kitCreateRng, hashSeed, type Sfc32 } from 'arcade-kit/prng';

export { hashSeed };

/** 规则核心用到的那几个方法（kit 的 Sfc32 还多 u32、snapshot，核心不用） */
export type Rng = Pick<Sfc32, 'next' | 'int' | 'pick' | 'shuffle'>;

export function createRng(seed: number): Rng {
  return kitCreateRng(seed);
}

/** 按用途分流的随机数，例如 rngFor(seed, 'deal', 3)。 */
export function rngFor(...parts: readonly (string | number)[]): Rng {
  return createRng(hashSeed(...parts));
}
