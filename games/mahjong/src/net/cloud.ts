/**
 * 云存档（docs/platform-backend.md 5.5，AGENTS.md 写了同步哪些槽）：雀馆只同步一个槽 `ladder`，茶馆擂台的称号和最远几桌（game/ladder.ts 的 cloudPart）。
 * 没打完的一轮、打到一半的牌局、设置都不同步。平台只存不透明的 JSON 和 rev，合并在这里：称号取并集、最远取较大（mergeLadder）。
 *
 * - 元数据 `mahjong.cloud`：{ userId, rev, dirty, at }（at 是上次上传成功的时刻）。每次都从存储里读，几个标签页自然共用一份。
 * - 启动：有 `__Host-arcade_li` 才问 `/api/me`（顺带续 last_seen_at）、再拉 `/api/saves/mahjong` 合并；合并前把本机那份备份到 `mahjong.ladder.pre-sync`。
 * - 上传：本机改了 10 秒防抖，同一个槽两次上传至少隔 5 分钟；切后台、离开牌桌时用 keepalive 补传（离上次不到 3 分钟就留到下次打开）。
 *   每个 PUT 都带 userId。409 conflict 合并后用 current.rev 只重交一次；409 wrong_user 不合并、不重试，按换号处理。
 * - 换号（/api/me 的账号和元数据记的不同，或 wrong_user）：不问玩家，本机那份先备份到 `mahjong.ladder.pre-switch.<旧账号>` 并读回核对，
 *   本机写成空档、元数据换成新账号并立即存盘，再拉新账号的；备份写不进去就什么都不清、暂停同步（云朵写"存储满了"）。
 *   以后登录回那个账号，拉完把备份并回本机、上传成功后改名 `.restored`，不再并第二次。
 */
import { readText, writeJson, writeText } from '../storage.ts';
import { cloudPart, emptyLadder, LADDER_KEY, mergeLadder, parseLadder, sameCloud, type LadderData } from '../game/ladder.ts';

export const CLOUD_KEY = 'mahjong.cloud';
const GAME = 'mahjong';
const SLOT = 'ladder';
export const PRE_SYNC = `${LADDER_KEY}.pre-sync`;
export const preSwitch = (uid: string): string => `${LADDER_KEY}.pre-switch.${uid}`;
const DEBOUNCE_MS = 10_000;
const GAP_MS = 5 * 60_000;
const HIDE_GAP_MS = 3 * 60_000;
const RECHECK_MS = 60_000;
/** keepalive 整个请求体 64 KB，留余量 */
const KEEPALIVE_MAX = 60_000;

/** 云朵的样子：off 没有平台（不显示）；out 没登录；full 本机存储满了 */
export type CloudState = 'off' | 'out' | 'ok' | 'syncing' | 'pending' | 'merged' | 'paused' | 'full';

export interface CloudMeta {
  userId: string | null;
  rev: number;
  dirty: boolean;
  at: number;
}

export interface CloudDeps {
  fetch: typeof fetch;
  store: Storage;
  now(): number;
  /** 有没有平台的登录标记 cookie（__Host-arcade_li） */
  loggedIn(): boolean;
  later(f: () => void, ms: number): unknown;
  cancel(t: unknown): void;
}

const emptyMeta = (): CloudMeta => ({ userId: null, rev: 0, dirty: false, at: 0 });

export function parseMeta(raw: string | null): CloudMeta {
  try {
    const o = JSON.parse(raw ?? '') as Partial<CloudMeta> | null;
    if (!o || typeof o !== 'object') return emptyMeta();
    return {
      userId: typeof o.userId === 'string' ? o.userId : null,
      rev: Number.isInteger(o.rev) && o.rev! >= 0 ? o.rev! : 0,
      dirty: o.dirty === true,
      at: Number.isFinite(o.at) ? o.at! : 0,
    };
  } catch {
    return emptyMeta();
  }
}

