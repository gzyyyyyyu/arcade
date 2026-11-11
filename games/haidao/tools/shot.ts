/**
 * 无头浏览器冒烟 + 截图：node tools/shot.ts [--out <目录>] [--view desktop,phonep] [--query <附加查询串>]
 *
 * - 自己起一个 vite 开发服务（端口由系统分配，不占 5170/4170，见仓库根 AGENTS.md 第 3 节），用 playwright-core + chromium；
 * - 每个视口截三张：基地、战斗中（?battle=<第 1 关>&auto&fast，机器人代打）、战斗打完；
 * - --views：各界面逐个截图（基地、海图、建造列表、主寨面板、升级庆祝面板、战斗中、结算），用 ?dev 给资源和星数，不写存档；
 * - --flow：新存档的真人流程（收金币 → 建造 → 看主寨 → 船队 → 出海 → 手动登陆放炮击 → 结算 → 回家），每步截图，任何一步失败记问题并退出码 1；
 * - --pvp：异步攻防的真人流程（海图"打玩家" → 找对手 → 手动登陆打 → 服务端结算 → 回家看"被打了 N 次" → 防守记录和回放 → 复仇 → 流浪海盗岛）。
 *   平台和 /api/pvp/* 由下面的 FakePvp 假装：Node 里跑真正的 worker/pvp/api.ts（内存假存储），回话和线上同一份代码出；
 * - --tdlive：悬赏守岛（实盘）的真人流程（守岛选关页 → 悬赏守岛选档 → 带入 → 造塔 / 英雄 / 叫波 → 结算 → 回家）。
 *   /api/td/*、/api/live/* 同样交给真的 worker/live.ts（内存假钱包 tools/fake-bank.ts）；--pvp 里还会让假服务端回一次 need_reload，截「游戏更新了」弹窗；
 * - --escortlive：护航实盘的真人流程（出海海图的护航卡 → 选图页的「实盘」→ 选档 → 带入 → 造塔、叫波 → 打完或撤退 → 结算 → 回家），钱包同样是假的；
 * - --maplive：航线实盘的真人流程（海图上「今日航线」旁的「实盘」→ 选档 → 带入 → 打一站 → 刷新页面 → 接着跑 → 收航 → 结算 → 回家），
 *   核对只写 haidao.maplive.run、不动 haidao.map、不交榜；
 * - --td：守岛一关的真人流程（--level，默认 td01）：选关页 → 驻守台选塔（电脑按空格开打）→ 预告卡和地图上的路线旗 → 敌人图鉴和克制表 →
 *   建塔（电脑按数字键选塔）、升级、卖塔（按两下）→ 清障 → 英雄走位、拒马、炸药桶 → 开打（电脑按空格）→ 4 倍速打完 → 结算；
 * - --escort：护航（商船队）的真人流程：出海海图的护航卡 → 选图选难度 → 局中点 停 / 冲 / 修船 / 跟随、造一座塔 → 4 倍速打到结束（5 分钟没完就撤退）→ 结算 → 回岛；
 *   检查顶栏血条、速度三联钮（当前档高亮、可点 ≥ 44）、手机竖屏的"回到船"钮，控制台零报错；
 * - --home：海盗来袭（守自己的岛）的真人流程：选关页入口 → 开局 → 造塔、英雄、开打 → 撑到结束（4 分钟没完就撤退）→ 结算（不算星）→ 回岛；
 * - 视口：desktop 1280×800、wide 1920×1080、phonep 手机竖屏、phone 手机横屏，--view 挑（默认 desktop,phonep）；
 * - --tide：大潮无尽（每周榜）的真人流程（守岛选关页的大潮入口 → 开局 → 造塔 / 英雄 / 技能 / 叫波 → 撑到结束 → 结算页 → 回岛）。
 *   往 /api/scores 交分用 page.route 拦下回 {best, improved: true}，并核对请求体（gameId、boardId、score）和只交了一次；
 * - --map：寻宝航线（每日航线）的真人流程，三个视口（电脑 1280×800、1920×1080、手机竖屏）：老玩家存档 → 出海 → 今日航线卡 → 航线图 → 选节点 → 整备（休整一条船）
 *   / 补给礁 → 真人登陆打（点船卡、点沙滩、放技能，不开 auto，?fast 4 倍速）→ 站间条 → … → 终局演出 → 结算 → 分享 → 回岛；
 *   往 /api/scores 交分用 page.route 拦下，核对榜名 daily-<日期>-map、只交了一次、haidao.map 记上了最好；
 *   电脑 1280×800 那一遍从最后一站的站间条起按 60 帧录终局演出（宝箱 / 沉船，webm + 拼图，--rec-out <目录>，默认 --out）；
 * - 可点的东西 ≥ 44×44 CSS 像素，控制台没有 error、页面没有未捕获的异常，不过就退出码 1；
 * - 没有 GPU 的环境 WebGL 走 SwiftShader（启动参数照开盘）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';
import type { Route } from 'playwright-core';
import { CAMPAIGN, RULES_VERSION, TD2_LEVEL_BY_ID, botActions, newProfile, presetLayout } from '../src/core/index.ts';
import type { Placed, Profile } from '../src/core/index.ts';
import { validateBase } from '../src/core/validate.ts';
import { handleLive, type LiveEnv } from '../worker/live.ts';
import { handlePvp, type Ports, type PvpEnv } from '../worker/pvp/api.ts';
import { BaseCore } from '../worker/pvp/base.ts';
import { HarborCore } from '../worker/pvp/harbor.ts';
import { MemKv } from '../worker/pvp/kv.ts';
import { ESCORT_LIVE_TIERS } from '../src/core/escortlive.ts';
import { MAP_LIVE_TIERS } from '../src/core/maplive.ts';
import { Bank } from './fake-bank.ts';
import { recordClip, recordFixed } from './record.ts';

const argv = process.argv.slice(2);
const opt = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const OUT = opt('--out') ?? opt('--record') ?? join(tmpdir(), 'haidao-shots');
const QUERY = opt('--query') ?? '';
/** 驻岛英雄截图：给战役局加一个宝藏箱和英雄（等级 1-8），见 main.ts 的 devhero */
const HERO = opt('--hero');
const HQ = HERO ? `devhero=${HERO}` : '';
const LEVEL = opt('--level') ?? CAMPAIGN[0]?.id ?? '';
mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'wide', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'phonep', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'phone', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'small', viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
const FLOW = argv.includes('--flow');
const PVP = argv.includes('--pvp');
const TD = argv.includes('--td');
/** --td 默认打第一章第 1 关；--level td07 打别的关（章节标签、主寨等级随关卡走，--hq 可改主寨） */
const TD_LEVEL = opt('--level') ?? 'td01';
const TD_LV = TD2_LEVEL_BY_ID.get(TD_LEVEL);
const TD_CHAPTER = TD_LV?.chapter ?? 1;
const TD_HQ = Number(opt('--hq') ?? Math.max(3, TD_LV?.hq ?? 3));
const TD_MECHANIC = !!(TD_LV && (TD_LV.sapperJam || TD_LV.bossSkill));
/** --home：海盗来袭（守自己的岛）的真人流程 */
const HOME = argv.includes('--home');
const ESCORT = argv.includes('--escort');
const TDLIVE = argv.includes('--tdlive');
const ESCORTLIVE = argv.includes('--escortlive');
const MAPLIVE = argv.includes('--maplive');
const TIDE = argv.includes('--tide');
const VIEWS_MODE = argv.includes('--views');
const MAP = argv.includes('--map');
/** --cam：镜头适配。手机竖屏守岛开场推镜、屏外敌人箭头、登陆战开场；电脑 / 1920 守岛整岛在屏内、按钮不重叠 */
const CAM = argv.includes('--cam');
const ONLY = opt('--view')?.split(',') ?? (MAP ? ['desktop', 'wide', 'phonep'] : CAM ? ['phonep', 'wide'] : ['desktop', 'phonep']);
/** --record <目录>：录动作短片（webm + 抽帧拼图），见下面 recordAll */
const REC = opt('--record');
const REC_KINDS = (opt('--rec-kinds') ?? 'sailor').split(',').filter(Boolean);
const REC_TD = (opt('--rec-td') ?? 'any').split(',').filter(Boolean);
/** --rec-towers battle,cannon,mortar,…：录炮台（battle = 登陆战里第一座有兵靠近的炮台；其余种类在守岛 td03 的木台上造一座再叫波），镜头定在塔上 */
const REC_TOWERS = (opt('--rec-towers') ?? '').split(',').filter(Boolean);
const REC_TZOOM = Number(opt('--rec-tzoom') ?? 0.75);
const REC_SECS = Number(opt('--rec-secs') ?? 4);
const REC_ZOOM = Number(opt('--rec-zoom') ?? 1.5);
const REC_LEVEL = opt('--level') ?? 'c07';
/** --rec-fps 60：手动按 16.67ms 推帧逐帧截图（固定 60 帧，默认）；--rec-fps live：CDP 屏幕广播收实际出的帧 */
const REC_LIVE = opt('--rec-fps') === 'live';

type Hook = { tdPt?(x: number, y: number): { x: number; y: number }; tdInfo?(): { tick: number; wave: number; vault: number; lost: number; gold: number; over: boolean; slots: Array<{ x: number; y: number; tower: number; wreck: boolean; garrison: boolean }>; flags: number; routes: number; barricades: number; hero: { x: number; y: number }; jammed: number; skilled: number }; ready?: boolean; level?: string; scene?: string; dev?: { give(g: number, w: number, s: number): void; td(hq: number): void }; where?(k: string): { x: number; y: number } | null; beach?(i: number): { x: number; y: number } | null };
const hook = (page: Page): Promise<Hook> => page.evaluate(() => ((window as unknown as { __haidao?: Hook }).__haidao ?? {}) as Hook);


// ---------------------------------------------------------------- 音效触发统计（--sfx-out <文件> 写 json，控制台总是打印）

type SfxCount = { req: number; played: number; gap: number; cap: number; silent: number };
const sfxTotal = new Map<string, SfxCount>();
/** 每 400ms 读一次页面里的计数（页面跳转会清零，按增量累加；计数只增不减，变小就当作重新载入） */
function trackSfx(page: Page): () => Promise<void> {
  const prev = new Map<string, SfxCount>();
  const poll = async (): Promise<void> => {
    const st = await page.evaluate(() => (window as unknown as { __haidao?: { sfxStats?(): { counts: Record<string, SfxCount> } } }).__haidao?.sfxStats?.().counts ?? null).catch(() => null);
    if (!st) return;
    for (const [name, c] of Object.entries(st)) {
      const old = prev.get(name);
      const base = old && old.req <= c.req ? old : { req: 0, played: 0, gap: 0, cap: 0, silent: 0 };
      const tot = sfxTotal.get(name) ?? { req: 0, played: 0, gap: 0, cap: 0, silent: 0 };
      for (const k of Object.keys(tot) as Array<keyof SfxCount>) tot[k] += c[k] - base[k];
      sfxTotal.set(name, tot);
      prev.set(name, { ...c });
    }
  };
  const timer = setInterval(() => void poll(), 400);
  return async () => {
    clearInterval(timer);
    await poll();
  };
}
function printSfx(): void {
  const rows = [...sfxTotal.entries()].sort((a, b) => b[1].req - a[1].req);
  console.log('声音\t请求\t放出\t限频丢\t并发丢\t没有音频');
  for (const [n, c] of rows) console.log(`${n}\t${c.req}\t${c.played}\t${c.gap}\t${c.cap}\t${c.silent}`);
  const out = opt('--sfx-out');
  if (out) writeFileSync(out, JSON.stringify(Object.fromEntries(rows)));
}

// ---------------------------------------------------------------- --pvp 的假平台

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

class FakePvp {
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

async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a, [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (r.width < 44 || r.height < 44) bad.push(`点击区域太小 ${Math.round(r.width)}×${Math.round(r.height)}：${el.getAttribute('aria-label') ?? el.textContent?.trim()}`);
    }
    return bad;
  });
}

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const ROOT = `http://127.0.0.1:${addr.port}/`;

type RecUnit = { id: number; kind: string; mode: string; hp: number; maxHp: number; front?: boolean };
/**
 * --record <目录>：录动作短片。视口 480×400 @2x、渲染倍数 2（?rs=2）、关掉泛光，镜头用 follow 钩子对准一个单位、放大 --rec-zoom 倍，
 * 裁出画面正中一块拼成 640 宽的 webm（tools/record.ts），每段旁边一张抽帧拼图（同名 .png）。
 * - 登陆战（--level，默认 c07，机器人代打）：--rec-kinds 里每个兵种开一局（devarmy=<兵种>，全军都是这种兵），各录走路、攻击 --rec-secs 秒，
 *   再等一个血量掉到三成以下的同种兵，跟着它录到倒下消失后 1.5 秒（battle-<兵种>-walk / attack / die）；
 * - 守岛（td03，dev 示范岛，造一座炮塔后叫波）：--rec-td 里每种敌人（any = 第一个出现的）录走路，再录一个倒下的（td-<种类>-walk / die）。
 */
