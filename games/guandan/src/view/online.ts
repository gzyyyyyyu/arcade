/**
 * 好友房的大厅（DOM 层，输房间码用原生输入框，手机上好打字）：开房、输码进房、选座、房主开局；牌桌上的"重连中"横条。
 * 标题页一直有"好友房"（0.3.0 起）；?online=1 启动后直接打开这个面板（平台大厅的入口）。房间、牌局都在服务端，这里只发意图、照房间的信息画。
 * 每天的额度（arcade-kit 0.2.0）：已经有房间给"回到房间"，今天开房次数用完、今天人太多都说成一句话，单机照常。
 * 快速匹配（0.26.0，kit 0.20.0 的 MatchClient，设计在 kit 的 docs/match.md）：排队也画在这张卡上；排到了照好友房进房，只是不给房间码、邀请、开局。
 */
import { MATCH_TEXT, MatchClient, type MatchSoloWhy } from 'arcade-kit/client';
import { CLOSE } from 'arcade-kit/protocol';
import { app } from './app.ts';
import { audio } from './common/audio.ts';
import { NetSession } from './guandan/net.ts';
import { createRoom, forgetRoom, isFinalForRoom, myRoom, roomInUrl, savedRoom, socketUrl } from './common/room-link.ts';
import { errorText } from '../net/error-text.ts';
import { isNoShuffleRoom, roomVariant, seatCountOf, type RoomVariant } from '../net/room-info.ts';
import { DDZ_NOSHUFFLE } from '../variants/doudizhu/index.ts';
import { DdzNetSession } from './doudizhu/net.ts';
import { MATCH_DDZ_TABLE, ddzMatchTierOf } from '../variants/doudizhu/net/match.ts';
import { MATCH_REL, matchTierOf } from '../variants/guandan/net/match.ts';
import { parseRoomOpts } from '../variants/guandan/net/stake.ts';
import { ROOM_DEALS, TIERS, TIER_IDS, pointValue, type TierId } from '../variants/guandan/stake/index.ts';
import { ROOM_DEALS as DDZ_ROOM_DEALS, newRules as ddzRules, pointValue as ddzPointValue } from '../variants/doudizhu/stake/index.ts';
import { NET_DOWN, RETRY_LABEL, ROOM_STAKE_TEXT, STAKE_TEXT, TIER_NAME, fmtChips } from './common/stake-text.ts';
import { fetchWallet } from './common/stake-api.ts';
import { standalone } from './common/platform.ts';
import { fetchFriendTables, hasFriends, openInvitePanel, presenceNow } from './common/social.ts';
import { getNick, getSettings, setNick, updateSettings } from './store.ts';
import { loginUrl } from './ui/cloud.ts';
import { mountThemeCss } from './common/theme.ts';
import { startWhenReady } from './common/textures.ts';

const TEAM = ['#d9443a', '#3a78c8'];

let root: HTMLElement | null = null;
/** 大厅里连着的会话：两种玩法共用（RoomLink 的那一半），进牌桌时按玩法交给 app.net 或 app.ddzNet */
type Link = NetSession | DdzNetSession;
let ses: Link | null = null;
/** 好友房面板现在开的是哪个玩法（斗地主面板进来的是 ddz；进房后以房间信息为准） */
let panelVariant: RoomVariant = 'guandan';
let offSes: (() => void) | null = null;
let note = '';

