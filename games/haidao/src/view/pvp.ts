/**
 * 异步攻防的界面（DESIGN.md 第 5 节）：海图上"打玩家"打开的面板、找对手、开打后交结果、防守记录（看回放、复仇）、
 * 被打后打开游戏时的提示。DOM 组件照 ui.ts，类名 hd-pvp-*，样式限定在 .hd-ui 下。
 * 结果一律以服务端重放为准，浏览器算的只在等回话时不显示；掠夺、被扣的资源经待扣 / 待领同步进本地存档。
 */
import { rankTitle } from './ranktext.ts';
import { RULES_VERSION, armyCost, armyFor, heroLevel, hqLevel, islandExt, rankOf } from '../core/index.ts';
import { raidSetup, replayRaid } from '../core/pvp.ts';
import type { BattleAction, Res } from '../core/types.ts';
import { applyPending, pvpApi, pvpReady, pvpState, readLocal, rulesTooNew, writeLocal, type DefenseBrief, type Me, type RaidStart } from '../net/pvp.ts';
import { app } from './app.ts';
import { lackText } from './basefeel.ts';
import { iconA } from './art.ts';
import { button, costRow, el, img, openModal, toast, uiRoot } from './ui.ts';

const ERR: Record<string, string> = {
  no_platform: '这个版本没有联机，单机照常玩',
  login: '登录后才能打别的玩家',
  no_snapshot: '基地还没同步上去，在岛上待一会儿再来',
  rate_limited: '打得太勤了，歇一会儿再来',
  busy: '今天联机的人太多了，明天再来',
  shield: '对方开着护盾，打不了',
  locked: '对方正在被别人打，过几分钟再来',
  revenged: '已经复仇过了',
  too_late: '超过 24 小时，不能复仇了',
  offline: '网络断了，稍后再试',
};
const errText = (e: string): string => ERR[e] ?? '暂时连不上，稍后再试';

/** 游戏更新了：旧页面按旧规则演会和服务端对不上，弹窗带"刷新"按钮（toast 一闪就没了，不够）。同一时间只弹一个 */
export function needReload(): void {
  style();
  if (uiRoot().querySelector('.hd-pvp-reload')) return;
  // 必须刷新：点遮罩和 Esc 都不关；叠在别的弹窗（结算）上，不把它顶掉
  const mask = openModal({ cls: 'hd-pvp-reload', closable: false, stack: true });
  const box = el('div', 'hd-dialog hd-pvp', undefined, mask);
  el('h2', '', '游戏更新了', box);
  el('p', 'hd-pvp-empty', '刷新一下就能继续玩', box);
  button('刷新', 'hd-btn-gold hd-btn-wide', () => location.reload(), box);
}

/** 找对手 / 复仇失败的统一提示：规则版本对不上弹刷新，其余 toast */
function failTip(error: string): void {
  if (error === 'need_reload') needReload();
  else toast(errText(error));
}

/** 找到的对手可不可以打：服务端的规则比本页新就弹刷新、不开打（调用方不再往下走） */
function usable(s: RaidStart): boolean {
  if (!rulesTooNew(s.setup)) return true;
  needReload();
  return false;
}
const TITLES = ['这次没成功', '拿下了！', '漂亮！', '大获全胜！'];
/** 最近一次拿到的"我的"状态：对手面板据此提示护盾、新手保护 */
let lastMe: Me | null = null;
/** 复仇的场次：结算页不提港口赏金（复仇不发） */
const revengeRaids = new Set<string>();

