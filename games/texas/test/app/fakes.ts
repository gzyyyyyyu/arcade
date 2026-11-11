/** src/app/ 测试共用的假东西：内存存档、假钱包（可编排回话）、给 Solo 用的依赖。不依赖别的测试目录里的辅助文件。 */
import { vi } from 'vitest';
import type { WalletApi, WalletReply, WalletView } from '../../src/net/wallet.ts';
import type { SoloDeps, Store } from '../../src/solo.ts';

export class MemStore implements Store {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

export const walletView = (o: Partial<WalletView> = {}): WalletView => ({ balance: 10_000, stakes: [], canRelief: false, writesLeft: 200, caps: {}, fresh: false, ...o });

export const okReply = (o: Partial<WalletView> = {}, extra: { credited?: number; capped?: number } = {}): WalletReply => ({ ok: true, wallet: walletView(o), ...extra });
export const errReply = (error: string, retryAfter?: number): WalletReply => ({ ok: false, error, ...(retryAfter ? { retryAfter } : {}) });

/**
 * 假钱包：每次调用先记下（op 也记，用来核对"重发用的是同一个操作 id"），再按 script 依次回话；脚本用完了回成功。
 * 结回成功时 credited 默认等于金额。
 */
export class FakeWallet implements WalletApi {
  buyins: { op: string; session: string; amount: number }[] = [];
  cashouts: { op: string; session: string; amount: number; keepalive: boolean }[] = [];
  buyScript: WalletReply[] = [];
  cashScript: WalletReply[] = [];
  buyin = vi.fn(async (op: string, session: string, _stakes: string, amount: number): Promise<WalletReply> => {
    this.buyins.push({ op, session, amount });
    return this.buyScript.shift() ?? okReply();
  });
  cashout = vi.fn(async (op: string, session: string, amount: number, keepalive = false): Promise<WalletReply> => {
    this.cashouts.push({ op, session, amount, keepalive });
    return this.cashScript.shift() ?? okReply({}, { credited: amount });
  });
}

export function soloDeps(wallet: WalletApi, store: Store): SoloDeps {
  let n = 0;
  return {
    wallet,
    store,
    entropy: () => [1, 2, 3, 4, 5, 6, 7, 8],
    newId: () => `id${++n}`,
    think: () => 0,
    wait: async () => {},
    onStep: async () => {},
  };
}

/** 假的"window"：只给被测代码用到的几个方法；定时器转给当前的全局（vi.useFakeTimers 换掉之后也跟着） */
export const fakeWindow = () => ({
  setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (h?: number) => globalThis.clearTimeout(h),
  addEventListener: vi.fn(),
});

/** 假的页面元素：记下 classList 的开关、事件监听 */
export function fakeEl() {
  const cls = new Set<string>();
  const handlers: Record<string, (() => void)[]> = {};
  return {
    cls,
    classList: {
      contains: (c: string) => cls.has(c),
      add: (c: string) => void cls.add(c),
      remove: (c: string) => void cls.delete(c),
    },
    addEventListener: (t: string, h: () => void) => void (handlers[t] ??= []).push(h),
    setAttribute: vi.fn(),
    querySelector: () => fakeEl(),
    click: () => handlers.click?.forEach((h) => h()),
    dataset: {} as Record<string, string>,
    href: '',
  };
}
