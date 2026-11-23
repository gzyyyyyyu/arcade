import { describe, expect, it, vi } from 'vitest';
import { LiveClient } from '../../src/platform/live.ts';
import { buyinWhy } from '../../src/app/liveText.ts';
import { quickLive, quickOffWhy, type MenuState } from '../../src/view/ui/screens/shared.ts';

const client = (status: number, body: unknown, onChange = vi.fn()) => {
  const urls: string[] = [];
  const c = new LiveClient({
    store: null,
    now: () => 0,
    onChange,
    fetch: async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(body), { status });
    },
  });
  return { c, urls, onChange };
};

describe('手上的筹码（平台钱包 GET /api/wallet）', () => {
  it('读到 wallet.balance 就记下并通知界面重画；同样的数不重画', async () => {
    const { c, urls, onChange } = client(200, { wallet: { balance: 1685, stakes: [] } });
    expect(c.chips).toBeNull();
    await c.readWallet();
    expect(urls).toEqual(['/api/wallet']);
    expect(c.chips).toBe(1685);
    expect(onChange).toHaveBeenCalledTimes(1);
    await c.readWallet();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('没登录（401）、回的东西不对：保持 null，不报错', async () => {
    for (const [status, body] of [[401, { error: 'no_user' }], [200, { wallet: { balance: -1 } }], [200, { nope: 1 }]] as const) {
      const { c } = client(status, body);
      await c.readWallet();
      expect(c.chips).toBeNull();
    }
  });
});

describe('筹码不够带一份', () => {
  it('写手上多少、这一档要多少、去哪补；没读到钱包就不写手上多少', () => {
    const o = { kind: 'reject', error: 'no_funds' } as const;
    expect(buyinWhy(o, { tier: 'small', chips: 1685 })).toBe('手上 1,685 筹码，小档要 2,000。钱包每天能领补给');
    expect(buyinWhy(o, { tier: 'medium', chips: null })).toBe('筹码不够带一份，中档要 10,000。钱包每天能领补给');
  });

  it('主页一键开：读到手上不够这一档一份就按娱乐开，并写明为什么；读不到照旧试带入', () => {
    const s = (chips: number | null) => ({ lastMode: 'vigil', raidFirst: false, live: { available: true, on: true, tier: 'small', chips } }) as unknown as MenuState;
    expect(quickLive(s(1999))).toBeNull();
    expect(quickOffWhy(s(1999))).toBe('手上 1,999 筹码，不够带小档一份');
    expect(quickLive(s(2000))).toEqual({ tier: 'small' });
    expect(quickLive(s(null))).toEqual({ tier: 'small' });
  });
});