const ago = (at: number): string => {
  const m = Math.max(0, Date.now() - at) / 60_000;
  return m < 60 ? `${Math.max(1, Math.floor(m))} 分钟前` : m < 1440 ? `${Math.floor(m / 60)} 小时前` : `${Math.floor(m / 1440)} 天前`;
};

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  const st = el('style');
  st.textContent = `
.hd-ui .hd-pvp-mapbtn { position:absolute; top:112px; right:6px; z-index:31; }
.hd-ui .hd-pvp { width:min(100%,420px); max-height:86%; overflow:auto; }
.hd-ui .hd-pvp h2 { margin:0 0 8px; font-size:20px; font-weight:900; text-align:center; }
.hd-ui .hd-pvp-stat { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:0 0 10px; }
.hd-ui .hd-pvp-chip { background:rgba(0,0,0,.08); border-radius:10px; padding:4px 10px; font-size:14px; font-weight:700; }
.hd-ui .hd-pvp-tag { display:inline-block; background:#7a5c3a; color:#fff4dc; border-radius:8px; padding:1px 8px; font-size:12px; margin-left:6px; vertical-align:middle; }
.hd-ui .hd-pvp-list { display:flex; flex-direction:column; gap:8px; margin:8px 0 12px; }
.hd-ui .hd-pvp-item { background:rgba(255,255,255,.55); border-radius:12px; padding:8px 10px; font-size:14px; }
.hd-ui .hd-pvp-item .hd-row { margin-top:6px; }
.hd-ui .hd-pvp-item .hd-btn { min-height:44px; flex:1; }
.hd-ui .hd-pvp-stars img { vertical-align:middle; }
.hd-ui .hd-pvp-empty { text-align:center; opacity:.7; font-size:14px; margin:8px 0 12px; }
.hd-ui .hd-pvp-stars { display:inline-flex; gap:2px; align-items:center; vertical-align:middle; }
.hd-ui .hd-pvp-stars img { display:inline-block; }
.hd-ui .hd-pvp .hd-sub { margin:0 0 10px; }
.hd-ui .hd-pvp-item .hd-pvp-ago { opacity:.6; font-size:12px; margin-left:6px; }
.hd-ui .hd-pvp-chip.strong { background:#b3261e; color:#fff4dc; }
.hd-ui .hd-pvp-tag.real { background:#2f7d4f; }
.hd-ui .hd-pvp-replaytag { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 112px); left:50%; transform:translateX(-50%); z-index:30; background:rgba(20,35,58,.82); color:#fff4dc; border-radius:10px; padding:6px 14px; font-size:14px; font-weight:800; pointer-events:none; white-space:nowrap; }
.hd-ui .hd-pvp .hd-btn-wide { width:100%; min-height:44px; margin-top:8px; }
.hd-ui .hd-pvp-pager { display:flex; gap:8px; align-items:center; justify-content:center; margin:-4px 0 8px; }
.hd-ui .hd-pvp-pager .hd-btn { min-height:44px; min-width:76px; }
.hd-ui .hd-pvp-pager[hidden] { display:none; }
.hd-ui .hd-pvp-acts { margin:0 0 8px; }
.hd-ui .hd-pvp-acts .hd-btn { flex:1; min-height:44px; }
.hd-ui .hd-pvp .hd-pvp-h3 { font-size:16px; margin:8px 0 0; }
@media (orientation:landscape) and (max-height:500px) {
  .hd-ui .hd-pvp { max-height:96%; padding:10px 14px; width:min(100%,460px); }
  .hd-ui .hd-pvp h2 { margin:0 0 4px; }
  .hd-ui .hd-pvp-list { margin:4px 0 6px; }
  .hd-ui .hd-pvp-item .hd-row { margin-top:4px; }
  .hd-ui .hd-pvp-stat { margin:0 0 4px; }
  .hd-ui .hd-pvp-acts { margin:0 0 4px; }
  .hd-ui .hd-pvp .hd-pvp-h3 { margin:2px 0 0; }
  .hd-ui .hd-pvp-item { display:flex; align-items:center; gap:8px; padding:6px 10px; }
  .hd-ui .hd-pvp-itxt { flex:1; min-width:0; }
  .hd-ui .hd-pvp-item .hd-row { margin-top:0; flex:none; }
  .hd-ui .hd-pvp-item .hd-btn { flex:none; min-width:76px; }
}
`;
  document.head.appendChild(st);
}

