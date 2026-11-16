/**
 * 寻宝航线的终局：演出（打下终点 = 宝箱开启、金币喷出飞进宝分；收航 = 船开回来；全灭 = 船沉下去、宝分 ×70%）→ 结算框（resultTimes / playBeats）
 * → 交今日榜、分享卡。演出全走 mapfx.ts 的时钟，金币用一个小对象池，样式在 mapcss.ts。
 */
import { prepareShare, type PreparedShare, type ShareCard } from 'arcade-kit/share';
import { rankOf } from '../core/index.ts';
import { MAP_LAYERS, type MapFinal, type MapState } from '../core/maptypes.ts';
import type { LiveTier } from '../core/live.ts';
import { MAP_LIVE_TIERS } from '../core/maplive.ts';
import { liveReturn } from '../core/live.ts';
import { mapLive } from '../net/live.ts';
import type { Sent } from '../net/live.ts';
import { submitMap } from '../net/mapscore.ts';
import { loggedIn } from '../net/pvp.ts';
import { app, fmt } from './app.ts';
import { iconA, shipA } from './art.ts';
import { playBeats } from './audio/beats.ts';
import { resultBeats, resultTimes, resultTiming } from './audio/result.ts';
import { sfx } from './audio/sfx.ts';
import { vibrate, REDUCED } from './feel.ts';
import { bez, every, rollNum, tween, wait } from './mapfx.ts';
import type { MapSource } from './maprules.ts';
import { netText, returnPctText } from './livemore-logic.ts';
import { button, el, img, openModal, toast, uiRoot } from './ui.ts';

export interface FinalOpts {
  s: MapState;
  fin: MapFinal;
  day: string;
  /** 这一局之前今天的本机最好（比它高才交榜） */
  prevBest: number;
  rules: MapSource;
  /** 实盘航线的一趟：不交榜、不记今天最好，结算框里写拿回带入的几成和这局筹码 ±N（sent 是已发出的结回） */
  live?: { tier: LiveTier; bp: number; sent: Promise<Sent> };
  onHome(): void;
  onAgain(): void;
}

const CHEST_BODY = `<svg viewBox="0 0 140 72" width="140" height="72"><rect x="6" y="3" width="128" height="64" rx="7" fill="#8a4f24" stroke="#2b1a15" stroke-width="4"/>
<path d="M8 26 H132 M8 46 H132" stroke="#5e3214" stroke-width="3"/><rect x="22" y="3" width="14" height="64" fill="#e0a824" stroke="#2b1a15" stroke-width="3"/>
<rect x="104" y="3" width="14" height="64" fill="#e0a824" stroke="#2b1a15" stroke-width="3"/><rect x="57" y="4" width="26" height="26" rx="4" fill="#ffd34d" stroke="#2b1a15" stroke-width="3"/>
<path d="M70 12 v8" stroke="#2b1a15" stroke-width="4" stroke-linecap="round"/></svg>`;
const CHEST_LID = `<svg viewBox="0 0 140 46" width="140" height="46"><path d="M6 44 V24 Q6 3 70 3 Q134 3 134 24 V44 Z" fill="#9c5a2a" stroke="#2b1a15" stroke-width="4"/>
<path d="M22 44 V9 H36 V44 Z M104 44 V9 H118 V44 Z" fill="#e0a824" stroke="#2b1a15" stroke-width="3"/><path d="M10 30 Q70 16 130 30" stroke="#6a3a18" stroke-width="3" fill="none"/></svg>`;

/** 终局的样子：打到终点且终点站拿到宝分才开宝箱；到了终点却 0 宝分按"返航"演（船回港） */
type EndKind = 'chest' | 'back' | 'home' | 'wiped';
const TITLE: Record<EndKind, string> = { chest: '满载而归！', back: '平安返航', home: '平安收航', wiped: '船队沉没' };
/** 终点站拿到的宝分（不是打到终点结束的为 0） */
const bossGain = (s: MapState): number => (s.end === 'clear' ? (s.log[s.log.length - 1]?.gain ?? 0) : 0);
function endKind(s: MapState): EndKind {
  if (s.end === 'wiped') return 'wiped';
  if (s.end === 'clear') return bossGain(s) > 0 ? 'chest' : 'back';
  return 'home';
}

