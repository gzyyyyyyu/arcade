/** 冒烟用的假数据：假钱包（平台接口）、档案样本、北京日期。 */
import type { Route } from 'playwright-core';
import { presetProfile } from '../../src/debug/profiles.ts';

/** 北京日期（和游戏里每日挑战的日期一个算法） */
export function beijingToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 档案样本写进 localStorage 的键值（打开页面前）。 */
export function profileStorage(kind: 'fresh' | 'partial' | 'all'): Record<string, string> {
  const p = presetProfile(kind);
  return { 'kaipan.profile': JSON.stringify(p.profile), 'kaipan.codex.viewed.v1': JSON.stringify(p.viewed) };
}

/** 冒烟用的假钱包：浏览器看钱包（GET /api/wallet）和开盘 Worker 的三条路（POST /api/live/*，冒烟时游戏在根路径下）。 */
export function fakeWallet(balance = 12_340) {
  const tiers: Record<string, number> = { small: 2_000, mid: 10_000, big: 50_000, lux: 200_000 };
  const w = {
    balance,
    stakes: [] as { game: string; ref: string; tier: string; amount: number; mode: string; at: number; until: number }[],
    calls: [] as { action: string; body: Record<string, unknown>; xArcade: string | undefined }[],
    /** 下一次（或一直）怎么回：'down' 回 503，其余当钱包的错误码回 { ok: false, error } */
    fail: { buyin: null as string | null, settle: null as string | null },
    /** 每日上限：进钱包最多这么多（超出的进 capped） */
    capAt: null as number | null,
    view() {
      return { balance: w.balance, stakes: w.stakes, canRelief: false, writesLeft: 200, caps: {}, fresh: false };
    },
    async route(route: Route): Promise<void> {
      const req = route.request();
      const u = new URL(req.url());
      if (u.pathname === '/api/me') return route.fulfill({ json: { user: { id: 'smoke-user', username: 'smoke', displayName: '冒烟' }, service: 'ok', saves: 'ok' } });
      if (u.pathname === '/api/saves/kaipan' && req.method() === 'GET') return route.fulfill({ json: { saves: [] } });
      if (req.method() === 'PUT') return route.fulfill({ json: { rev: 1, updatedAt: 2 } });
      if (u.pathname === '/api/wallet') return route.fulfill({ json: { wallet: w.view(), tiers, reliefTo: 2_000 } });
      const m = /^\/api\/live\/(buyin|settle|refund)$/.exec(u.pathname);
      if (!m || req.method() !== 'POST') return route.fulfill({ status: 404, json: { ok: false, error: 'not_found' } });
      const action = m[1] as 'buyin' | 'settle' | 'refund';
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
      w.calls.push({ action, body, xArcade: req.headers()['x-arcade'] });
      const f = action === 'refund' ? null : w.fail[action];
      if (f === 'down') return route.fulfill({ status: 503, json: { ok: false, error: 'unavailable' } });
      if (f) return route.fulfill({ json: { ok: false, error: f, wallet: w.view() } });
      const ref = String(body.ref);
      const i = w.stakes.findIndex((x) => x.game === 'kaipan' && x.ref === ref);
      if (action === 'buyin') {
        const amount = tiers[String(body.tier)] ?? 0;
        if (w.balance < amount) return route.fulfill({ json: { ok: false, error: 'no_funds', wallet: w.view() } });
        w.balance -= amount;
        w.stakes.push({ game: 'kaipan', ref, tier: String(body.tier), amount, mode: 'client', at: Date.now(), until: Date.now() + 86_400_000 });
        return route.fulfill({ json: { ok: true, wallet: w.view() } });
      }
      if (i < 0) return route.fulfill({ json: { ok: false, error: 'no_stake', wallet: w.view() } });
      const stake = w.stakes[i]!;
      w.stakes.splice(i, 1);
      const amount = action === 'refund' ? stake.amount : Math.floor(((tiers[String(body.tier)] ?? 0) * Number(body.bp)) / 10_000);
      const credited = w.capAt !== null ? Math.min(amount, w.capAt) : amount;
      w.balance += credited;
      return route.fulfill({ json: { ok: true, credited, capped: amount - credited, wallet: w.view() } });
    },
  };
  return w;
}