/** closable 默认 true（Esc 和点遮罩关）；结算页传 false 并用 onEsc 指向主按钮 */
function dialog(opts: { closable?: boolean; onEsc?: () => void } = {}): { mask: HTMLElement; box: HTMLElement } {
  style();
  const mask = openModal({ closable: opts.closable ?? true, onEsc: opts.onEsc });
  const box = el('div', 'hd-dialog hd-pvp', undefined, mask);
  return { mask, box };
}

function stars(n: number, px = 18): HTMLElement {
  const s = el('span', 'hd-pvp-stars');
  for (let i = 0; i < 3; i++) s.appendChild(img(iconA(i < n ? 'star' : 'starEmpty'), px));
  return s;
}

const hoursLeft = (until: number): string => {
  const h = Math.max(0, until - Date.now()) / 3600_000;
  return h >= 24 ? `${Math.ceil(h / 24)} 天` : h >= 1 ? `${Math.ceil(h)} 小时` : `${Math.max(1, Math.ceil(h * 60))} 分钟`;
};

/** 待扣 / 待领：加进本地存档，记下处理过的，再 ack 全部（ack 没送达下次再来，靠 applied 不重复加） */
async function syncPending(me: Me): Promise<void> {
  await applyAndAck(me.pending);
}

/** 也给兑换用（src/view/live.ts）：换来的资源同样是一条待领 */
export async function applyAndAck(pending: Me['pending']): Promise<void> {
  if (pending.length === 0) return;
  const local = readLocal();
  const r = applyPending(app.profile, pending, local.applied);
  if (r.fresh.length > 0) {
    app.commit(r.profile);
    app.reload();
    local.applied.push(...r.fresh.map((x) => x.raidId));
    writeLocal(local);
  }
  await pvpApi.ack(pending.map((x) => x.raidId));
}

/** 有几条自己没看过的防守记录（基地底栏「出海」上的红点用；只看打开游戏时取回的那份） */
export function unseenDefenseCount(): number {
  if (!lastMe) return 0;
  const seen = readLocal().seenAt;
  return lastMe.defenses.filter((d) => d.at > seen).length;
}

/** 打开游戏时调：取回待扣 / 待领；你不在时被打了就弹提示 */
export async function checkRaided(): Promise<void> {
  const r = await pvpApi.me();
  if (!r.ok) return;
  lastMe = r.data;
  await syncPending(r.data);
  const local = readLocal();
  const fresh = r.data.defenses.filter((d) => d.at > local.seenAt);
  if (fresh.length === 0) return;
  writeLocal({ ...readLocal(), seenAt: Math.max(...fresh.map((d) => d.at)) });
  const { mask, box } = dialog();
  el('h2', '', `你不在时被打了 ${fresh.length} 次`, box);
  const lost = fresh.reduce((a, d) => ({ gold: a.gold + d.lost.gold, wood: a.wood + d.lost.wood }), { gold: 0, wood: 0 });
  const row = el('div', 'hd-pvp-stat', undefined, box);
  const c = el('span', 'hd-pvp-chip', '一共被抢 ', row);
  c.appendChild(costRow(lost)).classList.add('hd-neg');
  const fit = defenseList(fresh, box, () => mask.remove());
  button('知道了', 'hd-btn-gold hd-btn-wide', () => mask.remove(), box);
  fit();
}

