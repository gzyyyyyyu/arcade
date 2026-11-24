/**
 * 量各界面在六个尺寸下要不要滚动，并量所有者质量线：node tools/noscroll.ts --out <目录> [--view desktop,wide,phone,phonep,small,tablet] [--only <界面名片段>] [--group <流程名片段>] [--help]
 * 尺寸：desktop 1280×720、wide 1920×1080、phone 844×390、phonep 390×844、small 360×640、tablet 820×1180（iPad Air 竖屏，触屏）；--view 不写就六个全量。
 *
 * 规矩见仓库根 docs/ui.md 第 11 节：任何界面一屏放下，页面和各栏 scrollHeight ≤ clientHeight。
 * - 起法照 tools/shot.ts：vite 临时端口、playwright-core、?dev 下 __haidao.dev.td(5) 给满资源满解锁存档；
 *   平台和 /api 用 shot.ts 同一套假服务（FakePvp，内存假钱包），所以悬赏、打玩家也能进；
 * - 每个界面每个尺寸截一张图，并量：document.scrollingElement 是否超出；.hd-ui 下 scrollHeight > clientHeight + 1 且
 *   overflow-y 是 auto / scroll 的（会出滚动条）；overflow 是 hidden 但内容被截断、且是面板 / 弹窗 / 抽屉类（类名含
 *   sheet / dialog / panel / sel / map / route / list）的；
 * - 局内界面用「撤退」直接进结算，不真打完；进不去的界面记原因，不算超出；
 * - 每个界面×尺寸另量四个「质量线」指标（函数 qline，和上面的检查同在 measure 里调用），写进 noscroll.json 的 q 字段，终端汇总按「不达标」列出：
 *   1. 顶底栏占比（barsPct，只在触屏视口量）：口径是「岛被上下 HUD 吃掉的高度」，竖屏下贴顶 HUD 行（含第二行、预告卡）的外接范围 + 贴底 HUD 行（含技能行、加速 / 撤退、护航速度排、贴底的第二行）的外接范围，÷ 屏高，≤ 22% 达标；元素按实际位置归顶或归底；横屏沿用顶栏 + 宽底栏口径；两种栏都没有记 null；
 *   2. 岛可见比例（islandPct，只在基地 / 登陆战 / 守岛类画布界面量）：最大那张 canvas 在视口里的部分，扣掉 .hd-ui 里不透明（背景色 alpha ≥ 0.85 或有背景图）、接收指针的可见元素外接矩形的并集，占整屏面积的比例，≥ 60% 达标；每 8 像素采一个点近似；
 *   3. 点按目标（tapSmall / tapGap）：可见可点元素（button、a、input、select、[role=button]、cursor 为 pointer 的 .hd-* 块；嵌套取最外层；有弹窗只看最上层遮罩里的；正在离场的弹窗、被整页盖住点不到的（中心点命中的不是它自己）不算）外接矩形宽或高 < 44 的个数，触屏要求 0；
 *      相邻（没交叠、间距 < 8 像素）的对数一并量，触屏同样要求 0（交叠归「重叠」检查）；
 *   4. 同屏文字牌数（signs）：局内画布界面（CANVAS_SCREEN）上常驻浮层文字块个数，≤ 6 达标；选关页、图鉴、航线图这类整页列表不量（记 0）。口径：.hd-ui 里排除
 *      .hd-dialog .hd-sheet .hd-td-sheet .hd-panel .hd-mask 里面的（弹窗、各种面板、守岛造塔和克制表面板），也排除按钮 / 链接里的字（那是控件不是牌子）；
 *      统计可见、在视口内、有非空文字、本身没有带字子元素的叶子块（display 非 inline）；同一块「牌」（往上第一个有底色或边框的祖先，没有就是它自己）里的多个叶子只算一个，
 *      牌里面嵌着的小牌（血条上的 2★ 3★ 刻度、预告卡里的推荐章）并进外层那块，不另算。
 * - 最后打印表格、写 <目录>/noscroll.json；有超出退出码 1。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page, type Route } from 'playwright-core';
import { createServer } from 'vite';
import { CAMPAIGN, RULES_VERSION, TD2_LEVEL_BY_ID, botActions, canPlace, newProfile, presetLayout } from '../src/core/index.ts';
import type { Placed, Profile } from '../src/core/index.ts';
import { validateBase } from '../src/core/validate.ts';
import { handleLive, type LiveEnv } from '../worker/live.ts';
import { handlePvp, type Ports, type PvpEnv } from '../worker/pvp/api.ts';
import { BaseCore } from '../worker/pvp/base.ts';
import { HarborCore } from '../worker/pvp/harbor.ts';
import { MemKv } from '../worker/pvp/kv.ts';
import { Bank } from './fake-bank.ts';
import { sampleProfile } from './sample.ts';
import { flag, opt } from './args.ts';

const USAGE = `用法：node tools/noscroll.ts --out <目录> [--view desktop,wide,phone,phonep,small,tablet] [--only <界面名片段>] [--group <流程名片段>]
尺寸：desktop 1280×720、wide 1920×1080、phone 844×390、phonep 390×844、small 360×640、tablet 820×1180（iPad Air 竖屏）；--view 不写就全量。
量：超出（要滚动）、可点元素（含数字牌 .hd-pill）重叠、字被裁，以及质量线四项（写进 noscroll.json 的 q，终端按「不达标」列出）：
  顶底栏占比 ≤ 22%（触屏）、岛可见比例 ≥ 60%（基地 / 登陆战 / 守岛）、点按目标 < 44 像素和间距 < 8 像素各 0（触屏）、同屏文字牌 ≤ 6。`;
if (flag('--help') || flag('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const OUT = opt('--out');
if (!OUT) {
  console.error(USAGE);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const ONLY_SCREEN = opt('--only');
/** --group <流程名片段>：只跑名字含这段的流程（基地 / 海图 / 航线 / 护航 / 守岛选关 / 守岛深度 / 守岛局内 / 海盗来袭 / 大潮 / 登陆战 / 悬赏守岛 / 打玩家） */
const ONLY_GROUP = opt('--group');

