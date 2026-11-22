import { claimAll } from './baseupgrade.ts';
import { ingotOwed } from '../core/ingot.ts';
import { openTraining, trainDot } from './training.ts';
import type { BaseScene } from './BaseScene.ts';
import { capacity, hqLevel, rankOf } from '../core/index.ts';
import type { Placed } from '../core/types.ts';
import { exchangeButton } from './live.ts';
import { pagePoint, fmt, app } from './app.ts';
import { wTex, sTex, iconA } from './art.ts';
import { flyIcons } from './fx.ts';
import { baseDots } from './dots.ts';
import { keyBadge } from './inputs.ts';
import { unseenDefenseCount } from './pvp.ts';
import { Tutorial } from './tutorial.ts';
import { img, el, screen, hallButton, button } from './ui.ts';
import { DEPTH } from './depth.ts';
import { type Node, CAPTAIN_ICON } from './basecommon.ts';
import { wallMask, openBuild } from './baseplace.ts';
import { openProfile } from './basepanel.ts';
import { paintProfileRank } from './rankui.ts';
import { openMap, openFleet, openTd } from './basenav.ts';

/** 按存档给建筑换上该用的贴图（升级完成换外观、高等级外观烘好之后） */
export function retexture(bs: BaseScene, n: Node, b: Placed): void {
  const art = b.kind === 'wall' ? wTex(b.level, wallMask(bs, b)) : sTex(b.kind, b.level);
  if (n.key === art.key) return;
  n.img.setTexture(art.key).setOrigin(art.ax / art.w, art.ay / art.h);
  n.key = art.key;
  if (b.kind !== 'wall') bs.env.dress(n.img, b.kind, b.level, b.id);
}

/** 收取气泡的底（圆 + 小尖角）：按渲染倍数画一次成贴图。以前每个气泡是一个 Graphics，满配岛上十几个每帧都要重新三角化 */
const BUBBLE_O = { x: 22, y: 22, w: 44, h: 52 };
function bubbleTex(bs: BaseScene): string {
  const key = `ui.bubble.${bs.r}`;
  if (bs.textures.exists(key)) return key;
  const g = bs.make.graphics({}, false);
  g.setScale(bs.r);
  const { x, y } = BUBBLE_O;
  g.fillStyle(0xf9f0da, 1).fillCircle(x, y, 19).lineStyle(3, 0x2b1a15, 1).strokeCircle(x, y, 19);
  g.fillStyle(0xf9f0da, 1).fillTriangle(x - 6, y + 16, x + 6, y + 16, x, y + 26).lineStyle(3, 0x2b1a15, 1).lineBetween(x - 6, y + 17, x, y + 26).lineBetween(x + 6, y + 17, x, y + 26);
  g.generateTexture(key, Math.ceil(BUBBLE_O.w * bs.r), Math.ceil(BUBBLE_O.h * bs.r));
  g.destroy();
  return key;
}

export function syncBubble(bs: BaseScene, n: Node, b: Placed): void {
  const kind = b.kind === 'goldmine' ? 'gold' : b.kind === 'sawmill' ? 'wood' : null;
  const show = kind !== null && (b.stored ?? 0) >= 1 && !bs.place;
  if (!show || !kind) {
    n.bubble?.destroy();
    n.bubble = undefined;
    return;
  }
  if (n.bubble && n.bubbleKind !== kind) {
    n.bubble.destroy();
    n.bubble = undefined;
  }
  if (!n.bubble) {
    const g = bs.add.image(0, 0, bubbleTex(bs)).setOrigin(BUBBLE_O.x / BUBBLE_O.w, BUBBLE_O.y / BUBBLE_O.h).setScale(1 / bs.r);
    const p = iconA(kind);
    const ic = bs.add.image(0, 0, p.key).setScale(26 / p.h / bs.r);
    n.bubble = bs.add.container(n.img.x, n.img.y, [g, ic]).setDepth(DEPTH.baseBubble);
    n.bubble.x = n.img.x;
    n.bubbleKind = kind;
  }
  n.bubble.x = n.img.x;
}

/** 世界坐标 → 页面上的屏幕坐标（CSS 像素） */
export function screenOf(bs: BaseScene, wx: number, wy: number): { x: number; y: number } {
  return pagePoint(bs.cc.toScreen(wx, wy));
}

