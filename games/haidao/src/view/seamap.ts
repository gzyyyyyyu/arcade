import { CAMPAIGN } from '../content/index.ts';
import { armyCost, armyFor, hqLevel, totalStars, trimArmy } from '../core/index.ts';
import { mapDecoArt, mapIslandArt } from './art/index.ts';
import { app } from './app.ts';
import { lackText } from './basefeel.ts';
import { dockGain } from './battleadvice.ts';
import { iconA } from './art.ts';
import { button, costRow, el, img, lockIcon, toast, uiRoot } from './ui.ts';
import { openPvp, pvpMapButton } from './pvp.ts';
import { bountyOf } from './meta.ts';
import { openScout } from './scout.ts';
import { liveEntryReady, liveMapButton, openLive } from './live.ts';
import { openEscortLive, openMapLive } from './livemore.ts';
import { mapCard, mapLiveChip, openRoute } from './maproute.ts';
import { escortCard, openEscortSelect } from './escortsel.ts';
import { TUT_DONE, tutStep } from './tutorial.ts';

const X = [50, 30, 68, 34, 70, 38, 64, 30, 62, 36, 68, 50];
const STEP = 138;
/** 内容顶部留给引导横幅的空白：横幅停在这里，不压节点 */
const TOP_PAD = 150;
const BOTTOM_PAD = 160;
const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

