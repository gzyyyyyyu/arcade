import type { TdScene } from './TdScene.ts';
import { TD_TREASURE } from '../content/index.ts';
import { TD2_ENEMIES } from '../content/td2units.ts';
import { tdPreview, tdRoutes, tdCallBonus, tdNextTide, type WavePreview } from '../core/index.ts';
import { TICKS_PER_SEC } from '../core/types.ts';
import { app, fmt } from './app.ts';
import { iconA, tdE } from './art.ts';
import { keyBadge } from './inputs.ts';
import { floatText } from './fx.ts';
import { laneName, planCard, callBonusText, fitSuggest, waveEnemies } from './td-ui.ts';
import { injectTdCss } from './tdcss.ts';
import { FOE_KEY, foeText, newFoes } from './tdhint.ts';
import { hintCard, takeNew } from './hintcard.ts';
import { screen, hallButton, el, img, button, confirmBox } from './ui.ts';
import { EscortView } from './escortview.ts';
import { injectEscortCss } from './escortcss.ts';
import { act, pickSkill, callWave, toggleHero } from './tdinput.ts';
import { closeSheet, showBest } from './tdsheet.ts';
import { SKILL } from './tdcommon.ts';
import { finish } from './tdresult.ts';
import { syncPadGuide } from './tdpadguide.ts';

// ---------------------------------------------------------------- 界面

export function buildUi(bs: TdScene): void {
  injectTdCss();
  bs.ui = screen('hd-td');
  if (bs.d.escort) {
    injectEscortCss();
    bs.esc = new EscortView({ scene: bs, r: bs.r, ui: bs.ui, cc: bs.cc, fit: () => bs.fit, state: () => bs.s, act: (a) => act(bs, a), float: (x, y, t, c, z) => ftx(bs, x, y, t, c, z) });
  }
  hallButton(() => app.leave(), bs.ui);
  const bar = el('div', 'hd-td-bar', undefined, bs.ui);
  const tp = el('div', 'hd-pill', undefined, bar);
  tp.appendChild(img(iconA('gold'), 22));
  const treasure = el('b', '', '', tp);
  tp.title = '宝藏';
  if (bs.esc) tp.style.display = 'none';
  const wp = el('div', 'hd-pill', undefined, bar);
  wp.appendChild(img(iconA('sword'), 22));
  const wave = el('b', '', '', wp);
  bs.esc?.buildBar(bar);
  // 矮竖屏（见 layout.ts）：预告卡默认收起，顶栏里留一个 44×44 的小钮显示下一波的波次号，点开在顶栏下面浮出预告卡；别的尺寸这个钮不显示
  button('', 'hd-btn-wood hd-plan-tog', () => setPlanOpen(bs, !bs.ui.classList.contains('hd-plan-open')), bar).setAttribute('aria-label', '下两波预告');
  const bar2 = el('div', 'hd-td-bar2', undefined, bs.ui);
  const gp = el('div', 'hd-pill', undefined, bar2);
  gp.appendChild(img(iconA('hammer'), 22));
  const gold = el('b', '', '', gp);
  gp.title = '局内金币';
  const cp = el('div', 'hd-pill', undefined, bar2);
  const count = el('b', '', '', cp);
  const spacer = el('span', '', undefined, bar2);
  spacer.style.flex = '1';
  const flip = (): void => {
    bs.speed = bs.speed >= 4 ? 1 : bs.speed * 2;
    speed.textContent = speedTop.textContent = `${bs.speed}×`;
  };
  const speed = button(`${bs.speed}×`, 'hd-btn-wood', flip, bar2);
  // 矮竖屏（360×640 一类）底栏一行装不下三个技能钮 + 叫波 + 金币牌 + 加速 + 撤退，加速挪到顶栏的空位（layout.ts），别的尺寸这个钮不显示
  const speedTop = button(`${bs.speed}×`, 'hd-btn-wood hd-td-speedtop', flip, bar);
  button('撤退', 'hd-btn-red', () => askEnd(bs), bar2);
  const hint = el('div', 'hd-hint', '', bs.ui);
  hint.style.display = 'none';
  // 预告卡：倒数里显示下两波（点开是敌人图鉴和克制表，图鉴开着时暂停）
  bs.edges = el('div', 'hd-td-edges', undefined, bs.ui);
  const plan = el('div', 'hd-td-plan', undefined, bs.ui);
  plan.title = '下两波的预告：点开看每一路的敌人和克制表（C）';
  plan.addEventListener('click', () => {
    setPlanOpen(bs, false);
    if (bs.bestOpen) closeSheet(bs);
    else showBest(bs);
  });
  const paused = el('div', 'hd-td-paused', '已暂停 · 关掉面板继续', bs.ui);
  const flashEl = el('div', 'hd-td-flash', undefined, bs.ui);
  const bottom = el('div', 'hd-td-bottom', undefined, bs.ui);
  // 英雄钮：先选中英雄，再点地面才走过去（点空地不再直接叫他走，免得到处乱跑）；快捷键 H，不占数字键
  const heroBtn = button('', 'hd-td-skill hd-btn-wood hd-td-herobtn', () => toggleHero(bs), bottom);
  heroBtn.appendChild(img(iconA('sword'), 28));
  el('b', '', '英雄', heroBtn);
  el('kbd', 'hd-key', 'H', heroBtn);
  heroBtn.title = '指挥英雄：选中后点地面让他过去，再点一次或 Esc 取消（H）';
  const mkSkill = (label: string, icon: 'barrage' | 'shield', tip: string, f: () => void, n: number): HTMLButtonElement => {
    const b = button('', 'hd-td-skill hd-btn-wood', f, bottom);
    el('span', 'hd-cd', undefined, b);
    b.appendChild(img(iconA(icon), 28));
    el('b', '', label, b);
    keyBadge(b, n);
    b.title = `${tip}（${n}）`;
    return b;
  };
  const barBtn = mkSkill('拒马', 'shield', '拒马：在英雄身边的路上放一道栅栏，挡住地面敌人几秒', () => pickSkill(bs, 'barricade'), 1);
  const keg = mkSkill('炸药桶', 'barrage', '炸药桶：扔到英雄身边，炸一小群', () => pickSkill(bs, 'keg'), 2);
  const call = button('', 'hd-btn-gold hd-td-call', () => callWave(bs), bottom);
  call.title = '叫下一波：提前开打，拿金币、技能冷却变短（空格 / 3）';
  keyBadge(call, 3);
  bs.esc?.buildCtl();
  bs.hud = { treasure, tpill: tp, wave, count, gold, speed, call, keg, bar: barBtn, hero: heroBtn, hint, flash: flashEl, plan, paused };
  updateHud(bs, true);
}