export function collectFly(bs: BaseScene, kind: 'gold' | 'wood', from: { x: number; y: number }, before: number, after: number): void {
  const pill = bs.hud[kind];
  const num = pill.querySelector('b')!;
  const start = bs.rolling[kind] ? (bs.shown[kind] ?? before) : before;
  bs.rolling[kind] = true;
  const done = (): void => {
    bs.rolling[kind] = false;
    updateHud(bs);
  };
  const timer = window.setTimeout(done, 2200);
  flyIcons(bs.ui, from, pill, () => img(iconA(kind), 22), 5, () => {
    pill.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 260 });
    const t0 = performance.now();
    const tick = (): void => {
      if (!bs.rolling[kind]) return;
      const f = Math.min(1, (performance.now() - t0) / 550);
      const v = start + (after - start) * (1 - (1 - f) * (1 - f));
      bs.shown[kind] = v;
      num.textContent = fmt(v);
      if (f < 1) requestAnimationFrame(tick);
      else {
        window.clearTimeout(timer);
        done();
      }
    };
    tick();
  });
}

/**
 * 花钱的反馈：顶栏的资源条抖一下，牌子下半截冒一个红色的 -N 往上飘着淡掉（升级、建造、研究都走这里；收取有自己的飞币）。
 * 不往下飘：手机竖屏顶栏两行，往下会撞在第二行的「训练营」上
 */
