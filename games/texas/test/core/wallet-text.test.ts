/** 钱包错误给玩家看的话（平台 15.10）：单机的 RPC、好友房、/api 三处说法不同 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWallet, walletError } from '../../src/net/wallet.ts';

describe('钱包错误的说法', () => {
  it('busy：单机说娱乐局照常玩；好友房里没有娱乐模式，不提；看钱包、领补给（/api）说先只能看、不能改', () => {
    expect(walletError('busy')).toContain('娱乐模式照常玩');
    expect(walletError('busy', undefined, 'room')).not.toContain('娱乐');
    expect(walletError('busy', undefined, 'api')).toBe('服务器今天有点忙，先只能看、不能改，明早恢复');
  });

  it('limit：好友房里不提娱乐模式，"桌上的照常结回"留着', () => {
    expect(walletError('limit', undefined, 'room')).toBe('今天开局太多了，明早 0 点恢复；桌上的照常结回');
    expect(walletError('limit')).toContain('娱乐模式照常玩');
  });
});

describe('限次和超时（审查 1122）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rate_limited：限次对玩家无感，不说"频繁""太快"，只说忙、筹码没动、多久后再试', () => {
    const t = walletError('rate_limited', 600);
    expect(t).toBe('钱包这会儿忙，筹码没动，过一会儿再试（10 分钟后）');
    expect(t).not.toMatch(/频繁|太快/);
  });

  it('钱包请求带超时：挂住的连接按连不上处理（offline），不让按钮一直转圈', async () => {
    const f = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      if (init.signal!.aborted) reject(init.signal!.reason);
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
    }));
    vi.stubGlobal('fetch', f);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => AbortSignal.abort(new DOMException('timeout', 'TimeoutError')));
    expect(await getWallet()).toEqual({ ok: false, error: 'offline' });
    expect(f.mock.calls[0]![1].signal!.aborted).toBe(true);
    vi.restoreAllMocks();
  });
});