/** 预告卡的展开 / 收起（只有矮竖屏用得上，状态只在界面层）：展开后点预告卡、点别处（包括点岛）、叫波都会收起 */
const planClose = new WeakMap<HTMLElement, (e: Event) => void>();
export function setPlanOpen(bs: TdScene, on: boolean): void {
  const ui = bs.ui;
  ui.classList.toggle('hd-plan-open', on);
  const old = planClose.get(ui);
  if (old) document.removeEventListener('pointerdown', old, true);
  planClose.delete(ui);
  if (!on) return;
  ui.querySelector('.hd-plan-tog')?.classList.remove('hint');
  const onDown = (e: Event): void => {
    if (!ui.isConnected) {
      document.removeEventListener('pointerdown', onDown, true);
      return;
    }
    const t = e.target as Element | null;
    if (t?.closest('.hd-td-plan, .hd-plan-tog')) return;
    setPlanOpen(bs, false);
  };
  planClose.set(ui, onDown);
  document.addEventListener('pointerdown', onDown, true);
}

export function canCall(bs: TdScene): boolean {
  const s = bs.s;
  return (!!s.level.endless || s.wave < s.level.waves.length) && s.next >= 0 && !s.over;
}

/** 登陆路下标 → 北路 / 西路…（落潮路下标 = lanes.length） */
export function laneTitle(bs: TdScene, lane: number): string {
  const lv = bs.s.level;
  const at = lane === lv.lanes.length ? lv.tide?.lane : lv.lanes[lane];
  return at ? laneName(at) : '那条路';
}

export function waveTitle(bs: TdScene, w: number): string {
  return bs.s.level.endless ? `第 ${w + 1} 波` : `第 ${w + 1}/${bs.s.level.waves.length} 波`;
}