async function recordAll(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  // 2 倍够看清部件，3 倍时没有 GPU 的机器只出十几帧，看不出动作顺不顺
  const view = { viewport: { width: 480, height: 400 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false };
  const [cw, ch, cu] = (opt('--rec-crop') ?? '0.6,0.7,0').split(',').map(Number);
  const crop = { w: cw ?? 0.62, h: ch ?? 0.62, up: cu ?? 0 };
  // mt1：无头 Chrome 的多纹理合批会让部件随机缺块（见 main.ts），录屏只用一个纹理单元
  const q = `rs=2&bloom=0&mt1${QUERY ? `&${QUERY}` : ''}`;
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const open = async (url: string): Promise<{ page: Page; close(): Promise<void>; cdp: Awaited<ReturnType<Awaited<ReturnType<typeof browser.newContext>>['newCDPSession']>> }> => {
    const ctx = await browser.newContext(view);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' && !/GL Driver Message/.test(m.text())) problems.push(`录屏 控制台报错：${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`录屏 未捕获异常：${e.message}`));
    await page.goto(url, { timeout: 60_000 });
    await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.ready === true, null, { timeout: 90_000 });
    return { page, cdp: await ctx.newCDPSession(page), close: () => ctx.close() };
  };
  // 录的是画布里的动作：界面（顶栏、底部卡片）藏起来，不挡住镜头中间
  const hideUi = (page: Page): Promise<unknown> => page.addStyleTag({ content: '.hd-ui{visibility:hidden!important}' });
  const units = (page: Page): Promise<RecUnit[]> => page.evaluate(() => (window as unknown as { __haidao: { units?(): RecUnit[] } }).__haidao.units?.() ?? []);
  const pick = async (page: Page, f: (u: RecUnit) => boolean, ms: number, best?: (a: RecUnit, b: RecUnit) => number): Promise<RecUnit | null> => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) {
      const us = (await units(page)).filter(f);
      if (us.length) return best ? us.sort(best)[0]! : us[0]!;
    }
    return null;
  };
  const follow = (page: Page, id: number | null): Promise<void> => page.evaluate(([i, z]) => (window as unknown as { __haidao: { follow?(id: number | null, z?: number): void } }).__haidao.follow?.(i, z), [id, REC_ZOOM] as const);
  /** 跟住一个单位录到它倒下消失后再录 1.5 秒（最长 ms） */
  const untilGone = (page: Page, id: number): (() => Promise<boolean>) => {
    let goneAt = 0;
    return async () => {
      const u = (await units(page)).find((x) => x.id === id);
      if ((!u || u.mode === 'dead') && !goneAt) goneAt = Date.now();
      // 逐帧录（默认）由 recordFixed 在倒下后再补录一段；实时录按墙钟多等 1.5 秒
      return goneAt > 0 && (!REC_LIVE || Date.now() - goneAt > 1500);
    };
  };
  const clip = async (page: Page, cdp: Parameters<typeof recordClip>[1], name: string, u: RecUnit | null, ms: number, until?: () => Promise<boolean>): Promise<void> => {
    if (!u) {
      problems.push(`录屏：${name} 没等到合适的单位`);
      return;
    }
    await follow(page, u.id);
    await sleep(300);
    const n = REC_LIVE ? await recordClip(page, cdp, dir, name, ms, crop, until) : await recordFixed(page, dir, name, Math.round((ms / 1000) * 60), crop, until);
    const occ = await page.evaluate(() => (window as unknown as { __haidao: { occluded?(): number } }).__haidao.occluded?.() ?? 0);
    console.log(`${name}：${u.kind} #${u.id}，${n} 帧（开局以来画过遮挡剪影 ${occ} 帧）`);
  };
  const byHp = (a: RecUnit, b: RecUnit): number => a.hp / a.maxHp - b.hp / b.maxHp;
  for (let kind of REC_KINDS) {
    // 只放 3 个，镜头里不叠成一团（--rec-kinds sailor:4 可改）
    const { page, cdp, close } = await open(`${ROOT}?battle=${REC_LEVEL}&auto&devarmy=${kind.includes(':') ? kind : `${kind}:3`}&${q}`);
    kind = kind.split(':')[0]!;
    await hideUi(page);
    await clip(page, cdp, `battle-${kind}-walk`, await pick(page, (u) => u.kind === kind && u.mode === 'move', 30_000), REC_SECS * 1000);
    // 攻击挑站在建筑前面的（跟拍时建筑半透明，但站前面看得最清楚），其中血最多的（血少的录不完就倒了）；等不到再挑血最多的
    const hpFirst = (a: RecUnit, b: RecUnit): number => byHp(b, a);
    const atk = (await pick(page, (u) => u.kind === kind && u.mode === 'attack' && u.front === true && u.hp > u.maxHp * 0.6, 8_000, hpFirst)) ?? (await pick(page, (u) => u.kind === kind && u.mode === 'attack', 20_000, hpFirst));
    await clip(page, cdp, `battle-${kind}-attack`, atk, REC_SECS * 1000);
    const d = await pick(page, (u) => u.kind === kind && u.mode !== 'dead' && u.hp < u.maxHp * 0.5, 60_000, byHp);
    await clip(page, cdp, `battle-${kind}-die`, d, 12_000, d ? untilGone(page, d.id) : undefined);
    await close();
  }
  if (REC_TD.length) {
    const { page, cdp, close } = await open(`${ROOT}?dev&${q}`);
    await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(3));
    await sleep(900);
    await page.locator('.hd-bottom button:has-text("守岛")').first().click({ timeout: 8000 });
    await sleep(500);
    await page.locator('.hd-tdtab[data-chapter="1"]').first().click({ timeout: 8000 });
    await sleep(300);
    await page.locator('.hd-tdcard button[data-level="td03"]').first().click({ timeout: 8000 });
    await page.locator('.hd-tdgar-go').first().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.scene === 'td', null, { timeout: 90_000 });
    await sleep(1200);
    const inf = await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.tdInfo?.());
    const sl = inf?.slots[0];
    if (sl) {
      const p = await page.evaluate(([x, y]) => (window as unknown as { __haidao: Hook }).__haidao.tdPt?.(x, y), [sl.x, sl.y] as const);
      if (p) await page.mouse.click(p.x, p.y);
      await sleep(400);
      await page.locator('.hd-td-tower[data-kind="cannon"]').first().click({ timeout: 8000 }).catch(() => undefined);
      await sleep(400);
      // 造完面板还开着（显示升级），收起来才点得到叫波
      if (await page.locator('.hd-td-sheet .hd-x').count()) await page.locator('.hd-td-sheet .hd-x').first().click({ timeout: 5000 }).catch(() => undefined);
      await sleep(300);
    }
    await page.locator('.hd-td-call').first().click({ timeout: 8000 });
    await hideUi(page);
    const seen = new Set<string>();
    for (const want of REC_TD) {
      const u = await pick(page, (x) => (want === 'any' || x.kind === want) && x.mode === 'in' && !seen.has(x.kind), 40_000);
      if (u) seen.add(u.kind);
      await clip(page, cdp, `td-${u?.kind ?? want}-walk`, u, REC_SECS * 1000);
    }
    const d = await pick(page, (u) => u.hp < u.maxHp * 0.5, 40_000, byHp);
    await clip(page, cdp, `td-${d?.kind ?? 'enemy'}-die`, d, 12_000, d ? untilGone(page, d.id) : undefined);
    await close();
  }
  type RecTower = { id: number; kind: string; level: number; slot: number; aim: boolean; near: boolean; x: number; y: number; tx?: number; ty?: number };
  const towers = (page: Page): Promise<RecTower[]> => page.evaluate(() => (window as unknown as { __haidao: { towers?(): RecTower[] } }).__haidao.towers?.() ?? []);
  /** 等一座塔有人靠近（进 1.5 倍射程），镜头定在它上面录 --rec-secs 秒；裁剪放宽，弹道和落点也在画面里 */
  const towerClip = async (page: Page, name: string, f: (t: RecTower) => boolean, z = REC_TZOOM): Promise<void> => {
    let t: RecTower | undefined;
    for (const t0 = Date.now(); Date.now() - t0 < 90_000 && !t; await sleep(50)) t = (await towers(page)).find((x) => f(x) && x.near);
    if (!t) {
      problems.push(`录屏：${name} 没等到有敌人靠近的塔`);
      return;
    }
    await page.evaluate(([x, y, z]) => (window as unknown as { __haidao: { lookAt?(x: number, y: number, z: number): void } }).__haidao.lookAt?.(x, y, z), [t.tx ? t.x * 0.62 + t.tx * 0.38 : t.x, t.ty ? t.y * 0.62 + t.ty * 0.38 + 6 : t.y + 10, z] as const);
    await sleep(200);
    const n = await recordFixed(page, dir, name, Math.round(REC_SECS * 60), { w: 0.96, h: 0.92, up: 0.02 });
    console.log(`${name}：${t.kind} ${t.level} 级 #${t.id}，${n} 帧`);
  };
  for (const item of REC_TOWERS) {
    // 种类:缩放（gunTower:1.4）单独给这一段的镜头缩放
    const [want = '', zs] = item.split(':');
    const tz = zs ? Number(zs) : REC_TZOOM;
    if (want === 'battle') {
      const { page, close } = await open(`${ROOT}?battle=${REC_LEVEL}&auto&${q}`);
      await hideUi(page);
      await towerClip(page, 'battle-tower', (t) => t.kind === 'cannon' || t.kind === 'mortar' || t.kind === 'gunTower', tz);
      await close();
      continue;
    }
    const { page, close } = await open(`${ROOT}?dev&${q}`);
    await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(3));
    await sleep(900);
    await page.locator('.hd-bottom button:has-text("守岛")').first().click({ timeout: 8000 });
    await sleep(500);
    await page.locator('.hd-tdtab[data-chapter="1"]').first().click({ timeout: 8000 });
    await sleep(300);
    await page.locator('.hd-tdcard button[data-level="td03"]').first().click({ timeout: 8000 });
    await page.locator('.hd-tdgar-go').first().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.scene === 'td', null, { timeout: 90_000 });
    await sleep(1200);
    // td03 的 0 号木台在敌人必经的路边（射程最短的喷火塔也够得着）；--rec-slot 可换
    const inf = await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.tdInfo?.());
    const sl = inf?.slots[Number(opt('--rec-slot') ?? 0)];
    if (sl) {
      const p = await page.evaluate(([x, y]) => (window as unknown as { __haidao: Hook }).__haidao.tdPt?.(x, y), [sl.x, sl.y] as const);
      if (p) await page.mouse.click(p.x, p.y);
      await sleep(400);
      await page.locator(`.hd-td-tower[data-kind="${want}"]`).first().click({ timeout: 8000 }).catch(() => problems.push(`录屏：造不了 ${want}`));
      await sleep(400);
      if (await page.locator('.hd-td-sheet .hd-x').count()) await page.locator('.hd-td-sheet .hd-x').first().click({ timeout: 5000 }).catch(() => undefined);
      await sleep(300);
    }
    await page.locator('.hd-td-call').first().click({ timeout: 8000 });
    await hideUi(page);
    // 喷火塔射程短：等它真喷起来再录（起势在录像开头）；其余塔有敌人靠近就录（看得到提前转向）
    await towerClip(page, `td-tower-${want}`, (t) => t.kind === want && t.slot >= 0 && (want !== 'flame' || t.aim), tz);
    await close();
  }
}

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu', '--autoplay-policy=no-user-gesture-required'] });
const problems: string[] = [];
/** 假服务端故意回 409 need_reload 的那一步：浏览器会把 4xx 记成控制台 error，这一步里放过 */
let allow409 = false;
try {
  if (REC) await recordAll(REC);
  else for (const v of VIEWS) {
    if (!ONLY.includes(v.name)) continue;
    const ctx = await browser.newContext(v);
    const page = await ctx.newPage();
    const sfxDone = trackSfx(page);
    page.on('console', (m) => {
      if (m.type() === 'error' && !/GL Driver Message/.test(m.text()) && !(allow409 && /status of 409/.test(m.text()))) problems.push(`${v.name} 控制台报错：${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`${v.name} 未捕获异常：${e.message}`));
    const ready = async (): Promise<void> => {
      try {
        await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.ready === true, null, { timeout: 60_000 });
      } catch (e) {
        // 没就绪：把截图和已收集的报错先吐出来，再失败
        await page.screenshot({ path: join(OUT, `${v.name}-stuck.png`) }).catch(() => {});
        console.error(`${v.name} 没就绪，场景 ${(await hook(page).catch(() => ({}) as Hook)).scene}，载入文字：${await page.locator('#boot').textContent().catch(() => '')}`);
        console.error(problems.join('\n'));
        throw e;
      }
    };

    if (FLOW || VIEWS_MODE || PVP || TD || TDLIVE || ESCORTLIVE || MAPLIVE || TIDE || MAP || HOME || ESCORT || CAM) {
      let n = 0;
      const shot = async (name: string): Promise<void> => {
        // 结算页有入场动画（星星依次落、战利品滚动、按钮最后淡入），等演完再截
        if (name.includes('result')) await page.waitForTimeout(3200);
        await page.screenshot({ path: join(OUT, `${v.name}-${String(++n).padStart(2, '0')}-${name}.png`) });
      };
      const tap = async (x: number, y: number): Promise<void> => {
        if (v.hasTouch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
      };
      const sceneIs = (s: string, ms = 20_000): Promise<unknown> => page.waitForFunction((w) => (window as unknown as { __haidao?: Hook }).__haidao?.scene === w, s, { timeout: ms });
      const step = async (name: string, f: () => Promise<void>): Promise<boolean> => {
        try {
          await f();
          return true;
        } catch (e) {
          problems.push(`${v.name} 流程「${name}」失败：${(e as Error).message.split('\n')[0]}`);
          await page.screenshot({ path: join(OUT, `${v.name}-${String(++n).padStart(2, '0')}-FAIL-${name}.png`) }).catch(() => {});
          return false;
        }
      };
      const click = (sel: string): Promise<void> => page.locator(sel).first().click({ timeout: 8000 });
      const where = (k: string): Promise<{ x: number; y: number } | null> => page.evaluate((kk) => (window as unknown as { __haidao: Hook }).__haidao.where?.(kk) ?? null, k);
      const beach = (i: number): Promise<{ x: number; y: number } | null> => page.evaluate((ii) => (window as unknown as { __haidao: Hook }).__haidao.beach?.(ii) ?? null, i);

      if (VIEWS_MODE) {
        const ok =
          (await step('基地', async () => {
            await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
            await ready();
            await page.waitForTimeout(800);
            await shot('base');
            for (const p of await layoutProblems(page)) problems.push(`${v.name} 基地 ${p}`);
          })) &&
          (await step('海图', async () => {
            // 星数给够，海图上才有首领岛可点
            await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.give(9000, 9000, 30));
            await page.waitForTimeout(400);
            await click('.hd-bottom button:has-text("出海")');
            await page.waitForTimeout(600);
            await shot('map');
            await click('.hd-map .hd-node:has(.hd-num:text-is("1"))');
            await page.waitForTimeout(400);
            await shot('map-island');
            if (await page.locator('.hd-map .hd-sheet button:has-text("侦察")').count()) {
              await click('.hd-map .hd-sheet button:has-text("侦察")');
              await page.waitForTimeout(800);
              await shot('scout');
              await click('.hd-scout .hd-x');
              await page.waitForTimeout(300);
            }
            await click('.hd-map .hd-sheet .hd-x');
            if (await page.locator('.hd-bounty').count()) {
              await click('.hd-bounty');
              await page.waitForTimeout(400);
              await shot('bounty');
              await click('.hd-map .hd-sheet .hd-x');
            }
            await page.locator('.hd-node.boss').first().scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
            await click('.hd-node.boss');
            await page.waitForTimeout(500);
            await shot('map-boss');
            await click('.hd-map .hd-sheet .hd-x');
            await click('.hd-map-close');
            await page.waitForTimeout(300);
            if (await page.locator('.hd-profile').count()) {
              // 星数和成就收在个人面板里：顶栏的船长钮 → 船长档案 → 成就和称号
              await click('.hd-profile');
              await page.waitForTimeout(400);
              await shot('profile');
              await click('.hd-sheet button:has-text("成就和称号")');
              await page.waitForTimeout(400);
              await shot('achievements');
              await click('.hd-sheet .hd-tabs button:has-text("收藏")');
              await page.waitForTimeout(400);
              await shot('collection');
              await click('.hd-sheet .hd-x');
            }
          })) &&
          (await step('建造列表', async () => {
            await click('.hd-bottom button:has-text("建造")');
            await page.waitForTimeout(500);
            await shot('build-list');
            await click('.hd-sheet button:has-text("推荐布局")');
            await page.waitForTimeout(700);
            await shot('presets');
            await click('.hd-sheet .hd-x');
          })) &&
          (await step('主寨面板和升级庆祝', async () => {
            await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.give(9000, 9000, 30));
            await page.waitForTimeout(400);
            const h = await where('hq');
            if (!h) throw new Error('找不到主寨');
            await tap(h.x, h.y);
            await page.waitForTimeout(500);
            // 手机点建筑弹操作环再点「信息」；电脑左键单击直接开右侧信息面板
            if (v.hasTouch) {
              await shot('hq-ring');
              await click('.hd-rmenu [data-ring=info]');
              await page.waitForTimeout(400);
            }
            await shot('hq-panel');
            await click('.hd-sheet .hd-upbtn');
            // 解锁弹窗等升级演出（约 2 秒）播完才出
            await page.locator('.hd-celebrate').waitFor({ timeout: 15_000 });
            await page.waitForTimeout(1200);
            await shot('celebrate');
            await click('.hd-mask button:has-text("去看看")');
            await page.waitForTimeout(1500);
            await shot('celebrate-badge');
            if (await page.locator('.hd-badge button').count()) await click('.hd-badge button');
          })) &&
          (await step('战斗和结算', async () => {
            await page.goto(`${ROOT}?battle=${LEVEL}&auto&fast&dev${HQ ? `&${HQ}` : ''}`, { timeout: 60_000 });
            await ready();
            if ((await hook(page)).level !== LEVEL) throw new Error(`?battle=${LEVEL} 打开的不是这一关`);
            await page.waitForTimeout(2500);
            await shot('battle');
            await sceneIs('result', 90_000);
            await page.waitForTimeout(1500);
            await shot('result');
            for (const p of await layoutProblems(page)) problems.push(`${v.name} 结算 ${p}`);
          })) &&
          (await step('首领战斗', async () => {
            // c15 迷雾（雾里的建筑只能是一团雾）、c10 海怪、c30 终局岛；每关先截开场俯瞰，再截战斗中
            for (const id of ['c15', 'c10', 'c30']) {
              await page.goto(`${ROOT}?battle=${id}&auto&fast&dev${HQ ? `&${HQ}` : ''}`, { timeout: 60_000 });
              await ready();
              const got = (await hook(page)).level;
              if (got !== id) throw new Error(`?battle=${id} 打开的却是 ${got}`);
              await page.waitForTimeout(700);
              await shot(`boss-intro-${id}`);
              await page.waitForTimeout(4500);
              await shot(`boss-battle-${id}`);
            }
          }));
        await sfxDone();
      await ctx.close();
        console.log(`${v.name}：界面 ${ok ? '截完' : '中断'}`);
        continue;
      }

      if (TD) {
        // 守岛：真人点一遍第一章第 1 关（不是机器人代打）：建临时塔 → 选分叉 → 英雄走位 → 放技能 → 提前叫波 → 打完 → 结算
        const call = <T>(f: string, ...a: unknown[]): Promise<T> => page.evaluate(([fn, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[fn as string]!(...(args as unknown[])), [f, a]) as Promise<T>;
        const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
        const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
        };
        const ok =
          (await step('进基地', async () => {
            await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
            await ready();
            await page.evaluate((hq) => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(hq), TD_HQ);
            await page.waitForTimeout(900);
            await shot('base-td-entry');
            await check('基地');
          })) &&
          (await step('选关页', async () => {
            await click('.hd-bottom button:has-text("守岛")');
            await page.waitForTimeout(500);
            await shot('level-select');
            await check('选关页');
          })) &&
          (await step('进守岛', async () => {
            // 选关页分章、默认停在打到的那一章：先点到这一关所在的章节标签
            await click(`.hd-tdtab[data-chapter="${TD_CHAPTER}"]`);
            await page.waitForTimeout(300);
            if (TD_LEVEL !== 'td01') await shot('level-select-ch');
            await click(`.hd-tdcard button[data-level="${TD_LEVEL}"]`);
            await page.waitForTimeout(600);
            // 带驻守台的关先弹选塔面板：截一张，换挑第二种塔（有的话）再开打
            if (await page.locator('.hd-tdgar').count()) {
              await shot('garrison-pick');
              await check('驻守台选塔');
              const cards = page.locator('.hd-tdgar-spot').first().locator('.hd-tdgar-card');
              if ((await cards.count()) > 2) await cards.nth(1).click();
              await page.waitForTimeout(250);
              await shot('garrison-picked');
              if (v.hasTouch) await click('.hd-tdgar-go');
              else await page.keyboard.press('Space');
            } else if (TD_LV?.garrison.length) throw new Error('这一关有驻守台，却没弹选塔面板');
            await sceneIs('td', 40_000);
            await page.waitForTimeout(1500);
            await shot('td-start');
            await check('守岛开场');
          })) &&
          (await step('预告和路线', async () => {
            const inf = await info();
            if (TD_LV?.garrison.length && !inf.slots.some((q) => q.garrison && q.tower >= 0)) throw new Error('驻守台上没有塔');
            if (inf.flags < 1 || inf.routes < 1) throw new Error(`地图上没有预告旗 / 路线：旗 ${inf.flags}，路线 ${inf.routes}`);
            const txt = (await page.locator('.hd-td-plan').textContent()) ?? '';
            if (!/第 1\/\d+ 波/.test(txt)) throw new Error(`预告卡没写第几波：${txt}`);
            if (!/建议：/.test(txt)) throw new Error(`预告卡没写建议：${txt}`);
            await shot('preview');
            await click('.hd-td-plan');
            await page.waitForTimeout(400);
            if (!(await page.locator('.hd-td-best .hd-ctr-tb').isVisible())) throw new Error('敌人图鉴里没有展开的克制表');
            await shot('bestiary-counter');
            await check('敌人图鉴');
            await click('.hd-td-best .hd-x');
            await page.waitForTimeout(250);
          })) &&
          (await step('建塔和克制表', async () => {
            const inf = await info();
            const si = inf.slots.findIndex((q) => q.tower < 0 && !q.wreck);
            if (si < 0) throw new Error('没有空的木台');
            const sl = inf.slots[si]!;
            const p = await pt(sl.x, sl.y);
            await tap(p.x, p.y);
            await page.waitForTimeout(400);
            await shot('build-menu');
            await check('建塔菜单');
            await click('.hd-td-sheet .hd-ctr-tog');
            await page.waitForTimeout(300);
            await shot('build-counter');
            // 克制表点开后只留表（0.30.3 起一屏放下），先收起才看得到塔卡
            await click('.hd-td-sheet .hd-ctr-off');
            await page.waitForTimeout(300);
            // 电脑用数字键选塔（建塔菜单开着时 1 = 第一种），手机点卡片
            if (v.hasTouch) await click('.hd-td-tower[data-kind="cannon"]');
            else await page.keyboard.press(String((await page.locator('.hd-td-tower').evaluateAll((els) => els.findIndex((e) => (e as HTMLElement).dataset.kind === 'cannon'))) + 1));
            await page.waitForTimeout(600);
            if ((await info()).slots[si]!.tower < 0) throw new Error('没造出塔');
            await tap(p.x, p.y);
            await page.waitForTimeout(500);
            await shot('tower-panel');
            await click('.hd-td-up');
            await page.waitForTimeout(600);
            await shot('tower-up');
            // 卖塔：按两下（第一下变红确认）
            const gold0 = (await info()).gold;
            await click('.hd-td-sell');
            // 第一下之后面板按下一帧重画成红色的"再点一下确认"（2 秒内有效）；先截这一张
            await page.locator('.hd-td-sell.arm').first().waitFor({ timeout: 1500 });
            await shot('sell-confirm');
            // 截图在负载高、手机横屏画面大时会超过 2 秒的确认窗口：过期了就重新上膛，上膛后立刻点第二下（真人点法在 844×390 上实测两下就卖掉）
            for (let k = 0; k < 3 && (await info()).slots[si]!.tower >= 0; k++) {
              if ((await page.locator('.hd-td-sell.arm').count()) === 0) {
                await click('.hd-td-sell');
                await page.locator('.hd-td-sell.arm').first().waitFor({ timeout: 1500 });
              }
              await click('.hd-td-sell');
              await page
                .waitForFunction((i) => ((window as unknown as { __haidao: Hook }).__haidao.tdInfo?.()?.slots[i]?.tower ?? 0) < 0, si, { timeout: 3000 })
                .catch(() => undefined);
            }
            const after = await info();
            if (after.slots[si]!.tower >= 0) throw new Error('卖了塔还在');
            if (after.gold <= gold0) throw new Error(`卖塔没退钱：${gold0} → ${after.gold}`);
            await shot('sold');
            // 再造回一座，好守
            await tap(p.x, p.y);
            await page.waitForTimeout(400);
            await click('.hd-td-tower[data-kind="cannon"]');
            await page.waitForTimeout(400);
            if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
          })) &&
          (await step('清障', async () => {
            const inf = await info();
            const wi = inf.slots.findIndex((q) => q.wreck);
            if (wi < 0) return;
            const w = inf.slots[wi]!;
            const p = await pt(w.x, w.y);
            await tap(p.x, p.y);
            await page.waitForTimeout(400);
            await shot('wreck');
            await check('清障');
            await click('.hd-td-clear');
            await page.waitForTimeout(700);
            if ((await info()).slots[wi]!.wreck) throw new Error('付了钱沉船还在');
            if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
          })) &&
          (await step('英雄和技能', async () => {
            // 没选中英雄时点地面英雄不动（所有者嫌点哪去哪太乱）；先点底栏英雄钮再点地面才走过去
            const h0 = (await info()).hero;
            const hp = await pt(10, 7);
            await tap(hp.x, hp.y);
            await page.waitForTimeout(700);
            const h1 = (await info()).hero;
            if (Math.hypot(h1.x - h0.x, h1.y - h0.y) > 0.3) throw new Error(`没选中英雄点地面他也走了：(${h0.x.toFixed(1)},${h0.y.toFixed(1)}) → (${h1.x.toFixed(1)},${h1.y.toFixed(1)})`);
            await click('.hd-td-herobtn');
            await page.waitForTimeout(200);
            await tap(hp.x, hp.y);
            await page.waitForTimeout(900);
            const h2 = (await info()).hero;
            if (Math.hypot(h2.x - h0.x, h2.y - h0.y) < 0.3) throw new Error('选中英雄再点地面，他没动');
            await shot('hero-move');
            await page.locator('.hd-td-skill:not(.hd-td-herobtn)').nth(0).click({ timeout: 5000 });
            await page.waitForTimeout(300);
            await shot('barricade-aim');
            const inf = await info();
            const bp = await pt(inf.hero.x, inf.hero.y - 1.5);
            await tap(bp.x, bp.y);
            await page.waitForTimeout(600);
            await page.locator('.hd-td-skill:not(.hd-td-herobtn)').nth(1).click({ timeout: 5000 });
            await page.waitForTimeout(300);
            await shot('keg-aim');
            const tp = await pt(inf.hero.x + 1, inf.hero.y - 1);
            await tap(tp.x, tp.y);
            await page.waitForTimeout(900);
            await shot('skills-used');
            await check('技能');
          })) &&
          (await step('开打', async () => {
            await shot('before-call');
            // 电脑按空格开打（按钮悬停提示里写着），手机点按钮
            if (v.hasTouch) await click('.hd-td-call');
            else await page.keyboard.press('Space');
            await page.waitForTimeout(700);
            if ((await info()).wave < 1) throw new Error('开打后还在第 0 波');
            await shot('wave-banner');
            await page.waitForTimeout(6000);
            await shot('wave-fight');
            await check('战斗中');
          })) &&
          (await step('新机制出现', async () => {
            if (!TD_MECHANIC) return;
            for (let i = 0; i < 2; i++) await click('.hd-td-bar2 button:has-text("×")');
            for (let k = 0; k < 360; k++) {
              const inf = await info();
              if (inf.over || inf.jammed > 0 || inf.skilled > 0) break;
              await page.waitForTimeout(500);
            }
            await page.waitForTimeout(250);
            await shot('mechanic');
            await check('新机制');
          })) &&
          (await step('打完', async () => {
            if (!TD_MECHANIC) for (let i = 0; i < 2; i++) await click('.hd-td-bar2 button:has-text("×")');
            await page.waitForTimeout(25_000);
            await shot('fight-late');
            await sceneIs('result', 300_000);
            await page.waitForTimeout(2600);
            await shot('result');
            await check('结算');
          })) &&
          (await step('回岛', async () => {
            await click('.hd-td-result button:has-text("回岛")');
            await sceneIs('base');
            await page.waitForTimeout(800);
            await shot('home');
          }));
        await sfxDone();
      await ctx.close();
        console.log(`${v.name}：守岛 ${ok ? '走完' : '中断'}`);
        continue;
      }

      if (MAP) {
        const fake = new FakePvp();
        await fake.seed();
        await fake.route(page, problems);
        const scoreBodies: Array<{ gameId?: string; boardId?: string; score?: number }> = [];
        await page.route((u) => u.pathname === '/api/scores', async (r: Route) => {
          scoreBodies.push(JSON.parse(r.request().postData() ?? 'null'));
          await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: 4321, improved: true }) });
        });
        const save = JSON.stringify({ profile: { ...newProfile(), tutorial: 99, res: { gold: 1500, wood: 1500 }, stats: { attacks: 1, wins: 1, lootGold: 0, lootWood: 0 } }, lastSeen: Date.now() });
        await page.addInitScript((sv) => {
          if (!localStorage.getItem('haidao.save')) localStorage.setItem('haidao.save', sv);
        }, save);
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
        };
        const isDesk = !v.hasTouch;
        const recDir = opt('--rec-out') ?? OUT;
        let recorded = false;
        let stops = 0;
        let reefs = 0;
        const ok =
          (await step('今日航线卡', async () => {
            await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
            await ready();
            await page.waitForTimeout(800);
            await click('.hd-bottom button:has-text("出海")');
            await page.locator('.hd-mapcard').waitFor({ timeout: 8000 });
            await page.waitForTimeout(500);
            await shot('map-card');
            await check('海图');
            await click('.hd-mapcard');
            await page.locator('.hd-route .hd-route-node.cur').first().waitFor({ timeout: 8000 });
            await page.waitForTimeout(600);
            await shot('route');
            await check('航线图');
            // 船队一行（船多时换行）：每张卡都完整在屏内
            const out = await page.evaluate(() => [...document.querySelectorAll('.hd-route-crew, .hd-route-energy')].filter((e) => { const r = e.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth || r.width === 0; }).length);
            if (out) throw new Error(`船队有 ${out} 张卡出屏`);
            if (isDesk) {
              // 电脑悬停：节点卡放大高亮
              await page.locator('.hd-route-node.cur').first().hover();
              await page.waitForTimeout(350);
              await shot('route-hover');
            }
          })) &&
          (await step('走航线', async () => {
            for (let guard = 0; guard < 8; guard++) {
              if (await page.locator('.hd-route-end').count()) break;
              await page.locator('.hd-route .hd-route-node.cur').first().waitFor({ timeout: 15_000 });
              await page.waitForTimeout(400);
              const cur = page.locator('.hd-route-node.cur');
              const n = await cur.count();
              const reefAt = await cur.evaluateAll((els) => els.findIndex((e) => e.classList.contains('reef')));
              // 有补给礁就走一次补给礁，其余打岛
              const pickReef = reefAt >= 0 && reefs === 0;
              const idx = pickReef ? reefAt : reefAt === 0 && n > 1 ? 1 : 0;
              if (isDesk && stops === 1 && n > 1) await page.keyboard.press(`Digit${idx + 1}`);
              else await cur.nth(idx).click({ timeout: 8000 });
              await page.waitForTimeout(500);
              if (pickReef) {
                reefs++;
                await shot('reef');
                await check('补给礁');
                await click('.hd-route-pick');
                await page.waitForTimeout(1800);
                await shot('reef-done');
                continue;
              }
              if (stops === 0 || stops === 1) {
                // 第二站休整一条船
                if (stops === 1) {
                  const rb = page.locator('.hd-route-restbtn:not(:disabled)');
                  if (await rb.count()) await rb.first().click();
                  await page.waitForTimeout(300);
                }
                await shot(`prep-${stops + 1}`);
                await check('整备');
              }
              if (isDesk && stops === 1) await page.keyboard.press('Enter');
              else await click('.hd-route-bottom button:has-text("出发")');
              await sceneIs('battle', 40_000);
              stops++;
              await page.waitForTimeout(600);
              if (stops === 1) await shot('stop-intro');
              // 收起开场的射程提示
              const vp = page.viewportSize()!;
              await tap(vp.width / 2, vp.height / 2);
              await page.waitForTimeout(400);
              // 终点站留一条船不登陆：船队不会全灭，终局走"打下终点"的宝箱演出（录像要它）
              const last = /第 4\/4 站/.test((await page.locator('.hd-mapstrip').textContent()) ?? '');
              const boats = await page.locator('.hd-boat').count();
              for (let i = 0; i < boats + 2; i++) {
                const left = await page.locator('.hd-boat:not(.done)').count();
                if (left === 0 || (last && left <= 1)) break;
                if ((await page.locator('.hd-boat.sel').count()) === 0) await click('.hd-boat:not(.done)');
                await page.waitForTimeout(200);
                const bp = await beach(i % 2);
                if (!bp) throw new Error('没有海滩点');
                await tap(bp.x, bp.y);
                await page.waitForTimeout(300);
              }
              const sk = page.locator('.hd-skill:not(.off)');
              if (await sk.count()) {
                await sk.first().click({ timeout: 5000 });
                const h = await where('hq');
                if (h) await tap(h.x, h.y);
              }
              await page.waitForTimeout(2500);
              if (stops <= 2) {
                await shot(`stop-${stops}`);
                await check('航线站');
                if (!/第 \d\/4 站/.test((await page.locator('.hd-mapstrip').textContent()) ?? '')) throw new Error('顶栏没有"第 N/4 站"');
              }
              await page.locator('.hd-route-mid').waitFor({ timeout: 90_000 });
              await page.locator('.hd-route-mid .hd-row.on').waitFor({ timeout: 15_000 });
              await page.waitForTimeout(200);
              await shot(`mid-${stops}`);
              await check('站间条');
              if (await page.locator('.hd-route-mid button:has-text("继续")').count()) {
                await click('.hd-route-mid button:has-text("继续")');
                await sceneIs('base', 30_000);
                await page.waitForTimeout(900);
                if (stops === 1) await shot('route-after');
              } else {
                // 最后一站（或船队打光）：从这里起录终局演出
                if (v.name === 'desktop' && !recorded) {
                  recorded = true;
                  const fr = await recordFixed(page, recDir, 'map-final', 420, { w: 1, h: 1 }, async () => (await page.locator('.hd-route-result').count()) > 0, 30);
                  console.log(`录了终局演出 ${fr} 帧：${join(recDir, 'map-final.webm')}`);
                } else {
                  await page.locator('.hd-route-end').waitFor({ timeout: 15_000 });
                  await page.waitForTimeout(1700);
                  await shot('final-show');
                }
                break;
              }
            }
          })) &&
          (await step('结算交榜', async () => {
            await page.locator('.hd-route-result').waitFor({ timeout: 30_000 });
            await shot('final-result');
            await check('航线结算');
            const txt = (await page.locator('.hd-route-result').textContent()) ?? '';
            if (!/宝分 [\d,]+/.test(txt)) throw new Error(`结算没有宝分：${txt}`);
            const loc = await page.evaluate(() => localStorage.getItem('haidao.map'));
            const best = (JSON.parse(loc ?? '{}') as { best?: number; state?: unknown }).best ?? -1;
            if (best < 0 || (JSON.parse(loc ?? '{}') as { state?: unknown }).state) throw new Error(`haidao.map 不对：${loc}`);
            if (best > 0) {
              if (scoreBodies.length !== 1) throw new Error(`交分次数不对：${scoreBodies.length}`);
              const b = scoreBodies[0]!;
              if (b.gameId !== 'haidao' || !/^daily-\d{4}-\d{2}-\d{2}-map$/.test(b.boardId ?? '') || b.score !== best) throw new Error(`交分请求体不对：${JSON.stringify(b)}`);
            } else if (scoreBodies.length) throw new Error('0 宝分不该交榜');
            console.log(`${v.name}：打了 ${stops} 站、补给礁 ${reefs} 次，宝分 ${best}，交分 ${JSON.stringify(scoreBodies)}`);
          })) &&
          (await step('分享', async () => {
            await click('.hd-route-share');
            const close = page.locator('[data-key="share:close"]');
            await close.waitFor({ timeout: 10_000 });
            await page.waitForTimeout(600);
            await shot('share');
            await close.click();
            await page.waitForTimeout(300);
          })) &&
          (await step('回岛', async () => {
            await click('.hd-route-result button:has-text("回岛")');
            await sceneIs('base');
            await page.waitForTimeout(800);
            if (await page.locator('.hd-route, .hd-route-end').count()) throw new Error('航线界面没收起');
            await shot('map-home');
          }));
        await sfxDone();
        await ctx.close();
        console.log(`${v.name}：寻宝航线 ${ok ? '走完' : '中断'}`);
        continue;
      }

      if (CAM) {
        type FitInfo = { box: { l: number; r: number; t: number; b: number } | null; w: number; h: number };
        const call = <T>(f: string, ...a: unknown[]): Promise<T> => page.evaluate(([fn, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[fn as string]!(...(args as unknown[])), [f, a]) as Promise<T>;
        const fit = (): Promise<FitInfo> => call<FitInfo>('fitInfo');
        const pct = (f: FitInfo): number => (f.box ? (f.box.b - f.box.t) / f.h : 0);
        const portrait = v.viewport.height > v.viewport.width * 1.2;
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
          // 看得见的按钮两两不重叠（嵌套的不算）
          const lap = await page.evaluate(() => {
            const bs = [...document.querySelectorAll<HTMLElement>('.hd-ui button')].filter((b) => b.offsetParent && getComputedStyle(b).visibility !== 'hidden');
            const out: string[] = [];
            for (let i = 0; i < bs.length; i++) {
              for (let j = i + 1; j < bs.length; j++) {
                const a = bs[i]!, c = bs[j]!;
                if (a.contains(c) || c.contains(a)) continue;
                const p = a.getBoundingClientRect(), q = c.getBoundingClientRect();
                if (p.width && q.width && p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1) out.push(`${a.className}「${a.textContent?.trim().slice(0, 8)}」和 ${c.className}「${c.textContent?.trim().slice(0, 8)}」重叠`);
              }
            }
            return out;
          });
          for (const p of lap) problems.push(`${v.name} ${what} ${p}`);
        };
        /** 进场前在页面里挂一个逐帧的探针，记下这个场景里内容盒占屏高的最小值（竖屏开场的全景）；机器负载高时进场检测会晚，所以不靠进场后再量 */
        const probe = (scene: string): Promise<void> =>
          page.evaluate((sc) => {
            const w = window as unknown as { __minFit: number; __haidao?: { scene?: string; fitInfo?(): FitInfo } };
            w.__minFit = 9;
            const loop = (): void => {
              const f = w.__haidao?.scene === sc ? w.__haidao.fitInfo?.() : null;
              if (f?.box) w.__minFit = Math.min(w.__minFit, (f.box.b - f.box.t) / f.h);
              requestAnimationFrame(loop);
            };
            loop();
          }, scene);
        /** 推镜结束后量一次，和探针记下的开场比 */
        const intro = async (what: string): Promise<void> => {
          await page.waitForTimeout(2500);
          const f0: FitInfo = { box: { l: 0, r: 0, t: 0, b: await page.evaluate(() => (window as unknown as { __minFit: number }).__minFit) }, w: 0, h: 1 };
          const f1 = await fit();
          console.log(`${v.name} ${what}：内容盒占屏高 开场 ${Math.round(pct(f0) * 100)}% → 推镜后 ${Math.round(pct(f1) * 100)}%，左右 ${Math.round(f1.box?.l ?? 0)}..${Math.round(f1.box?.r ?? 0)} / ${f1.w}`);
          if (portrait) {
            if (pct(f1) < 0.5 || pct(f1) > 0.62) throw new Error(`竖屏推镜后内容盒占屏高 ${Math.round(pct(f1) * 100)}%，应约 60%`);
            if (pct(f0) > pct(f1) - 0.1) throw new Error('竖屏开场没有先给整岛全景');
          } else if (!f1.box || f1.box.l < -1 || f1.box.r > f1.w + 1 || f1.box.t < -1 || f1.box.b > f1.h + 1) throw new Error('电脑上内容盒没有完整在屏内');
        };
        const ok =
          (await step('守岛开场', async () => {
            await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
            await ready();
            await page.evaluate((hq) => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(hq), TD_HQ);
            await page.waitForTimeout(900);
            await click('.hd-bottom button:has-text("守岛")');
            await page.waitForTimeout(500);
            await click(`.hd-tdtab[data-chapter="${TD_CHAPTER}"]`);
            await page.waitForTimeout(300);
            await probe('td');
            await click(`.hd-tdcard button[data-level="${TD_LEVEL}"]`);
            await page.waitForTimeout(600);
            if (await page.locator('.hd-tdgar').count()) {
              if (v.hasTouch) await click('.hd-tdgar-go');
              else await page.keyboard.press('Space');
            }
            await sceneIs('td', 40_000);
            await intro('守岛');
            await shot('cam-td-start');
            await check('守岛开场');
          })) &&
          (!portrait ||
            ((await step('屏外箭头', async () => {
              await click('.hd-td-call');
              await page.waitForFunction(() => ((window as unknown as { __haidao: { units?(): unknown[] } }).__haidao.units?.() ?? []).length > 0, null, { timeout: 30_000 });
              await page.waitForTimeout(1500);
              const edge = page.locator('.hd-td-edge:not(.slot):not(.gate):visible');
              // 单指拖开：先往右拖（看左边），没有箭头再往左拖
              for (const dx of [240, -480, -240]) {
                await page.mouse.move(195, 460);
                await page.mouse.down();
                await page.mouse.move(195 + dx, 460, { steps: 10 });
                await page.mouse.up();
                await page.waitForTimeout(500);
                if (await edge.count()) break;
              }
              const n = await edge.count();
              if (!n) throw new Error('拖开以后屏幕边上没有敌人箭头');
              await shot('cam-td-edge');
              await check('屏外箭头');
              const b0 = (await fit()).box!;
              await edge.first().click();
              await page.waitForTimeout(700);
              const b1 = (await fit()).box!;
              if (Math.abs(b1.l - b0.l) < 20 && Math.abs(b1.t - b0.t) < 20) throw new Error('点了箭头镜头没动');
              console.log(`${v.name}：屏边敌人箭头 ${n} 个、空木台小标 ${await page.locator('.hd-td-edge.slot:visible').count()} 个，点箭头镜头移了 ${Math.round(b1.l - b0.l)},${Math.round(b1.t - b0.t)}`);
            })) &&
              (await step('登陆战开场', async () => {
                await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
                await ready();
                await page.waitForTimeout(800);
                await click('.hd-bottom button:has-text("出海")');
                await page.waitForTimeout(500);
                await click('.hd-map .hd-node:has(.hd-num:text-is("1"))');
                await page.waitForTimeout(400);
                await probe('battle');
                await click('.hd-map .hd-sheet button:has-text("出发")');
                await sceneIs('battle');
                await intro('登陆战');
                await shot('cam-battle-start');
                await check('登陆战开场');
              }))));
        await sfxDone();
        await ctx.close();
        console.log(`${v.name}：镜头 ${ok ? '走完' : '中断'}`);
        continue;
      }

      if (ESCORT) {
        // 护航：海图的护航卡 → 选图和难度 → 开局 → 停 / 冲 / 修船 / 跟随、造一座塔 → 4 倍速打到结束 → 结算 → 回岛
        const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
        const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
        const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
        };
        const paceOn = async (): Promise<string> => (await page.locator('.hd-esc-pbtn.on').first().getAttribute('data-pace')) ?? '';
        const ok =
          (await step('进基地', async () => {
            await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
            await ready();
            await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(5));
            await page.waitForTimeout(900);
            await click('.hd-bottom button:has-text("出海")');
            await page.locator('.hd-esc-card').waitFor({ timeout: 8000 });
            await page.waitForTimeout(500);
            await shot('escort-card');
            await check('海图护航卡');
          })) &&
          (await step('选图选难度', async () => {
            await click('.hd-esc-card');
            await page.locator('.hd-esc-sel').waitFor({ timeout: 8000 });
            await page.waitForTimeout(500);
            if ((await page.locator('.hd-esc-map').count()) < 1) throw new Error('选图页没有图');
            if ((await page.locator('.hd-esc-diff').count()) !== 3) throw new Error('难度不是三档');
            await shot('escort-select');
            await check('护航选图页');
            await click('.hd-esc-diff[data-diff="easy"]');
            await shot('escort-select-easy');
          })) &&
          (await step('开局', async () => {
            await click('.hd-esc-go');
            await sceneIs('td', 40_000);
            await page.waitForTimeout(2500);
            if ((await page.locator('.hd-esc-hull').count()) !== 1) throw new Error('顶栏没有商船血条');
            if ((await page.locator('.hd-esc-pbtn').count()) !== 3) throw new Error('速度钮不是三个');
            if ((await page.locator('.hd-esc-pbtn.on').count()) !== 1) throw new Error('当前档没有高亮');
            await shot('escort-start');
            await check('护航开场');
          })) &&
          (await step('造两座塔', async () => {
            // 开局倒数很快，没塔第一波上岸船就沉了：先造两座塔再点操作钮（造塔时游戏暂停）
            for (let k = 0; k < 2; k++) {
              const inf = await info();
              const si = inf.slots.findIndex((q) => q.tower < 0 && !q.wreck);
              if (si < 0) throw new Error('没有空的木台');
              // 竖屏镜头在跟船，木台的屏幕位置会动：点不开面板就重新取坐标再点（最多 4 次）
              for (let t = 0; t < 4 && !(await page.locator('.hd-td-tower[data-kind="cannon"]').count()); t++) {
                const p = await pt(inf.slots[si]!.x, inf.slots[si]!.y);
                await tap(p.x, p.y);
                await page.waitForTimeout(400);
              }
              if (k === 0) {
                await shot('escort-build-sheet');
                await check('护航造塔面板');
              }
              await click('.hd-td-tower[data-kind="cannon"]');
              await page.waitForTimeout(600);
              if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
            }
          })) &&
          (await step('停冲修船跟随', async () => {
            await click('.hd-esc-pbtn[data-pace="hold"]');
            await page.waitForTimeout(500);
            if ((await paceOn()) !== 'hold') throw new Error('点停之后高亮没跟过去');
            await click('.hd-esc-pbtn[data-pace="rush"]');
            await page.waitForTimeout(500);
            if ((await paceOn()) !== 'rush') throw new Error('点冲之后高亮没跟过去');
            for (const q of await page.locator('.hd-esc-pbtn, .hd-esc-mend, .hd-esc-follow').all()) {
              const b = await q.boundingBox();
              if (b && (b.width < 44 || b.height < 44)) problems.push(`${v.name} 护航按钮小于 44：${Math.round(b.width)}×${Math.round(b.height)}`);
            }
            await click('.hd-esc-follow');
            await page.waitForTimeout(300);
            if (await page.locator('.hd-esc-mend:not([disabled])').count()) await click('.hd-esc-mend');
            await click('.hd-esc-pbtn[data-pace="sail"]');
            await shot('escort-controls');
            await check('护航操作钮');
          })) &&
          (await step('开打', async () => {
            await click('.hd-td-call');
            await page.waitForTimeout(3000);
            await shot('escort-fight');
            await check('护航战斗中');
          })) &&
          (await step('打到结束', async () => {
            for (let i = 0; i < 2; i++) await click('.hd-td-bar2 button:has-text("×")');
            const done = await page.locator('.hd-esc-result').waitFor({ timeout: 300_000 }).then(() => true, () => false);
            if (!done) {
              await click('.hd-td-bar2 button:has-text("撤退")');
              await click('.hd-dialog button:has-text("撤退")');
              await page.locator('.hd-esc-result').waitFor({ timeout: 20_000 });
            }
            await page.waitForTimeout(3200);
            await shot('escort-result');
            await check('护航结算');
            const txt = (await page.locator('.hd-esc-result').textContent()) ?? '';
            if (!/(到港|沉没|误了潮)/.test(txt)) throw new Error(`结算标题不对：${txt}`);
            if (!/\d+%/.test(txt)) throw new Error('结算没有剩余血量百分比');
            if (!/\d 星 · 走了 \d+ 格 · 修了 \d+ 次/.test(txt)) throw new Error(`结算小字不对：${txt}`);
          })) &&
          (await step('回岛', async () => {
            await click('.hd-esc-result button:has-text("回岛")');
            await sceneIs('base');
            await page.waitForTimeout(800);
            await shot('escort-back');
          })) &&
          (await step('减少动效：中途撤退、刷新回基地', async () => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
            await ready();
            await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(5));
            await page.waitForTimeout(900);
            await click('.hd-bottom button:has-text("出海")');
            await click('.hd-esc-card');
            await page.locator('.hd-esc-sel').waitFor({ timeout: 8000 });
            await click('.hd-esc-go');
            await sceneIs('td', 40_000);
            await page.waitForTimeout(1500);
            await click('.hd-td-bar2 button:has-text("撤退")');
            await click('.hd-dialog button:has-text("撤退")');
            await page.locator('.hd-esc-result').waitFor({ timeout: 20_000 });
            await page.waitForTimeout(3200);
            await shot('escort-retreat-result');
            await check('护航撤退结算（减少动效）');
            await page.reload({ timeout: 60_000 });
            await ready();
            await sceneIs('base');
            await shot('escort-reload-base');
            await page.emulateMedia({ reducedMotion: 'no-preference' });
          }));
        await sfxDone();
        await ctx.close();
        console.log(`${v.name}：护航 ${ok ? '走完' : '中断'}`);
        continue;
      }

      if (HOME) {
        // 海盗来袭：守自己的岛（dev 示范岛），真人点：选关页入口 → 开局 → 造塔、英雄、开打 → 4 倍速撑到结束（4 分钟没完就撤退）→ 结算（不算星）→ 回岛
        const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
        const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
        const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
        };
        const ok =
          (await step('进基地', async () => {
            await page.goto(`${ROOT}?dev&fast`, { timeout: 60_000 });
            await ready();
            await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(5));
            await page.waitForTimeout(900);
            await click('.hd-bottom button:has-text("守岛")');
            await page.locator('.hd-homecard').waitFor({ timeout: 8000 });
            await page.waitForTimeout(400);
            await shot('td-select-home');
            await check('守岛选关页');
          })) &&
          (await step('开局', async () => {
            await click('.hd-homecard button[data-home]');
            await sceneIs('td', 40_000);
            await page.waitForTimeout(1500);
            if (!/波 0\/\d+|第 1 波待开/.test((await page.locator('.hd-td-bar').textContent()) ?? '')) throw new Error('顶栏没有显示波数');
            const inf = await info();
            if (inf.flags < 1) throw new Error('海盗来袭开局没有预告旗');
            await shot('home-start');
            await check('海盗来袭开场');
          })) &&
          (await step('造塔英雄开打', async () => {
            const inf = await info();
            const si = inf.slots.findIndex((q) => q.tower < 0 && !q.wreck);
            if (si < 0) throw new Error('没有空的木台');
            const p = await pt(inf.slots[si]!.x, inf.slots[si]!.y);
            await tap(p.x, p.y);
            await page.waitForTimeout(400);
            await click('.hd-td-tower[data-kind="cannon"]');
            await page.waitForTimeout(600);
            if ((await info()).slots[si]!.tower < 0) throw new Error('没造出塔');
            if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
            const hp = await pt(10, 7);
            await click('.hd-td-herobtn');
            await tap(hp.x, hp.y);
            await page.waitForTimeout(600);
            await shot('home-built');
            await click('.hd-td-call');
            await page.waitForTimeout(5000);
            await shot('home-fight');
            await check('海盗来袭战斗中');
          })) &&
          (await step('撑到结束', async () => {
            for (let i = 0; i < 2; i++) await click('.hd-td-bar2 button:has-text("×")');
            const done = await page.locator('.hd-home-result').waitFor({ timeout: 240_000 }).then(() => true, () => false);
            if (!done) {
              await click('.hd-td-bar2 button:has-text("撤退")');
              await click('.hd-dialog button:has-text("撤退")');
              await page.locator('.hd-home-result').waitFor({ timeout: 20_000 });
            }
            await page.waitForTimeout(3200);
            await shot('home-result');
            await check('海盗来袭结算');
            const txt = (await page.locator('.hd-home-result').textContent()) ?? '';
            if (!/撑住 \d+ 波/.test(txt)) throw new Error(`结算页文字不对：${txt}`);
            if (await page.locator('.hd-home-result .hd-td-starrow').count()) throw new Error('海盗来袭不该有星星');
          })) &&
          (await step('回岛', async () => {
            await click('.hd-home-result button:has-text("回岛")');
            await sceneIs('base');
            await page.waitForTimeout(800);
            await shot('home-back');
          }));
        await sfxDone();
        await ctx.close();
        console.log(`${v.name}：海盗来袭 ${ok ? '走完' : '中断'}`);
        continue;
      }

      if (TIDE) {
        // 大潮无尽：平台和 /api/scores 都是假的（登录 cookie 补上，交分请求拦下记下来）
        const fake = new FakePvp();
        await fake.seed();
        await fake.route(page, problems);
        const scoreBodies: unknown[] = [];
        await page.route((u) => u.pathname === '/api/scores', async (r: Route) => {
          scoreBodies.push(JSON.parse(r.request().postData() ?? 'null'));
          const h = r.request().headers();
          if (h['x-arcade'] !== '1' || !/application\/json/.test(h['content-type'] ?? '')) problems.push(`${v.name} 交分请求头不对：${JSON.stringify(h)}`);
          await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: 123456, improved: true }) });
        });
        const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
        const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
        const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
        };
        const ok =
          (await step('进基地', async () => {
            await page.goto(`${ROOT}?dev&fast`, { timeout: 60_000 });
            await ready();
            await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(5));
            await page.waitForTimeout(900);
            await click('.hd-bottom button:has-text("守岛")');
            await page.locator('.hd-tidecard:not(.hd-homecard)').waitFor({ timeout: 8000 });
            await page.waitForTimeout(400);
            await shot('td-select-tide');
            await check('守岛选关页');
          })) &&
          (await step('开局', async () => {
            await click('.hd-tidecard button[data-tide]');
            await sceneIs('td', 40_000);
            await page.waitForTimeout(1500);
            if (!/第 \d+ 波/.test((await page.locator('.hd-td-bar').textContent()) ?? '')) throw new Error('顶栏没有显示"第 N 波"');
            await shot('tide-start');
            await check('大潮开场');
          })) &&
          (await step('造塔英雄技能叫波', async () => {
            const inf = await info();
            if (inf.slots.length === 0) throw new Error('没有临时塔位');
            const p = await pt(inf.slots[0]!.x, inf.slots[0]!.y);
            await tap(p.x, p.y);
            await page.waitForTimeout(400);
            await click('.hd-td-tower[data-kind="cannon"]');
            await page.waitForTimeout(600);
            if ((await info()).slots[0]!.tower < 0) throw new Error('没造出塔');
            const hp = await pt(10, 7);
            await click('.hd-td-herobtn');
            await tap(hp.x, hp.y);
            await page.waitForTimeout(700);
            await shot('tide-built');
            await page.locator('.hd-td-skill:not(.hd-td-herobtn)').nth(1).click({ timeout: 5000 });
            await page.waitForTimeout(400);
            await click('.hd-td-call');
            await page.waitForTimeout(5000);
            await shot('tide-fight');
            await check('大潮战斗中');
          })) &&
          (await step('撑到结束', async () => {
            for (let i = 0; i < 2; i++) await click('.hd-td-bar2 button:has-text("×")');
            // 放着打，最多等 4 分钟；还没输就点撤退（也是结算的一条路）
            const done = await page.locator('.hd-tide-result').waitFor({ timeout: 240_000 }).then(() => true, () => false);
            if (!done) {
              await click('.hd-td-bar2 button:has-text("撤退")');
              await click('.hd-dialog button:has-text("撤退")');
              await page.locator('.hd-tide-result').waitFor({ timeout: 20_000 });
            }
            await page.waitForTimeout(900);
            await shot('tide-result');
            await check('大潮结算');
            const txt = (await page.locator('.hd-tide-result').textContent()) ?? '';
            if (!/撑过 \d+ 波/.test(txt) || !/击退 \d+/.test(txt) || !/本周最好：撑过 \d+ 波 · 击退 \d+/.test(txt)) throw new Error(`结算页文字不对：${txt}`);
            if (!/新纪录/.test(txt)) throw new Error(`结算页没有"新纪录"：${txt}`);
            if (/金币 \+|木材 \+/.test(txt)) throw new Error('大潮不该发金币木材');
            if (scoreBodies.length !== 1) throw new Error(`交分次数不对：${scoreBodies.length}`);
            const b = scoreBodies[0] as { gameId?: string; boardId?: string; score?: number };
            if (b.gameId !== 'haidao' || !/^week-\d{4}-W\d{2}-tide$/.test(b.boardId ?? '') || !Number.isInteger(b.score)) throw new Error(`交分请求体不对：${JSON.stringify(b)}`);
            const best = await page.evaluate(() => localStorage.getItem('haidao.tide'));
            if (!best || !/"week":"\d{4}-W\d{2}"/.test(best)) throw new Error(`haidao.tide 没记上：${best}`);
            console.log(`${v.name}：交分 ${JSON.stringify(b)}，本机 ${best}`);
          })) &&
          (await step('回岛', async () => {
            await click('.hd-tide-result button:has-text("回岛")');
            await sceneIs('base');
            await page.waitForTimeout(800);
            await shot('tide-home');
          }));
        await sfxDone();
      await ctx.close();
        console.log(`${v.name}：大潮无尽 ${ok ? '走完' : '中断'}`);
        continue;
      }

      if (ESCORTLIVE) {
        // 护航实盘：海图护航卡 → 选图页「实盘」→ 选档 → 带入 → 造塔、叫波 → 打完（或到时撤退）→ 结算 → 回家
        const fake = new FakePvp();
        await fake.seed();
        await fake.route(page, problems);
        const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
        const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
        const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
        };
        const stake = ESCORT_LIVE_TIERS.small.stake;
        const ok =
          (await step('护航选图页的实盘钮', async () => {
            await page.goto(`${ROOT}?dev&fast`, { timeout: 60_000 });
            await ready();
            await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(3));
            await page.waitForTimeout(900);
            await click('.hd-bottom button:has-text("出海")');
            await page.locator('.hd-esc-card').waitFor({ timeout: 8000 });
            await click('.hd-esc-card');
            await page.locator('.hd-esc-live').waitFor({ timeout: 8000 });
            await page.waitForTimeout(500);
            await shot('escortlive-select');
            await check('护航选图页');
          })) &&
          (await step('护航实盘选档', async () => {
            await click('.hd-esc-live');
            await page.locator('.hd-live-card button[data-tier="small"]').waitFor({ timeout: 8000 });
            await page.waitForTimeout(700);
            await shot('escortlive-tiers');
            await check('护航实盘选档');
            const txt = (await page.locator('.hd-live-tiers').textContent()) ?? '';
            if (!/今天还能护 \d+ 场/.test(txt)) throw new Error(`选档页没写今天还剩几场：${txt}`);
            if (!/最多赢 .*最多输/.test(txt)) throw new Error('选档卡没写最多赢 / 最多输');
          })) &&
          (await step('带入开护', async () => {
            await click('.hd-live-card button[data-tier="small"]');
            const go = page.locator('.hd-dialog .hd-btn-gold', { hasText: '确定开护' }).last();
            await go.waitFor({ timeout: 8000 });
            await go.click({ timeout: 8000 });
            await sceneIs('td', 40_000);
            if (fake.bank.balance !== 10_000 - stake) throw new Error(`带入后钱包余额不对：${fake.bank.balance}`);
            await page.waitForTimeout(2000);
            if ((await page.locator('.hd-esc-hull').count()) !== 1) throw new Error('顶栏没有商船血条');
            await shot('escortlive-start');
            await check('护航实盘开场');
          })) &&
          (await step('造塔叫波', async () => {
            for (let k = 0; k < 2; k++) {
              const inf = await info();
              const si = inf.slots.findIndex((q) => q.tower < 0 && !q.wreck);
              if (si < 0) throw new Error('没有空的木台');
              for (let t = 0; t < 4 && !(await page.locator('.hd-td-tower[data-kind="cannon"]').count()); t++) {
                const p = await pt(inf.slots[si]!.x, inf.slots[si]!.y);
                await tap(p.x, p.y);
                await page.waitForTimeout(400);
              }
              await click('.hd-td-tower[data-kind="cannon"]');
              await page.waitForTimeout(600);
              if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
            }
            await click('.hd-esc-pbtn[data-pace="sail"]');
            await click('.hd-td-call');
            await page.waitForTimeout(3000);
            await shot('escortlive-fight');
            await check('护航实盘战斗中');
          })) &&
          (await step('打完或撤退后结算', async () => {
            for (let i = 0; i < 2; i++) await click('.hd-td-bar2 button:has-text("×")');
            const done = await page.locator('.hd-live button:has-text("回家")').waitFor({ timeout: 150_000 }).then(() => true, () => false);
            if (!done) {
              // 撤退：按走过的格数折算
              await click('.hd-td-bar2 button:has-text("撤退")');
              const t = await page.locator('.hd-dialog', { hasText: '按已经走过的路结回筹码' }).count();
              if (!t) throw new Error('撤退确认没写按走过的路结回筹码');
              await click('.hd-dialog button:has-text("撤退")');
              await page.locator('.hd-live button:has-text("回家")').waitFor({ timeout: 20_000 });
            }
            await page.waitForTimeout(600);
            await shot('escortlive-result');
            await check('护航实盘结算');
            const txt = (await page.locator('.hd-live').last().textContent()) ?? '';
            if (!/(到港|沉没|误了潮)/.test(txt)) throw new Error(`结算标题不对：${txt}`);
            if (!/商船剩余血量 \d+% · 走了 \d+\/\d+ 格/.test(txt)) throw new Error(`结算没写船血和格数：${txt}`);
            if (!/拿回带入的 \d+%/.test(txt)) throw new Error('结算没写拿回带入的几成');
            const set = fake.bank.calls.filter((c) => c.m === 'settle');
            if (set.length !== 1 || !String(set[0]!.a.ref).startsWith('he-')) throw new Error('钱包里没有一次 he- 前缀的结回');
            if ((await page.locator('.hd-live-net').count()) === 0) throw new Error('结算页没有显示赢 / 输多少筹码');
            const save = await page.evaluate(() => localStorage.getItem('haidao.save') ?? '');
            if (/"escort":\{"stars":\{"[^}]+\d/.test(save)) throw new Error('实盘不该记护航星数');
          })) &&
          (await step('回家', async () => {
            await click('.hd-live button:has-text("回家")');
            await sceneIs('base');
            await page.waitForTimeout(800);
            await shot('escortlive-home');
          }));
        await sfxDone();
        await ctx.close();
        console.log(`${v.name}：护航实盘 ${ok ? '走完' : '中断'}`);
        continue;
      }

      if (MAPLIVE) {
        // 航线实盘：海图「今日航线」旁的「实盘」→ 选档 → 带入 → 打一站 → 刷新页面 → 接着跑 → 收航 → 结算 → 回家
        const fake = new FakePvp();
        await fake.seed();
        await fake.route(page, problems);
        const scoreBodies: unknown[] = [];
        await page.route((u) => u.pathname === '/api/scores', async (r: Route) => {
          scoreBodies.push(JSON.parse(r.request().postData() ?? 'null'));
          await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: 1, improved: true }) });
        });
        const save = JSON.stringify({ profile: { ...newProfile(), tutorial: 99, res: { gold: 1500, wood: 1500 }, stats: { attacks: 1, wins: 1, lootGold: 0, lootWood: 0 } }, lastSeen: Date.now() });
        await page.addInitScript((sv) => {
          if (!localStorage.getItem('haidao.save')) localStorage.setItem('haidao.save', sv);
        }, save);
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
        };
        const stake = MAP_LIVE_TIERS.small.stake;
        const openTiers = async (): Promise<void> => {
          await click('.hd-bottom button:has-text("出海")');
          await page.locator('.hd-mapchip').waitFor({ timeout: 8000 });
          await page.waitForTimeout(500);
        };
        const ok =
          (await step('海图上的实盘钮', async () => {
            await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
            await ready();
            await page.waitForTimeout(800);
            await openTiers();
            await shot('maplive-card');
            await check('海图（今日航线 + 实盘）');
          })) &&
          (await step('航线实盘选档', async () => {
            await click('.hd-mapchip');
            await page.locator('.hd-live-card button[data-tier="small"]').waitFor({ timeout: 8000 });
            await page.waitForTimeout(700);
            await shot('maplive-tiers');
            await check('航线实盘选档');
            const txt = (await page.locator('.hd-live-tiers').textContent()) ?? '';
            if (!/今天还能跑 \d+ 趟/.test(txt)) throw new Error(`选档页没写今天还剩几趟：${txt}`);
            if (!/同一条航线，档越高结回越少/.test(txt)) throw new Error('选档卡没写同一条航线');
            if (/电脑/.test(txt)) throw new Error('航线选档卡不该写电脑★');
          })) &&
          (await step('带入出航', async () => {
            await click('.hd-live-card button[data-tier="small"]');
            const go = page.locator('.hd-dialog .hd-btn-gold', { hasText: '确定出航' }).last();
            await go.waitFor({ timeout: 8000 });
            await go.click({ timeout: 8000 });
            await page.locator('.hd-route .hd-route-node.cur').first().waitFor({ timeout: 15_000 });
            if (fake.bank.balance !== 10_000 - stake) throw new Error(`带入后钱包余额不对：${fake.bank.balance}`);
            await page.waitForTimeout(700);
            await shot('maplive-route');
            await check('航线实盘航线图');
            if (!/实盘/.test((await page.locator('.hd-route-title').textContent()) ?? '')) throw new Error('航线页没标实盘');
          })) &&
          (await step('打一站', async () => {
            const cur = page.locator('.hd-route-node.cur');
            const reefAt = await cur.evaluateAll((els) => els.findIndex((e) => e.classList.contains('reef')));
            await cur.nth(reefAt === 0 ? 1 : 0).click({ timeout: 8000 });
            await page.waitForTimeout(500);
            await click('.hd-route-bottom button:has-text("出发")');
            await sceneIs('battle', 40_000);
            await page.waitForTimeout(600);
            const vp = page.viewportSize()!;
            await tap(vp.width / 2, vp.height / 2);
            await page.waitForTimeout(400);
            const boats = await page.locator('.hd-boat').count();
            for (let i = 0; i < boats + 2; i++) {
              if ((await page.locator('.hd-boat:not(.done)').count()) === 0) break;
              if ((await page.locator('.hd-boat.sel').count()) === 0) {
                // 手机竖屏有的船队第一张卡被技能钮压住一角，点不到就直接触发它的 click
                await click('.hd-boat:not(.done)').catch(() => page.locator('.hd-boat:not(.done)').first().evaluate((e) => (e as HTMLElement).click()));
              }
              await page.waitForTimeout(200);
              const bp = await beach(i % 2);
              if (!bp) throw new Error('没有海滩点');
              await tap(bp.x, bp.y);
              await page.waitForTimeout(300);
            }
            await page.locator('.hd-route-mid').waitFor({ timeout: 120_000 });
            await page.locator('.hd-route-mid .hd-row.on').waitFor({ timeout: 15_000 });
            await check('航线实盘站间条');
            await click('.hd-route-mid button:has-text("继续")');
            await sceneIs('base', 30_000);
            await page.waitForTimeout(900);
            const run = await page.evaluate(() => localStorage.getItem('haidao.maplive.run'));
            if (!run || !/"state"/.test(run)) throw new Error('haidao.maplive.run 没存进度');
            if (await page.evaluate(() => localStorage.getItem('haidao.map'))) throw new Error('实盘不该写娱乐的 haidao.map');
          })) &&
          (await step('刷新后接着跑', async () => {
            await page.reload({ timeout: 60_000 });
            await ready();
            await page.waitForTimeout(800);
            await openTiers();
            await click('.hd-mapchip');
            const resume = page.locator('.hd-live-tiers button:has-text("接着跑")');
            await resume.waitFor({ timeout: 8000 });
            await page.waitForTimeout(500);
            await shot('maplive-resume');
            await check('航线实盘接着跑');
            await resume.click();
            await page.locator('.hd-route .hd-route-node.cur').first().waitFor({ timeout: 15_000 });
            await page.waitForTimeout(500);
            await check('航线实盘接着跑的航线图');
          })) &&
          (await step('收航结算', async () => {
            await click('.hd-route-bottom button:has-text("收航")');
            await click('.hd-dialog button:has-text("收航")');
            await page.locator('.hd-route-result').waitFor({ timeout: 40_000 });
            await page.waitForTimeout(3200);
            await shot('maplive-result');
            await check('航线实盘结算');
            const txt = (await page.locator('.hd-route-result').textContent()) ?? '';
            if (!/拿回带入的 \d+%/.test(txt)) throw new Error(`结算没写拿回带入的几成：${txt}`);
            await page.locator('.hd-live-net.hd-pos, .hd-live-net.hd-neg').waitFor({ timeout: 8000 });
            if (/今天最好|新纪录/.test(txt)) throw new Error('实盘结算不该写今天最好');
            const set = fake.bank.calls.filter((c) => c.m === 'settle');
            if (set.length !== 1 || !String(set[0]!.a.ref).startsWith('hm-')) throw new Error('钱包里没有一次 hm- 前缀的结回');
            if (scoreBodies.length) throw new Error(`实盘不该交榜：${JSON.stringify(scoreBodies)}`);
            if (await page.evaluate(() => localStorage.getItem('haidao.maplive.run'))) throw new Error('结算后 haidao.maplive.run 没清掉');
            if (await page.evaluate(() => localStorage.getItem('haidao.map'))) throw new Error('实盘不该写娱乐的 haidao.map');
          })) &&
          (await step('回岛', async () => {
            await click('.hd-route-result button:has-text("回岛")');
            await sceneIs('base');
            await page.waitForTimeout(800);
            if (await page.locator('.hd-route, .hd-route-end').count()) throw new Error('航线界面没收起');
          }));
        await sfxDone();
        await ctx.close();
        console.log(`${v.name}：航线实盘 ${ok ? '走完' : '中断'}`);
        continue;
      }

      if (TDLIVE) {
        const fake = new FakePvp();
        await fake.seed();
        await fake.route(page, problems);
        const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
        const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
        const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
        };
        const ok =
          (await step('进基地', async () => {
            await page.goto(`${ROOT}?dev&fast`, { timeout: 60_000 });
            await ready();
            await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(3));
            await page.waitForTimeout(900);
            await click('.hd-bottom button:has-text("守岛")');
            await page.locator('.hd-tdsel-live').waitFor({ timeout: 8000 });
            await page.waitForTimeout(400);
            await shot('td-select-with-live');
            await check('守岛选关页');
          })) &&
          (await step('悬赏守岛选档', async () => {
            await click('.hd-tdsel-live');
            await page.locator('.hd-live-card button[data-tier="small"]').waitFor({ timeout: 8000 });
            await page.waitForTimeout(600);
            await shot('tdlive-tiers');
            await check('悬赏守岛选档');
          })) &&
          (await step('带入开守', async () => {
            await click('.hd-live-card button[data-tier="small"]');
            // 带入前有一次确认（写清带入多少、最多赢输多少）
            // 选档页本身也是 .hd-dialog，按文字找确认按钮
            const ok = page.locator('.hd-dialog .hd-btn-gold', { hasText: '确定开守' }).last();
            await ok.waitFor({ timeout: 8000 });
            await shot('tdlive-confirm');
            await ok.click({ timeout: 8000 });
            await sceneIs('td', 40_000);
            if (fake.bank.balance !== 10_000 - 2000) throw new Error(`带入后钱包余额不对：${fake.bank.balance}`);
            await page.waitForTimeout(1200);
            await shot('tdlive-start');
            await check('悬赏守岛开场');
          })) &&
          (await step('造塔英雄叫波', async () => {
            const inf = await info();
            if (inf.slots.length === 0) throw new Error('没有临时塔位');
            const p = await pt(inf.slots[0]!.x, inf.slots[0]!.y);
            await tap(p.x, p.y);
            await page.waitForTimeout(400);
            await click('.hd-td-tower[data-kind="cannon"]');
            await page.waitForTimeout(600);
            if ((await info()).slots[0]!.tower < 0) throw new Error('没造出塔');
            const hp = await pt(10, 7);
            await click('.hd-td-herobtn');
            await tap(hp.x, hp.y);
            await page.waitForTimeout(700);
            await shot('tdlive-built');
            await page.locator('.hd-td-skill:not(.hd-td-herobtn)').nth(1).click({ timeout: 5000 });
            await page.waitForTimeout(400);
            await click('.hd-td-call');
            await page.waitForTimeout(5000);
            await shot('tdlive-fight');
            await check('悬赏守岛战斗中');
          })) &&
          (await step('打完结算', async () => {
            for (let i = 0; i < 2; i++) await click('.hd-td-bar2 button:has-text("×")');
            await page.locator('.hd-live button:has-text("回家")').waitFor({ timeout: 300_000 });
            await page.waitForTimeout(600);
            await shot('tdlive-result');
            await check('悬赏守岛结算');
            const set = fake.bank.calls.filter((c) => c.m === 'settle');
            if (set.length !== 1 || !String(set[0]!.a.ref).startsWith('ht-')) throw new Error('钱包里没有一次 ht- 前缀的结回');
            if ((await page.locator('.hd-live-net').count()) === 0) throw new Error('结算页没有显示赢 / 输多少筹码');
          })) &&
          (await step('回家', async () => {
            await click('.hd-live button:has-text("回家")');
            await sceneIs('base');
            await page.waitForTimeout(800);
            await shot('tdlive-home');
          }));
        await sfxDone();
      await ctx.close();
        console.log(`${v.name}：悬赏守岛 ${ok ? '走完' : '中断'}`);
        continue;
      }

      if (PVP) {
        const fake = new FakePvp();
        await fake.seed();
        await fake.route(page, problems);
        // 老玩家的存档（跳过新手引导、打过一场），木材够出海；只在第一次打开时写，之后的刷新沿用页面自己存的
        const save = JSON.stringify({ profile: { ...newProfile(), tutorial: 99, res: { gold: 1500, wood: 1500 }, stats: { attacks: 1, wins: 1, lootGold: 0, lootWood: 0 } }, lastSeen: Date.now() });
        await page.addInitScript((sv) => {
          if (!localStorage.getItem('haidao.save')) localStorage.setItem('haidao.save', sv);
        }, save);
        const check = async (what: string): Promise<void> => {
          for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
        };
        const openPanel = async (): Promise<void> => {
          await click('.hd-bottom button:has-text("出海")');
          await page.waitForTimeout(500);
          await click('.hd-pvp-mapbtn');
          await page.locator('.hd-pvp button:has-text("找对手")').waitFor({ timeout: 10_000 });
          await page.waitForTimeout(300);
        };
        // ?fast：战斗和回放 4 倍速，省时间；操作仍是真人点的
        await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
        await ready();
        await page.waitForTimeout(800);
        const ok =
          (await step('海图上的打玩家', async () => {
            await click('.hd-bottom button:has-text("出海")');
            await page.locator('.hd-pvp-mapbtn').waitFor({ timeout: 8000 });
            await page.waitForTimeout(500);
            await shot('pvp-map');
            await check('海图');
            await click('.hd-pvp-mapbtn');
            await page.locator('.hd-pvp button:has-text("找对手")').waitFor({ timeout: 10_000 });
            await page.waitForTimeout(300);
            await shot('pvp-panel');
            await check('打玩家面板');
          })) &&
          (await step('游戏更新了弹窗', async () => {
            // 假服务端回一次 need_reload：旧页面发的请求被挡，页面弹出带"刷新"按钮的提示
            fake.staleNext = true;
            allow409 = true;
            await click('.hd-pvp button:has-text("找对手")');
            await page.locator('.hd-pvp-reload button:has-text("刷新")').waitFor({ timeout: 10_000 });
            await page.waitForTimeout(300);
            allow409 = false;
            await shot('pvp-need-reload');
            await check('游戏更新了弹窗');
            await page.evaluate(() => document.querySelector('.hd-pvp-reload')?.remove());
          })) &&
          (await step('找对手', async () => {
            await click('.hd-pvp button:has-text("找对手")');
            await page.locator('.hd-pvp button:has-text("开打")').waitFor({ timeout: 10_000 });
            if (await page.locator('.hd-pvp .hd-pvp-tag:has-text("电脑")').count()) throw new Error('第一次找对手应该匹配到真人老李');
            await page.waitForTimeout(300);
            await shot('pvp-opponent');
            await check('对手');
          })) &&
          (await step('手动打', async () => {
            await click('.hd-pvp button:has-text("开打")');
            await sceneIs('battle');
            await page.waitForTimeout(1200);
            await shot('pvp-battle-start');
            for (let i = 0; i < 2; i++) {
              if ((await page.locator('.hd-boat.sel').count()) === 0) await click('.hd-boat:not(.done)');
              await page.waitForTimeout(250);
              const bp = await beach(i * 3);
              if (!bp) throw new Error('没有海滩点');
              await tap(bp.x, bp.y);
              await page.waitForTimeout(500);
            }
            await click('.hd-skill');
            const h = await where('hq');
            if (!h) throw new Error('战斗里找不到主寨');
            await tap(h.x, h.y);
            await page.waitForTimeout(1500);
            await shot('pvp-battle-barrage');
            await page.waitForTimeout(1500);
            await shot('pvp-battle-fight');
            await check('攻防战斗');
          })) &&
          (await step('服务端结算', async () => {
            // 等它打完（4 倍速），超时就撤退：结果仍由服务端按交上去的操作和结束拍重放
            await page.locator('.hd-pvp button:has-text("回家")').waitFor({ timeout: 90_000 }).catch(async () => {
              await click('.hd-bar2 button.hd-btn-red');
              await page.locator('.hd-dialog button:has-text("结束")').click({ timeout: 5000 });
            });
            await page.locator('.hd-pvp button:has-text("回家")').waitFor({ timeout: 30_000 });
            await page.waitForTimeout(600);
            await shot('pvp-result');
            await check('攻防结算');
            await click('.hd-pvp button:has-text("回家")');
            await sceneIs('base');
            await page.waitForTimeout(800);
          })) &&
          (await step('被打了 N 次', async () => {
            await fake.raidMe();
            // 重新打开游戏：进基地时查一次
            await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
            await ready();
            await page.locator('.hd-pvp h2:has-text("你不在时被打了")').waitFor({ timeout: 15_000 });
            await page.waitForTimeout(500);
            await shot('pvp-raided');
            await check('被打提示');
            await click('.hd-pvp button:has-text("知道了")');
          })) &&
          (await step('防守记录和回放', async () => {
            await openPanel();
            await page.locator('.hd-pvp-item').first().scrollIntoViewIfNeeded();
            await shot('pvp-defenses');
            await click('.hd-pvp-item button:has-text("看回放")');
            await sceneIs('battle');
            await page.waitForTimeout(3500);
            await shot('pvp-replay');
            await page.locator('.hd-pvp h2:has-text("的进攻")').waitFor({ timeout: 90_000 });
            await page.waitForTimeout(400);
            await shot('pvp-replay-end');
            await check('回放结束');
            await click('.hd-pvp button:has-text("回家")');
            await sceneIs('base');
            await page.waitForTimeout(800);
          })) &&
          (await step('复仇', async () => {
            await openPanel();
            await click('.hd-pvp-item button:has-text("复仇")');
            await page.locator('.hd-pvp .hd-pvp-tag:has-text("复仇")').waitFor({ timeout: 10_000 });
            await page.waitForTimeout(300);
            await shot('pvp-revenge');
            await check('复仇');
            // 不点"不打了"（放弃的接口要改成按输结），直接重开页面
          })) &&
          (await step('流浪海盗岛', async () => {
            await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
            await ready();
            await page.waitForTimeout(800);
            await openPanel();
            await click('.hd-pvp button:has-text("找对手")');
            await page.locator('.hd-pvp .hd-pvp-tag:has-text("电脑")').waitFor({ timeout: 10_000 });
            await page.waitForTimeout(300);
            await shot('pvp-wanderer');
            await check('流浪海盗岛');
          }));
        await sfxDone();
      await ctx.close();
        console.log(`${v.name}：攻防 ${ok ? '走完' : '中断'}`);
        continue;
      }

      await page.goto(HQ ? `${ROOT}?${HQ}` : ROOT, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await shot('base');
      for (const p of await layoutProblems(page)) problems.push(`${v.name} 基地 ${p}`);
      const go =
        (await step('收金币', async () => {
          const b = await where('bubble');
          if (!b) throw new Error('金矿头上没有收取气泡');
          await tap(b.x, b.y);
          await page.waitForTimeout(500);
          await shot('collected');
        })) &&
        (await step('设置面板', async () => {
          // 顶栏右上只有一个齿轮；点开设置面板，同时只有一个遮罩；关音乐后 haidao.settings 里 music=false；Esc 关掉
          if ((await page.locator('.hd-mute, .hd-feel').count()) !== 1) throw new Error('右上角不止一个设置钮');
          await click('.hd-mute');
          await page.waitForTimeout(400);
          await shot('settings');
          if ((await page.locator('.hd-mask').count()) !== 1) throw new Error('设置面板打开后遮罩不是 1 个');
          await click('.hd-settings .hd-setrow:has-text("音乐") .hd-switch');
          const saved = await page.evaluate(() => localStorage.getItem('haidao.settings'));
          if (!saved || JSON.parse(saved).music !== false || JSON.parse(saved).sfx !== true) throw new Error(`设置没存对：${saved}`);
          await click('.hd-settings button:has-text("恢复默认")');
          const back = await page.evaluate(() => localStorage.getItem('haidao.settings'));
          if (!back || JSON.parse(back).music !== true) throw new Error(`恢复默认没生效：${back}`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          if ((await page.locator('.hd-mask').count()) !== 0) throw new Error('Esc 没关掉设置面板');
        })) &&
        (await step('建造', async () => {
          await click('.hd-bottom button:has-text("建造")');
          await page.waitForTimeout(400);
          await shot('build-list');
          // 手机用手指点卡片（之后的摆放用虚影旁的 ✓），电脑用鼠标（之后左键点虚影放下）
          const card = page.locator('.hd-card:has-text("金库")').first();
          if (v.hasTouch) await card.tap({ timeout: 8000 });
          else await card.click({ timeout: 8000 });
          await page.waitForTimeout(500);
          await shot('place');
          if (v.hasTouch) {
            if (!(await page.locator('.hd-place-float.on .hd-place-ok').count())) throw new Error('手机摆放时虚影旁没有 ✓');
            await page.locator('.hd-place-ok').tap({ timeout: 8000 });
          } else {
            const g = await where('ghost');
            if (!g) throw new Error('找不到虚影');
            await page.mouse.move(g.x, g.y);
            await page.waitForTimeout(300);
            await page.mouse.click(g.x, g.y);
          }
          await page.waitForTimeout(700);
          await shot('placed');
          if ((await page.locator('.hd-place').count()) > 0) throw new Error('放置没有完成');
        })) &&
        (await step('看主寨', async () => {
          const h = await where('hq');
          if (!h) throw new Error('找不到主寨');
          if (v.hasTouch) {
            await tap(h.x, h.y);
            await page.waitForTimeout(500);
            await shot('hq-ring');
            if ((await page.locator('.hd-rmenu [data-ring=info]').count()) === 0) throw new Error('点主寨没有弹出操作环');
            await click('.hd-rmenu [data-ring=info]');
          } else {
            // 电脑：右键弹菜单（贴着鼠标，带快捷键），Esc 收起；左键单击直接开信息面板
            await page.mouse.move(h.x, h.y);
            await page.waitForTimeout(400);
            await shot('hq-hover');
            await page.mouse.click(h.x, h.y, { button: 'right' });
            await page.waitForTimeout(400);
            await shot('hq-ctxmenu');
            if ((await page.locator('.hd-ctxmenu [data-ctx=info]').count()) === 0) throw new Error('右键主寨没有弹出菜单');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            if ((await page.locator('.hd-ctxmenu').count()) > 0) throw new Error('Esc 没有收起右键菜单');
            await page.mouse.click(h.x, h.y);
          }
          await page.waitForTimeout(400);
          await shot('hq-panel');
          if ((await page.locator('.hd-sheet').count()) === 0) throw new Error(v.hasTouch ? '点操作环的「信息」没有弹出面板' : '左键单击主寨没有弹出信息面板');
          await click('.hd-sheet .hd-x');
          const miss = await page.evaluate(() => (window as unknown as { __haidao: { missing?(): string[] } }).__haidao.missing?.() ?? []);
          if (miss.length) throw new Error(`基地有缺图：${miss.join('、')}`);
        })) &&
        (await step('船队', async () => {
          await click('.hd-bottom button:has-text("船队")');
          await page.waitForTimeout(400);
          await shot('fleet');
          await click('.hd-sheet .hd-x');
        })) &&
        (await step('出海', async () => {
          await click('.hd-bottom button:has-text("出海")');
          await page.waitForTimeout(500);
          await shot('map');
          await click('.hd-map .hd-node:has(.hd-num:text-is("1"))');
          await page.waitForTimeout(400);
          await shot('island');
          await click('.hd-map .hd-sheet button:has-text("出发")');
          await sceneIs('battle');
          await page.waitForTimeout(800);
          await shot('battle-start');
        })) &&
        (await step('登陆放炮', async () => {
          for (let i = 0; i < 2; i++) {
            // 登陆一条后规则会自动选中下一条船，已经选中就不再点（再点会取消）
            if ((await page.locator('.hd-boat.sel').count()) === 0) await click('.hd-boat:not(.done)');
            await page.waitForTimeout(250);
            if (i === 0) await shot('boat-selected');
            const bp = await beach(i);
            if (!bp) throw new Error('没有海滩点');
            await tap(bp.x, bp.y);
            await page.waitForTimeout(500);
          }
          await shot('landed');
          const sk = page.locator('.hd-skill').first();
          if ((await sk.count()) === 0) throw new Error('没有技能按钮');
          await sk.click({ timeout: 5000 });
          const h = await where('hq');
          if (!h) throw new Error('战斗里找不到主寨');
          await tap(h.x, h.y);
          await page.waitForTimeout(1500);
          await shot('barrage');
          await page.locator('.hd-bar2 button:has-text("×")').first().click({ timeout: 5000 });
          await page.waitForTimeout(12_000);
          await shot('fight');
        })) &&
        (await step('结算', async () => {
          // 先等它自然打完（真人流程要看到正常的结算），超时才点"结束"
          await sceneIs('result', 90_000).catch(() => {});
          if ((await hook(page)).scene !== 'result') {
            await click('.hd-bar2 button.hd-btn-red');
            await page.locator('.hd-dialog button:has-text("结束")').click({ timeout: 5000 });
          }
          await sceneIs('result', 30_000);
          await page.waitForTimeout(1800);
          await shot('result');
          for (const p of await layoutProblems(page)) problems.push(`${v.name} 结算 ${p}`);
        })) &&
        (await step('回家', async () => {
          // 新成就的弹窗盖在结算上面（新档第一场必弹），先收起
          await page.waitForTimeout(3500);
          for (let i = 0; i < 4; i++) {
            const ok = page.locator('button:has-text("太棒了")');
            if (!(await ok.count())) break;
            await shot(`achievement-${i + 1}`);
            await ok.first().click({ timeout: 5000 });
            await page.waitForTimeout(500);
          }
          await click('.hd-result button:has-text("回家")');
          await sceneIs('base');
          await page.waitForTimeout(1000);
          await shot('home');
        }));
      void go;
      await sfxDone();
      await ctx.close();
      console.log(`${v.name}：流程 ${go ? '走完' : '中断'}`);
      continue;
    }

    await page.goto(`${ROOT}?${QUERY}`, { timeout: 60_000 });
    await ready();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `${v.name}-base.png`) });
    for (const p of await layoutProblems(page)) problems.push(`${v.name} 基地 ${p}`);

    await page.goto(`${ROOT}?battle=${LEVEL}&auto&fast${QUERY ? `&${QUERY}` : ''}${HQ ? `&${HQ}` : ''}`, { timeout: 60_000 });
    await ready();
    if ((await hook(page)).level !== LEVEL) problems.push(`${v.name} ?battle=${LEVEL} 打开的不是这一关`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(OUT, `${v.name}-battle.png`) });
    for (const p of await layoutProblems(page)) problems.push(`${v.name} 战斗 ${p}`);
    await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.scene === 'result', null, { timeout: 90_000 }).catch(() => problems.push(`${v.name} 战斗 90 秒没打完`));
    await page.waitForTimeout(3200);
    await page.screenshot({ path: join(OUT, `${v.name}-result.png`) });
    console.log(`${v.name}：场景 ${(await hook(page)).scene}`);
    await sfxDone();
      await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
printSfx();
console.log(`截图在 ${OUT}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('控制台零报错，按钮检查通过');
