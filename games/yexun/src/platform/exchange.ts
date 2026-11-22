/**
 * 铜钱换筹码的浏览器端（DESIGN 3.8a）：经夜巡自己的 Worker（同域 POST api/exchange/{view,do}）转给平台钱包，浏览器不直接碰钱包。
 *
 * 铜钱扣减和 op 绑在一起，流水只追加（platform/save.ts startExchange / endExchange）：
 * - 发之前先扣全额、记待办；回了 credited（含 dup 重发的第一次结果）就退回没入账的那部分；
 * - 钱包明确拒绝（exchange_cap、limit、bad_amount……）或这里没有钱包（501）：全额退回；
 * - busy、internal、连不上、没登录：留着待办，下次打开、回到前台时用同一个 op 重发，钱包按 op 只算一次。
 * 不依赖 DOM：fetch 和存档从外面传进来。
 */
import { endExchange, newXcOp, startExchange, type Save } from './save.ts';
import { isObj, requestJson, type Fetch, type JsonRes } from './http.ts';

const API = 'api/exchange/';

/** 今天的额度；拿不到（单独部署、没登录、连不上）是 null，界面写「每天最多 2,000」 */
export interface Quota {
  left: number;
  cap: number;
}

export type ExchangeResult =
  | { kind: 'ok'; credited: number; left: number | null }
  | { kind: 'reject'; error: string; left: number | null }
  /** 没结：铜钱先扣着，过会儿自动重发 */
  | { kind: 'pending'; why: 'offline' | 'login' }
  /** 发之前就挡下了（钱不够、正在换） */
  | { kind: 'skip'; why: 'coins' | 'busy' };

const RETRY = new Set(['busy', 'internal']);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

export interface ExchangeDeps {
  save: Save;
  fetch: Fetch;
  /** 生成兑换号（测试里固定） */
  newOp?: () => string;
}

export class ExchangeClient {
  private readonly d: ExchangeDeps;
  private busy = false;
  /** 收到过 501：这里没有钱包，兑换入口藏起来 */
  unavailable = false;

  constructor(d: ExchangeDeps) {
    this.d = d;
  }

  async quota(): Promise<Quota | null> {
    const { status, body } = await this.post('view', {});
    if (status === 501) this.unavailable = true;
    if (status !== 200 || !isObj(body) || body.ok !== true) return null;
    const left = int(body.exchangeLeft);
    const cap = int(body.exchangeCap);
    return left === null || cap === null ? null : { left, cap };
  }

  /** 换 amount 个筹码（先扣 amount × 汇率 枚铜钱） */
  async exchange(amount: number): Promise<ExchangeResult> {
    if (this.busy) return { kind: 'skip', why: 'busy' };
    const op = this.d.newOp?.() ?? newXcOp(Date.now(), crypto.randomUUID().replace(/-/g, '').slice(0, 20));
    if (!startExchange(this.d.save, op, amount)) return { kind: 'skip', why: 'coins' };
    this.busy = true;
    try {
      return await this.send(op, amount);
    } finally {
      this.busy = false;
    }
  }

  /** 把没结的重发一遍（打开页面、回到前台、联网时调）；返回这次结掉了几笔 */
  async resume(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let n = 0;
    try {
      for (const p of [...this.d.save.xc]) if ((await this.send(p.op, p.amount)).kind !== 'pending') n++;
    } finally {
      this.busy = false;
    }
    return n;
  }

  private async send(op: string, amount: number): Promise<ExchangeResult> {
    const { status, body } = await this.post('do', { op, amount });
    if (status === 401) return { kind: 'pending', why: 'login' };
    if (status === 501) {
      this.unavailable = true;
      endExchange(this.d.save, op, 0);
      return { kind: 'reject', error: 'no_wallet', left: null };
    }
    if (status === 0 || status >= 500 || !isObj(body)) return { kind: 'pending', why: 'offline' };
    const left = int(body.left);
    if (status === 200 && body.ok === true) {
      const credited = int(body.credited) ?? 0;
      endExchange(this.d.save, op, credited);
      return { kind: 'ok', credited, left };
    }
    const error = typeof body.error === 'string' ? body.error : `http_${status}`;
    if (status === 200 && RETRY.has(error)) return { kind: 'pending', why: 'offline' };
    if (status === 200 && error === 'no_user') return { kind: 'pending', why: 'login' };
    // 钱包明确拒绝、请求本身不对（夜巡的 bug，控制台留证据）：全额退回
    if (status !== 200) console.error('兑换出错：', error);
    endExchange(this.d.save, op, 0);
    return { kind: 'reject', error, left };
  }

  private post(action: 'view' | 'do', body: unknown): Promise<JsonRes> {
    return requestJson(this.d.fetch, 'POST', `${API}${action}`, JSON.stringify(body));
  }

}