async function body(r: Response): Promise<Record<string, unknown> | null> {
  try {
    const j = (await r.json()) as unknown;
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export class CloudSync {
  state: CloudState = 'off';
  private uid: string | null = null;
  private timer: unknown = null;
  private inflight = false;
  /** 这个槽本次打开不再传（413、400 这类再传也没用） */
  private dead = false;
  private lastCheck = 0;
  /** 这次打开拉取时并进了云端的东西：传完以后云朵写"已合并" */
  private merged = false;
  private listeners = new Set<(s: CloudState) => void>();

  private readonly d: CloudDeps;

  constructor(deps: CloudDeps) {
    this.d = deps;
  }

  on(f: (s: CloudState) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private set(s: CloudState): void {
    this.state = s;
    for (const f of this.listeners) f(s);
  }

  meta(): CloudMeta {
    return parseMeta(readText(CLOUD_KEY, this.d.store));
  }

  private saveMeta(m: CloudMeta): boolean {
    return writeJson(CLOUD_KEY, m, this.d.store);
  }

  private local(): LadderData {
    return parseLadder(readText(LADDER_KEY, this.d.store));
  }

  /** 写一份并读回核对；存不上回 false */
  private put(key: string, d: LadderData): boolean {
    const raw = JSON.stringify(d);
    return writeText(key, raw, this.d.store) && readText(key, this.d.store) === raw;
  }

  /** 打开页面时 */
  async start(): Promise<void> {
    if (!this.d.loggedIn()) return this.set('out');
    if ((await this.checkMe()) !== 'gone') await this.pull();
  }

  /** 问 /api/me：'same' 账号没变、'switched' 换了号（本机已备份清空）、'gone' 不同步了（没登录、停服、存储满） */
  private async checkMe(): Promise<'same' | 'switched' | 'gone'> {
    this.lastCheck = this.d.now();
    let r: Response;
    try {
      r = await this.d.fetch('/api/me', { credentials: 'same-origin' });
    } catch {
      this.set('pending');
      return 'gone';
    }
    if (r.status === 401) return this.out();
    if (!r.ok) return this.pause();
    const j = await body(r);
    if (!j) return this.pause();
    const id = (j.user as { id?: unknown } | null)?.id;
    if (typeof id !== 'string') return this.out();
    if (j.saves === 'paused') return this.pause();
    const known = this.meta().userId;
    if (known && known !== id) {
      if (!this.switchAway(id)) return 'gone';
      this.uid = id;
      return 'switched';
    }
    this.uid = id;
    return 'same';
  }

  private out(): 'gone' {
    this.uid = null;
    this.set('out');
    return 'gone';
  }

  private pause(): 'gone' {
    this.set('paused');
    return 'gone';
  }

  /** 换号的前半：本机那份备份给旧账号、清空、元数据换成 next（wrong_user 时是 null）并立即存盘 */
  private switchAway(next: string | null): boolean {
    const meta = this.meta();
    const old = meta.userId;
    if (old) {
      let backup = cloudPart(this.local());
      try {
        const had = this.d.store.getItem(preSwitch(old));
        if (had) backup = cloudPart(mergeLadder(backup, JSON.parse(had)));
      } catch {
        // 旧备份坏了就只存这一份
      }
      if (!this.put(preSwitch(old), backup)) {
        this.set('full');
        return false;
      }
    }
    if (!this.put(LADDER_KEY, emptyLadder()) || !this.saveMeta({ userId: next, rev: 0, dirty: false, at: 0 })) {
      this.set('full');
      return false;
    }
    return true;
  }

  /** 拉云端的合并进本机；再把以前留给这个账号的换号备份并回来 */
  private async pull(): Promise<void> {
    const uid = this.uid;
    if (!uid) return;
    this.set('syncing');
    let r: Response;
    try {
      r = await this.d.fetch(`/api/saves/${GAME}?userId=${encodeURIComponent(uid)}`, { credentials: 'same-origin' });
    } catch {
      this.set('pending');
      return;
    }
    const j = await body(r);
    if (r.status === 401) return void this.out();
    if (r.status === 409 && j?.error === 'wrong_user') return this.wrongUser();
    if (!r.ok || !j || !Array.isArray(j.saves)) return void this.pause();
    const remote = (j.saves as { slot?: unknown; rev?: unknown; data?: unknown }[]).find((s) => s.slot === SLOT);
    const local = this.local();
    let merged = remote ? mergeLadder(local, remote.data) : local;
    let changed = !sameCloud(merged, local);
    if (changed && !this.put(PRE_SYNC, local)) return void this.set('full');
    let dirty = remote ? !sameCloud(merged, parseLadder(remote.data)) : !sameCloud(local, emptyLadder());
    const back = readText(preSwitch(uid), this.d.store);
    if (back) {
      const withBack = mergeLadder(merged, JSON.parse(back));
      changed ||= !sameCloud(withBack, merged);
      merged = withBack;
      dirty = true;
    }
    if (!this.put(LADDER_KEY, merged)) return void this.set('full');
    this.merged = changed;
    const meta = this.meta();
    this.saveMeta({ userId: uid, rev: remote && Number.isInteger(remote.rev) ? (remote.rev as number) : 0, dirty: dirty || (meta.userId === uid && meta.dirty), at: meta.userId === uid ? meta.at : 0 });
    if (this.meta().dirty) this.schedule();
    else this.set(changed ? 'merged' : 'ok');
  }

  private async wrongUser(): Promise<void> {
    if (!this.switchAway(null)) return;
    this.uid = null;
    await this.start();
  }

  /** 本机的擂台记录改了（view/ladder.ts 的 writeLadder 调） */
  touched(): void {
    // 没登录时也记着：登录后拉取时一起传上去
    this.saveMeta({ ...this.meta(), dirty: true });
    if (this.uid) this.schedule();
  }

  private schedule(): void {
    if (!this.uid || this.dead || this.state === 'paused' || this.state === 'full') return;
    const m = this.meta();
    if (!m.dirty) return;
    if (this.timer) this.d.cancel(this.timer);
    const now = this.d.now();
    const at = Math.max(now + DEBOUNCE_MS, m.at + GAP_MS);
    this.timer = this.d.later(() => {
      this.timer = null;
      void this.upload(false);
    }, at - now);
    this.set('pending');
  }

  /** 切后台、关页面、离开牌桌：有待传的、没在传、离上次够久，就用 keepalive 补传一次 */
  flush(): void {
    const m = this.meta();
    if (!this.uid || !m.dirty || this.inflight || this.d.now() - m.at < HIDE_GAP_MS) return;
    void this.upload(true);
  }

  /** 回到前台、拿到焦点：离上次确认身份超过 1 分钟就再问一次，换了号就拉新账号的 */
  async recheck(): Promise<void> {
    if (this.state === 'off' || !this.d.loggedIn() || this.d.now() - this.lastCheck < RECHECK_MS) return;
    const r = await this.checkMe();
    if (r === 'switched') await this.pull();
    else if (r === 'same' && this.meta().dirty) this.schedule();
  }

  /** 别的标签页改了元数据：那边换了号，这边跟着换 */
  storage(key: string | null): void {
    if (key !== CLOUD_KEY) return;
    const id = this.meta().userId;
    if (id && this.uid && id !== this.uid) {
      this.uid = id;
      this.set(this.meta().dirty ? 'pending' : 'ok');
    }
  }

  async upload(keepalive: boolean, retried = false): Promise<void> {
    const uid = this.uid;
    const meta = this.meta();
    if (!uid || this.dead || this.inflight || !meta.dirty || meta.userId !== uid) return;
    const sent = cloudPart(this.local());
    const payload = JSON.stringify({ baseRev: meta.rev, data: sent, userId: uid });
    if (keepalive && payload.length > KEEPALIVE_MAX) return;
    this.inflight = true;
    if (!keepalive) this.set('syncing');
    let r: Response;
    try {
      r = await this.d.fetch(`/api/saves/${GAME}/${SLOT}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive,
      });
    } catch {
      this.inflight = false;
      this.set('pending');
      return;
    }
    const j = await body(r);
    this.inflight = false;
    if (r.ok && j && Number.isInteger(j.rev)) {
      const now = this.meta();
      // 传的时候本机又改了：留着待传
      const still = !sameCloud(this.local(), sent);
      this.saveMeta({ userId: uid, rev: Math.max(now.rev, j.rev as number), dirty: still, at: this.d.now() });
      this.restored(uid);
      if (still) this.schedule();
      else this.set(retried || this.merged ? 'merged' : 'ok');
      this.merged = false;
      return;
    }
    if (r.status === 409 && j?.error === 'wrong_user') return this.wrongUser();
    if (r.status === 409 && j?.error === 'conflict' && !retried) {
      const cur = j.current as { rev?: unknown; data?: unknown } | null;
      const local = this.local();
      if (!this.put(PRE_SYNC, local) || !this.put(LADDER_KEY, mergeLadder(local, cur?.data))) return void this.set('full');
      this.saveMeta({ ...this.meta(), rev: cur && Number.isInteger(cur.rev) ? (cur.rev as number) : 0, dirty: true });
      return this.upload(keepalive, true);
    }
    if (r.status === 429) {
      const wait = Number(j?.retryAfter);
      this.timer = this.d.later(() => void this.upload(false), (Number.isFinite(wait) && wait > 0 ? wait : 60) * 1000);
      this.set('pending');
      return;
    }
    if (r.status === 401) return void this.out();
    if (r.status === 503) return void this.pause();
    if (r.status === 413 || r.status === 400 || r.status === 422 || r.status === 404) {
      this.dead = true;
      this.set('pending');
      return;
    }
    // 别的（连不上、回来的不是 JSON、第二次冲突）：留着待传，下次再说
    this.set('pending');
  }

  /** 换号备份并回来、传上去以后改名 .restored，不再并第二次 */
  private restored(uid: string): void {
    try {
      const raw = this.d.store.getItem(preSwitch(uid));
      if (raw === null) return;
      this.d.store.setItem(`${preSwitch(uid)}.restored`, raw);
      this.d.store.removeItem(preSwitch(uid));
    } catch {
      // 改不了名：下次打开再并一次，并集和较大值并几次都一样
    }
  }
}