function defenseList(list: DefenseBrief[], parent: HTMLElement, close: () => void): () => void {
  if (list.length === 0) {
    el('p', 'hd-pvp-empty', '还没有人来打过你的岛', parent);
    return () => undefined;
  }
  // 记录可以很多：一页只放放得下的几条，翻页看，不滚动。放得下几条靠量（fit），不按屏高猜：
  // 面板里还有别的按钮，各尺寸剩下的高度差得多，按 innerHeight 分档在五个尺寸上都会滚
  let per = Math.min(4, list.length);
  let pages = 1;
  let page = 0;
  const wrap = el('div', 'hd-pvp-list', undefined, parent);
  const pager = el('div', 'hd-pvp-pager', undefined, parent);
  const render = (): void => {
    pages = Math.ceil(list.length / per);
    page = Math.min(page, pages - 1);
    wrap.textContent = '';
    pager.replaceChildren();
    pager.hidden = pages <= 1;
    if (pages > 1) {
      const prev = button('上一页', 'hd-btn-plain', () => { page--; render(); }, pager);
      prev.disabled = page === 0;
      el('span', 'hd-n', `${page + 1} / ${pages}`, pager);
      const next = button('下一页', 'hd-btn-plain', () => { page++; render(); }, pager);
      next.disabled = page === pages - 1;
    }
    for (const d of list.slice(page * per, page * per + per)) item(d);
  };
  const item = (d: DefenseBrief): void => {
    const it = el('div', 'hd-pvp-item', undefined, wrap);
    // 文字包一层：矮横屏上文字在左、两个按钮在右，一条记录少占一行按钮的高度
    const txt = el('div', 'hd-pvp-itxt', undefined, it);
    const head = el('div', '', undefined, txt);
    el('b', '', d.attacker, head);
    el('span', 'hd-pvp-ago', ago(d.at), head);
    const line = el('div', '', undefined, txt);
    line.appendChild(stars(d.stars, 16));
    el('span', '', ` 拆了 ${d.pct}%`, line);
    const sub = el('div', '', undefined, txt);
    if (d.lost.gold || d.lost.wood) {
      sub.appendChild(document.createTextNode('被抢 '));
      sub.appendChild(costRow(d.lost)).classList.add('hd-neg');
    } else sub.appendChild(document.createTextNode('守住了，一点没丢'));
    if (d.trophies) {
      sub.appendChild(document.createTextNode('  奖杯 '));
      el('span', `hd-n ${d.trophies > 0 ? 'hd-pos' : 'hd-neg'}`, `${d.trophies > 0 ? '+' : ''}${d.trophies}`, sub);
    }
    const row = el('div', 'hd-row', undefined, it);
    button('看回放', 'hd-btn-wood', () => {
      close();
      void watch(d.raidId, d.rules);
    }, row);
    if (d.revenge) {
      button('复仇', 'hd-btn-gold', () => {
        void pvpApi.revenge(d.raidId).then((r) => {
          if (!r.ok) return failTip(r.error);
          if (!usable(r.data)) return;
          close();
          opponent(r.data, true);
        });
      }, row);
    }
  };
  render();
  // 面板（.hd-pvp）是滚动容器：有滚动就少放一条再画，直到放得下或只剩一条
  const box = parent.closest<HTMLElement>('.hd-pvp');
  return () => {
    while (box && per > 1 && box.scrollHeight > box.clientHeight + 1) {
      per--;
      render();
    }
  };
}