export function spendFx(bs: BaseScene, kind: 'gold' | 'wood', amount: number): void {
  const pill = bs.hud[kind];
  pill.animate([{ transform: 'scale(1)' }, { transform: 'scale(.93)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  const a = pill.getBoundingClientRect();
  const b = bs.ui.getBoundingClientRect();
  const t = el('div', 'hd-spend', `-${fmt(amount)}`, bs.ui);
  t.style.left = `${a.left - b.left + a.width / 2}px`;
  t.style.top = `${a.top - b.top + a.height / 2}px`;
  t.animate([{ opacity: 1, transform: 'translate(-50%,0)' }, { opacity: 1, transform: 'translate(-50%,-10px)', offset: 0.7 }, { opacity: 0, transform: 'translate(-50%,-20px)' }], { duration: 1400, easing: 'ease-out' }).onfinish = () => t.remove();
}

export function updateHud(bs: BaseScene): void {
  const p = app.profile;
  const cap = capacity(p);
  const prev = bs.prevRes;
  bs.prevRes = { gold: p.res.gold, wood: p.res.wood };
  for (const k of ['gold', 'wood'] as const) {
    if (prev && !bs.rolling[k] && prev[k] - p.res[k] >= 1) spendFx(bs, k, Math.floor(prev[k] - p.res[k]));
    const pill = bs.hud[k];
    pill.className = `hd-pill hd-flex${p.res[k] >= cap[k] ? ' full' : ''}`;
    if (!bs.rolling[k]) pill.querySelector('b')!.textContent = fmt(p.res[k]);
    // 「上限」两个字单独包一层：手机竖屏资源牌放不下，CSS 把它藏起来只剩「/ 6,500」
    const sm = pill.querySelector('small')!;
    sm.textContent = '';
    el('span', 'hd-capk', '上限 ', sm);
    sm.append(fmt(cap[k]));
  }
  bs.hud.hq.querySelector('b')!.textContent = `主寨 ${hqLevel(p)} 级`;
  paintProfileRank(bs.hud.me, rankOf(p));
  // 底栏红点：能升级 / 能领取在「建造」上，被打了在「出海」上
  const d = baseDots(p, unseenDefenseCount());
  bs.dotEls.get('upgrade')?.classList.toggle('on', d.upgrade);
  bs.dotEls.get('collect')?.classList.toggle('on', d.collect);
  bs.dotEls.get('attacked')?.classList.toggle('on', d.attacked);
  claimLabel(bs, d.collect);
  bs.trainBtn?.querySelector('.hd-dot')?.classList.toggle('on', trainDot());
}

/** 一键收取钮：写上矿里攒着的加训练营待领的有多少（金、木各一个数），还有待领的金银锭，没有能收的就藏起来；内容没变不重建 DOM */
function claimLabel(bs: BaseScene, on: boolean): void {
  const btn = bs.claimBtn;
  if (!btn) return;
  const st = { gold: 0, wood: 0 };
  for (const b of app.profile.base.buildings) {
    if (b.kind === 'goldmine') st.gold += Math.floor(b.stored ?? 0);
    else if (b.kind === 'sawmill') st.wood += Math.floor(b.stored ?? 0);
  }
  const owed = app.profile.train?.owed;
  if (owed) {
    st.gold += owed.gold;
    st.wood += owed.wood;
  }
  const ing = ingotOwed(app.profile);
  const sig = on ? `${st.gold}:${st.wood}:${ing}` : '';
  if (btn.dataset.sig === sig) return;
  btn.dataset.sig = sig;
  btn.classList.toggle('on', on);
  btn.replaceChildren();
  if (!on) return;
  el('span', 'hd-claim-t', '一键收取', btn);
  for (const k of ['gold', 'wood'] as const) {
    if (st[k] < 1) continue;
    btn.appendChild(img(iconA(k), 20));
    el('b', 'hd-n', fmt(st[k]), btn);
  }
  if (ing > 0) {
    btn.appendChild(img(iconA('ingot'), 20));
    el('b', 'hd-n', fmt(ing), btn);
  }
}

export function buildUi(bs: BaseScene): void {
  bs.ui = screen('hd-base');
  hallButton(() => app.leave(), bs.ui);
  const bar = el('div', 'hd-bar', undefined, bs.ui);
  const pill = (kind: 'gold' | 'wood'): HTMLElement => {
    const d = el('div', 'hd-pill hd-flex', undefined, bar);
    d.appendChild(img(iconA(kind), 24));
    // 数字和上限上下两行：390 宽的手机上两条资源也放得下
    const col = el('span', 'hd-col', undefined, d);
    el('b', '', '0', col);
    el('small', '', '', col);
    return d;
  };
  const gold = pill('gold');
  const wood = pill('wood');
  // 第二行：主寨等级、筹码换资源、个人面板（星数和成就收在里面）
  const bar2 = el('div', 'hd-bar2', undefined, bs.ui);
  const hq = el('div', 'hd-pill', undefined, bar2);
  hq.appendChild(img(iconA('home'), 22));
  el('b', '', '', hq);
  exchangeButton(bar2);
  bs.trainBtn = button('', 'hd-btn-wood hd-trainbtn', () => openTraining(), bar2);
  bs.trainBtn.appendChild(img(iconA('sword'), 22));
  el('span', '', '训练营', bs.trainBtn);
  bs.trainBtn.appendChild(el('i', 'hd-dot'));
  bs.trainBtn.title = '训练营：每种兵一关短教学';
  const me = button('', 'hd-btn-plain hd-profile', () => openProfile(bs), bar2);
  bs.hud = { gold, wood, hq, me };
  me.innerHTML = CAPTAIN_ICON;
  me.setAttribute('aria-label', '船长档案：星数、成就、收藏');
  bs.bottom = el('div', 'hd-bottom', undefined, bs.ui);
  const mk = (label: string, icon: 'hammer' | 'map' | 'ship' | 'shield', cls: string, f: () => void, dots: Array<'upgrade' | 'collect' | 'attacked'> = []): HTMLElement => {
    const b = button('', cls, f, bs.bottom);
    b.appendChild(img(iconA(icon), 28));
    el('span', '', label, b);
    const n = bs.bottom.children.length;
    keyBadge(b, n);
    b.title = label === '建造' ? `建造（${n} 或 B）` : `${label}（${n}）`;
    for (const k of dots) {
      const dot = el('i', `hd-dot ${k}`, undefined, b);
      bs.dotEls.set(k, dot);
    }
    return b;
  };
  bs.buildBtn = mk('建造', 'hammer', 'hd-btn-wood', () => openBuild(bs), ['upgrade', 'collect']);
  bs.mapBtn = mk('出海', 'map', 'hd-btn-gold', () => openMap(bs), ['attacked']);
  bs.fleetBtn = mk('船队', 'ship', 'hd-btn-wood', () => openFleet(bs));
  mk('守岛', 'shield', 'hd-btn-wood', () => openTd(bs)).classList.add('hd-tdbtn');
  // 一键收取：矿里攒了东西才浮在底栏正上方（底栏收起时跟着收），点一下全收、弹汇总
  bs.claimBtn = button('', 'hd-btn-gold hd-claimfab', () => claimAll(bs), bs.bottom, null);
  bs.claimBtn.title = '一键收取（C）';
  // 第二行放在底栏后面：矮竖屏它和底栏挤在同一行，底栏收起（开面板 / 页面）时用兄弟选择器一起收起，不压住面板里的按钮
  bs.bottom.after(bar2);
  bs.plate = el('div', 'hd-nameplate', undefined, bs.ui);
  bs.tut = new Tutorial(bs.ui);
  bs.vaultTut = new Tutorial(bs.ui, { label: '先不了', onSkip: () => (app.storageCut = null) });
}