export function playFinal(o: FinalOpts): void {
  const end = endKind(o.s);
  const root = el('div', `hd-route-end${end === 'wiped' ? ' sunk' : ''}`, undefined, uiRoot());
  const alive = (): boolean => root.isConnected;
  const pill = el('div', 'hd-pill hd-route-endpts', undefined, root);
  pill.appendChild(img(iconA('gold'), 30));
  const num = el('b', '', '0', pill);
  const cap = el('div', 'hd-route-endcap', '', root);
  const stage = el('div', 'hd-route-stage', undefined, root);
  app.api.scene = 'result';

  // 点一下跳过演出，直接出结算
  let skipped = false;
  let shown = false;
  const show = (): void => {
    if (shown || !alive()) return;
    shown = true;
    num.textContent = fmt(o.fin.pts);
    resultBox(o, root);
  };
  root.addEventListener('pointerdown', () => {
    if (!shown) {
      skipped = true;
      show();
    }
  });
  const run = end === 'chest' ? chestShow : end === 'wiped' ? sinkShow : homeShow;
  void run(o, stage, root, num, cap, () => alive() && !skipped).then(show);
}

/** 金币对象池：一局终局用一组，飞完藏起来重用 */
function coinPool(root: HTMLElement, n: number): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const c = el('div', 'hd-route-coin', undefined, root);
    c.appendChild(img(iconA('gold'), 28));
    out.push(c);
  }
  return out;
}

/** 从 (x0,y0) 喷出 n 枚金币，弧线飞进宝分牌；每到一枚宝分往上跳一截 */
async function coinBurst(root: HTMLElement, pool: HTMLElement[], x0: number, y0: number, target: HTMLElement, from: number, to: number, ok: () => boolean): Promise<void> {
  const rr = root.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  const tx = tr.left - rr.left + tr.width / 2 - 14;
  const ty = tr.top - rr.top + tr.height / 2 - 14;
  const n = pool.length;
  let got = 0;
  const flights = pool.map((c, i) => {
    // 先往上喷（左右散开），再弯着飞向宝分牌；位置全由编号定
    const side = (i % 2 ? 1 : -1) * (40 + ((i * 53) % 110));
    const cx = x0 + side;
    const cy = y0 - 140 - ((i * 37) % 90);
    return wait(i * 55, ok).then(() => {
      c.style.display = 'block';
      return tween(700 + ((i * 29) % 160), (k) => {
        const x = bez(x0, cx, tx, k);
        const y = bez(y0, cy, ty, k);
        c.style.transform = `translate(${x}px,${y}px) rotate(${k * (i % 2 ? 540 : -540)}deg) scale(${1.15 - k * 0.35})`;
      }, 'fall', ok).then(() => {
        c.style.display = 'none';
        got++;
        target.textContent = fmt(Math.round(from + ((to - from) * got) / n));
        target.parentElement?.classList.remove('pop');
        void target.parentElement?.offsetWidth;
        target.parentElement?.classList.add('pop');
        if (got % 3 === 1) sfx('coin', { pitch: 1 + got * 0.02 });
      });
    });
  });
  await Promise.all(flights);
  target.textContent = fmt(to);
}

