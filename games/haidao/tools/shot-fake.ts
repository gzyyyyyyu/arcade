/**
 * --pvp、--tdlive、--escortlive、--maplive、--map、--tide 用的假平台：
 * 页面的 /api/* 用 page.route 拦下，pvp 和实盘接口交给 Node 里跑的真 worker 代码（内存假存储、假钱包），回话和线上同一份代码出。
 */
import type { Page, Route } from 'playwright-core';
import { RULES_VERSION, botActions, newProfile, presetLayout } from '../src/core/index.ts';
import type { Placed, Profile } from '../src/core/index.ts';
import { validateBase } from '../src/core/validate.ts';
import { handleLive, type LiveEnv } from '../worker/live.ts';
import { handlePvp, type Ports, type PvpEnv } from '../worker/pvp/api.ts';
import { BaseCore } from '../worker/pvp/base.ts';
import { HarborCore } from '../worker/pvp/harbor.ts';
import { MemKv } from '../worker/pvp/kv.ts';
import { Bank } from './fake-bank.ts';

const ME = { id: 'u-me', name: '我' };
const DAY = 24 * 3600_000;

/** 主寨 hq 级的岛：在新档上加几样防御和城墙，坐标交给推荐布局排，再过一遍快照校验 */
function island(hq: number, extra: Array<[Placed['kind'], number]>): Profile {
  const p = newProfile();
  let id = 100;
  const list: Placed[] = p.base.buildings.map((b) => (b.kind === 'hq' ? { ...b, level: hq } : b));
  for (const [kind, n] of extra) for (let i = 0; i < n; i++) list.push({ id: id++, kind, level: Math.min(hq, 2), x: 0, y: 0 });
  const prof: Profile = { ...p, res: { gold: 2400, wood: 1500 }, base: { buildings: list, nextId: id } };
  const v = validateBase({ ...prof, base: { ...prof.base, buildings: presetLayout(prof, 'turtle') } });
  if (!v.ok) throw new Error(`假对手的岛没过校验：${v.error}`);
  return v.value;
}

export class FakePvp {
  private bases = new Map<string, BaseCore>();
  private harbor = new HarborCore(new MemKv());
  readonly ports: Ports = { base: (id: string) => this.base(id), harbor: () => this.harbor } as unknown as Ports;
  /** 假钱包：悬赏出海 / 悬赏守岛 / 兑换走真的 handleLive，钱包是内存里的 */
  readonly bank = new Bank();
  private liveEnv: LiveEnv = { WALLET: this.bank, ARCADE: { fetch: async () => Response.json({ user: { id: ME.id, displayName: ME.name } }) } as unknown as LiveEnv['ARCADE'] };
  /** 置为 true：下一次 pvp 找对手回 409 need_reload（截「游戏更新了」弹窗用） */
  staleNext = false;
  private env: PvpEnv = { ARCADE: { fetch: async () => Response.json({ user: { id: ME.id, displayName: ME.name } }) } as unknown as PvpEnv['ARCADE'] };

  private base(id: string): BaseCore {
    let b = this.bases.get(id);
    if (!b) this.bases.set(id, (b = new BaseCore(new MemKv(), id)));
    return b;
  }

  /** 港口里一个能匹配的真人"老李"（4 天前建号，过了新手保护、不在线），自己的快照（4 天前建号，过了新手保护，才能被打） */
  async seed(): Promise<void> {
    const now = Date.now();
    const lao = await this.base('u-lao').upload(island(2, [['cannon', 1], ['gunTower', 1], ['wall', 8]]), '老李', now - 4 * DAY);
    if (lao.ok) await this.harbor.upsert([lao.entry]);
    await this.base(ME.id).upload(newProfile(), ME.name, now - 4 * DAY);
    // 来打我的两个人（复仇要锁他们的岛，所以也要有快照；不进港口索引）
    await this.base('u-wolf').upload(island(2, [['cannon', 1], ['wall', 6]]), '海狼', now - 5 * DAY);
    await this.base('u-shark').upload(island(1, [['cannon', 1]]), '鲨鱼', now - 5 * DAY);
  }