/** 海图上的"打玩家"：奖杯、护盾、找对手、防守记录 */
export function openPvp(onClose: () => void): void {
  const { mask, box } = dialog({ onEsc: () => back.click() });
  const close = (): void => {
    mask.remove();
  };
  el('h2', '', '打别的海盗', box);
  // 试打自己的岛不走网络，接口失败时也能点；找对手接口回来后并进同一行（省一行按钮的高度，一屏放得下防守记录）
  const acts = el('div', 'hd-row hd-pvp-acts', undefined, box);
  button('试打自己的岛', 'hd-btn-plain', () => {
    close();
    trySelf(onClose);
  }, acts);
  const body = el('div', '', undefined, box);
  el('p', 'hd-pvp-empty', '正在看港口…', body);
  const back = button('回岛', 'hd-btn-wood hd-btn-wide', () => {
    close();
    onClose();
  }, box);
  void pvpApi.me().then(async (r) => {
    body.textContent = '';
    if (!r.ok) {
      el('p', 'hd-pvp-empty', errText(r.error), body);
      return;
    }
    await syncPending(r.data);
    writeLocal({ ...readLocal(), seenAt: Math.max(readLocal().seenAt, ...r.data.defenses.map((d) => d.at)) });
    const m = (lastMe = r.data);
    const stat = el('div', 'hd-pvp-stat', undefined, body);
    el('span', 'hd-pvp-chip', `奖杯 ${m.trophies}`, stat);
    if (m.shieldUntil) el('span', 'hd-pvp-chip', `护盾还有 ${hoursLeft(m.shieldUntil)}`, stat);
    if (m.protectUntil) el('span', 'hd-pvp-chip', `新手保护还有 ${hoursLeft(m.protectUntil)}`, stat);
    if (m.shieldUntil) el('p', 'hd-sub', '去打别人会马上失去护盾。', body);
    const cost = armyCost(app.profile);
    const go = button(app.profile.res.wood < cost.wood ? lackText({ gold: 0, wood: cost.wood }, app.profile.res) : '找对手', 'hd-btn-gold', () => {
      go.disabled = true;
      void pvpApi.find().then((f) => {
        go.disabled = false;
        if (!f.ok) return failTip(f.error);
        if (!usable(f.data)) return;
        close();
        opponent(f.data, false, onClose);
      });
    }, acts);
    go.disabled = app.profile.res.wood < cost.wood;
    el('h2', 'hd-pvp-h3', '防守记录', body);
    const fit = defenseList(m.defenses, body, close);
    // 矮横屏（高 ≤ 500）回岛也并进上面那一行，竖屏和电脑仍在最下面
    if (matchMedia('(orientation:landscape) and (max-height:500px)').matches) {
      back.classList.remove('hd-btn-wide');
      acts.prepend(back);
    } else body.appendChild(back);
    fit();
  });
}

/**
 * 试打自己的岛：用自己现在的布局、船队和驻岛英雄开一局登陆战（DESIGN 3）。
 * 不扣出海木材、不调任何 pvp 接口（不结算资源、不进攻防记录、不动奖杯）；结果只在本机用同一份核心算一遍给自己看。
 */
export function trySelf(onClose: () => void = () => app.goBase()): void {
  const p = app.profile;
  const setup = raidSetup(p.base.buildings, islandExt(p.base.buildings), armyFor(p), (Date.now() & 0x3fffffff) | 1, heroLevel(p));
  app.startPvp(setup, {
    rank: rankOf(p),
    onFinish: (log, end) => {
      const r = replayRaid(setup, log, end).result;
      let main: HTMLButtonElement | undefined;
      const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
      el('h2', '', '试打结果', box);
      box.appendChild(stars(r.stars, 40));
      const row = el('div', 'hd-pvp-stat', undefined, box);
      el('span', 'hd-pvp-chip', `拆了 ${r.destroyedPct}%`, row);
      el('p', 'hd-sub', '只是练习：没有任何损失，也不算战绩。', box);
      const btns = el('div', 'hd-row', undefined, box);
      button('回岛', 'hd-btn-plain', () => {
        mask.remove();
        onClose();
      }, btns);
      main = button('再试一次', 'hd-btn-gold', () => {
        mask.remove();
        trySelf(onClose);
      }, btns);
    },
  });
}