/** 宝箱：落地 → 跳三下 → 开盖金光柱 → 金币喷出飞向宝分 → 宝分滚到总分 */
async function chestShow(o: FinalOpts, stage: HTMLElement, root: HTMLElement, num: HTMLElement, cap: HTMLElement, ok: () => boolean): Promise<void> {
  const rays = el('div', 'hd-route-rays', undefined, stage);
  const pillar = el('div', 'hd-route-pillar', undefined, stage);
  el('div', 'hd-route-shadow', undefined, stage);
  const chest = el('div', 'hd-route-chest', undefined, stage);
  const glow = el('div', 'glow', undefined, chest);
  const lid = el('div', 'lid', undefined, chest);
  lid.innerHTML = CHEST_LID;
  const body = el('div', 'body', undefined, chest);
  body.innerHTML = CHEST_BODY;
  // 金币数按终点站拿到的宝分占这座岛满分的比例给（3–16 枚）；宝分牌从开箱前的数滚到总分
  const gain = bossGain(o.s);
  const boss = o.s.route.layers[MAP_LAYERS - 1]?.[0];
  const full = boss?.kind === 'island' ? (o.rules.island(boss.island)?.pts ?? gain) : gain;
  const pool = coinPool(root, Math.max(3, Math.min(16, Math.round((16 * gain) / Math.max(1, full)))));
  const before = Math.max(0, o.fin.pts - gain);
  num.textContent = fmt(before);
  cap.textContent = '终点宝岛的宝箱';
  chest.style.transform = 'translateY(-420px)';
  await tween(260, (k) => (cap.style.opacity = String(k)), 'recover', ok);
  // 落地
  await tween(520, (k) => (chest.style.transform = `translateY(${-420 * (1 - k)}px)`), 'bounce', ok);
  sfx('land');
  vibrate('land');
  // 跳三下，一下比一下高
  for (let j = 0; j < 3; j++) {
    const h = 14 + j * 10;
    await tween(260, (k) => {
      const y = -h * Math.sin(Math.PI * k);
      const sq = 1 + 0.08 * Math.cos(Math.PI * 2 * k) * (k < 0.15 || k > 0.85 ? 1 : 0);
      chest.style.transform = `translateY(${y}px) scale(${2 - sq},${sq}) rotate(${(j % 2 ? 1 : -1) * 4 * Math.sin(Math.PI * k)}deg)`;
    }, 'recover', ok);
    sfx('wood', { pitch: 1 + j * 0.12 });
  }
  chest.style.transform = '';
  // 开盖：盖子掀起来，金光柱冲上去，光芒转起来
  sfx('star3');
  vibrate('collapse');
  cap.textContent = '开箱！';
  every((ms) => {
    rays.style.transform = `rotate(${ms / 60}deg)`;
    return ok() || root.isConnected;
  }, () => root.isConnected);
  await tween(380, (k) => {
    lid.style.transform = `translate(${-6 * k}px,${-26 * k}px) rotate(${-34 * k}deg)`;
    glow.style.opacity = String(k);
    pillar.style.opacity = String(k);
    pillar.style.transform = `scaleY(${k})`;
    rays.style.opacity = String(k);
  }, 'land', ok);
  // 金币喷出，飞进宝分
  const rr = root.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  await coinBurst(root, pool, sr.left - rr.left - 14, sr.top - rr.top - 40, num, before, o.fin.pts, ok);
  await tween(400, (k) => (pillar.style.opacity = String(1 - k * 0.6)), 'fade', ok);
  await wait(300, ok);
}

/** 收航：船从左边开回来，卸下一小袋金币 */
async function homeShow(o: FinalOpts, stage: HTMLElement, root: HTMLElement, num: HTMLElement, cap: HTMLElement, ok: () => boolean): Promise<void> {
  const ship = el('div', 'hd-route-sinkship', undefined, stage);
  ship.appendChild(img(shipA('flagship', rankOf(app.profile)), 180));
  el('div', 'hd-route-waves', undefined, stage);
  cap.textContent = o.s.end === 'clear' ? '终点宝岛没打下来，平安返航' : o.fin.pts > 0 ? '带着宝分回港' : '空手回港';
  cap.style.opacity = '1';
  await tween(1000, (k) => {
    ship.style.transform = `translate(${-360 * (1 - k)}px,${Math.sin(k * 9) * 4}px)`;
  }, 'recover', ok);
  sfx('splash');
  if (o.fin.pts > 0) {
    const rr = root.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    await coinBurst(root, coinPool(root, 8), sr.left - rr.left - 14, sr.top - rr.top - 60, num, 0, o.fin.pts, ok);
  }
  await wait(400, ok);
}