  /** 我不在时被打：海狼、鲨鱼各用机器人真打一场，由我的 Base 重放结算（和线上同一条路） */
  async raidMe(): Promise<void> {
    const me = this.base(ME.id);
    let i = 0;
    for (const [id, name, style] of [['u-wolf', '海狼', 'normal'], ['u-shark', '鲨鱼', 'novice']] as const) {
      const prep = await this.base(id).prepare(Date.now());
      if (!prep.ok) throw new Error(`${name} 准备失败：${prep.error}`);
      const raidId = `seedraid${++i}xxxxxx`;
      // 我的快照是 4 天前建的，已过新手保护，按普通进攻锁（复仇的进攻不能再被复仇）
      const l = await me.lock({ raidId, attackerId: id, attackerName: name, attackerTrophies: 0, army: prep.army, seed: 1000 + i, revenge: false }, Date.now());
      if (!l.ok) throw new Error(`锁我的岛失败：${l.error}`);
      const acts = botActions({ layout: l.layout, army: prep.army, seed: 1000 + i, rules: RULES_VERSION }, style);
      const s = await me.settle(raidId, acts, 3600, Date.now());
      if (!s.ok) throw new Error(`结算失败：${s.error}`);
      // 护盾会挡住第二个人：造数据时清掉
      (me as unknown as { s: { shieldUntil: number } | null }).s!.shieldUntil = 0;
    }
  }

  /** 页面的 /api/*：平台的 /api/me、云存档假装登录；api/pvp/* 交给真的 handlePvp */
  async route(page: Page, problems: string[]): Promise<void> {
    // 客户端只在有平台的登录提示 cookie 时才调接口；http 的本地服务设不了 __Host- cookie，在页面里补上
    await page.addInitScript(() => {
      const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      if (!d?.get || !d.set) return;
      const get = d.get;
      const set = d.set;
      Object.defineProperty(Document.prototype, 'cookie', {
        configurable: true,
        get(this: Document) {
          const c = get.call(this) as string;
          return `${c ? `${c}; ` : ''}__Host-arcade_li=1`;
        },
        set(this: Document, v: string) {
          set.call(this, v);
        },
      });
    });
    await page.route((u) => u.pathname.startsWith('/api/'), async (r: Route) => {
      const req = r.request();
      const u = new URL(req.url());
      const json = (body: unknown, status = 200): Promise<void> => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (u.pathname === '/api/me') return json({ user: { id: ME.id, username: 'me', displayName: ME.name } });
      if (u.pathname.startsWith('/api/saves/haidao')) return req.method() === 'GET' ? json({ saves: [] }) : json({ rev: 1 });
      if (u.pathname.startsWith('/api/pvp/')) {
        if (this.staleNext && u.pathname === '/api/pvp/find') {
          this.staleNext = false;
          return json({ ok: false, error: 'need_reload' }, 409);
        }
        // 本地 vite 把游戏挂在根上，线上是 /games/haidao/：换成 Worker 认的路径
        const url = new URL(`/games/haidao${u.pathname}${u.search}`, u.origin);
        const body = req.postData();
        const headers = { ...req.headers(), cookie: '__Host-sid=shot', ...(body ? { 'content-length': String(Buffer.byteLength(body)) } : {}) };
        const res = await handlePvp(new Request(url, { method: req.method(), headers, ...(body ? { body } : {}) }), this.env, this.ports);
        const text = await res.text();
        if (res.status >= 400) problems.push(`接口 ${req.method()} ${u.pathname} 回 ${res.status} ${text}`);
        return r.fulfill({ status: res.status, contentType: 'application/json', body: text });
      }
      if (u.pathname === '/api/wallet') return json({ wallet: { balance: this.bank.balance } });
      if (u.pathname.startsWith('/api/live/') || u.pathname.startsWith('/api/td/') || u.pathname.startsWith('/api/escort/') || u.pathname.startsWith('/api/map/')) {
        const url = new URL(`/games/haidao${u.pathname}${u.search}`, u.origin);
        const body = req.postData();
        const headers = { ...req.headers(), cookie: '__Host-sid=shot', ...(body ? { 'content-length': String(Buffer.byteLength(body)) } : {}) };
        const res = await handleLive(new Request(url, { method: req.method(), headers, ...(body ? { body } : {}) }), this.liveEnv, this.ports);
        const text = await res.text();
        if (res.status >= 400) problems.push(`接口 ${req.method()} ${u.pathname} 回 ${res.status} ${text}`);
        return r.fulfill({ status: res.status, contentType: 'application/json', body: text });
      }
      problems.push(`没有假的接口：${req.method()} ${u.pathname}`);
      return json({ ok: false, error: 'not_found' }, 404);
    });
  }
}