const VIEWS = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false },
  { name: 'wide', viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false },
  { name: 'phone', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
  { name: 'phonep', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'small', viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true },
  // iPad Air 竖屏
  { name: 'tablet', viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
];
const ONLY = opt('--view')?.split(',') ?? VIEWS.map((v) => v.name);

type Hook = { tdPt?(x: number, y: number): { x: number; y: number }; tdInfo?(): { slots: Array<{ x: number; y: number; tower: number; wreck: boolean; garrison: boolean }> }; ready?: boolean; scene?: string; dev?: { give(g: number, w: number, s: number): void; td(hq: number, branch?: boolean, hero?: number, deep?: boolean): void; load(p: Profile): void }; where?(k: string): { x: number; y: number } | null; focusOn?(k: string, z: number): boolean };

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

  private raidSeq = 0;
  /** 我不在时被打：n 个人各用机器人真打我一场，由我的 Base 重放结算（和线上同一条路）（同一人每天最多打同一座岛有上限 pair_limit，所以超过海狼、鲨鱼的另造攻击者）；造出的防守记录够五个尺寸翻页 */
  private raidCalls = 0;
  async raidMe(n = 2): Promise<void> {
    const me = this.base(ME.id);
    const crew = ['海狼', '鲨鱼', '独眼龙', '黑胡子', '红袖', '老锚'];
    // 一个进程量五个尺寸会调好几次：同一攻击者每天最多打同一座岛 PAIR_PER_DAY 次，第二次起换一批攻击者编号
    const call = this.raidCalls++;
    for (let k = 0; k < Math.min(n, crew.length); k++) {
      const name = crew[k]!;
      const id = call === 0 && k < 2 ? (k === 0 ? 'u-wolf' : 'u-shark') : `u-crew${k}-${call}`;
      const style = k % 2 === 0 ? 'normal' : 'novice';
      const i = ++this.raidSeq;
      if (call > 0 || k >= 2) await this.base(id).upload(island(1, [['cannon', 1]]), name, Date.now() - 5 * DAY);
      const prep = await this.base(id).prepare(Date.now());
      if (!prep.ok) throw new Error(`${name} 准备失败：${prep.error}`);
      const raidId = `seedraid${i}xxxxxx`;
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
      if (u.pathname.startsWith('/api/live/') || u.pathname.startsWith('/api/td/')) {
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

// ---------------------------------------------------------------- 量

type Item = { sel: string; kind: 'doc' | 'scroll' | 'clip'; sh: number; ch: number };
type Listed = { n: number; top: string[] };
/** 质量线四项；不适用（非触屏、没有顶底栏、不是画布界面）记 null */
type Q = { barsPct: number | null; islandPct: number | null; tapSmall: Listed; tapGap: Listed; signs: Listed };
type Rec = { screen: string; view: string; shot: string; items: Item[]; small: string[]; off: string[]; overlap: string[]; cut: string[]; q: Q };
type Skip = { screen: string; view: string; reason: string };
const recs: Rec[] = [];
const skips: Skip[] = [];


/** 画布界面（岛可见比例只量这些）：基地主界面和各种局内 */
const CANVAS_SCREEN = /^(基地主界面|登陆战局内|守岛局内|护航局内|海盗来袭局内|大潮局内)/;

/**
 * 质量线四项，在页面里跑（page.evaluate 序列化这个函数，所以必须自包含，不能引用外面的变量）。口径见文件顶部注释。
 */
function qline(arg: { touch: boolean; canvas: boolean }): Q {
  const W = innerWidth;
  const H = innerHeight;
  const desc = (e: Element): string => {
    const cls = [...e.classList].slice(0, 3).join('.');
    return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
  };
  const vis = (e: Element): DOMRect | null => {
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  };
  const inView = (r: DOMRect): boolean => r.right > 0 && r.bottom > 0 && r.left < W && r.top < H;
  const alpha = (c: string): number => {
    if (c === 'transparent') return 0;
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return 0;
    const p = m[1]!.split(/[,\s/]+/).filter(Boolean);
    return p.length > 3 ? Number.parseFloat(p[3]!) : 1;
  };
  const label = (e: Element, r: DOMRect): string => `${desc(e)}「${(e.textContent ?? '').trim().slice(0, 8)}」${Math.round(r.width)}×${Math.round(r.height)}`;

  // 1. 顶底栏占比（触屏才量）。口径是「岛被上下 HUD 吃掉的高度」：
  //    竖屏：顶部 = 所有贴顶 HUD 行（大厅、顶栏、第二行、预告卡）的外接范围，即最低一行的下沿；
  //          底部 = 所有贴底 HUD 行（底栏、技能行、加速 / 撤退、护航的速度排、贴底的第二行）的外接范围，即最高一行的上沿到屏底；
  //          一个元素在屏幕上半的算顶部、在下半的算底部，同一个元素在哪边看它实际的位置，不看它叫什么（挪位置不能躲过量测）。
  //    横屏：右侧竖排的操作区不吃高度，沿用原来的顶栏 + 宽底栏口径。
  let barsPct: number | null = null;
  if (arg.touch) {
    let top = 0;
    let bottom = 0;
    if (H > W) {
      const rows = '.hd-hall, .hd-bar, .hd-bar2, .hd-td-bar, .hd-td-bar2, .hd-td-plan, .hd-bottom, .hd-cards, .hd-td-bottom, .hd-esc-ctl, .hd-skills';
      for (const e of document.querySelectorAll(rows)) {
        const r = vis(e);
        if (!r || r.height > H * 0.3) continue;
        if (r.top < H * 0.3) top = Math.max(top, Math.min(r.bottom, H));
        else if (r.bottom > H * 0.7) bottom = Math.max(bottom, H - Math.max(r.top, 0));
      }
    } else {
      for (const e of document.querySelectorAll('.hd-hall, .hd-bar, .hd-bar2, .hd-td-bar, .hd-td-bar2')) {
        const r = vis(e);
        if (r && r.top < H * 0.3) top = Math.max(top, Math.min(r.bottom, H));
      }
      for (const e of document.querySelectorAll('.hd-bottom, .hd-cards, .hd-td-bottom')) {
        const r = vis(e);
        if (r && r.width > W * 0.6) bottom = Math.max(bottom, H - Math.max(r.top, 0));
      }
    }
    if (top > 0 || bottom > 0) barsPct = Math.round(((top + bottom) / H) * 1000) / 10;
  }

  // 2. 岛可见比例：最大画布在视口里的部分，扣掉不透明 UI 矩形的并集（8 像素网格采样）
  let islandPct: number | null = null;
  if (arg.canvas) {
    let cv: DOMRect | null = null;
    for (const c of document.querySelectorAll('canvas')) {
      const r = vis(c);
      if (r && (!cv || r.width * r.height > cv.width * cv.height)) cv = r;
    }
    if (cv) {
      const covers: DOMRect[] = [];
      for (const e of document.querySelectorAll<HTMLElement>('.hd-ui *')) {
        const r = vis(e);
        if (!r || !inView(r) || r.width < 4 || r.height < 4) continue;
        if (r.width * r.height > W * H * 0.9) continue;
        const cs = getComputedStyle(e);
        if (cs.pointerEvents === 'none' || Number(cs.opacity) < 0.9) continue;
        if (alpha(cs.backgroundColor) >= 0.85 || cs.backgroundImage !== 'none') covers.push(r);
      }
      const step = 8;
      let total = 0;
      let seen = 0;
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) {
          total++;
          if (x < cv.left || x > cv.right || y < cv.top || y > cv.bottom) continue;
          if (!covers.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) seen++;
        }
      }
      islandPct = total ? Math.round((seen / total) * 1000) / 10 : null;
    }
  }

  // 3. 点按目标：尺寸 < 44、相邻间距 < 8
  // 正在离场的（hd-leaving：淡出中、不吃点击）不算一层，也不算点按目标
  const masks = [...document.querySelectorAll<HTMLElement>('.hd-ui .hd-mask')].filter((m) => vis(m) && !m.classList.contains('hd-leaving'));
  const layer: ParentNode = masks.length > 0 ? masks[masks.length - 1]! : document;
  const pick = [...layer.querySelectorAll<HTMLElement>('.hd-ui button, .hd-ui a, .hd-ui input, .hd-ui select, .hd-ui [role=button], .hd-ui [class*=hd-]')].filter((e) => {
    if (e.closest('.hd-map-in, .hd-scout-map, .hd-leaving')) return false;
    if ((e as HTMLButtonElement).disabled) return false;
    if (/^(BUTTON|A|INPUT|SELECT)$/.test(e.tagName) || e.getAttribute('role') === 'button') return true;
    return getComputedStyle(e).cursor === 'pointer';
  });
  const set = new Set(pick);
  const tg = pick
    .filter((e) => {
      for (let p = e.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    })
    .map((e) => ({ e, r: vis(e) }))
    .filter((x): x is { e: HTMLElement; r: DOMRect } => !!x.r && inView(x.r))
    // 被整页盖住、手指点不到的不算（如航线图页底下的基地底栏）：中心点命中的不是它自己或它里面的东西
    .filter((x) => {
      const cx = Math.min(W - 1, Math.max(0, (x.r.left + x.r.right) / 2));
      const cy = Math.min(H - 1, Math.max(0, (x.r.top + x.r.bottom) / 2));
      const hit = document.elementFromPoint(cx, cy);
      return !hit || x.e.contains(hit) || hit.contains(x.e);
    });
  const smallL = tg.filter((x) => x.r.width < 44 || x.r.height < 44).map((x) => label(x.e, x.r));
  const gapL: string[] = [];
  let gapN = 0;
  for (let i = 0; i < tg.length; i++) {
    for (let j = i + 1; j < tg.length; j++) {
      const a = tg[i]!;
      const b = tg[j]!;
      const dx = Math.max(b.r.left - a.r.right, a.r.left - b.r.right);
      const dy = Math.max(b.r.top - a.r.bottom, a.r.top - b.r.bottom);
      if (dx < 0 && dy < 0) continue; // 交叠归「重叠」检查
      const gap = Math.max(dx, dy);
      if (gap >= 8) continue;
      gapN++;
      if (gapL.length < 6) gapL.push(`${label(a.e, a.r)} / ${label(b.e, b.r)} 间距 ${Math.round(gap * 10) / 10}`);
    }
  }

  // 4. 同屏文字牌数
  const plates = new Set<Element>();
  const signL: string[] = [];
  const signText = new Map<Element, string>();
  for (const e of document.querySelectorAll<HTMLElement>('.hd-ui *')) {
    if (!arg.canvas) break;
    if (e.closest('.hd-dialog, .hd-sheet, .hd-td-sheet, .hd-panel, .hd-mask, button, a, [role=button], select, input')) continue;
    if (!(e.textContent ?? '').trim()) continue;
    if ([...e.children].some((c) => (c.textContent ?? '').trim())) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'inline') continue;
    const r = vis(e);
    if (!r || !inView(r)) continue;
    let plate: Element = e;
    for (let p = e.parentElement; p && !p.classList.contains('hd-ui'); p = p.parentElement) {
      const pc = getComputedStyle(p);
      const pr = p.getBoundingClientRect();
      if (pr.width * pr.height > W * H * 0.5) break;
      if (alpha(pc.backgroundColor) > 0.1 || pc.backgroundImage !== 'none' || Number.parseFloat(pc.borderTopWidth) > 0) {
        plate = p;
        break;
      }
    }
    if (plates.has(plate)) continue;
    plates.add(plate);
    signText.set(plate, `${desc(plate)}「${(e.textContent ?? '').trim().slice(0, 8)}」`);
  }
  // 嵌在另一块牌里的小牌并进外层：只留最外层
  for (const p of [...plates]) {
    for (let a = p.parentElement; a; a = a.parentElement) {
      if (plates.has(a)) {
        plates.delete(p);
        break;
      }
    }
  }
  for (const p of plates) if (signL.length < 8) signL.push(signText.get(p)!);

  return {
    barsPct,
    islandPct,
    tapSmall: { n: smallL.length, top: smallL.slice(0, 6) },
    tapGap: { n: gapN, top: gapL },
    signs: { n: plates.size, top: signL },
  };
}

/** 质量线不达标的几条（触屏才查顶底栏、点按目标、间距） */
function qFails(q: Q, touch: boolean): string[] {
  const f: string[] = [];
  if (touch && q.barsPct !== null && q.barsPct > 22) f.push(`顶底栏占 ${q.barsPct}%（要 ≤ 22%）`);
  if (q.islandPct !== null && q.islandPct < 60) f.push(`岛只露出 ${q.islandPct}%（要 ≥ 60%）`);
  if (touch && q.tapSmall.n > 0) f.push(`点按目标 < 44 像素 ${q.tapSmall.n} 个：${q.tapSmall.top.join('；')}`);
  if (touch && q.tapGap.n > 0) f.push(`相邻点按目标间距 < 8 像素 ${q.tapGap.n} 对：${q.tapGap.top.join('；')}`);
  if (q.signs.n > 6) f.push(`同屏文字牌 ${q.signs.n} 个（要 ≤ 6）：${q.signs.top.join('；')}`);
  return f;
}

/** 在页面里量：文档本身、.hd-ui 下会出滚动条的、被截断的面板类元素；质量线四项（qline）同处调用 */
async function measure(page: Page, touch: boolean, screen: string): Promise<Omit<Rec, 'screen' | 'view' | 'shot'>> {
  // 等正在播的入场动画走完再量（最多 1 秒）：异步弹出的弹窗（加载页上「你不在时被打了」等 /api 回话才弹）常在截图和量之间冒出来，
  // 缩放中的弹窗按 0.99 倍量，44 高的钮记成 43.9、8 的间距记成 7.9
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 1000)),
  ])).catch(() => {});
  const q = await page.evaluate(qline, { touch, canvas: CANVAS_SCREEN.test(screen) });
  const r = await page.evaluate((touch) => {
    const out: Array<{ sel: string; kind: 'doc' | 'scroll' | 'clip'; sh: number; ch: number }> = [];
    const se = document.scrollingElement as HTMLElement;
    if (se.scrollHeight > se.clientHeight + 1) out.push({ sel: 'document', kind: 'doc', sh: se.scrollHeight, ch: se.clientHeight });
    const panel = /sheet|dialog|panel|sel|map|route|list/;
    const desc = (e: Element): string => {
      const cls = [...e.classList].slice(0, 3).join('.');
      return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
    };
    for (const e of document.querySelectorAll<HTMLElement>('.hd-ui, .hd-ui *')) {
      if (e.clientHeight === 0) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const r = e.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      if (e.scrollHeight <= e.clientHeight + 1) continue;
      const oy = cs.overflowY;
      if (oy === 'auto' || oy === 'scroll') out.push({ sel: desc(e), kind: 'scroll', sh: e.scrollHeight, ch: e.clientHeight });
      else if (oy === 'hidden' && panel.test(e.className.toString())) out.push({ sel: desc(e), kind: 'clip', sh: e.scrollHeight, ch: e.clientHeight });
    }
    const small: string[] = [];
    const off: string[] = [];
    const vis = (e: Element): DOMRect | null => {
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return r;
    };
    const label = (e: Element): string => `${desc(e)}「${(e.textContent ?? '').trim().slice(0, 10)}」`;
    // 点击区：可见的 button / [role=button] / a（触屏尺寸才算问题，非触屏也记下来备查）
    for (const e of document.querySelectorAll<HTMLElement>('.hd-ui button, .hd-ui [role=button], .hd-ui a, .hd-ui input, .hd-ui select')) {
      const r = vis(e);
      if (!r) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      if ((e as HTMLButtonElement).disabled && !touch) continue;
      if (r.width < 43.5 || r.height < 43.5) small.push(`${label(e)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    // 超出视口：.hd-ui 下可见元素的框伸到视口外（滚动容器里被滚动区域裁掉的不算：只看没有祖先滚动 / 裁剪的）
    for (const e of document.querySelectorAll<HTMLElement>('.hd-ui *')) {
      const r = vis(e);
      if (!r) continue;
      if (r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1) continue;
      if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) {
        // 完全在视口外：只有交互元素才算问题
        if (!/^(BUTTON|A|INPUT)$/.test(e.tagName)) continue;
      }
      let clipped = false;
      for (let p = e.parentElement; p && !p.classList.contains('hd-ui'); p = p.parentElement) {
        const o = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(o.overflowY + o.overflowX) && p.clientHeight > 0) { clipped = true; break; }
      }
      if (clipped) continue;
      if (!/^(BUTTON|A|INPUT|H1|H2|H3|P|SPAN|B|SMALL|DIV)$/.test(e.tagName)) continue;
      if (e.children.length > 0 && e.tagName === 'DIV' && !/sheet|dialog|panel|sel|card|bar|pill/.test(e.className.toString())) continue;
      off.push(`${label(e)} [${Math.round(r.left)},${Math.round(r.top)}→${Math.round(r.right)},${Math.round(r.bottom)}] 视口${innerWidth}×${innerHeight}`);
      if (off.length >= 12) break;
    }
    // 可点元素互相压住：同一层（有弹窗时只看最上面一层遮罩里的）可见、在视口里的可点元素两两比，交叠 > 2 像素算；互为祖先的不算；
    // 出海海图、侦察取景框是能拖的地图，里面的节点不算。整屏页面（海图、选关、航线图）和侧面板不是 .hd-mask，
    // 盖在下面的基地顶栏、底栏按矩形看也"交叠"，所以只比真点得到的：中心或四角往里 4 像素处点命中它自己（或它里面的元素）。
    // 顶栏底栏的数字牌（.hd-pill，金币、宝藏）不可点，但压住钮一样挡手、挡字，也算进来（360 宽守岛金币牌压叫波钮就是这样漏的）
    const overlap: string[] = [];
    const masks = [...document.querySelectorAll<HTMLElement>('.hd-ui .hd-mask')].filter((m) => vis(m));
    const layer: ParentNode = masks.length > 0 ? masks[masks.length - 1]! : document;
    const reach = (e: HTMLElement, r: DOMRect): boolean => {
      const pts: [number, number][] = [[(r.left + r.right) / 2, (r.top + r.bottom) / 2], [r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]];
      return pts.some(([x, y]) => {
        const t = document.elementFromPoint(x, y);
        // 整个被别的钮压住的也会被漏掉：分不清压它的是同层的钮还是整屏页面上的钮，宁可漏这种（少见）也不报整屏页面压基地顶栏
        return !!t && (t === e || e.contains(t));
      });
    };
    // 滚动区（军械所研究网格在手机横屏的惯性滚动）里的钮只按看得见的那一截比，滚出去的部分盖不住区外的钮
    const clip = (e: HTMLElement, r: DOMRect | null): DOMRect | null => {
      if (!r) return null;
      let { left, top, right, bottom } = r;
      for (let p = e.parentElement; p && !p.classList.contains('hd-ui'); p = p.parentElement) {
        if (!/(auto|scroll)/.test(getComputedStyle(p).overflowY)) continue;
        const q = p.getBoundingClientRect();
        left = Math.max(left, q.left);
        top = Math.max(top, q.top);
        right = Math.min(right, q.right);
        bottom = Math.min(bottom, q.bottom);
      }
      return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    };
    const hits = [...layer.querySelectorAll<HTMLElement>('button, [role=button], a, input, select, .hd-pill')]
      .filter((e) => e.closest('.hd-ui') && !e.closest('.hd-map-in, .hd-scout-map, .hd-minimap'))
      .map((e) => ({ e, r: clip(e, vis(e)) }))
      .filter((x): x is { e: HTMLElement; r: DOMRect } => !!x.r && x.r.width > 0 && x.r.height > 0 && x.r.right > 0 && x.r.bottom > 0 && x.r.left < innerWidth && x.r.top < innerHeight)
      .filter((x) => reach(x.e, x.r));
    for (let i = 0; i < hits.length && overlap.length < 12; i++) {
      for (let j = i + 1; j < hits.length; j++) {
        const a = hits[i]!;
        const b = hits[j]!;
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 2 && h > 2) overlap.push(`${label(a.e)} × ${label(b.e)} 交叠 ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    // 文字被裁：直接带文字的元素 scrollWidth > clientWidth（字比框宽，被截掉或溢出框外）
    const cut: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>('.hd-ui *')) {
      if (cut.length >= 12) break;
      if (e.clientWidth === 0 || e.closest('.hd-map-in, .hd-scout-map, .hd-minimap')) continue;
      if (![...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) continue;
      const r = vis(e);
      if (!r || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      if (e.scrollWidth > e.clientWidth + 1) cut.push(`${label(e)} ${e.scrollWidth}/${e.clientWidth}`);
    }
    // 字穿出牌子 / 按钮：上面那条只看直接带字的元素，字所在的元素（如资源牌里的 <small>）自己会撑开，撑破的是外面的牌子，
    // 牌子本身没有直接的字就漏了（390 宽基地「上限 25,200」穿出右框就是这样漏的）。这里对牌子和按钮，取里面每段可见文字的实际矩形，
    // 越出外框 > 1 像素算
    const rg = document.createRange();
    for (const box of document.querySelectorAll<HTMLElement>('.hd-ui .hd-pill, .hd-ui button')) {
      if (cut.length >= 12) break;
      if (box.closest('.hd-map-in, .hd-scout-map')) continue;
      const br = vis(box);
      if (!br || br.right < 0 || br.bottom < 0 || br.left > innerWidth || br.top > innerHeight) continue;
      const tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      let over = 0;
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!(n.textContent ?? '').trim()) continue;
        rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) {
          if (q.width === 0) continue;
          over = Math.max(over, q.right - br.right, br.left - q.left, q.bottom - br.bottom, br.top - q.top);
        }
      }
      if (over > 1) cut.push(`${label(box)} 字出框 +${Math.round(over * 10) / 10}`);
    }
    return { items: out, small, off, overlap, cut };
  }, touch);
  return { ...r, q };
}

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const ROOT = `http://127.0.0.1:${addr.port}/`;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu', '--autoplay-policy=no-user-gesture-required'] });