/** 全灭：船歪着沉下去，冒泡，画面转灰蓝；宝分先显示原数再滚到 ×70% */
async function sinkShow(o: FinalOpts, stage: HTMLElement, _root: HTMLElement, num: HTMLElement, cap: HTMLElement, ok: () => boolean): Promise<void> {
  const ship = el('div', 'hd-route-sinkship', undefined, stage);
  ship.appendChild(img(shipA('flagship', rankOf(app.profile)), 180));
  el('div', 'hd-route-waves', undefined, stage);
  const bubbles = Array.from({ length: 8 }, () => el('div', 'hd-route-bubble', undefined, stage));
  num.textContent = fmt(o.s.pts);
  cap.textContent = '船队打光了，船沉了……';
  await tween(300, (k) => (cap.style.opacity = String(k)), 'recover', ok);
  sfx('crumbleBig');
  vibrate('lose');
  const sink = tween(1800, (k) => {
    ship.style.transform = `translateY(${k * 120}px) rotate(${-26 * k}deg)`;
    ship.style.opacity = String(1 - k * 0.85);
    ship.style.filter = `grayscale(${k}) brightness(${1 - k * 0.4})`;
  }, 'fall', ok);
  bubbles.forEach((b, i) => {
    void wait(300 + i * 160, ok).then(() => {
      b.style.display = 'block';
      return tween(900, (k) => {
        b.style.transform = `translate(${((i * 37) % 80) - 40 + Math.sin(k * 6 + i) * 6}px,${40 - k * 120}px) scale(${0.6 + k * 0.6})`;
        b.style.opacity = String(1 - k);
      }, 'recoil', ok);
    });
  });
  void wait(500, ok).then(() => sfx('splash', { pitch: 0.8 }));
  await sink;
  if (o.s.pts > 0) {
    const sm = el('small', '', ' ×70%', num.parentElement!);
    sm.style.marginLeft = '2px';
    await rollNum(num, o.s.pts, o.fin.pts, 900, fmt, ok);
  }
  await wait(400, ok);
}

// ---------------------------------------------------------------- 结算框、交榜、分享