/** 找到的对手：昵称、奖杯、主寨、预计掠夺，开打 / 换一个 */
function opponent(s: RaidStart, revenge: boolean, onClose: () => void = () => app.goBase()): void {
  const { mask, box } = dialog({ onEsc: () => giveUp.click() });
  const h = el('h2', '', s.opponent.name, box);
  if (s.wanderer) el('span', 'hd-pvp-tag', '电脑', h);
  else el('span', 'hd-pvp-tag real', '真人', h);
  if (revenge) {
    el('span', 'hd-pvp-tag', '复仇', h);
    revengeRaids.add(s.raidId);
  }
  const cost = armyCost(app.profile);
  const stat = el('div', 'hd-pvp-stat', undefined, box);
  el('span', 'hd-pvp-chip', `奖杯 ${s.opponent.trophies}`, stat);
  el('span', 'hd-pvp-chip', `主寨 ${s.opponent.hq} 级`, stat);
  if (s.opponent.rank) el('span', 'hd-pvp-chip', rankTitle(s.opponent.rank), stat);
  // 对手主寨比自己高：防守方高一级时进攻方胜率很低（DESIGN.md 5.9），醒目提示一下
  if (!s.wanderer && s.opponent.hq > hqLevel(app.profile)) el('span', 'hd-pvp-chip strong', '更强', stat);
  const loot = el('div', 'hd-pvp-stat', undefined, box);
  const c = el('span', 'hd-pvp-chip', '最多能抢 ', loot);
  c.appendChild(costRow(s.maxGain));
  const c2 = el('span', 'hd-pvp-chip', '出海要 ', loot);
  c2.appendChild(costRow({ gold: 0, wood: cost.wood }, app.profile.res));
  if (s.wanderer) el('p', 'hd-sub', '港口里暂时没有段位合适的玩家，这是电脑扮的流浪海盗，掠夺由系统发。', box);
  else if (revenge) el('p', 'hd-sub', '复仇只拿回他抢走的那部分（最多两成，按拆掉多少算），港口不发赏金；复仇不能再被复仇。', box);
  else el('p', 'hd-sub', '打赢能抢走他仓库的一部分（最多两成，按拆掉多少算），港口另发一半赏金；他会得到护盾，能看回放、找你复仇。', box);
  if (lastMe?.shieldUntil) el('p', 'hd-sub', `你的护盾还有 ${hoursLeft(lastMe.shieldUntil)}，开打就没了。`, box);
  else if (lastMe?.protectUntil) el('p', 'hd-sub', `你还在新手保护期（${hoursLeft(lastMe.protectUntil)}），别人匹配不到你；去打别人不影响保护。`, box);
  const row = el('div', 'hd-row', undefined, box);
  if (!revenge) {
    button('换一个', 'hd-btn-wood', () => {
      void pvpApi.cancel(s.raidId).then(() => pvpApi.find()).then((f) => {
        if (!f.ok) return failTip(f.error);
        if (!usable(f.data)) return;
        mask.remove();
        opponent(f.data, false, onClose);
      });
    }, row);
  }
  const go = button('开打', 'hd-btn-gold', () => {
    if (app.profile.res.wood < cost.wood) return toast(`${lackText({ gold: 0, wood: cost.wood }, app.profile.res)}，先回岛收一收`);
    mask.remove();
    fight(s, cost);
  }, row);
  go.disabled = app.profile.res.wood < cost.wood;
  const giveUp = button('不打了', 'hd-btn-plain hd-btn-wide', () => {
    void pvpApi.cancel(s.raidId);
    mask.remove();
    onClose();
  }, box);
}

/** 开打：出海木材本地先扣（和战役一样），打完交操作 */
function fight(s: RaidStart, cost: Res): void {
  const p = app.profile;
  app.commit({ ...p, res: { gold: p.res.gold - cost.gold, wood: p.res.wood - cost.wood } });
  app.startPvp(s.setup, { rank: s.opponent.rank, onFinish: (log, end) => submit(s, log, end) });
}