const OLD_SAVE = JSON.stringify({ profile: { ...newProfile(), tutorial: 99, res: { gold: 1500, wood: 1500 }, stats: { attacks: 1, wins: 1, lootGold: 0, lootWood: 0 } }, lastSeen: Date.now() });
/** 主寨 8、船坞还是 7 级、前 22 关都三星：海图 c23 的岛面板要出「建议船坞 8 级」那行（中段卡关的提醒） */
const DOCK_BEHIND_SAVE = (() => {
  const p = sampleProfile(8);
  const stars = Object.fromEntries(CAMPAIGN.slice(0, 22).map((l) => [l.id, 3]));
  const buildings = p.base.buildings.map((b) => (b.kind === 'dock' ? { ...b, level: 7 } : b));
  return JSON.stringify({ profile: { ...p, base: { ...p.base, buildings }, stars, tutorial: 99, res: { gold: 9000, wood: 9000 } }, lastSeen: Date.now() });
})();
/** 主寨 6、军械所 5 级、研究有高有低、钱只够一部分：军械所面板的研究网格里升得起、缺钱、到顶、没解锁四种卡都有 */
const ARMORY_SAVE = (() => {
  const p = sampleProfile(6);
  const buildings = [...p.base.buildings];
  let at: [number, number] | null = null;
  for (let y = 0; y < 20 && !at; y++) for (let x = 0; x < 20 && !at; x++) if (canPlace({ ...p, base: { ...p.base, buildings } }, 'armory', x, y)) at = [x, y];
  if (!at) throw new Error('示范岛上放不下军械所');
  buildings.push({ id: p.base.nextId, kind: 'armory', level: 5, x: at[0], y: at[1] });
  const research = { ...p.research, sailor: 5, gunner: 3 };
  return JSON.stringify({ profile: { ...p, base: { buildings, nextId: p.base.nextId + 1 }, research, tutorial: 99, res: { gold: 2600, wood: 1400 } }, lastSeen: Date.now() });
})();
const GARRISON_LEVEL = [...TD2_LEVEL_BY_ID.values()].find((l) => l.garrison.length > 2);

