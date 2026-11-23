import { afterEach, describe, expect, it, vi } from 'vitest';
import { BotRunner } from '../../src/view/common/bot-runner.ts';

/** 假的 Worker：收到 job 异步回 job×10；broken 时触发 onerror */
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  private readonly broken: boolean;
  constructor(broken: boolean) {
    this.broken = broken;
  }
  postMessage(m: { id: number; job: number }): void {
    queueMicrotask(() => {
      if (this.broken) this.onerror?.({ message: 'boom' } as ErrorEvent);
      else this.onmessage?.({ data: { id: m.id, action: m.job * 10 } } as MessageEvent);
    });
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('电脑的后台线程（view/common/bot-runner.ts）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('没有 Worker（vitest、老浏览器）：当场同步算', async () => {
    vi.stubGlobal('Worker', undefined);
    const make = vi.fn(() => new FakeWorker(false) as unknown as Worker);
    const r = new BotRunner<number, number>(make, (j) => j + 1);
    await expect(r.run(4)).resolves.toBe(5);
    expect(make).not.toHaveBeenCalled();
  });

  it('有 Worker：交给它算，按编号对上各自的结果；只起一个', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const make = vi.fn(() => new FakeWorker(false) as unknown as Worker);
    const r = new BotRunner<number, number>(make, (j) => j + 1);
    await expect(Promise.all([r.run(1), r.run(2)])).resolves.toEqual([10, 20]);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('Worker 出错：在等的和以后的都改在页面里算，不卡住', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = new BotRunner<number, number>(() => new FakeWorker(true) as unknown as Worker, (j) => j + 1);
    await expect(r.run(1)).resolves.toBe(2);
    await expect(r.run(7)).resolves.toBe(8);
  });
});