/** 预告和路线：开新的一波、墙破了或修好时重算（tdPreview、tdRoutes 都要跑找路，不每帧算） */
export function refreshPlan(bs: TdScene, force = false): void {
  const s = bs.s;
  const walls = s.walls.reduce((n, w, i) => (w.destroyed ? n + (i + 1) * 7 : n), 0);
  const sig = `${s.wave}|${walls}|${s.over}`;
  if (!force && sig === bs.planSig) return;
  const newWave = !bs.planSig.startsWith(`${s.wave}|`);
  const fresh = bs.planSig !== '' && newWave;
  bs.planSig = sig;
  bs.pv = s.over ? [] : fitSuggest(tdPreview(s, 2), s.unlocked);
  if (newWave && bs.pv[0]) foeHint(bs, bs.pv[0]);
  bs.plan.set(s, bs.pv, s.over ? [] : tdRoutes(s));
  bs.hudSig = '';
  // 新的一波预告：卡片弹一下，提示"现在该看下一波了"
  if (fresh && bs.hud) {
    bs.hud.plan.classList.remove('fresh');
    void bs.hud.plan.offsetWidth;
    bs.hud.plan.classList.add('fresh');
    // 收起时有了新的预告（新一波的推荐）：小钮亮一个提示点
    if (!bs.ui.classList.contains('hd-plan-open')) bs.ui.querySelector('.hd-plan-tog')?.classList.add('hint');
  }
}

/** 预告里的下一波有第一次见到的敌人：弹一张不挡操作的小卡（头像、会干什么、最怕什么伤害），每种只提示一次 */
function foeHint(bs: TdScene, p: WavePreview): void {
  const fresh = takeNew(FOE_KEY, (seen) => newFoes(waveEnemies(p).map((e) => e.kind), seen));
  const rows = fresh.flatMap((k) => {
    const f = tdE(k, 'walk')[0];
    return f ? [{ icon: img(f, 40), name: TD2_ENEMIES[k].name, text: foeText(k, bs.s.unlocked) }] : [];
  });
  hintCard(bs, bs.ui, rows, fresh.length ? '新敌人' : undefined);
}

export function hintText(bs: TdScene, t: string): void {
  bs.hud.hint.textContent = t;
  bs.hud.hint.style.display = t ? '' : 'none';
}

