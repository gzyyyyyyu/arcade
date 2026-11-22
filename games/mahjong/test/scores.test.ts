import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitScore } from '../src/net/scores.ts';

describe('submitScore', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('按平台的格式交，收下回 true、拒了回 false', async () => {
    const bodies: unknown[] = [];
    let status = 200;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response('{}', { status });
    });
    expect(await submitScore('daily-2026-11-22-xz', -1280, 'u1')).toBe(true);
    status = 404;
    expect(await submitScore('hekiri-2026-11-22', 9, 'u1')).toBe(false);
    expect(bodies[0]).toEqual({ gameId: 'mahjong', boardId: 'daily-2026-11-22-xz', score: -1280, userId: 'u1' });
  });

  it('断网回 false 不抛；同一个榜交到一半再交不重发', async () => {
    let calls = 0;
    let release: (r: Response) => void = () => {};
    vi.stubGlobal('fetch', () => {
      calls++;
      return new Promise<Response>((r) => {
        release = r;
      });
    });
    const first = submitScore('ting-2026-11-22', 5, 'u1');
    expect(await submitScore('ting-2026-11-22', 5, 'u1')).toBe(false);
    release(new Response('{}'));
    expect(await first).toBe(true);
    expect(calls).toBe(1);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await submitScore('ting-2026-11-22', 5, 'u1')).toBe(false);
  });
});