try {
  for (const v of VIEWS) {
    if (!ONLY.includes(v.name)) continue;
    const ctx = await browser.newContext({ ...v, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const fake = new FakePvp();
    await fake.seed();
    await fake.route(page, []);
    await page.route((u) => u.pathname === '/api/scores', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: 1, improved: true }) }));
    let n = 0;
    const want = (name: string): boolean => !ONLY_SCREEN || name.includes(ONLY_SCREEN);

    const ready = (): Promise<unknown> => page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.ready === true, null, { timeout: 60_000 });
    const sceneIs = (s: string, ms = 30_000): Promise<unknown> => page.waitForFunction((w) => (window as unknown as { __haidao?: Hook }).__haidao?.scene === w, s, { timeout: ms });
    const tap = async (x: number, y: number): Promise<void> => {
      if (v.hasTouch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    };
    const click = (sel: string): Promise<void> => page.locator(sel).first().click({ timeout: 8000 });
    const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
    const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
    const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
    const where = (k: string): Promise<{ x: number; y: number } | null> => page.evaluate((kk) => (window as unknown as { __haidao: Hook }).__haidao.where?.(kk) ?? null, k);

    /** 量并截一张图 */
    const snap = async (screen: string, waitMs = 500): Promise<void> => {
      await page.waitForTimeout(waitMs);
      const file = `${v.name}-${String(++n).padStart(2, '0')}-${screen.replace(/[^\w一-龥-]+/g, '_')}.png`;
      await page.screenshot({ path: join(OUT, file) }).catch(() => {});
      recs.push({ screen, view: v.name, shot: file, ...(await measure(page, v.hasTouch, screen)) });
    };
    /** 一小步：失败就记进不去，接着做下一步 */
    const attempt = async (screen: string, f: () => Promise<void>): Promise<boolean> => {
      if (!want(screen) && !(ONLY_SCREEN && screen.startsWith('~'))) return false;
      try {
        await f();
        return true;
      } catch (e) {
        skips.push({ screen, view: v.name, reason: (e as Error).message.split('\n').slice(0, 6).join(' ').slice(0, 400) });
        return false;
      }
    };
    /** 一个流程：整段失败只记一次 */
    const group = async (name: string, f: () => Promise<void>): Promise<void> => {
      if (ONLY_GROUP && !name.includes(ONLY_GROUP)) return;
      try {
        await f();
      } catch (e) {
        skips.push({ screen: `${name}（流程中断）`, view: v.name, reason: (e as Error).message.split('\n')[0]!.slice(0, 120) });
      }
    };
    /** branch：塔选上分叉（一档、两档交替），驻守台卡片上的分叉牌才量得到挤压 */
    const fresh = async (hq = 5, q = '?dev', branch = false, deep = false): Promise<void> => {
      await page.goto(`${ROOT}${q}`, { timeout: 60_000 });
      await ready();
      await page.evaluate(([h, br, dp]) => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(h, br, undefined, dp), [hq, branch, deep] as const);
      await page.waitForTimeout(900);
    };
    const closeSheet = async (): Promise<void> => {
      if (await page.locator('.hd-sheet .hd-x, .hd-dialog .hd-x').count()) await click('.hd-sheet .hd-x, .hd-dialog .hd-x').catch(() => {});
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    };
    /** 局内倒数还在转时点撤退 → 确认框 → 结算 */
    const retreat = async (confirmName: string, resultSel: string, resultName: string): Promise<void> => {
      await click('.hd-td-bar2 button:has-text("撤退")');
      await page.waitForTimeout(300);
      await snap(confirmName, 100);
      await click('.hd-dialog button:has-text("撤退")');
      await page.locator(resultSel).waitFor({ timeout: 20_000 });
      await snap(resultName, 3300);
    };
    const buildSheet = async (): Promise<number> => {
      const inf = await info();
      const si = inf.slots.findIndex((q) => q.tower < 0 && !q.wreck);
      if (si < 0) throw new Error('没有空的木台');
      for (let t = 0; t < 4 && !(await page.locator('.hd-td-tower[data-kind="cannon"]').count()); t++) {
        const p = await pt(inf.slots[si]!.x, inf.slots[si]!.y);
        await tap(p.x, p.y);
        await page.waitForTimeout(400);
      }
      if (!(await page.locator('.hd-td-tower[data-kind="cannon"]').count())) throw new Error('点木台没弹出造塔面板');
      return si;
    };

    // ---- 基地、建造、船队、建筑信息、船长档案、设置
    await group('基地', async () => {
      // 普通建筑的升级面板（两栏：立绘对比 + 数值花费）和军械所（升级 + 研究网格），都要一屏放下
      const openInfoOf = async (kind: string): Promise<void> => {
        // 竖屏初始视野常看不到要点的建筑：先把镜头对过去
        await page.evaluate((k) => (window as unknown as { __haidao: Hook }).__haidao.focusOn?.(k, 1.4), kind);
        await page.waitForTimeout(600);
        const h = await where(kind);
        if (!h) throw new Error(`找不到${kind}`);
        await tap(h.x, h.y);
        await page.waitForTimeout(500);
        if (v.hasTouch) {
          await click('.hd-rmenu [data-ring=info]');
          await page.waitForTimeout(400);
        }
      };
      // dev.td(10) 的存档主寨 8 级、资源上限 18,000（五位数带逗号），资源牌放不放得下要在这种长数字下量
      await fresh(10);
      await attempt('基地主界面·满级', () => snap('基地主界面·满级'));
      await attempt('建筑信息面板（主寨满级）', async () => {
        await openInfoOf('hq');
        await snap('建筑信息面板（主寨满级）');
        await closeSheet();
      });
      await attempt('军械所面板', async () => {
        await page.evaluate((sv) => localStorage.setItem('haidao.save', sv), ARMORY_SAVE);
        await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
        await ready();
        await page.waitForTimeout(800);
        await openInfoOf('armory');
        await snap('军械所面板');
        await closeSheet();
      });
      await fresh();
      await attempt('基地主界面', () => snap('基地主界面'));
      await attempt('建造列表', async () => {
        await click('.hd-bottom button:has-text("建造")');
        await snap('建造列表');
        await closeSheet();
      });
      // 一键收取（矿里攒着东西才浮出来）、汇总框、介绍卡片（手指长按 / 鼠标右键）
      const MINES = { ...sampleProfile(7), tutorial: 99, base: { ...sampleProfile(7).base, buildings: sampleProfile(7).base.buildings.map((b) => (b.kind === 'goldmine' || b.kind === 'sawmill' ? { ...b, stored: 1500 } : b)) } };
      await attempt('一键收取', async () => {
        await page.evaluate((pr) => (window as unknown as { __haidao: Hook }).__haidao.dev?.load(pr as Profile), MINES);
        await page.locator('.hd-claimfab.on').waitFor({ timeout: 8000 });
        await snap('基地主界面·有得收');
        await click('.hd-claimfab.on');
        await snap('一键收取汇总');
        await click('.hd-claim .hd-btn-gold');
        await page.waitForTimeout(300);
      });
      await attempt('训练营', async () => {
        // 手机竖屏顶栏没有训练营钮（从主寨的操作环进，layout.ts）：用快捷键 T 打开同一个面板，量的是面板
        if (await page.locator('.hd-trainbtn').isVisible()) await click('.hd-trainbtn');
        else await page.keyboard.press('t');
        await page.locator('.hd-train').waitFor({ timeout: 4000 });
        await snap('训练营');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      });
      await attempt('介绍卡片', async () => {
        // 船队面板的兵种卡全在一页上（建造列表分页，第一张带介绍的卡可能在没翻到的页）
        await click('.hd-bottom button:has-text("船队")');
        // 鼠标还停在「船队」钮的位置，面板弹出后正压在一张兵种卡上，悬停会弹介绍卡片把面板盖住：先移开
        await page.mouse.move(0, 0);
        await page.waitForTimeout(400);
        // 主寨 7 级的船队面板（兵种多、每格写满）比新档的挤，单独量一次
        await snap('船队面板（主寨 7 级）');
        const card = page.locator('.hd-fleetgrid .hd-intel-host:visible').first();
        if (v.hasTouch) {
          const b = (await card.boundingBox())!;
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
          await page.waitForTimeout(700);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else await card.click({ button: 'right' });
        try {
          await page.locator('.hd-intel-dlg').waitFor({ timeout: 4000 });
          await snap('介绍卡片');
          await click('.hd-intel-x');
          await page.waitForTimeout(300);
        } finally {
          await closeSheet();
        }
      });
      // 后面的界面照旧用新档量（上面换成了主寨 7 级的岛）
      await fresh();
      await attempt('船队面板', async () => {
        await click('.hd-bottom button:has-text("船队")');
        await page.mouse.move(0, 0);
        await snap('船队面板');
        await closeSheet();
      });
      await attempt('设置弹窗', async () => {
        await click('.hd-mute');
        await page.locator('.hd-settings').first().waitFor({ timeout: 5000 });
        await snap('设置弹窗');
        await closeSheet();
      });
      await attempt('船长档案面板', async () => {
        await click('.hd-profile');
        await snap('船长档案面板');
        await click('.hd-sheet button:has-text("成就和称号")');
        await snap('成就和称号');
        await click('.hd-sheet .hd-tabs button:has-text("收藏")');
        await snap('收藏页');
        await closeSheet();
      });
      await attempt('建筑信息面板（炮台）', async () => {
        await openInfoOf('cannon');
        await snap('建筑信息面板（炮台）');
        await closeSheet();
      });
      await attempt('建筑信息面板（主寨）', async () => {
        // 示范岛（dev.td）没有战役星，主寨升不了、点不到「升级庆祝」：先给够星和钱（give 会重载页面）
        await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.give(200_000, 60_000, 90));
        await ready();
        await page.waitForTimeout(900);
        await openInfoOf('hq');
        await snap('建筑信息面板（主寨）');
        if (await page.locator('.hd-sheet .hd-upbtn').count()) {
          await click('.hd-sheet .hd-upbtn');
          await page.locator('.hd-celebrate').first().waitFor({ timeout: 15_000 });
          await snap('升级庆祝面板', 1200);
          await click('.hd-celebrate button:has-text("先不了"), .hd-celebrate button:has-text("好的")');
          await page.waitForTimeout(1500);
          if (await page.locator('.hd-badge').count()) await snap('成就弹窗', 100);
          else skips.push({ screen: '成就弹窗', view: v.name, reason: '升级后没有弹出成就' });
        }
      });
    });

    // ---- 出海海图、侦察、悬赏
    await group('海图', async () => {
      await fresh();
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.give(9000, 9000, 30));
      await page.waitForTimeout(500);
      await attempt('出海海图', async () => {
        await click('.hd-bottom button:has-text("出海")');
        await page.locator('.hd-map').first().waitFor({ timeout: 8000 });
        await snap('出海海图', 700);
      });
      await attempt('每日三件小事', async () => {
        await click('.hd-goals-card');
        await page.locator('.hd-goals').first().waitFor({ timeout: 5000 });
        await snap('每日三件小事', 400);
        // 点框外的遮罩要能关：点左下角，关不掉就报流程错
        const vp = page.viewportSize()!;
        await page.mouse.click(4, vp.height - 4);
        await page.locator('.hd-goals').first().waitFor({ state: 'detached', timeout: 3000 });
      });
      await attempt('海图岛屿面板', async () => {
        await page.locator('.hd-map .hd-node:has(.hd-num:text-is("1"))').first().dispatchEvent('click');
        await snap('海图岛屿面板', 400);
      });
      await attempt('侦察面板', async () => {
        await click('.hd-map .hd-sheet button:has-text("侦察")');
        await page.locator('.hd-scout').first().waitFor({ timeout: 5000 });
        await snap('侦察面板', 800);
        await click('.hd-scout .hd-x');
        await page.waitForTimeout(300);
      });
      await attempt('悬赏出海选档页', async () => {
        // 海图上的实盘入口是 .hd-live-mapbtn（"悬赏出海（实盘）"）；.hd-bounty 是"今日悬赏"（点开只是岛屿面板），别混
        if (await page.locator('.hd-map .hd-sheet .hd-x').count()) await click('.hd-map .hd-sheet .hd-x');
        await page.waitForTimeout(300);
        await click('.hd-live-mapbtn');
        await page.locator('.hd-live-card').first().waitFor({ timeout: 8000 });
        await snap('悬赏出海选档页', 600);
      });
      await attempt('确认框（悬赏出海）', async () => {
        // 档位卡上的钮是"出海"（带入筹码，先弹确认框）；"娱乐"钮是 hd-btn-plain，要点金色的那个
        await page.locator('.hd-live-card .hd-btn-gold:not(:disabled)').first().click({ timeout: 8000 });
        await page.locator('.hd-dialog:has-text("确定出海")').first().waitFor({ timeout: 8000 });
        await snap('确认框（悬赏出海）', 500);
      });
      await attempt('海图岛屿面板（船坞没跟上）', async () => {
        await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
        await page.evaluate((sv) => localStorage.setItem('haidao.save', sv), DOCK_BEHIND_SAVE);
        await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
        await ready();
        await page.waitForTimeout(800);
        await click('.hd-bottom button:has-text("出海")');
        await page.locator('.hd-map').first().waitFor({ timeout: 8000 });
        await page.locator('.hd-map .hd-node:has(.hd-num:text-is("23"))').first().dispatchEvent('click');
        await page.locator('.hd-map .hd-sheet .hd-dockhint').first().waitFor({ timeout: 5000 });
        await snap('海图岛屿面板（船坞没跟上）', 400);
      });
    });

    // ---- 寻宝航线和整备
    await group('航线', async () => {
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await page.evaluate((sv) => localStorage.setItem('haidao.save', sv), OLD_SAVE);
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await click('.hd-bottom button:has-text("出海")');
      await page.locator('.hd-mapcard').first().waitFor({ timeout: 8000 });
      await attempt('寻宝航线入口卡', () => snap('寻宝航线入口卡'));
      // 今日三件小事、护航、抢劫的卡也带 .hd-mapcard，只点今日航线那张
      await click('.hd-mapcard:not(.hd-goals-card):not(.hd-esc-card):not(.hd-pvp-card)');
      await page.locator('.hd-route .hd-route-node.cur').first().waitFor({ timeout: 8000 });
      await attempt('寻宝航线图页（.hd-route）', () => snap('寻宝航线图页（.hd-route）', 700));
      await attempt('整备条', async () => {
        await click('.hd-route-node.cur');
        await snap('整备条', 500);
      });
    });

    // ---- 护航
    await group('护航', async () => {
      await fresh();
      await click('.hd-bottom button:has-text("出海")');
      await page.locator('.hd-esc-card').first().waitFor({ timeout: 8000 });
      await attempt('护航入口卡（海图）', () => snap('护航入口卡（海图）'));
      await click('.hd-esc-card');
      await page.locator('.hd-esc-sel').first().waitFor({ timeout: 8000 });
      await attempt('护航选图页（.hd-esc-sel）', () => snap('护航选图页（.hd-esc-sel）', 600));
      await click('.hd-esc-go');
      await sceneIs('td', 40_000);
      await page.waitForTimeout(2500);
      await attempt('护航局内', () => snap('护航局内'));
      await attempt('护航造塔面板', async () => {
        await buildSheet();
        await snap('护航造塔面板');
        await closeSheet();
      });
      await attempt('护航结算', () => retreat('确认框（撤退）', '.hd-esc-result', '护航结算'));
    });

    // ---- 守岛：选关页各章节、驻守台选塔
    await group('守岛选关', async () => {
      // 带分叉的存档：选关页不受影响，驻守台选塔卡片上有一张、两张分叉牌
      await fresh(10, '?dev', true);
      await click('.hd-bottom button:has-text("守岛")');
      await page.locator('.hd-tdtab').first().waitFor({ timeout: 8000 });
      const tabs = await page.locator('.hd-tdtab').count();
      for (let i = 0; i < tabs; i++) {
        await attempt(`守岛选关页（第 ${i + 1} 个页签）`, async () => {
          await page.locator('.hd-tdtab').nth(i).click({ timeout: 5000 });
          await snap(`守岛选关页（第 ${i + 1} 个页签）`, 400);
        });
      }
      await attempt('海盗来袭入口', async () => {
        await page.locator('.hd-homecard').scrollIntoViewIfNeeded({ timeout: 5000 });
        await snap('海盗来袭入口', 200);
      });
      await attempt('大潮入口', async () => {
        await page.locator('.hd-tidecard').last().scrollIntoViewIfNeeded({ timeout: 5000 });
        await snap('大潮入口', 200);
      });
      await attempt('驻守台选塔面板', async () => {
        if (!GARRISON_LEVEL) throw new Error('关卡表里没有主寨 ≤5 且带驻守台的关');
        await click(`.hd-tdtab[data-chapter="${GARRISON_LEVEL.chapter}"]`);
        await page.waitForTimeout(300);
        for (let k = 0; k < 3 && !(await page.locator(`.hd-tdcard button[data-level="${GARRISON_LEVEL.id}"]`).count()); k++) await click('.hd-tdpg-next');
        await click(`.hd-tdcard button[data-level="${GARRISON_LEVEL.id}"]`);
        await page.locator('.hd-tdgar').first().waitFor({ timeout: 8000 });
        await snap('驻守台选塔面板', 400);
      });
    });

    // ---- 守岛深度玩法：全 3 星带徽章的存档。选关页天赋钮和「老兵 · 挑战」、天赋页、驻守台面板打法钮、塔面板终极卡
    await group('守岛深度', async () => {
      await fresh(10, '?dev', true, true);
      await click('.hd-bottom button:has-text("守岛")');
      await page.locator('.hd-tdtab').first().waitFor({ timeout: 8000 });
      await click('.hd-tdtab[data-chapter="1"]');
      await attempt('守岛选关页（老兵 · 挑战、天赋钮）', () => snap('守岛选关页（老兵 · 挑战、天赋钮）', 400));
      await attempt('海图天赋页', async () => {
        await click('.hd-tdsel-talent');
        await page.locator('.hd-tdtalent').first().waitFor({ timeout: 5000 });
        await snap('海图天赋页', 400);
        await click('.hd-tdtalent button:has-text("好了")');
        await page.waitForTimeout(300);
      });
      await attempt('驻守台面板（打法钮）', async () => {
        if (!GARRISON_LEVEL) throw new Error('关卡表里没有带驻守台的关');
        await click(`.hd-tdtab[data-chapter="${GARRISON_LEVEL.chapter}"]`);
        await page.waitForTimeout(300);
        for (let k = 0; k < 3 && !(await page.locator(`.hd-tdcard button[data-level="${GARRISON_LEVEL.id}"]`).count()); k++) await click('.hd-tdpg-next');
        await click(`.hd-tdcard button[data-level="${GARRISON_LEVEL.id}"]`);
        await page.locator('.hd-tdgar').first().waitFor({ timeout: 8000 });
        await snap('驻守台面板（打法钮）', 400);
      });
      await attempt('塔面板（3 阶终极卡）', async () => {
        // 驻守台挑一座 3 阶、两档分叉都选了的火枪塔 / 加农炮 / 臼炮，开打后点它
        const ok = await page.evaluate(() => {
          for (const c of document.querySelectorAll<HTMLElement>('.hd-tdgar-card')) {
            if (!['gunTower', 'cannon', 'mortar'].includes(c.dataset.kind ?? '')) continue;
            if (!c.querySelector('.hd-tdgar-tier')?.textContent?.includes('3 阶') || c.querySelectorAll('.hd-chip').length < 2) continue;
            c.click();
            return true;
          }
          return false;
        });
        if (!ok) throw new Error('驻守台没有 3 阶两档分叉的炮塔可选');
        if (v.hasTouch) await click('.hd-tdgar-go');
        else await page.keyboard.press('Space');
        await sceneIs('td', 40_000);
        await page.waitForTimeout(1500);
        const slots = (await info()).slots;
        for (const sl of slots) {
          if (!sl.garrison || sl.tower < 0) continue;
          const p = await pt(sl.x, sl.y);
          await tap(p.x, p.y);
          await page.waitForTimeout(500);
          if (await page.locator('.hd-td-ult').count()) return snap('塔面板（3 阶终极卡）', 100);
          await closeSheet();
        }
        throw new Error('点遍驻守塔都没出终极卡');
      });
    });

    // ---- 守岛局内与结算
    await group('守岛局内', async () => {
      await fresh(10);
      await click('.hd-bottom button:has-text("守岛")');
      await page.locator('.hd-tdtab').first().waitFor({ timeout: 8000 });
      await click('.hd-tdtab[data-chapter="1"]');
      await page.waitForTimeout(300);
      await click('.hd-tdcard button[data-level="td01"]');
      await page.waitForTimeout(600);
      // 带驻守台的关会先弹选塔面板：直接开打
      if (await page.locator('.hd-tdgar').count()) {
        if (v.hasTouch) await click('.hd-tdgar-go');
        else await page.keyboard.press('Space');
      }
      await sceneIs('td', 40_000);
      await attempt('守岛局内（开局倒数）', () => snap('守岛局内（开局倒数）', 1500));
      await attempt('敌人图鉴和克制表', async () => {
        // 点第一行（卡中间那一格「下一座造 / 升级」点了是平移镜头，不开图鉴）
        // 矮竖屏的预告卡只看不点，图鉴从顶栏「图鉴」钮进
        if (await page.locator('.hd-best-btn').isVisible()) await click('.hd-best-btn');
        else await click('.hd-td-plan .hd-plan-r1');
        await page.locator('.hd-td-best').first().waitFor({ timeout: 5000 });
        await snap('敌人图鉴和克制表', 400);
        await click('.hd-td-best .hd-x');
        await page.waitForTimeout(250);
      });
      await attempt('守岛木台造塔面板', async () => {
        const si = await buildSheet();
        await snap('守岛木台造塔面板');
        await click('.hd-td-tower[data-kind="cannon"]');
        await page.waitForTimeout(600);
        const p = await pt((await info()).slots[si]!.x, (await info()).slots[si]!.y);
        await tap(p.x, p.y);
        await page.waitForTimeout(500);
        await snap('守岛塔升级面板', 100);
        await closeSheet();
      });
      await attempt('守岛局内（战斗中）', async () => {
        await click('.hd-td-call');
        await snap('守岛局内（战斗中）', 4000);
      });
      await attempt('守岛结算', () => retreat('确认框（守岛撤退）', '.hd-td-result', '守岛结算'));
    });

    // ---- 海盗来袭
    await group('海盗来袭', async () => {
      await fresh(5, '?dev&fast');
      await click('.hd-bottom button:has-text("守岛")');
      await page.locator('.hd-homecard').first().waitFor({ timeout: 8000 });
      await click('.hd-homecard button[data-home]');
      await sceneIs('td', 40_000);
      await page.waitForTimeout(1500);
      await attempt('海盗来袭局内', () => snap('海盗来袭局内'));
      await attempt('海盗来袭结算', () => retreat('确认框（海盗来袭撤退）', '.hd-home-result', '海盗来袭结算'));
    });

    // ---- 大潮
    await group('大潮', async () => {
      await fresh(5, '?dev&fast');
      await click('.hd-bottom button:has-text("守岛")');
      await page.locator('.hd-tidecard').first().waitFor({ timeout: 8000 });
      await click('.hd-tidecard:not(.hd-homecard) button[data-tide]');
      await sceneIs('td', 40_000);
      await page.waitForTimeout(1500);
      await attempt('大潮局内', () => snap('大潮局内'));
      await attempt('大潮结算', () => retreat('确认框（大潮撤退）', '.hd-tide-result', '大潮结算'));
    });

    // ---- 登陆战 c04
    await group('登陆战', async () => {
      await page.goto(`${ROOT}?battle=c04&dev`, { timeout: 60_000 });
      await ready();
      await attempt('登陆战局内（c04）', () => snap('登陆战局内（c04）', 2500));
      await page.goto(`${ROOT}?battle=c04&auto&fast&dev`, { timeout: 60_000 });
      await ready();
      await sceneIs('result', 120_000);
      await attempt('登陆战结算', () => snap('登陆战结算', 3300));
    });

    // ---- 悬赏守岛选档（假钱包）
    await group('悬赏守岛', async () => {
      await fresh(3);
      await click('.hd-bottom button:has-text("守岛")');
      await page.locator('.hd-tdsel-live').first().waitFor({ timeout: 8000 });
      await click('.hd-tdsel-live');
      await page.locator('.hd-live-card button[data-tier="small"]').first().waitFor({ timeout: 8000 });
      await attempt('悬赏守岛选档页', () => snap('悬赏守岛选档页', 600));
      await attempt('确认框（悬赏守岛带入）', async () => {
        await click('.hd-live-card button[data-tier="small"]');
        await page.locator('.hd-dialog .hd-btn-gold', { hasText: '确定开守' }).last().waitFor({ timeout: 8000 });
        await snap('确认框（悬赏守岛带入）', 300);
      });
    });

    // ---- 打玩家
    await group('打玩家', async () => {
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await page.evaluate((sv) => localStorage.setItem('haidao.save', sv), OLD_SAVE);
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await click('.hd-bottom button:has-text("出海")');
      await page.locator('.hd-pvp-card').first().waitFor({ timeout: 8000 });
      await click('.hd-pvp-card');
      await page.locator('.hd-pvp button:has-text("找对手")').first().waitFor({ timeout: 10_000 });
      await attempt('打玩家面板', () => snap('打玩家面板', 400));
      await attempt('打玩家面板（找到对手）', async () => {
        await click('.hd-pvp button:has-text("找对手")');
        await page.locator('.hd-pvp button:has-text("开打")').first().waitFor({ timeout: 10_000 });
        await snap('打玩家面板（找到对手）', 400);
      });
    });

    // ---- 追加界面：更新弹窗、防守记录、兑换、新手引导、加载页
    await group('追加', async () => {
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await page.evaluate((sv) => localStorage.setItem('haidao.save', sv), OLD_SAVE);
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await attempt('筹码兑换面板', async () => {
        await click('.hd-live-xbtn');
        await snap('筹码兑换面板', 500);
        await closeSheet();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      });
      await click('.hd-bottom button:has-text("出海")');
      await page.locator('.hd-pvp-card').first().waitFor({ timeout: 8000 });
      await click('.hd-pvp-card');
      await page.locator('.hd-pvp button:has-text("找对手")').first().waitFor({ timeout: 10_000 });
      await attempt('防守记录（空）', async () => {
        // 防守记录是打玩家面板里的一段（h2「防守记录」+ 列表），不是按钮；还没人打过时是一行空状态
        await page.locator('.hd-pvp .hd-pvp-empty:has-text("还没有人来打过你的岛")').first().waitFor({ timeout: 8000 });
        await snap('防守记录（空）', 400);
      });
      await attempt('游戏更新了弹窗', async () => {
        fake.staleNext = true;
        await click('.hd-pvp button:has-text("找对手")');
        await page.locator('.hd-dialog:has-text("游戏更新了")').first().waitFor({ timeout: 8000 });
        await snap('游戏更新了弹窗', 400);
      });
    });
    await group('防守记录', async () => {
      // 造 6 条被打记录：一页 1–4 条（看屏高），所以五个尺寸都有第 2 页可翻
      await fake.raidMe(6);
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await page.evaluate((sv) => localStorage.setItem('haidao.save', sv), OLD_SAVE);
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(1500);
      await attempt('防守记录（被打提示）', async () => {
        await page.locator('.hd-dialog:has-text("你不在时被打了")').first().waitFor({ timeout: 8000 });
        await snap('防守记录（被打提示）', 400);
      });
      // 提示框不管有没有量都要关掉，别挡住后面的真实入口
      if (await page.locator('.hd-dialog:has-text("你不在时被打了")').count()) await click('.hd-dialog button:has-text("知道了")');
      await page.waitForTimeout(300);
      // 真实入口：基地底栏「出海」→ 海图「打玩家」→ 面板里的防守记录
      await click('.hd-bottom button:has-text("出海")');
      await page.locator('.hd-pvp-card').first().waitFor({ timeout: 8000 });
      await click('.hd-pvp-card');
      await page.locator('.hd-pvp .hd-pvp-item').first().waitFor({ timeout: 10_000 });
      const pages = async (): Promise<string> => (await page.locator('.hd-pvp-pager .hd-n').first().textContent({ timeout: 3000 }).catch(() => null)) ?? '';
      await attempt('防守记录（有记录）', async () => {
        const n = await page.locator('.hd-pvp .hd-pvp-item').count();
        if (n === 0) throw new Error('面板里没有记录条目');
        await snap('防守记录（有记录）', 400);
      });
      await attempt('防守记录（翻页）', async () => {
        const pg = await pages();
        if (!pg) throw new Error('没有翻页器：记录条数不够多');
        await click('.hd-pvp-pager button:has-text("下一页")');
        await page.waitForTimeout(300);
        await snap(`防守记录（翻页）`, 300);
      });
      await attempt('防守记录（末页）', async () => {
        for (let k = 0; k < 6; k++) {
          const nx = page.locator('.hd-pvp-pager button:has-text("下一页")');
          if (!(await nx.count()) || (await nx.first().isDisabled())) break;
          await nx.first().click({ timeout: 3000 });
          await page.waitForTimeout(150);
        }
        await snap('防守记录（末页）', 300);
      });
    });
    await group('新手引导', async () => {
      await page.goto(`${ROOT}`, { timeout: 60_000 });
      await page.evaluate(() => localStorage.clear());
      const p2 = page.goto(`${ROOT}?fast`, { timeout: 60_000, waitUntil: 'commit' });
      await p2;
      await attempt('加载页', async () => { await snap('加载页', 150); });
      await ready();
      await page.waitForTimeout(1500);
      await attempt('新手引导第一步', () => snap('新手引导第一步', 500));
    });

    await ctx.close();
    console.log(`${v.name}：量完`);
  }
} finally {
  await browser.close();
  await server.close();
}