/** 出海：一张海图，12 个岛从下往上排；点岛看简介，"出发"进战斗 */
export function openSeaMap(onGo: (levelId: string, bounty: boolean) => void, onClose: () => void): () => void {
  const p = app.profile;
  const stars = totalStars(p);
  const wrap = el('div', 'hd-map', undefined, uiRoot());
  const inner = el('div', 'hd-map-in', undefined, wrap);
  const n = CAMPAIGN.length;
  const H = TOP_PAD + (n - 1) * STEP + BOTTOM_PAD + 90;
  inner.style.height = `${H}px`;
  const pos = (i: number): { x: number; y: number } => ({ x: X[i % X.length]!, y: H - BOTTOM_PAD - 50 - i * STEP });

  // 底层：海面波纹、海鸥、礁石、罗盘、航线（都按序号定位，不用随机数）
  const deco = el('div', 'hd-map-deco', undefined, inner);
  for (let i = 0; i < n * 3; i++) {
    const x = (i * 37 + 11) % 90 + 4;
    const y = H - 40 - i * (H / (n * 3));
    const a = mapDecoArt('wave');
    const w = el('div', 'hd-deco', undefined, deco);
    w.style.cssText = `left:${x}%;top:${y}px;opacity:${0.5 + (i % 3) * 0.15}`;
    w.appendChild(img(a, 22));
  }
  for (let i = 0; i < 5; i++) {
    const g = el('div', 'hd-deco hd-gull', undefined, deco);
    g.style.cssText = `left:${(i * 29 + 12) % 80 + 6}%;top:${H - 260 - i * 330}px;animation-delay:${-i * 1.7}s`;
    const a = mapDecoArt('gull');
    g.appendChild(img(a, 22));
  }
  for (const [kind, x, y, h] of [['compass', 14, H - 150, 64], ['rock', 84, H - 360, 34], ['rock', 10, H - 640, 30], ['ship', 80, H - 470, 54]] as const) {
    const a = mapDecoArt(kind);
    const d = el('div', 'hd-deco', undefined, deco);
    d.style.cssText = `left:${x}%;top:${y}px`;
    d.appendChild(img(a, h));
  }
  const svg = svgEl('svg', { viewBox: `0 0 100 ${H}`, preserveAspectRatio: 'none', width: '100%', height: String(H) });
  svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
  svgEl('polyline', { points: CAMPAIGN.map((_, i) => `${pos(i).x},${pos(i).y}`).join(' '), fill: 'none', stroke: '#effcf7', 'stroke-width': '4', 'stroke-dasharray': '2 10', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', opacity: '.85' }, svg);
  inner.appendChild(svg);

  // 解锁了的最靠后的那座
  let current = 0;
  CAMPAIGN.forEach((l, i) => {
    if (stars >= l.reqStars) current = i;
  });
  // 下一关：第一座解锁了还没拿星的岛；都拿过星就是第一座没三星的；全三星停在最后解锁的那座。光圈、「下一关」旗、出发钮和「回到下一关」都认它
  let focus = CAMPAIGN.findIndex((l) => stars >= l.reqStars && (p.stars[l.id] ?? 0) === 0);
  if (focus < 0) focus = CAMPAIGN.findIndex((l) => stars >= l.reqStars && (p.stars[l.id] ?? 0) < 3);
  if (focus < 0) focus = current;
  // 新手引导还在带路时，引导自己的高亮框和箭头指着这座岛：旗和出发钮会被框压住、和箭头抢位置，先不画（引导走完再出现）
  const guided = tutStep() < TUT_DONE;
  let detail: HTMLElement | null = null;
  let bountyEl: HTMLElement | null = null;

  const show = (i: number, bounty = false): void => {
    detail?.remove();
    const l = CAMPAIGN[i]!;
    const locked = stars < l.reqStars;
    const cost = armyCost(p);
    const d = (detail = el('div', 'hd-sheet', undefined, wrap));
    d.style.position = 'fixed';
    const head = el('div', 'hd-head', undefined, d);
    el('h2', '', `${i + 1}. ${l.name}`, head);
    if (l.boss) el('span', 'hd-bosstag', '首领', head);
    button('×', 'hd-x', () => d.remove(), head);
    el('p', 'hd-desc', `${l.boss ? '首领' : '岛主'}：${l.bossName ?? l.captain}。${l.blurb}`, d);
    if (l.boss && l.mechanic) el('p', 'hd-mech', `特殊机制：${l.mechanic}`, d);
    if (bounty) el('p', 'hd-bountyline', '今日悬赏：这一关通关奖励翻倍（每天一次）', d);
    // 船坞比这关的建议低（只算主寨允许升到的）：中段卡关多半卡在这里，提前说
    const dockLv = p.base.buildings.find((b) => b.kind === 'dock')?.level ?? 0;
    const dockWant = Math.min(l.hq, hqLevel(p));
    const gain = locked ? null : dockGain(dockLv, dockWant);
    if (gain) el('p', 'hd-bountyline hd-dockhint', `建议船坞 ${dockWant} 级（你 ${dockLv} 级，升上去${gain}）`, d);
    const row = el('div', 'hd-chips', undefined, d);
    const c = el('span', 'hd-chip', '预计掠夺 ', row);
    c.appendChild(costRow(l.loot));
    const c2 = el('span', 'hd-chip', '出海要 ', row);
    c2.appendChild(costRow({ gold: 0, wood: cost.wood }, p.res));
    const s = el('span', 'hd-chip', '星数 ', row);
    for (let k = 0; k < 3; k++) s.appendChild(img(iconA(k < (p.stars[l.id] ?? 0) ? 'star' : 'starEmpty'), 16));
    // 战役木材不够会自动少带兵（startCampaign → trimArmy），一个兵都带不起才灰；悬赏出海不减兵，照旧要整支船队的木材
    const trim = bounty ? null : trimArmy(armyFor(p), p.res.wood);
    const short = bounty ? p.res.wood < cost.wood : !trim;
    const go = button(locked ? `还差 ${l.reqStars - stars} 颗星才能上岛` : short ? (bounty ? lackText({ gold: 0, wood: cost.wood }, p.res) : '木材连一个兵都带不起') : trim?.trimmed ? `出发（少带 ${trim.trimmed} 个兵）` : '出发', 'hd-btn-gold', () => onGo(l.id, bounty), d);
    go.style.width = '100%';
    const sc = button('侦察：看看对面怎么布防', 'hd-btn-plain', () => openScout(l), d);
    sc.style.cssText += ';width:100%;margin-top:8px';
    go.disabled = locked || short;
    revealIsland(i, d);
  };

  /** 竖屏的岛面板是底部抽屉：把这座岛（连名牌和星）滑进「顶上入口条」和抽屉之间的可见区，别让面板盖住它；侧边面板（电脑、横屏）不盖地图，不动 */
  const revealIsland = (i: number, sheet: HTMLElement): void => {
    const r = sheet.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    if (r.top - w.top < w.height * 0.3) return;
    const lo = 170;
    const hi = Math.max(lo, r.top - w.top - 96);
    const cur = pos(i).y - off;
    const want = Math.min(hi, Math.max(lo, cur));
    if (Math.abs(want - cur) > 1) setOff(off + cur - want, true);
  };

  CAMPAIGN.forEach((l, i) => {
    const locked = stars < l.reqStars;
    const q = pos(i);
    const b = el('button', `hd-node${locked ? ' lock' : ''}${l.boss ? ' boss' : ''}${i === focus ? ' next' : ''}`, undefined, inner);
    b.type = 'button';
    b.style.left = `${q.x}%`;
    b.style.top = `${q.y}px`;
    const isle = el('span', 'hd-isle', undefined, b);
    if (i === focus) {
      el('span', 'hd-ring', undefined, isle);
      if (!guided) el('span', 'hd-nextflag', '下一关', isle);
    }
    const art = mapIslandArt(i % 30);
    isle.appendChild(img(art, l.boss ? 112 : 84, 'hd-img hd-isle-img'));
    el('span', 'hd-num', String(i + 1), isle);
    if (locked) {
      const lk = el('span', 'hd-lockic', undefined, isle);
      lk.appendChild(lockIcon(30));
    }
    if (l.boss) el('span', 'hd-bosslabel', '首领', isle);
    const plate = el('span', 'hd-lb', l.boss ? (l.bossName ?? l.name) : l.name, b);
    if (locked) el('small', '', `还差 ${l.reqStars - stars} 星`, plate);
    else {
      const st = el('span', 'hd-stars', undefined, b);
      for (let k = 0; k < 3; k++) st.appendChild(img(iconA(k < (p.stars[l.id] ?? 0) ? 'star' : 'starEmpty'), 14));
    }
    b.addEventListener('click', () => {
      if (locked) toast(`要累计 ${l.reqStars} 颗星才能上这座岛`);
      show(i);
    });
  });
  // 下一关旁边一颗大的「出发」：新玩家第一眼就知道点哪儿（点开岛面板，木材、星数、侦察都在面板上）；岛在右半边时钮放左边，反之放右边
  if (!guided) {
    const fq = pos(focus);
    const goNext = button('出发', `hd-btn-gold hd-node-go ${fq.x >= 50 ? 'l' : 'r'}`, () => show(focus), inner);
    goNext.style.left = `${fq.x}%`;
    goNext.style.top = `${fq.y}px`;
  }

  // 今日悬赏告示：一天一次，奖励翻倍
  const bo = bountyOf(p);
  if (bo) {
    const bl = CAMPAIGN.findIndex((l) => l.id === bo.levelId);
    const note = el('button', `hd-bounty${bo.done ? ' done' : ''}`, undefined, uiRoot());
    note.type = 'button';
    note.appendChild(img(iconA('bounty'), 34));
    const t = el('span', 'hd-bt', undefined, note);
    el('b', '', '今日悬赏', t);
    el('small', '', bo.done ? '已完成，明天再来' : `${bo.name} · 通关奖励翻倍`, t);
    note.addEventListener('click', () => {
      if (bo.done) return toast('今天的悬赏已经完成，明天再来');
      show(bl, true);
    });
    wrap.addEventListener('remove', () => note.remove());
    bountyEl = note;
  }
  // 入口卡竖着排在一个容器里：卡的高度跟着字数变（窄屏上标题会折行），各自写死 top 会叠在一起
  const cards = el('div', 'hd-seacards', undefined, uiRoot());
  // 寻宝航线（每日航线）：一张醒目的卡，点了关掉海图、打开航线图页（src/view/maproute.ts）
  const routeRow = el('div', 'hd-mc-row', undefined, cards);
  const routeOff = mapCard(() => {
    stop();
    onClose();
    openRoute();
  }, routeRow);
  // 同一条航线带筹码跑（实盘）：登录了、没被 501 关掉才有（src/view/livemore.ts）
  const mapLiveOff = liveEntryReady()
    ? mapLiveChip(() => {
        stop();
        openMapLive(onClose);
      }, routeRow)
    : () => undefined;
  // 护航（商船队）：选图和难度，出发走守岛场景（src/view/escortsel.ts）
  const escortOff = escortCard(() => {
    stop();
    openEscortSelect((id) => app.startTdLevel(id), onClose, liveEntryReady() ? () => openEscortLive(onClose) : undefined);
  }, cards);
  const close = button('回岛', 'hd-btn-wood hd-map-close', () => {
    stop();
    onClose();
  }, uiRoot());
  // 异步攻防：打别的玩家（src/view/pvp.ts）；单独部署、没登录时不显示
  const pvpOff = pvpMapButton(() => {
    stop();
    openPvp(onClose);
  });
  // 悬赏出海（实盘，src/view/live.ts）；单独部署、没登录时不显示
  const liveOff = liveMapButton(() => {
    stop();
    openLive(onClose);
  });
  function stop(): void {
    bountyEl?.remove();
    wrap.remove();
    close.remove();
    home.remove();
    window.removeEventListener('resize', onResize);
    pvpOff();
    liveOff();
    routeOff();
    mapLiveOff();
    escortOff();
    cards.remove();
  }
  // 海图是可拖动的游戏地图：页面本身不滚（容器 overflow:clip），内容用 transform 平移；
  // 拖动平移，滚轮不响应（不滚页面），按钮和面板都在 wrap 外固定在屏幕上，「回到下一关」把地图平移回下一关
  let off = 0;
  const maxOff = (): number => Math.max(0, H - wrap.clientHeight);
  const setOff = (v: number, anim = false): void => {
    off = Math.min(maxOff(), Math.max(0, v));
    inner.classList.toggle('glide', anim);
    inner.style.transform = `translate3d(0,${-off}px,0)`;
  };
  // 下一关放在靠下的位置，上面留出几座岛的视野；新号下一关是第 1 关，贴着底部，顶上留给引导横幅的是空白海面
  const homeOff = (): number => i0(pos(focus).y - (wrap.clientHeight - 200));
  let drag: { id: number; y: number; off: number; moved: boolean } | null = null;
  let swallow = false;
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || (e.target as Element).closest('.hd-sheet')) return;
    drag = { id: e.pointerId, y: e.clientY, off, moved: false };
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {
        // 没有活动指针（合成事件）时抓不住，拖动照常
      }
    }
    setOff(drag.off - dy);
  });
  const endDrag = (): void => {
    swallow = !!drag?.moved;
    drag = null;
    // 拖完紧跟着的那次 click 吞掉，免得松手时点开岛
    if (swallow) setTimeout(() => (swallow = false), 0);
  };
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);
  wrap.addEventListener('click', (e) => {
    if (swallow) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  wrap.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  const onResize = (): void => setOff(off);
  window.addEventListener('resize', onResize);
  const home = button('回到下一关', 'hd-btn-plain hd-map-home', () => setOff(homeOff(), true), uiRoot());
  requestAnimationFrame(() => setOff(homeOff()));
  return stop;
}

const i0 = (v: number): number => Math.max(0, v);