export function updateHud(bs: TdScene, force = false): void {
  const s = bs.s;
  // HUD 的内容都由规则状态算出来，状态每拍（50 毫秒）才变一次；一拍里的多个画面帧不用重算签名
  if (!force && s.tick === bs.hudTick && bs.mode === bs.hudMode) return;
  bs.hudTick = s.tick;
  bs.hudMode = bs.mode;
  const h = s.hero;
  refreshPlan(bs);
  syncPadGuide(bs);
  bs.esc?.refresh(bs.pv);
  const total = s.level.waves.length;
  const endless = !!s.level.endless;
  const left = s.next >= 0 ? Math.max(0, Math.ceil((s.next - s.tick) / TICKS_PER_SEC)) : -1;
  const canCallNow = canCall(bs);
  // 叫波的奖励（金币、技能冷却抵扣）由规则核心算，界面只显示
  const cb = canCallNow ? tdCallBonus(s) : { gold: 0, cdCut: 0 };
  const kegCd = Math.max(0, h.kegReady - s.tick);
  const barCd = Math.max(0, (h.barricadeReady ?? 0) - s.tick);
  // 英雄倒下时两个技能钮写复活倒数（只有一闪而过的横幅的话，锁着的钮看不出为什么、要等多久）
  const downS = h.respawn >= 0 ? Math.max(0, Math.ceil((h.respawn - s.tick) / TICKS_PER_SEC)) : -1;
  const nextTide = tdNextTide(s);
  const nowTide = s.level.tideOpen ? bs.tideOn : null;
  const sig = `${nextTide}|${nowTide}|${TD_TREASURE - s.lost}|${s.vault}|${s.wave}|${left}|${s.gold}|${cb.gold}|${cb.cdCut >> 4}|${kegCd >> 2}|${barCd >> 2}${downS}|${bs.mode}|${bs.planSig}|${bs.esc?.planSig(bs.pv) ?? ''}`;
  if (!force && sig === bs.hudSig) return;
  bs.hudSig = sig;
  const H = bs.hud;
  // 预告卡：潮水的变化写进第二行
  const ln = s.level.tide ? laneName(s.level.tide.lane) : '那条路';
  const tide = nextTide !== null && nowTide !== null ? (nextTide === nowTide ? '' : nextTide ? `落潮：${ln}开通` : `涨潮：${ln}关上`) : '';
  // 预告卡只在预告、倒数秒数、潮水变了时重排（金币、冷却这些每拍在变的不牵动它）
  const planKey = `${bs.planSig}|${canCallNow ? left : -1}|${tide}|${bs.esc?.planSig(bs.pv) ?? ''}`;
  if (force || planKey !== bs.planKey) {
    bs.planKey = planKey;
    planCard(H.plan, bs.pv, { title: (w) => waveTitle(bs, w), left: canCallNow ? left : -1, tide, laneTitle: (l) => laneTitle(bs, l) });
    bs.esc?.decoratePlan(H.plan, bs.pv);
  }
  // 收起状态的小钮写下一波的波次号；叫波后（波数变了）自动收起
  const tog = bs.ui.querySelector('.hd-plan-tog');
  const w0 = bs.pv[0]?.wave;
  if (tog) tog.textContent = w0 === undefined ? '—' : endless ? `${w0 + 1}` : `${w0 + 1}/${total}`;
  if (bs.ui.dataset.pw !== String(s.wave)) {
    if (bs.ui.dataset.pw !== undefined && bs.ui.classList.contains('hd-plan-open')) setPlanOpen(bs, false);
    bs.ui.dataset.pw = String(s.wave);
  }
  // 手机上顶栏放不下"宝藏"两个字（.hd-tw 在窄屏隐藏），只留图标和数字
  H.treasure.textContent = '';
  el('span', 'hd-tw', '宝藏 ', H.treasure);
  H.treasure.append(`${TD_TREASURE - s.lost}/${TD_TREASURE}`);
  // 大潮无尽、海盗来袭：波数没有尽头，顶栏写"打到第几波"（已经开打的最后一波），结算再写"撑过几波"（打完的）
  const waveKey = endless ? (s.wave > 0 ? `打到第 ${s.wave} 波` : '第 1 波待开') : `${s.wave}/${total} 波`;
  if (H.wave.dataset.k !== waveKey) {
    H.wave.dataset.k = waveKey;
    H.wave.textContent = '';
    if (!endless) {
      // 手机上「已来」收起（td-ui.ts 的 .hd-wave-pre）：牌宽不够时最后一个字会被右邻牌盖住
      el('span', 'hd-wave-pre', '已来 ', H.wave);
    }
    H.wave.append(waveKey);
  }
  H.gold.textContent = fmt(s.gold);
  H.count.textContent = !endless && s.wave >= total ? '最后一波' : left >= 0 ? `下一波 ${left}秒` : '';
  H.call.disabled = !canCallNow;
  const lab = H.call.querySelector('span') ?? el('span', '', '', H.call);
  lab.textContent = canCallNow ? (s.wave === 0 ? '开打' : '叫下一波') : s.over ? '这局结束了' : '没有更多波次';
  let sub = H.call.querySelector('small');
  if (canCallNow) {
    sub ??= el('small', '', '', H.call);
    const bonus = callBonusText(cb.gold, cb.cdCut);
    const text = s.wave === 0 ? (bonus ? `先造塔 · ${bonus}` : '先造塔，再开打') : bonus || '倒数到了自动来';
    // 副文字单行：「技能快 N 秒」那段单独包起来，窄按钮（手机横屏右下角那块板）上收起，整句放 title
    if (sub.dataset.t !== text) {
      sub.dataset.t = text;
      sub.textContent = '';
      const i = text.indexOf(' · 技能快');
      if (i < 0) sub.textContent = text;
      else {
        sub.append(text.slice(0, i));
        el('span', 'hd-call-cd', text.slice(i), sub);
      }
      H.call.title = `叫下一波：提前开打，拿金币、技能冷却变短（空格 / 3）。${text}`;
    }
  } else sub?.remove();
  const ring = (b: HTMLElement, cd: number, total: number, label: string): void => {
    const t = b.querySelector('b')!;
    b.style.setProperty('--cd', `${Math.round((Math.min(cd, total) / total) * 360)}deg`);
    b.classList.toggle('cool', cd > 0 && downS < 0);
    b.classList.toggle('off', downS >= 0);
    t.textContent = downS >= 0 ? `复活 ${downS}秒` : cd > 0 ? `${Math.ceil(cd / TICKS_PER_SEC)}秒` : label;
  };
  ring(H.bar, barCd, SKILL.barricade.cd, '拒马');
  ring(H.keg, kegCd, SKILL.bomb.cd, '炸药桶');
  H.hero.classList.toggle('sel', bs.heroSel);
  H.hero.classList.toggle('off', downS >= 0);
  H.keg.classList.toggle('sel', bs.mode === 'keg');
  H.bar.classList.toggle('sel', bs.mode === 'barricade');
}