// ---------------------------------------------------------------- 报表

const by = new Map<string, Map<string, Rec>>();
for (const r of recs) {
  if (!by.has(r.screen)) by.set(r.screen, new Map());
  by.get(r.screen)!.set(r.view, r);
}
let bad = 0;
let qBad = 0;
const VIEW_TOUCH = new Map(VIEWS.map((v) => [v.name, v.hasTouch]));
console.log('\n界面\t尺寸\t元素\t种类\tscrollHeight/clientHeight\t超出');
for (const [screen, vs] of by) {
  for (const [view, r] of vs) {
    for (const t of r.small) console.log(`${screen}\t${view}\t小按钮\t${t}`);
    for (const t of r.off) console.log(`${screen}\t${view}\t出视口\t${t}`);
    for (const t of r.overlap) console.log(`${screen}\t${view}\t重叠\t${t}`);
    for (const t of r.cut) console.log(`${screen}\t${view}\t裁字\t${t}`);
    for (const t of qFails(r.q, VIEW_TOUCH.get(view) ?? false)) {
      qBad++;
      console.log(`${screen}\t${view}\t不达标\t${t}`);
    }
    for (const it of r.items) {
      bad++;
      console.log(`${screen}\t${view}\t${it.sel}\t${it.kind === 'scroll' ? '滚动条' : it.kind === 'clip' ? '被截' : '页面'}\t${it.sh}/${it.ch}\t+${it.sh - it.ch}`);
    }
  }
}
const nOver = recs.reduce((n, r) => n + r.overlap.length, 0);
const nCut = recs.reduce((n, r) => n + r.cut.length, 0);
console.log(`\n共 ${bad} 处超出、${nOver} 处重叠、${nCut} 处裁字，质量线 ${qBad} 处不达标，量了 ${recs.length} 个界面×尺寸。`);
if (skips.length) {
  console.log('\n进不去的：');
  for (const s of skips) console.log(`${s.screen}\t${s.view}\t${s.reason}`);
}
writeFileSync(join(OUT, 'noscroll.json'), JSON.stringify({ measured: recs, skipped: skips }, null, 1));
process.exit(0);