function submit(s: RaidStart, log: BattleAction[], end: number): void {
  let main: HTMLButtonElement | undefined;
  const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
  el('h2', '', '清点战利品…', box);
  const go = (): void => {
    void pvpApi.finish(s.raidId, log, end).then(async (r) => {
      box.textContent = '';
      if (!r.ok) {
        el('h2', '', '结果没交上去', box);
        el('p', '', errText(r.error), box);
        const row = el('div', 'hd-row', undefined, box);
        main = button('回岛', 'hd-btn-plain', () => {
          mask.remove();
          app.goBase();
        }, row);
        button('再交一次', 'hd-btn-gold', go, row);
        return;
      }
      const o = r.data;
      el('h2', '', o.expired ? '超时了，这场不算' : (TITLES[o.stars] ?? ''), box);
      const st = el('div', 'hd-pvp-stat', undefined, box);
      st.appendChild(stars(o.stars, 40));
      const row = el('div', 'hd-pvp-stat', undefined, box);
      el('span', 'hd-pvp-chip', `摧毁 ${o.pct}%`, row);
      const tc = el('span', 'hd-pvp-chip', '奖杯 ', row);
      el('span', `hd-n ${o.trophies >= 0 ? 'hd-pos' : 'hd-neg'}`, `${o.trophies >= 0 ? '+' : ''}${o.trophies}`, tc);
      const lo = el('div', 'hd-pvp-stat', undefined, box);
      const c = el('span', 'hd-pvp-chip', '抢到 ', lo);
      c.appendChild(costRow(o.gain)).classList.add('hd-pos');
      if (!o.wanderer && !revengeRaids.has(s.raidId) && (o.gain.gold || o.gain.wood)) el('p', 'hd-sub', '里面有三分之一是港口发的赏金。', box);
      const me = await pvpApi.me();
      if (me.ok) await syncPending(me.data);
      main = button('回岛', 'hd-btn-gold hd-btn-wide', () => {
        mask.remove();
        app.goBase();
      }, box);
    });
  };
  go();
}

/** 防守回放：同一份规则核心按记录的操作重演 */
async function watch(raidId: string, rules: number): Promise<void> {
  const r = await pvpApi.defense(raidId);
  if (!r.ok) return toast(errText(r.error));
  // 回放只按现在的规则放，不保证跨版本
  if (rules !== RULES_VERSION) toast('这是旧版本的回放，可能放得不对');
  // 回放时画面上挂一条"回放"，免得以为是自己在打
  style();
  const tag = el('div', 'hd-pvp-replaytag', `回放 · ${r.data.attacker} 的进攻`, uiRoot());
  app.startPvp(r.data.setup, {
    rank: rankOf(app.profile),
    replay: { actions: r.data.actions, end: r.data.endTick },
    onFinish: () => {
      tag.remove();
      let main: HTMLButtonElement | undefined;
      const { mask, box } = dialog({ closable: false, onEsc: () => main?.click() });
      el('h2', '', `${r.data.attacker} 的进攻`, box);
      const st = el('div', 'hd-pvp-stat', undefined, box);
      st.appendChild(stars(r.data.stars, 32));
      const row = el('div', 'hd-pvp-stat', undefined, box);
      el('span', 'hd-pvp-chip', `拆了 ${r.data.pct}%`, row);
      const lost = el('span', 'hd-pvp-chip', r.data.lost.gold || r.data.lost.wood ? '被抢 ' : '一点没丢', row);
      if (r.data.lost.gold || r.data.lost.wood) lost.appendChild(costRow(r.data.lost)).classList.add('hd-neg');
      main = button('回岛', 'hd-btn-gold hd-btn-wide', () => {
        mask.remove();
        app.goBase();
      }, box);
    },
  });
}

/** 海图上的入口按钮（单独部署、没登录时不显示）；回一个移除函数 */
export function pvpMapButton(onOpen: () => void): () => void {
  if (pvpState.off || !pvpReady()) return () => undefined;
  style();
  const b = button('打玩家', 'hd-btn-gold hd-pvp-mapbtn', onOpen, uiRoot());
  return () => b.remove();
}
