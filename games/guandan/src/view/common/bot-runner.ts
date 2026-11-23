/**
 * 电脑的决定放到 Web Worker 里算（掼蛋、斗地主各一个 worker，见各自的 bot-worker.ts）：残局推演一手要几百毫秒，
 * 放在主线程上画面会冻住；放进 worker，出牌动画、按钮照常响应。
 * 没有 Worker（vitest、极老的浏览器）或者 worker 出错时当场同步算，结果一样（电脑只看传过去的视图和种子）。
 */
interface Pending<J, A> {
  job: J;
  done: (a: A | null) => void;
}

export class BotRunner<J, A> {
  private worker: Worker | null = null;
  private broken = false;
  private seq = 0;
  private readonly pending = new Map<number, Pending<J, A>>();

  private readonly make: () => Worker;
  private readonly sync: (job: J) => A | null;

  constructor(make: () => Worker, sync: (job: J) => A | null) {
    this.make = make;
    this.sync = sync;
  }

  run(job: J): Promise<A | null> {
    const w = this.ensure();
    if (!w) return Promise.resolve(this.sync(job));
    const id = ++this.seq;
    return new Promise((done) => {
      this.pending.set(id, { job, done });
      w.postMessage({ id, job });
    });
  }

  private ensure(): Worker | null {
    if (this.worker || this.broken || typeof Worker === 'undefined') return this.worker;
    try {
      this.worker = this.make();
    } catch (e) {
      console.warn('电脑的后台线程起不来，改在页面里算', e);
      this.broken = true;
      return null;
    }
    this.worker.onmessage = (e: MessageEvent<{ id: number; action: A | null }>) => {
      const p = this.pending.get(e.data.id);
      this.pending.delete(e.data.id);
      p?.done(e.data.action);
    };
    this.worker.onerror = (e) => {
      console.warn('电脑的后台线程出错，改在页面里算', e.message);
      this.worker?.terminate();
      this.worker = null;
      this.broken = true;
      for (const p of this.pending.values()) p.done(this.sync(p.job));
      this.pending.clear();
    };
    return this.worker;
  }
}