function style(): void {
  mountThemeCss();
  if (document.getElementById('online-style')) return;
  const st = document.createElement('style');
  st.id = 'online-style';
  st.textContent = `
#online { position: fixed; inset: 0; z-index: 8500; display: flex; align-items: center; justify-content: center; background: rgba(10, 6, 4, 0.72);
  font: 16px/1.5 var(--gd-font); color: var(--gd-ink); font-variant-numeric: tabular-nums;
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); box-sizing: border-box; }
#online .ol-card { width: min(560px, calc(100vw - var(--gd-s6))); max-height: calc(100% - var(--gd-s4)); overflow: auto; box-sizing: border-box; padding: var(--gd-s4) var(--gd-s6);
  border-radius: 16px; background: linear-gradient(#fffaf0, var(--gd-paper) 35%, #f3e3c0); border: var(--gd-line);
  box-shadow: 0 0 0 2px var(--gd-gold) inset, 0 0 0 6px var(--gd-paper) inset, 0 0 0 7px #d8c39a inset, 0 8px 0 #2b1d14, 0 16px 32px rgba(0, 0, 0, 0.3);
  display: flex; flex-direction: column; gap: var(--gd-s3); position: relative; }
/* 标题只是字：红色留给这一屏唯一的主按钮（docs/ui.md 第 2 节） */
#online h2 { align-self: center; margin: 0 var(--gd-s8) var(--gd-s1); font-size: 24px; line-height: 1.5; color: var(--gd-red-dark); letter-spacing: 2px; }
#online .ol-x { position: absolute; top: var(--gd-s1); right: var(--gd-s1); }
#online .ol-code { font: bold 34px/1.1 var(--gd-font-num); letter-spacing: 6px; color: var(--gd-red); }
#online .ol-row { display: flex; gap: var(--gd-s2); flex-wrap: wrap; align-items: center; }
#online .ol-row #ol-share { flex: 1; min-width: 160px; margin-left: var(--gd-s2); }
#online input { flex: 1; min-width: 120px; min-height: var(--gd-hit); box-sizing: border-box; padding: 0 var(--gd-s3); border: 2px solid #c8a878; border-radius: var(--gd-r-md);
  font: bold 22px var(--gd-font-num); letter-spacing: 4px; background: #fffaf0; color: var(--gd-ink); }
#online input:focus-visible { outline: 3px solid var(--gd-focus); outline-offset: 1px; }
#online .ol-seats { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gd-s2); }
/* 斗地主 3 个座位排一行：没有队伍，名字在上、按钮在下 */
#online .ol-seats.ol-seats-3 { grid-template-columns: repeat(3, 1fr); }
#online .ol-seats-3 .ol-seat { flex-direction: column; align-items: stretch; justify-content: center; gap: var(--gd-s1); padding: var(--gd-s1) var(--gd-s2); border-left-width: 2px; }
#online .ol-seats-3 .ol-seat .gd-btn { width: 100%; }
#online .ol-seat { display: flex; align-items: center; justify-content: space-between; gap: var(--gd-s2); min-height: 52px; min-width: 0; padding: var(--gd-s1) var(--gd-s2) var(--gd-s1) var(--gd-s3);
  border-radius: var(--gd-r-md); background: linear-gradient(#fffaf0, #f1e4c6); border: 2px solid #2b1d14; border-left: 8px solid var(--team);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 3px 8px rgba(0, 0, 0, 0.14); }
#online .ol-seat > div { min-width: 0; overflow: hidden; }
#online .ol-seat b { display: flex; font-size: 16px; white-space: nowrap; }
#online .ol-seat .ol-nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#online .ol-seat .ol-you { flex: none; }
#online .ol-seat small { display: block; color: var(--gd-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#online .ol-seat .gd-btn, #online #ol-tiers .gd-btn { flex: none; padding: 0 var(--gd-s3); font-size: 15px; }
#online .ol-note { min-height: 1.5em; color: var(--gd-red-dark); font-weight: bold; }
#online .ol-tip { color: var(--gd-muted); font-size: 14px; }
/* 好友在打：名字长了按省略号截，"在打 · 2/4"和"加入"永远看得见 */
#online .ol-friend { flex-wrap: nowrap; }
#online .ol-friend .ol-fn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: bold; }
#online .ol-friend .ol-fs { flex: none; color: var(--gd-muted); font-family: var(--gd-font-num); }
#online .ol-friend .gd-btn { flex: none; }
#online #ol-tiers .ol-tip { flex-basis: 100%; }
/* 手机竖屏放不下一排四档：等宽两行两个，不参差 */
@media (max-width: 600px) { #online #ol-tiers .gd-btn { flex: 1 1 calc(50% - var(--gd-s2)); } }
#online .ol-wait { font: bold 20px/1.4 var(--gd-font); text-align: center; }
#online .ol-stake { padding: var(--gd-s1) var(--gd-s3); border-radius: var(--gd-r-sm); background: #f6dcc8; color: var(--gd-red-dark); font-weight: bold; }
/* 还没填东西的占位（回到房间、实盘档位）不占一格间距；手机横屏矮，收紧间距，"关掉"不用滚就够得着（0.27.4 多尺寸） */
#online .ol-card > div:empty:not(.ol-note) { display: none; }
@media (max-height: 430px) {
  #online .ol-card { gap: var(--gd-s1); padding: var(--gd-s2) var(--gd-s4); max-height: calc(100% - var(--gd-s2)); }
  #online h2 { margin: 0 var(--gd-s8); font-size: 18px; }
  #online .ol-note { min-height: 0; }
  #online .ol-row #ol-share { min-height: 48px; font-size: 19px; }
}
/* 电脑和平板（又宽又高）：面板放大成游戏里的一块牌匾，不像网页小弹窗——字、按钮、房间码输入框都放大，开房一排按钮等分（0.40.5） */
@media (min-width: 900px) and (min-height: 600px) {
  #online .ol-card { width: min(720px, calc(100vw - var(--gd-s6))); padding: var(--gd-s6) var(--gd-s8); gap: var(--gd-s4); }
  #online h2 { font-size: 32px; letter-spacing: 6px; }
  #online .ol-tip { font-size: 17px; text-align: center; }
  #online .ol-card .gd-btn:not(.gd-x) { min-height: 60px; font-size: 21px; padding: 0 var(--gd-s6); }
  #online .ol-make .gd-btn { flex: 1 1 0; }
  #online .ol-make #ol-create { flex-grow: 1.4; font-size: 24px; }
  #online input { min-height: 64px; font-size: 30px; letter-spacing: 10px; text-align: center; }
  #online input::placeholder { font: bold 22px var(--gd-font); letter-spacing: 2px; }
  #online .ol-friend { padding: var(--gd-s2) var(--gd-s3); border-radius: var(--gd-r-md); background: #f6e6c6; border: 2px solid var(--gd-gold); font-size: 18px; }
  #online .ol-seat b { font-size: 18px; }
  #online .ol-seat { min-height: 64px; }
  #online .ol-wait { font-size: 24px; }
}
#net-banner { position: fixed; z-index: 8400; left: 50%; top: max(var(--gd-s2), env(safe-area-inset-top, 0px)); transform: translateX(-50%); display: none;
  padding: var(--gd-s2) var(--gd-s4); border-radius: var(--gd-r-pill); background: rgba(43, 22, 10, 0.92); border: 2px solid var(--gd-gold); color: #ffe9c2;
  font: bold 15px/1.3 var(--gd-font); pointer-events: none; }
#net-banner.on { display: block; }
/* 连不上时整条横幅就是"重试"按钮：点按区不低于 44 */
#net-banner.on.retry { min-height: 44px; display: flex; align-items: center; cursor: pointer; }`;
  document.head.appendChild(st);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

/** 面板里的按钮都用 THEME_CSS 的 .gd-btn；cls 是 gd-2（次要）、gd-big（大号确认） */
function button(label: string, onClick: () => void, cls = '', id = ''): HTMLButtonElement {
  const b = el('button', { type: 'button', class: cls ? `gd-btn ${cls}` : 'gd-btn', ...(id ? { id } : {}) }, label);
  // 和画布按钮一样松手出"嗒"（ui/kit.ts 的 Button）
  b.addEventListener('click', () => {
    audio.sfx('click');
    onClick();
  });
  return b;
}

/** 现在这一屏能不能随手关（入口面板能；进了房间、匹配中要点"离开""取消"）：Esc 和点遮罩都走它 */
let dismiss: (() => void) | null = null;

function onKey(ev: KeyboardEvent): void {
  if (ev.key === 'Escape' && dismiss) {
    ev.preventDefault();
    dismiss();
  }
}

function card(): HTMLElement {
  style();
  if (!root) {
    root = el('div', { id: 'online' });
    // 按下、抬起都在遮罩上才算点遮罩：点画布上的"好友房"卡打开面板的那一下，抬起后的 click 会落到刚出现的遮罩上（电脑上一点就关）
    let downOnRoot = false;
    root.addEventListener('pointerdown', (ev) => (downOnRoot = ev.target === root));
    root.addEventListener('click', (ev) => {
      if (ev.target === root && downOnRoot) dismiss?.();
      downOnRoot = false;
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(root);
  }
  dismiss = null;
  root.replaceChildren();
  const c = el('div', { class: 'ol-card' });
  root.appendChild(c);
  return c;
}

function close(): void {
  stopMatch();
  dismiss = null;
  document.removeEventListener('keydown', onKey);
  root?.remove();
  root = null;
}

function noteEl(): HTMLElement {
  return el('div', { class: 'ol-note', id: 'ol-note' }, note);
}

/** 好友房入口：开房 / 输码进房 / 回到刚才的房间。variant：从哪个玩法的主页进来的（斗地主面板传 'ddz'，开房时带上；输码、链接进房以房间信息为准） */
export function openOnline(variant: RoomVariant = 'guandan'): void {
  panelVariant = variant;
  const c = card();
  dismiss = () => {
    note = '';
    close();
  };
  c.appendChild(el('h2', {}, '好友房'));
  const x = el('button', { type: 'button', class: 'gd-btn gd-x ol-x', id: 'ol-close', 'aria-label': '关掉' }, '✕');
  x.addEventListener('click', () => dismiss?.());
  c.appendChild(x);
  c.appendChild(el('div', { class: 'ol-tip' }, variant === 'ddz' ? '开个房间把房间码发给朋友，3 个人一起打斗地主；人不够电脑补上。' : '开个房间把房间码发给朋友，4 个人一起打；人不够电脑补上。'));
  // 回到刚才的房间：先问平台现在是谁，是这个账号记下的才给（换了账号的人看不到）
  const slot = el('div');
  c.appendChild(slot);
  void myRoom().then((back) => {
    if (back && slot.isConnected) slot.appendChild(button(`回到刚才的房间 ${back.code}`, () => join(back.code, back.host, null, false, back.variant ?? 'guandan'), 'gd-2', 'ol-back'));
  });
  // 好友在打（0.40.2）：在牌馆好友房里的好友，一点"加入"就进那一桌（等人时自动坐空位，开打了接管电脑或旁观）；没人在打这块不显示
  const friends = el('div', { id: 'ol-friends' });
  c.appendChild(friends);
  void fetchFriendTables().then((list) => {
    if (!friends.isConnected) return;
    list.forEach((t, i) => {
      const row = el('div', { class: 'ol-row ol-friend' });
      const names = t.names.join('、');
      row.appendChild(el('span', { class: 'ol-fn', title: names }, names));
      row.appendChild(el('span', { class: 'ol-fs' }, `在打 · ${t.seats}`));
      row.appendChild(button('加入', () => void rejoin(t.room), 'gd-2', `ol-friend-${i}`));
      friends.appendChild(row);
    });
  });
  // 单独部署（0.8.0）没有账号：别人看到的名字自己填，开房、进房的地址上带着（不填就叫"游客"加数字）
  if (standalone()) {
    const row = el('label', { class: 'ol-row' });
    row.appendChild(el('span', {}, '你的昵称'));
    const nick = el('input', { id: 'ol-nick', maxlength: '12', placeholder: '不填就叫"游客"', autocomplete: 'nickname' });
    nick.value = getNick();
    nick.addEventListener('change', () => setNick(nick.value.trim()));
    row.appendChild(nick);
    c.appendChild(row);
  }
  const make = el('div', { class: 'ol-row ol-make' });
  make.appendChild(button('开个房间', () => void create(null), '', 'ol-create'));
  // 斗地主不洗牌（娱乐 0.33.0）；不洗牌的实盘房间在"开实盘房间"里选（0.39.0）
  if (panelVariant === 'ddz') make.appendChild(button('不洗牌房间', () => void create(null, true), 'gd-2', 'ol-create-clump'));
  // 实盘房间（0.5.0，docs/stake.md 第 3 节）：开房时选档位，之后不能改。单独部署没有钱包，不摆
  // 点开后是选中态（金底），档位在下面一行展开
  if (!standalone()) {
    const sb = button('开实盘房间', () => {
      sb.className = 'gd-btn gd-on';
      sb.setAttribute('aria-pressed', 'true');
      pickTier(tiers);
    }, 'gd-2', 'ol-create-stake');
    make.appendChild(sb);
  }
  c.appendChild(make);
  const tiers = el('div', { class: 'ol-row', id: 'ol-tiers' });
  c.appendChild(tiers);
  const row = el('div', { class: 'ol-row' });
  const input = el('input', { id: 'ol-code', inputmode: 'numeric', maxlength: '6', placeholder: '6 位房间码', autocomplete: 'off' });
  input.addEventListener('input', () => (input.value = input.value.replace(/\D/g, '').slice(0, 6)));
  row.appendChild(input);
  row.appendChild(
    button('进房', () => {
      if (!/^\d{6}$/.test(input.value)) return setNote('房间码是 6 位数字');
      join(input.value, false);
    }, 'gd-2', 'ol-join'),
  );
  c.appendChild(row);
  c.appendChild(noteEl());
}

function setNote(t: string): void {
  note = t;
  document.getElementById('ol-retry')?.remove();
  const n = document.getElementById('ol-note');
  if (n) n.textContent = t;
}

/** 面板里的断网：统一一句话加"重试"按钮（挂在提示行后面，下一次 setNote 自动收起） */
function setNetDown(retry: () => void): void {
  setNote(NET_DOWN);
  document.getElementById('ol-note')?.insertAdjacentElement('afterend', button(RETRY_LABEL, retry, '', 'ol-retry'));
}

/** 实盘房间：每档一个按钮，钱包不够一份的灰掉（钱包连不上时不拦，开局时带入被拒就是这个人不计输赢） */
function pickTier(box: HTMLElement): void {
  box.replaceChildren(el('div', { class: 'ol-tip' }, `打 ${panelVariant === 'ddz' ? DDZ_ROOM_DEALS : ROOM_DEALS} 副，输赢最多是带入的筹码；${ROOM_STAKE_TEXT.bots}。${STAKE_TEXT.noCash}`));
  // 斗地主多选一样发牌（0.39.0）：经典 / 不洗牌，和单机、选档页共用 ddzDeal 这个设置；选中的金底（gd-on），另一个木色
  let clump = panelVariant === 'ddz' && getSettings().ddzDeal === 'clump';
  if (panelVariant === 'ddz') {
    const pick = (v: boolean): void => {
      clump = v;
      updateSettings({ ddzDeal: v ? 'clump' : 'classic' });
      classic.className = v ? 'gd-btn gd-2' : 'gd-btn gd-on';
      noShuf.className = v ? 'gd-btn gd-on' : 'gd-btn gd-2';
      classic.setAttribute('aria-pressed', String(!v));
      noShuf.setAttribute('aria-pressed', String(v));
    };
    const classic = button('经典洗牌', () => pick(false), '', 'ol-deal-classic');
    const noShuf = button('不洗牌 · 炸弹多', () => pick(true), '', 'ol-deal-clump');
    box.appendChild(classic);
    box.appendChild(noShuf);
    pick(clump);
  }
  const btns = TIER_IDS.map((t) => {
    const b = button(`${TIER_NAME[t]} ${fmtChips(TIERS[t])}`, () => void create(t, clump), 'gd-2', `ol-tier-${t}`);
    box.appendChild(b);
    return [t, b] as const;
  });
  void fetchWallet().then((w) => {
    if (!w || !box.isConnected) return;
    // 选档前先看到自己有多少筹码（选不了的档为什么灰着）
    box.insertBefore(el('div', { class: 'ol-tip', id: 'ol-balance' }, `你有 ${fmtChips(w.balance)} 筹码`), box.firstChild);
    for (const [t, b] of btns) b.disabled = w.balance < TIERS[t];
    if (w.balance < TIERS.small) setNote(STAKE_TEXT.lowFunds);
  });
}

/** 开房：每人同时 1 个房间（0.38.0），已经有一个开着的（kit 回 has_room 带码）就带他回那个房间 */
let creating = false;
async function create(stake: TierId | null, noShuffle = false): Promise<void> {
  // 转圈只挡住点的那个按钮：等回话时再点另一个开房按钮（经典 / 不洗牌 / 实盘）也会开出第二个房间
  if (creating) return;
  creating = true;
  try {
    await createOnce(stake, noShuffle);
  } finally {
    creating = false;
  }
}

async function createOnce(stake: TierId | null, noShuffle: boolean): Promise<void> {
  setNote('正在开房…');
  // 等回话时按钮转圈、不能再点（连点会开出两个房间）
  const btn = document.getElementById(stake !== null ? 'ol-create-stake' : noShuffle ? 'ol-create-clump' : 'ol-create');
  btn?.classList.add('is-loading');
  // 包一层 fetch 认出"请求没发出去 / 没回来"（断网）：和别的失败（被拒、额度）分开，断网统一说 NET_DOWN 并给重试
  let offline = false;
  const probe: typeof fetch = (...a) =>
    fetch(...a).catch((e) => {
      offline = true;
      throw e;
    });
  const r = await createRoom(probe, stake, panelVariant === 'ddz' ? 'ddz' : null, noShuffle).finally(() => btn?.classList.remove('is-loading'));
  if ('code' in r) {
    note = '';
    join(r.code, true, null, false, panelVariant);
    // 开完房直接弹"叫朋友来"（0.40.2）：少点一下。没好友（单独部署、没登录、还没加好友）不弹，房间面板上照样有"叫朋友来"
    const name = panelVariant === 'ddz' ? '斗地主' : '掼蛋';
    void hasFriends().then((yes) => {
      if (yes && ses?.code === r.code) void openInvitePanel(r.code, name);
    });
    return;
  }
  if (offline) return setNetDown(() => void create(stake, noShuffle));
  if (r.room) {
    note = '';
    return rejoin(r.room, panelVariant, true);
  }
  setNote(r.error);
  if (r.login) window.setTimeout(() => (window.location.href = loginUrl()), 1200);
}

/**
 * 叫朋友来：手机上弹系统分享（微信、短信……），不支持的复制链接；朋友点开链接就进这个房间（没登录的先登录、登录完回来），
 * 开打了就接管电脑的座位。返回要给人看的一句话（弹了系统分享、或者自己关掉了分享面板时没有）。大厅和牌桌（0.6.1）共用
 */

/**
 * 进房（含房主自己）：连上后画房间。prefer：再来一场跟过来的，想坐的真实座位；match：快速匹配排到的桌。
 * variant：先按它连（开房、匹配、本机记着的房间都知道是哪个玩法）；不知道的（输码、邀请链接）先当掼蛋连，
 * 房间信息一到发现是斗地主就换一条斗地主的会话重连——玩法由房间说了算，不看本机设置
 */
export function join(code: string, host: boolean, prefer: number | null = null, match = false, variant?: RoomVariant): void {
  offSes?.();
  ses?.close();
  const v: RoomVariant = variant ?? (savedRoom()?.code === code ? (savedRoom()?.variant ?? 'guandan') : 'guandan');
  const s: Link = v === 'ddz' ? new DdzNetSession(code, host, match ? { match } : {}) : new NetSession(code, host, match ? { match } : {});
  s.prefer = prefer;
  ses = s;
  roomInUrl(code);
  app.net = null;
  app.ddzNet = null;
  offSes = s.on(() => {
    if (s.wrongVariant) {
      // 房间是另一个玩法：放手这条，换对的重连（座位、房间码都没动）
      offSes?.();
      offSes = null;
      s.detach();
      join(code, host, prefer, match, roomVariant(s.room));
      return;
    }
    // 进了房间、有人坐下或走了：好友那边的"在牌馆的好友房 · 3/4"跟着变（没变不报）
    presenceNow();
    renderRoom();
  });
  renderRoom();
}

function seatLabel(i: number, mine: number | null, n = 4): string {
  if (mine === null) return `${i + 1} 号位`;
  if (n === 3) return i === mine ? '你' : (i - mine + 3) % 3 === 1 ? '下家' : '上家';
  if (i === mine) return '你';
  return (i - mine + 4) % 2 === 0 ? '对家（和你一队）' : (i - mine + 4) % 4 === 1 ? '下家' : '上家';
}

function renderRoom(): void {
  const s = ses;
  if (!s) return;
  // 开打了、我也坐下了：进牌桌
  if (s.canEnterTable && app.game) {
    enterTable(s);
    return;
  }
  const c = card();
  const match = s.match;
  c.appendChild(el('h2', {}, match ? '和真人匹配' : '好友房'));
  panelVariant = s.variant;
  if (s.status === 'closed' || s.status === 'failed') {
    // 连不上（不是平台忙）：统一一句话和"重试"，其余原因照旧说原因
    const netDown = s.status === 'failed' && !s.platformBusy;
    c.appendChild(el('div', { class: 'ol-note' }, netDown ? NET_DOWN : s.linkText()));
    // 回不去了（房间散了、码不对、满了、在别处进了……）：地址栏里的房间码也去掉，免得刷新又撞上
    if (isFinalForRoom(s.closeCode)) roomInUrl(null);
    const row = el('div', { class: 'ol-row' });
    // 登录完回到这个房间（地址栏里的房间码上面刚去掉了，按房间码拼）
    // 单独部署：游客 cookie 是打开首页时发的，刷新一下（带着房间码）就有了
    if (s.closeCode === CLOSE.unauthorized) {
      if (standalone()) row.appendChild(button('刷新再进', () => window.location.assign(`./?room=${s.code}`)));
      else row.appendChild(button('去登录', () => (window.location.href = loginUrl(`?room=${s.code}`))));
    }
    if (s.status === 'failed') row.appendChild(button(RETRY_LABEL, () => s.retry(), '', 'ol-retry'));
    row.appendChild(button('好', () => (match ? close() : openOnline()), 'gd-2', 'ol-ok'));
    c.appendChild(row);
    return;
  }
  // 匹配桌只给排到的人进（别人拿着码也是 4004）：房间码、叫朋友都不摆
  if (!match) {
    const head = el('div', { class: 'ol-row' });
    head.appendChild(el('span', {}, '房间码'));
    head.appendChild(el('span', { class: 'ol-code', id: 'ol-room-code' }, s.code));
    // "叫朋友来"和房间码并排一行：手机横屏只有 376 高，各占一行时斗地主不洗牌房间要滚（docs/ui.md 第 11 节）
    if (s.room?.status !== 'over') head.appendChild(button('叫朋友来', () => void openInvitePanel(s.code, s.variant === 'ddz' ? '斗地主' : '掼蛋'), 'gd-big', 'ol-share'));
    c.appendChild(head);
  }
  // 实盘房间：开房时定的档位，进房的人都看得到
  const stake = parseRoomOpts(s.room?.opts)?.stake ?? null;
  const clumpRoom = isNoShuffleRoom(s.room);
  if (stake) {
    const pv = s.variant === 'ddz' ? ddzPointValue(stake, ddzRules(clumpRoom)) : pointValue(stake);
    c.appendChild(
      el('div', { class: 'ol-stake', id: 'ol-stake' }, `实盘${clumpRoom ? ' · 不洗牌' : ''} · ${TIER_NAME[stake]}（带入 ${fmtChips(TIERS[stake])}，1 分 = ${fmtChips(pv)}）· 打 ${s.variant === 'ddz' ? DDZ_ROOM_DEALS : ROOM_DEALS} 副 · ${ROOM_STAKE_TEXT.bots}`),
    );
  } else if (clumpRoom) {
    c.appendChild(el('div', { class: 'ol-stake', id: 'ol-clump' }, `不洗牌 · 炸弹多，每副最多 ${DDZ_NOSHUFFLE.dealCap} 分`));
  }
  if (s.status !== 'open' || !s.room) {
    c.appendChild(el('div', { class: 'ol-tip' }, s.status === 'reconnecting' ? s.linkText() : '正在进房…'));
    c.appendChild(button('离开', () => leave(), 'gd-danger'));
    return;
  }
  const room = s.room;
  const n = seatCountOf(room);
  const seats = el('div', { class: n === 3 ? 'ol-seats ol-seats-3' : 'ol-seats' });
  room.seats.slice(0, n).forEach((st, i) => {
    const box = el('div', { class: 'ol-seat', 'data-seat': String(i) });
    box.style.setProperty('--team', n === 3 ? '#c8a050' : TEAM[i % 2]!);
    const who = el('div');
    // 电脑座位带 name 的是绑了人、主人离座了，电脑在替他打
    const name =
      st.kind === 'human' ? (i === s.mySeat ? (st.name ?? '') : (st.name ?? '玩家')) : st.kind === 'ai' ? (st.name !== null ? `电脑代 ${st.name} 打` : '电脑') : '空位';
    const you = st.kind === 'human' && i === s.mySeat;
    // 座位卡窄（斗地主三列），长昵称按省略号截、悬停看全名；"（你）"放在截断的外面，永远看得见
    const nameLine = el('b', { title: you ? `${name}（你）` : name });
    nameLine.appendChild(el('span', { class: 'ol-nm' }, name));
    if (you) nameLine.appendChild(el('span', { class: 'ol-you' }, '（你）'));
    who.appendChild(nameLine);
    who.appendChild(el('small', {}, `${seatLabel(i, s.mySeat, n)}${st.kind === 'human' && st.away ? ' · 掉线了' : ''}`));
    box.appendChild(who);
    if (room.status === 'waiting' && st.kind === 'empty' && !match) box.appendChild(button(s.mySeat === null ? '坐这里' : '换到这', () => s.sit(i), 'gd-2', `ol-sit-${i}`));
    if (room.status === 'playing' && s.mySeat === null) {
      // 开打后座位绑人（arcade-kit 0.1.1）：坐过的人只能回自己的座位；没坐过的人只能接管没绑人的电脑座位
      if (s.bound === i) box.appendChild(button('回到我的座位', () => s.sit(i), '', `ol-sit-${i}`));
      else if (s.bound === null && st.kind === 'ai' && !st.reserved) box.appendChild(button('接管', () => s.sit(i), 'gd-2', `ol-sit-${i}`));
    }
    seats.appendChild(box);
  });
  c.appendChild(seats);
  if (room.status === 'waiting' && match) {
    // 匹配桌：排到的人都坐好了，到齐就开；20 秒还没来的座位电脑替他打（kit 的 matchJoinMs）
    c.appendChild(el('div', { class: 'ol-tip', id: 'ol-match-tip' }, '排到了！人到齐就开打，没来的座位电脑替他打'));
  } else if (room.status === 'waiting') {
    if (s.host) {
      // 实盘至少两个真人（3.1）：房间开局时不够也会整场不计输赢，这里先把按钮灰掉
      const humans = room.seats.filter((st) => st.kind === 'human').length;
      const go = button('开局（空位电脑补）', () => s.start(), '', 'ol-start');
      go.disabled = s.mySeat === null || (stake !== null && humans < 2);
      c.appendChild(go);
      const tip = s.mySeat === null ? '先选个座位坐下' : stake !== null && humans < 2 ? ROOM_STAKE_TEXT.needTwo : stake !== null ? '人到齐了就能开；开局时每人从钱包带入' : '朋友进来选好座位就能开；一个人也能开，和电脑打';
      c.appendChild(el('div', { class: 'ol-tip', id: 'ol-start-tip' }, tip));
    } else c.appendChild(el('div', { class: 'ol-tip' }, s.mySeat === null ? '选个座位坐下，等开房的人开局' : '等开房的人开局…'));
  } else if (room.status === 'playing' && s.mySeat === null) {
    const free = room.seats.some((st) => st.kind === 'ai' && !st.reserved);
    c.appendChild(
      el('div', { class: 'ol-tip' }, s.bound !== null ? '电脑在替你打，点"回到我的座位"接着打' : free ? '已经开打了，选一个电脑的座位接管' : '已经开打了，座位都有主人，换个房间吧'),
    );
  } else if (room.status === 'over') {
    c.appendChild(el('div', { class: 'ol-tip' }, match ? '这局已经打完了，再排一次吧' : '这局已经打完了，开个新房间再来'));
  }
  c.appendChild(noteEl());
  c.appendChild(button('离开房间', () => leave(), 'gd-danger', 'ol-leave'));
  const err = s.lastError;
  // 其余的（座位被占 not_your_seat / seat_reserved 等）用和牌桌上一样的大白话
  if (err) setNote(err === 'seat_taken' ? '这个座位刚被别人坐了' : errorText(err));
}

function leave(): void {
  const match = ses?.match ?? false;
  offSes?.();
  offSes = null;
  ses?.leave();
  ses = null;
  app.net = null;
  app.ddzNet = null;
  presenceNow();
  note = '';
  // 匹配桌是从选档页排来的：离开就回标题页（好友房面板和它不相干）
  if (match) close();
  else openOnline(panelVariant);
}

let matcher: MatchClient | null = null;
let tick: number | null = null;

function stopMatch(): void {
  matcher?.cancel();
  matcher = null;
  if (tick !== null) window.clearInterval(tick);
  tick = null;
}

/**
 * 快速匹配（0.26.0）：stake 是档位（娱乐 null），solo 是转同档单机（标题页给：娱乐按现在的设置开一局、实盘按这一档带入）。
 * 排队连接只建一条、不轮询；人数变了服务端推一次（带剩余毫秒数），倒计时页面自己数。15 秒只剩自己、联机忙、今天局数用完都转单机；
 * 排到了用好友房同一套进房（match = true）
 */
export function openMatch(stake: TierId | null, solo: () => void, variant: RoomVariant = 'guandan', noShuffle = false): void {
  stopMatch();
  const ddz = variant === 'ddz';
  const c = card();
  c.appendChild(el('h2', {}, '和真人匹配'));
  c.appendChild(
    el('div', { class: 'ol-stake', id: 'ol-match-tier' }, ddz ? (stake ? `斗地主实盘${noShuffle ? ' · 不洗牌' : ''} · ${TIER_NAME[stake]}（带入 ${fmtChips(TIERS[stake])}）· 打 ${DDZ_ROOM_DEALS} 副` : '斗地主 · 娱乐 · 不计战绩') : stake ? `实盘 · ${TIER_NAME[stake]}（带入 ${fmtChips(TIERS[stake])}）· 打 ${ROOM_DEALS} 副` : '娱乐 · 打过 A · 不计战绩'),
  );
  const wait = el('div', { class: 'ol-wait', id: 'ol-match-wait' }, '正在找人…');
  c.appendChild(wait);
  c.appendChild(el('div', { class: 'ol-tip' }, '找到几个算几个，空位电脑补；只剩你一个就先和电脑打'));
  const row = el('div', { class: 'ol-row' });
  const cancel = button('取消', () => close(), 'gd-2', 'ol-match-cancel');
  const now = button('不等了，和电脑打', () => {
    close();
    solo();
  }, '', 'ol-match-solo');
  row.appendChild(now);
  row.appendChild(cancel);
  c.appendChild(row);
  let n = 1;
  let seats = ddz ? MATCH_DDZ_TABLE : 4;
  let until = 0;
  const paint = (): void => {
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    wait.textContent = until ? `正在找人 · 已有 ${n}/${seats} 人 · 还剩 ${left} 秒` : '正在找人…';
  };
  const done = (t: string, then: (() => void) | null): void => {
    stopMatch();
    wait.textContent = t;
    now.remove();
    cancel.remove();
    if (then) window.setTimeout(() => {
      if (root?.contains(wait)) {
        close();
        then();
      }
    }, 1200);
    else row.appendChild(button('好', () => close(), 'gd-2', 'ol-ok'));
  };
  const m = new MatchClient({
    url: socketUrl(`${MATCH_REL}/${ddz ? ddzMatchTierOf(stake, noShuffle) : matchTierOf(stake)}`),
    onWaiting: (count, size, leftMs) => {
      [n, seats, until] = [count, size, Date.now() + leftMs];
      paint();
    },
    onMatched: (code) => {
      stopMatch();
      join(code, false, null, true, variant);
    },
    // 已经有一个开着的房间（kit 入队前先问计量）：带他回去
    onHasRoom: (code) => {
      stopMatch();
      void rejoin(code, variant, true);
    },
    // 别的页面排上了：这里不排了，也不替他开单机
    onSolo: (why: MatchSoloWhy) => done(MATCH_TEXT[why], why === 'replaced' ? null : solo),
  });
  matcher = m;
  tick = window.setInterval(paint, 1000);
  m.start();
}

function enterTable(s: Link): void {
  close();
  offSes?.();
  offSes = null;
  // 两个玩法各一个牌桌场景：会话放进各自的位置，另一个清空
  app.net = s instanceof NetSession ? s : null;
  app.ddzNet = s instanceof DdzNetSession ? s : null;
  const scene = s.variant === 'ddz' ? 'ddz' : 'table';
  s.autoplay = !!app.params?.autoplay;
  mountNetBanner(s);
  // 还在载入（字体、纹理没烘完）：不打断，BootScene 载完看到 app.net 会自己进牌桌
  if (!app.ready) return;
  const game = app.game!;
  const active = game.scene.getScenes(true)[0];
  if (active?.scene.key === scene) active.scene.restart();
  // BootScene 置了 ready、发出 start('title') 后要到下一帧才真换场景：这一帧里接上的，挂在 boot 上等就会随 boot 关掉而丢，人停在标题页（11-02 联机冒烟抓到），改在标题页建好后再等
  else if (active?.scene.key === 'boot') game.scene.getScene('title').events.once('create', (sc: Parameters<typeof startWhenReady>[0]) => startWhenReady(sc, scene));
  else game.scene.getScenes(true).forEach((sc) => startWhenReady(sc, scene));
}

let bannerOff: (() => void) | null = null;

/** 牌桌上方的连接状态：断线重连中；房间关了、被顶掉时弹一句话 */
function mountNetBanner(s: Link): void {
  style();
  bannerOff?.();
  let b = document.getElementById('net-banner');
  if (!b) {
    b = el('div', { id: 'net-banner' });
    document.body.appendChild(b);
  }
  const banner = b;
  const paint = (): void => {
    if ((app.net ?? app.ddzNet) !== s) {
      banner.classList.remove('on');
      return;
    }
    const t = s.linkText(true);
    banner.textContent = t;
    banner.classList.toggle('on', !!t);
    banner.style.pointerEvents = s.status === 'failed' ? 'auto' : 'none';
    banner.classList.toggle('retry', s.status === 'failed');
  };
  banner.onclick = () => s.status === 'failed' && s.retry();
  const off = s.on((k) => k === 'status' && paint());
  bannerOff = () => {
    off();
    banner.classList.remove('on');
  };
  paint();
}

/** 启动时：URL 带 room=xxxxxx 就直接进那个房间 */
export async function autoJoin(code: string | null): Promise<void> {
  if (!code || !/^\d{6}$/.test(code)) return;
  await rejoin(code);
}

/**
 * 回到一个已有的房间（链接里的、开房或匹配时 kit 说"你已经有一个"的）。玩法认这个账号本机记下的，没记下的按 variant 先连，
 * 玩法不对 join 会自己换。房主：本机记下的（同一台设备换了账号，房间照进，但不是房主）；kit 说"你已经有一个"（own）的就是他开的
 * ——名额记在开房的人名下，"离开房间"会清本机记录；匹配桌没有房主，页面看房间信息藏开局，房间也按账号拒
 */
async function rejoin(code: string, variant?: RoomVariant, own = false): Promise<void> {
  const saved = await myRoom();
  const mine = saved?.code === code ? saved : null;
  join(code, own || (mine?.host ?? false), null, false, mine ? (mine.variant ?? 'guandan') : variant);
}

/** 大厅里（还没进牌桌）的联机会话，给调试桥看状态用 */
export function lobbySession(): Link | null {
  return ses;
}

export { forgetRoom };
