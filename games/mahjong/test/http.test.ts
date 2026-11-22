import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../src/net/http.ts';

describe('apiFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('每个请求都带超时信号，调用方的其他参数原样传下去', async () => {
    let seen: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen = init;
      return new Response('{}');
    });
    await apiFetch('/api/me', { method: 'POST', credentials: 'same-origin', keepalive: true });
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    expect(seen?.signal?.aborted).toBe(false);
    expect(seen).toMatchObject({ method: 'POST', credentials: 'same-origin', keepalive: true });
  });
});