function resultBox(o: FinalOpts, root: HTMLElement): void {
  const { fin, s } = o;
  const end = endKind(s);
  const win = fin.stars > 0 && end !== 'wiped';
  const tm = resultTimes('battle', fin.stars, win);
  const alive = (): boolean => root.isConnected;
  playBeats(resultBeats({ kind: 'battle', stars: fin.stars, win, roll: fin.pts > 0 }), alive);
  vibrate(win ? 'win' : 'lose');
  // 结算必须点按钮：点遮罩不理，Esc = 主按钮（回岛）
  let main: HTMLButtonElement | undefined;
  const mask = openModal({ cls: fin.stars >= 3 ? 'hd-s3' : '', closable: false, onEsc: () => main?.click(), parent: root });
  const box = el('div', `hd-dialog hd-result hd-route-result${win ? '' : ' hd-lose'}`, undefined, mask);
  box.style.setProperty('--sd', `${tm.sd}ms`);
  box.style.setProperty('--fin', `${tm.fin}ms`);
  el('h2', '', TITLE[end], box);
  const row = el('div', 'hd-stars', undefined, box);
  row.style.justifyContent = 'center';
  for (let i = 0; i < 3; i++) {
    const im = img(iconA(i < fin.stars ? 'star' : 'starEmpty'), 52);
    row.appendChild(im);
    if (i < fin.stars && !REDUCED) {
      im.style.visibility = 'hidden';
      setTimeout(() => {
        im.style.visibility = '';
        im.classList.add('drop');
      }, tm.starAt(i));
    }
  }
  const big = el('div', 'hd-big', '宝分 0', box);
  setTimeout(() => {
    const t0 = performance.now();
    const dur = resultTiming('battle', win).rollDur;
    const tick = (): void => {
      const f = Math.min(1, (performance.now() - t0) / dur);
      big.textContent = `宝分 ${fmt(fin.pts * (1 - (1 - f) * (1 - f)))}`;
      if (f < 1 && big.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, tm.rollAt);
  const best = Math.max(o.prevBest, fin.score);
  if (!o.live) {
    const bl = el('p', '', `今天最好 ${fmt(best)} 宝分`, box);
    if (fin.score > o.prevBest && fin.score > 0) el('span', 'hd-new', ' · 新纪录！', bl);
  }
  // 走过的路：每一站拿了多少
  const trail = el('div', 'hd-route-trail', undefined, box);
  for (const l of s.log) {
    const n = s.route.layers[l.layer]?.[l.node];
    const name = n?.kind === 'island' ? (o.rules.island(n.island)?.name ?? '') : '补给礁';
    const t = el('span', '', l.reef ? `${name} · ${l.reef === 'crew' ? '补兵' : '补能量'}` : `${name} `, trail);
    if (!l.reef) el('span', 'hd-pos hd-n', `+${fmt(l.gain)}`, t);
  }
  if (!s.log.length) el('span', '', '一站没走', trail);
  // 交今日榜：比今天本机最好高才交；没登录 / 单独部署静默跳过
  const board = el('p', 'hd-sub', '', box);
  if (o.live) liveLines(o.live, board, box);
  else if (fin.score > o.prevBest && fin.score > 0) {
    if (!loggedIn()) board.textContent = '登录后能上今日榜';
    else {
      board.textContent = '正在交到今日榜…';
      void submitMap(o.day, fin.score).then((r) => {
        board.textContent = r.state === 'ok' ? `已交到今日榜（榜上最好 ${fmt(r.best)}）` : r.state === 'busy' ? '榜单有点忙，下次打完再交' : '';
      });
    }
  }
  // 分享卡：结算一出来就先画好（iOS 只许在点击那一下里调系统分享）
  const card: ShareCard = {
    game: '海岛',
    title: `寻宝航线 · ${o.day.replace(/-/g, '.')}`,
    accent: '#c7861e',
    big: { value: fmt(fin.pts), label: '宝分' },
    stats: [
      { label: '星', value: `${fin.stars} 颗` },
      { label: '走了', value: `${s.log.length}/${MAP_LAYERS} 站` },
      { label: '结局', value: TITLE[end] },
    ],
    line: shareLine(o),
    art: routeArt(o),
  };
  const text = `我在《海岛》今日航线拿了 ${fmt(fin.pts)} 宝分（${fin.stars} 星），同一条航线，来比比！`;
  let prep: PreparedShare | null = null;
  try {
    prep = prepareShare(card, { url: './', text });
  } catch {
    prep = null;
  }
  const copy = (): void => {
    void navigator.clipboard?.writeText(text).then(() => toast('战绩已复制，去发给朋友吧'), () => toast('复制不了，截个图分享吧'));
    if (!navigator.clipboard) toast('复制不了，截个图分享吧');
  };
  const btns = el('div', 'hd-row', undefined, box);
  button('分享', 'hd-btn-gold hd-route-share', () => {
    if (!prep) return copy();
    void prep.share().catch(copy);
  }, btns);
  // 实盘一天一趟，没有"再跑一趟"（娱乐航线在出海面板里开）
  if (!o.live) {
    button('再跑一趟', 'hd-btn-wood', () => {
      root.remove();
      o.onAgain();
    }, btns);
  }
  main = button('回岛', 'hd-btn-gold', () => {
    root.remove();
    o.onHome();
  }, box);
  main.style.width = '100%';
}

/** 实盘结算：拿回带入的几成（马上写出）、结回后这局筹码 ±N；连不上写"记下了，连上网后自动结回" */
function liveLines(l: NonNullable<FinalOpts['live']>, note: HTMLElement, box: HTMLElement): void {
  const stake = MAP_LIVE_TIERS[l.tier].stake;
  note.textContent = returnPctText(l.bp);
  note.className = 'hd-sub hd-live-ret';
  const net = el('p', 'hd-live-net', '结算中…', box);
  note.after(net);
  void l.sent.then((r) => {
    if (!net.isConnected) return;
    if (r.ok) {
      const credited = mapLive.record?.credited ?? liveReturn(stake, l.bp);
      net.className = `hd-live-net ${credited >= stake ? 'hd-pos' : 'hd-neg'}`;
      net.textContent = netText(credited, stake);
    } else if (r.why === 'offline' || r.why === 'login') net.textContent = '结果记下了，连上网后会自动结回。';
    else net.textContent = '钱包暂时连不上，稍后再试';
  });
}

function shareLine(o: FinalOpts): string {
  const end = endKind(o.s);
  const boss = o.s.route.layers[MAP_LAYERS - 1]?.[0];
  const bn = boss?.kind === 'island' ? (o.rules.island(boss.island)?.name ?? '终点宝岛') : '终点宝岛';
  if (end === 'chest') return `一路杀到${bn}，撬开了宝箱`;
  if (end === 'back') return `一路开到${bn}，宝箱没撬开`;
  if (end === 'wiped') return `冲到第 ${o.s.layer + 1} 站，船队打光了`;
  return `走了 ${o.s.log.length} 站见好就收`;
}

/** 分享卡上的航线小图：羊皮纸、走过的路、终点宝箱（canvas 程序画） */
function routeArt(o: FinalOpts): HTMLCanvasElement {
  const S = 360;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return c;
  const grd = g.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S * 0.7);
  grd.addColorStop(0, '#f6e7c4');
  grd.addColorStop(1, '#d9b877');
  g.fillStyle = grd;
  g.beginPath();
  g.roundRect(6, 6, S - 12, S - 12, 18);
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = '#2b1a15';
  g.stroke();
  const rows = [0.9, 0.7, 0.5, 0.3, 0.1];
  const pos = (layer: number, node: number, n: number): [number, number] => [layer < 0 || n <= 1 ? S / 2 : node === 0 ? S * 0.28 : S * 0.72, S * rows[layer + 1]!];
  const L = o.s.route.layers;
  // 所有航路淡虚线
  g.setLineDash([6, 8]);
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(122,90,48,.45)';
  for (let l = -1; l < L.length - 1; l++) {
    const an = l < 0 ? 1 : L[l]!.length;
    for (let i = 0; i < an; i++) for (let j = 0; j < L[l + 1]!.length; j++) {
      const a = pos(l, i, an);
      const b = pos(l + 1, j, L[l + 1]!.length);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
  }
  // 走过的路金色实线
  g.setLineDash([]);
  g.lineWidth = 7;
  g.strokeStyle = '#c7861e';
  g.beginPath();
  let p = pos(-1, 0, 1);
  g.moveTo(p[0], p[1]);
  for (const lg of o.s.log) {
    p = pos(lg.layer, lg.node, L[lg.layer]!.length);
    g.lineTo(p[0], p[1]);
    }
  g.stroke();
  // 节点
  L.forEach((ns, l) => ns.forEach((n, i) => {
    const [x, y] = pos(l, i, ns.length);
    const done = o.s.log.some((lg) => lg.layer === l && lg.node === i);
    g.beginPath();
    g.arc(x, y, l === L.length - 1 ? 26 : 18, 0, Math.PI * 2);
    g.fillStyle = done ? '#ffd34d' : n.kind === 'reef' ? '#9fd3df' : '#efe0bb';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#2b1a15';
    g.stroke();
    if (l === L.length - 1) {
      g.fillStyle = '#8a4f24';
      g.fillRect(x - 13, y - 6, 26, 16);
      g.fillStyle = '#e0a824';
      g.fillRect(x - 13, y - 11, 26, 6);
    }
  }));
  // 港口
  const [hx, hy] = pos(-1, 0, 1);
  g.fillStyle = '#6a4a22';
  g.fillRect(hx - 30, hy + 6, 60, 6);
  return c;
}