/** 顶栏下面正中的"被带走了 -N"：1.2 秒内的累加成一条，过后淡出 */
export function stolenNote(bs: TdScene, n: number): void {
  bs.stolen += n;
  if (!bs.stolenEl?.isConnected) bs.stolenEl = el('span', 'hd-td-stolen', undefined, bs.ui);
  bs.stolenEl.textContent = `被带走了 -${bs.stolen}`;
  bs.stolenEl.classList.remove('off');
  bs.stolenTimer?.remove();
  bs.stolenTimer = bs.time.delayedCall(1200, () => {
    bs.stolen = 0;
    bs.stolenEl?.classList.add('off');
  });
}

export function ftx(bs: TdScene, wx: number, wy: number, str: string, color = '#ffe885', size = 18): void {
  const W = bs.scale.width / bs.r;
  const H = bs.scale.height / bs.r;
  const sp = bs.cc.toScreen(wx, wy);
  const z = bs.cc.z;
  const padX = Math.min(70, W * 0.12);
  const top = 130 + 8;
  const bot = H - 160;
  const sx = Math.min(W - padX, Math.max(padX, sp.x));
  const sy = Math.min(bot, Math.max(top, sp.y));
  const x = wx + (sx - sp.x) / z;
  const y = wy + (sy - sp.y) / z;
  const m = /^(.*?)(-?\d+)$/.exec(str);
  const now = performance.now();
  if (m) {
    const key = m[1] + '|' + color;
    const old = bs.ftMerge.get(key);
    if (old && now - old.t < 700 && Math.hypot(old.x - x, old.y - y) * z < 60 && old.txt.active) {
      old.n += Number(m[2]);
      old.txt.setText(`${m[1]}${old.n}`);
      old.t = now;
      return;
    }
  }
  // 不同类的字在同处：按已有数量往上错开
  let near = 0;
  for (const o of bs.ftMerge.values()) if (now - o.t < 900 && Math.hypot(o.x - x, o.y - y) * z < 40) near++;
  const yy = y - near * 16 / z;
  const t = floatText(bs, bs.r, z, x, yy, str, color, size);
  if (m) bs.ftMerge.set(m[1] + '|' + color, { t: now, x, y: yy, n: Number(m[2]), txt: t });
}

export function banner(bs: TdScene, title: string, sub = '', boss = false): void {
  const b = el('div', `hd-td-banner${boss ? ' boss' : ''}`, undefined, bs.ui);
  el('span', '', title, b);
  if (sub) el('small', '', sub, b);
  setTimeout(() => b.remove(), 950);
}

export function askEnd(bs: TdScene): void {
  if (bs.ended) return;
  const msg = bs.d.escortLive
    ? '现在撤退？商船到不了港，按已经走过的路结回筹码。'
    : bs.d.escort
    ? '现在撤退？商船到不了港，不拿奖励。'
    : bs.d.live
    ? '现在撤退？这局算宝藏被抢光，按撑过的波数结回筹码。'
    : bs.d.tide
      ? '现在撤退？这局到此为止，按撑过的波数记成绩。'
      : bs.d.home
        ? '现在撤退？这局到此为止，按撑住的波数给奖励。'
        : '现在撤退？这局算宝藏被抢光，不拿奖励。';
  confirmBox(msg, '撤退', () => {
    bs.s.lost = TD_TREASURE;
    bs.s.over = true;
    finish(bs);
  }, '继续守');
}
