/**
 * /games/racing/health：平台巡检用（仓库根 docs/monitoring.md），排在登录闸门前面，不问平台、不碰静态资源；
 * 单独部署和接入平台都一样回。测试 Worker 的 env 是接入平台的样子（GATE=login、假的 ARCADE），去掉这两样就是单独部署。
 */
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import worker, { type Env } from '../../worker/main.ts';

const SITE = 'https://game.example.com';
const HEALTH = '/games/racing/health';

/** 不该被调到的绑定：调一次记一次 */
function never(): { calls: number; fetch: () => Promise<Response> } {
  const f = {
    calls: 0,
    fetch: async (): Promise<Response> => {
      f.calls++;
      return new Response('should not be called', { status: 500 });
    },
  };
  return f;
}

const call = (e: Env, path: string, init: RequestInit = {}) =>
  worker.fetch(new Request(`${SITE}${path}`, { redirect: 'manual', ...init }) as Parameters<typeof worker.fetch>[0], e);

describe('健康检查', () => {
  it('单独部署：回 ok 和 package.json 的版本，不缓存，不碰静态资源', async () => {
    const assets = never();
    const res = await call({ ...env, ARCADE: undefined, GATE: undefined, ASSETS: assets } as unknown as Env, HEALTH);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, version: pkg.version });
    expect(assets.calls).toBe(0);
  });

  it('接入平台（GATE=login）不带 cookie 也回 200，不问平台', async () => {
    const assets = never();
    const arcade = never();
    const res = await call({ ...env, ASSETS: assets, ARCADE: arcade } as unknown as Env, HEALTH);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: pkg.version });
    expect(assets.calls + arcade.calls).toBe(0);
  });

  it('HEAD 也回；别的方法、别的路径交给后面的路由', async () => {
    const e = { ...env, ASSETS: { fetch: async () => new Response('asset', { status: 404 }) } } as unknown as Env;
    expect((await call(e, HEALTH, { method: 'HEAD' })).status).toBe(200);
    expect((await call(e, HEALTH, { method: 'POST' })).status).toBe(404);
    expect((await call(e, '/games/racing/healthz')).status).toBe(404);
  });
});
