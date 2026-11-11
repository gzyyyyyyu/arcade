/**
 * 假钱包（实盘接口的测试和截图冒烟共用）：arcade-kit/testing 的 FakeBank 依赖 cloudflare:workers，Node 里加载不了，
 * 这里照它的关键规则写一个最小的：按 op 去重、余额不够回 no_funds、结回清掉桌上那一份。
 */
import type { WalletRpc } from '../worker/live.ts';

export class Bank implements WalletRpc {
  balance = 10_000;
  stakes = new Map<string, number>();
  ops = new Map<string, unknown>();
  calls: Array<{ m: string; a: Record<string, unknown> }> = [];
  private once(op: string, f: () => unknown): Promise<never> {
    if (!this.ops.has(op)) this.ops.set(op, f());
    return Promise.resolve(this.ops.get(op) as never);
  }
  view = async () => ({ ok: true as const, wallet: { balance: this.balance, stakes: [...this.stakes].map(([ref, amount]) => ({ game: 'haidao', ref, amount })) } });
  buyin = (a: Parameters<WalletRpc['buyin']>[0]) => {
    this.calls.push({ m: 'buyin', a });
    return this.once(a.op, () => {
      if (this.balance < a.amount) return { ok: false, error: 'no_funds' };
      this.balance -= a.amount;
      this.stakes.set(a.ref, (this.stakes.get(a.ref) ?? 0) + a.amount);
      return { ok: true, wallet: { balance: this.balance } };
    });
  };
  settle = (a: Parameters<WalletRpc['settle']>[0]) => {
    this.calls.push({ m: 'settle', a });
    return this.once(a.op, () => {
      if (!this.stakes.has(a.ref)) return { ok: false, error: 'no_stake' };
      this.stakes.delete(a.ref);
      this.balance += a.amount;
      return { ok: true, wallet: { balance: this.balance }, credited: a.amount };
    });
  };
  refund = (a: Parameters<WalletRpc['refund']>[0]) => {
    this.calls.push({ m: 'refund', a });
    return this.once(a.op, () => {
      const v = this.stakes.get(a.ref);
      if (v === undefined) return { ok: false, error: 'no_stake' };
      this.stakes.delete(a.ref);
      this.balance += v;
      return { ok: true, wallet: { balance: this.balance } };
    });
  };
}
