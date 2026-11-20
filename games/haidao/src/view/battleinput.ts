/** 部署与输入：顶栏 / 船卡 / 技能钮、点沙滩登陆与放技能、悬停高亮、选择状态、航线一站的顶栏、教程提示 */
import { SKILLS, TROOPS } from '../content/index.ts';
import { battleResult, canLand } from '../core/index.ts';
import { MAP_LAYERS, MAP_STOP_TICKS } from '../core/maptypes.ts';
import { BATTLE_TICKS, BEACH, ISLAND, TICKS_PER_SEC, UNIT, type BattleResult, type SkillKind } from '../core/types.ts';
import { app, fmt } from './app.ts';
import { iconA, tArt } from './art.ts';
import { keyBadge } from './inputs.ts';
import { clampCenter } from './fxlayout.ts';
import { floatText } from './fx.ts';
import { REDUCED, vibrate } from './feel.ts';
import { iso, unIso } from './iso.ts';
import { sfx } from './audio/sfx.ts';
import { Tutorial, rectOf, tutStep } from './tutorial.ts';
import { button, confirmBox, el, hallButton, img, screen, toast } from './ui.ts';
import { v2 } from './battlecommon.ts';
import type { MapStopHooks } from './battlecommon.ts';
import type { BattleScene } from './BattleScene.ts';
import { finish } from './battleresult.ts';
import { skillCanCast, skillHint } from './aimcalc.ts';
import { snapLanding } from './beachfx.ts';
import { funHud } from './funui.ts';
import { pickReach } from './battleranges.ts';
import { SCOUT_LABEL } from './battlescout.ts';

/** 海滩一圈的登陆区高亮：进场就亮（呼吸），选了船更亮；沙滩外缘一圈金边，一眼看出点哪里能派兵 */
export function drawBeach(bs: BattleScene): void {
  const g = bs.beachG;
  g.fillStyle(0x3fe06a, 0.32).lineStyle(1, 0x2f8a40, 0.5);
  // 岛扩了 ext 圈（自己的岛按主寨）：岛边 [-ext, ISLAND+ext)，沙滩再往外 BEACH 格
  const a = -bs.st.ext;
  const b = ISLAND + bs.st.ext;
  for (let y = a - BEACH; y < b + BEACH; y++) {
    for (let x = a - BEACH; x < b + BEACH; x++) {
      if (!canLand(bs.st, x * UNIT + 50, y * UNIT + 50)) continue;
      const pts = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
      g.fillPoints(pts.map(v2), true).strokePoints(pts.map(v2), true);
    }
  }
  const lo = a - BEACH;
  const hi = b + BEACH;
  const ring = [iso(lo, lo), iso(hi, lo), iso(hi, hi), iso(lo, hi)];
  const inner = [iso(a, a), iso(b, a), iso(b, b), iso(a, b)];
  g.lineStyle(4, 0xffe885, 0.95).strokePoints(ring.map(v2), true);
  g.lineStyle(2, 0xffe885, 0.6).strokePoints(inner.map(v2), true);
}

/** 还有没登陆的船、也没在选技能：沙滩高亮着 */
export function beachOn(bs: BattleScene): boolean {
  return !bs.st.over && !bs.ended && bs.selSkill < 0 && bs.groups.some((g) => g.idx.some((i) => bs.st.landed[i] !== true));
}

export function buildUi(bs: BattleScene): void {
  bs.ui = screen('hd-battle');
  hallButton(() => app.leave(), bs.ui);
  const bar = el('div', 'hd-bar', undefined, bs.ui);
  const t = el('div', 'hd-pill', undefined, bar);
  t.appendChild(img(iconA('sword'), 22));
  bs.timeEl = el('b', '', '3:00', t);
  // 侦察期（第一个操作前计时不走）的小字，出第一船后收起
  bs.scoutEl = el('small', 'hd-scoutnote', SCOUT_LABEL, t);
  bs.scoutEl.style.cssText = 'display:none;font-size:12px;font-weight:700;color:#ffe885;white-space:nowrap';
  const pc = el('div', 'hd-pill', undefined, bar);
  pc.appendChild(img(iconA('skull'), 22));
  bs.pctEl = el('b', '', '0%', pc);
  const st = el('div', 'hd-pill', undefined, bar);
  const stars = el('span', 'hd-stars', undefined, st);
  for (let i = 0; i < 3; i++) {
    const im = img(iconA('starEmpty'), 24);
    stars.appendChild(im);
    bs.starsEl.push(im);
  }
  bs.starsEl = [...stars.querySelectorAll('img')] as HTMLImageElement[];
  if (bs.d.map) mapStrip(bs, bs.d.map);
  const bar2 = el('div', 'hd-bar2', undefined, bs.ui);
  bar2.style.justifyContent = 'flex-end';
  bs.speedBtn = button(`${bs.speed}×`, 'hd-btn-wood', () => {
    bs.speed = bs.speed >= 2 ? 1 : 2;
    bs.speedBtn.textContent = `${bs.speed}×`;
  }, bar2);
  bs.endBtn = button('撤退', 'hd-btn-red', () => askEnd(bs), bar2);

  bs.cardsEl = el('div', 'hd-cards', undefined, bs.ui);
  bs.hintEl = el('div', 'hd-hint', '', bs.cardsEl);
  bs.hintEl.style.display = 'none';
  bs.skillsEl = el('div', 'hd-skills', undefined, bs.cardsEl);
  bs.boatsEl = el('div', 'hd-boats', undefined, bs.cardsEl);
  renderCards(bs);
  bs.boatsEl.addEventListener('scroll', () => updateMore(bs), { passive: true });
  bs.cardsEl.addEventListener('scroll', () => updateMore(bs), { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => updateMore(bs));
    ro.observe(bs.boatsEl);
    ro.observe(bs.cardsEl);
  }
  bs.tut = new Tutorial(bs.ui);
}

/** 技能的键位：兵种占数字键 1–9，技能用字母键（编号再多也按得出来） */
export const SKILL_KEYS = 'qwertyuiop';

/** 放不下要滑时给个渐隐提示（竖屏兵种行向右滑，横屏右列向下滑）；滑到头就收掉 */
export function updateMore(bs: BattleScene): void {
  const b = bs.boatsEl;
  const c = bs.cardsEl;
  b.classList.toggle('hd-more', b.scrollWidth > b.clientWidth + 2 && b.scrollLeft + b.clientWidth < b.scrollWidth - 2);
  c.classList.toggle('hd-more', c.scrollHeight > c.clientHeight + 2 && c.scrollTop + c.clientHeight < c.scrollHeight - 2);
}

export function hint(bs: BattleScene, t: string): void {
  bs.hintEl.textContent = t;
  bs.hintEl.style.display = t ? '' : 'none';
}

export function renderCards(bs: BattleScene): void {
  const s = bs.st;
  const army = bs.d.setup.army;
  bs.boatsEl.textContent = '';
  // 兵种多（≥5 张卡）时卡片收紧，手机竖屏一屏放得下
  const tight = bs.groups.length >= 5;
  bs.boatsEl.classList.toggle('hd-tight', tight);
  bs.groups.forEach((g, gi) => {
    const left = g.idx.filter((i) => s.landed[i] !== true);
    const total = left.reduce((n, i) => n + army.boats[i]!.count, 0);
    const done = left.length === 0;
    const c = el('button', `hd-boat${done ? ' done' : ''}${bs.selBoat === gi ? ' sel' : ''}`, undefined, bs.boatsEl);
    c.type = 'button';
    if (gi < 9) keyBadge(c, gi + 1);
    c.appendChild(img(tArt(g.troop, 'idle'), tight ? 44 : 56));
    el('span', 'hd-nm', done ? TROOPS[g.troop].name : `${TROOPS[g.troop].name} ×${total}`, c);
    el('small', '', done ? `已出发 ${g.idx.reduce((n, i) => n + army.boats[i]!.count, 0)}` : `${left.length} 船待命`, c);
    c.addEventListener('click', () => {
      if (done || s.over) return;
      // 再点已选中的卡不取消：出完一船再点卡是常见手势，取消了之后点沙滩就没反应；取消用右键、Esc 或点技能
      bs.selBoat = gi;
      bs.selSkill = -1;
      afterSelect(bs);
    });
  });
  bs.skillsEl.textContent = '';
  const en = el('div', 'hd-en', undefined, bs.skillsEl);
  en.appendChild(img(iconA('energy'), 20));
  el('b', '', String(s.energy), en);
  army.skills.forEach((k, i) => {
    const def = SKILLS[k.kind];
    const cost = def.levels[k.level - 1]?.energy ?? 0;
    const on = s.energy >= cost && !s.over;
    const c = el('button', `hd-btn hd-skill${bs.selSkill === i ? ' sel' : ''}`, undefined, bs.skillsEl);
    c.type = 'button';
    // 能量不够：灰掉、费用变浅红，底下一条进度（现有能量 / 要的能量）
    c.classList.toggle('off', !on);
    if (!on) c.style.setProperty('--p', `${Math.min(100, Math.round((s.energy / Math.max(1, cost)) * 100))}%`);
    c.title = on || s.over ? def.name : `${def.name}：还差 ${cost - s.energy} 点能量`;
    keyBadge(c, SKILL_KEYS[i]?.toUpperCase() ?? '');
    c.appendChild(img(iconA(k.kind), 26));
    // 图标在左、名字和能量两行叠在右边；一律横排不换字，能量不够时只灰掉（点一下有提示）
    const tx = el('span', 'hd-sk-t', undefined, c);
    el('span', 'hd-sk-n', def.name, tx);
    el('small', '', `⚡${cost}`, tx);
    c.addEventListener('click', () => {
      if (s.over) return;
      if (!on) sfx('error');
      if (!on) return toast(`${def.name}：还差 ${Math.max(1, Math.ceil(cost - s.energy))} 能量，拆掉建筑能回能量`);
      bs.selSkill = bs.selSkill === i ? -1 : i;
      bs.selBoat = -1;
      afterSelect(bs);
    });
  });
  bs.cardsSig = sig(bs);
  requestAnimationFrame(() => updateMore(bs));
}

export function sig(bs: BattleScene): string {
  return `${bs.st.energy}|${bs.st.landed.join('')}|${bs.selBoat}|${bs.selSkill}|${bs.st.over}`;
}

/**
 * 船都出完、兵（医疗兵不算）都倒了、还没结束：规则核心要能量也不够放技能才自动结束（battle.ts 的 spent），
 * 剩着能量时计时照走、画面上什么都不动，玩家不知道在等什么。提示条和发光的「结束」钮告诉玩家下一步
 */
export function allDown(bs: BattleScene): boolean {
  const s = bs.st;
  return !s.over && !bs.d.pvp?.replay && s.landed.every(Boolean) && !s.units.some((u) => u.mode !== 'dead' && u.kind !== 'medic');
}

const downText = (bs: BattleScene): string => `兵都倒了：还剩 ${bs.st.energy} 能量，放完技能点「结束」`;

export function afterSelect(bs: BattleScene): void {
  bs.hoverCell = '';
  bs.beachGlow.hover = null;
  bs.hoverG.clear();
  bs.aim.clear();
  bs.beachG.setVisible(beachOn(bs));
  beachPulse(bs);
  const army = bs.d.setup.army;
  if (bs.st.over) hint(bs, '');
  else if (bs.selBoat >= 0) hint(bs, '点沙滩，把船开上去');
  else if (bs.selSkill >= 0) hint(bs, skillHint(army.skills[bs.selSkill]!.kind, SKILLS[army.skills[bs.selSkill]!.kind].name));
  else if (beachOn(bs) && !bs.st.landed.some(Boolean) && !bs.d.pvp?.replay) hint(bs, '先点船卡，再点发光的沙滩');
  else if (allDown(bs)) hint(bs, downText(bs));
  else hint(bs, '');
  renderCards(bs);
  tutRefresh(bs);
}

export function tap(bs: BattleScene, wx: number, wy: number): void {
  const s = bs.st;
  if (s.over || bs.paused) return;
  const g0 = unIso(wx, wy);
  // 出船（或什么都没选）时，点在沙滩外沿、草边的点吸到登陆圈上；选着船时点在岛里面也吸到最近的沙滩；放技能照点的位置
  const snap = bs.selSkill < 0 ? snapLanding(g0.gx, g0.gy, s.ext, bs.selBoat >= 0) : null;
  const g = snap ? { gx: snap.x, gy: snap.y } : g0;
  const ux = Math.round(g.gx * UNIT);
  const uy = Math.round(g.gy * UNIT);
  if (bs.selBoat < 0 && bs.selSkill < 0) {
    // 什么都没选就点了沙滩：替玩家选上第一组还有船的卡、提示再点一下，这一下不出船（免得误放）
    const gi = bs.groups.findIndex((q) => q.idx.some((i) => s.landed[i] !== true));
    // 点在一座敌方防御上：画它的射程和盲区（battleranges.ts）
    if (!snap) {
      pickReach(bs, g0.gx, g0.gy);
      return;
    }
    if (gi < 0) return;
    bs.selBoat = gi;
    afterSelect(bs);
    tapNote(bs, wx, wy, `选上了${TROOPS[bs.groups[gi]!.troop].name}，再点沙滩出船`, '#ffe885', 18);
    return;
  }
  if (bs.selBoat >= 0) {
    if (!canLand(s, ux, uy)) {
      sfx('error');
      badTap(bs, wx, wy);
      return;
    }
    // 这一兵种下一条没登陆的船
    const grp = bs.groups[bs.selBoat]!;
    const boat = grp.idx.find((i) => s.landed[i] !== true);
    if (boat === undefined) return;
    bs.pending.push({ t: s.tick, type: 'land', boat, x: ux, y: uy });
    vibrate('land');
    s.landed[boat] = true; // 先灰掉，下一拍规则核心会确认
    // 这一组还有船就保持选中，否则换下一组还有船的
    if (grp.idx.every((i) => s.landed[i] === true)) bs.selBoat = bs.groups.findIndex((q) => q.idx.some((i) => s.landed[i] !== true));
    afterSelect(bs);
  } else if (bs.selSkill >= 0) {
    const k = bs.d.setup.army.skills[bs.selSkill]!;
    // 信号弹点在范围里没有建筑的地方，规则里整个不生效：提示一下、技能保持选中，让玩家换个点
    if (!skillCanCast(k.kind, s.buildings, ux, uy, skillRadius(bs, bs.selSkill))) {
      sfx('error');
      badTap(bs, wx, wy, '✕ 附近没有能标记的建筑');
      return;
    }
    bs.pending.push({ t: s.tick, type: 'skill', skill: k.kind as SkillKind, x: ux, y: uy });
    bs.selSkill = -1;
    afterSelect(bs);
  }
}

/** 第 i 个技能当前等级的作用半径（格） */
function skillRadius(bs: BattleScene, i: number): number {
  const k = bs.d.setup.army.skills[i]!;
  return SKILLS[k.kind].levels[k.level - 1]?.radius ?? 2;
}

/** 点哪儿就在哪儿飘一句提示，夹在可见区内（点边缘也看得全） */
function tapNote(bs: BattleScene, wx: number, wy: number, text: string, color: string, size: number): void {
  const z = bs.cc.z;
  const css = { w: bs.scale.width / bs.r, h: bs.scale.height / bs.r };
  const sc = bs.cc.toScreen(wx, wy);
  // 宽按字数估（中文一字一个字号宽），长提示不会出屏
  const cx = clampCenter(sc.x, text.length * size + 16, css.w, 8);
  const cy = Math.min(css.h - 210, Math.max(120, sc.y));
  floatText(bs, bs.r, z, wx + (cx - sc.x) / z, wy + (cy - sc.y) / z, text, color, size);
}

/** 点到了不能登陆的地方：提示一句，沙滩亮一下提醒往哪点 */
export function badTap(bs: BattleScene, wx: number, wy: number, text = '✕ 只能在沙滩登陆'): void {
  tapNote(bs, wx, wy, text, '#ff8a7a', 18);
  if (bs.selBoat < 0) return;
  bs.tweens.killTweensOf(bs.beachG);
  bs.beachG.setAlpha(1);
  bs.tweens.add({ targets: bs.beachG, alpha: { from: 1, to: 0.3 }, duration: 160, ease: 'Quad.easeOut', yoyo: true, repeat: 2, onComplete: () => beachPulse(bs) });
}

export function clearSel(bs: BattleScene): void {
  if (bs.st.over || bs.ended || (bs.selBoat < 0 && bs.selSkill < 0)) return;
  bs.selBoat = bs.selSkill = -1;
  afterSelect(bs);
}

/** 鼠标悬停：选着船时，指到能登陆的格子画金色菱形；选着技能时指到的格子画圈 */
export function hover(bs: BattleScene, wx: number, wy: number): void {
  const g = unIso(wx, wy);
  // 选着船时按点下去会吸到的那一格画，悬停和真正落点一致
  const snap = bs.selBoat >= 0 ? snapLanding(g.gx, g.gy, bs.st.ext, true) : null;
  const cx = Math.floor(snap ? snap.x : g.gx);
  const cy = Math.floor(snap ? snap.y : g.gy);
  const on = !Number.isNaN(wx) && !bs.st.over && (bs.selBoat >= 0 || bs.selSkill >= 0) && (bs.selSkill >= 0 || (!!snap && canLand(bs.st, cx * UNIT + 50, cy * UNIT + 50)));
  // 技能的圈跟着鼠标走（四分之一格一档），船只在格子间换
  const key = on ? (bs.selBoat >= 0 ? `${cx},${cy},b` : `${Math.round(g.gx * 4)},${Math.round(g.gy * 4)},s${bs.selSkill}`) : '';
  bs.beachGlow.hover = on && bs.selBoat >= 0 ? { x: cx + 0.5, y: cy + 0.5 } : null;
  if (key === bs.hoverCell) return;
  bs.hoverCell = key;
  bs.hoverG.clear();
  bs.aim.clear();
  bs.input.setDefaultCursor(on ? 'pointer' : 'default');
  if (!on) return;
  if (bs.selSkill >= 0) {
    bs.aim.skill(bs.d.setup.army.skills[bs.selSkill]!.kind, bs.st.buildings, g.gx, g.gy, skillRadius(bs, bs.selSkill));
    return;
  }
  bs.aim.squad(cx, cy);
  const pts = [iso(cx, cy), iso(cx + 1, cy), iso(cx + 1, cy + 1), iso(cx, cy + 1)].map(v2);
  bs.hoverG.fillStyle(0xffe885, 0.4).fillPoints(pts, true).lineStyle(3, 0xffffff, 0.95).strokePoints(pts, true);
}

export function beachPulse(bs: BattleScene): void {
  bs.tweens.killTweensOf(bs.beachG);
  const sel = bs.selBoat >= 0;
  bs.tweens.add({ targets: bs.beachG, alpha: sel ? { from: 0.5, to: 1 } : { from: 0.3, to: 0.7 }, duration: sel ? 600 : 900, yoyo: true, repeat: -1 });
}

export function askEnd(bs: BattleScene): void {
  if (bs.ended) return;
  bs.paused = true;
  confirmBox(bs.st.landed.some(Boolean) ? '现在结束？已经拆掉的算数。' : '还没登陆就撤退？出海的木材不退。', '结束', () => {
    bs.st.over = true;
    finish(bs, 0);
  }, '继续打', () => (bs.paused = false));
}

/** 航线站的顶栏条：第 N/4 站 · 宝分 · 倒计时条（样式在 mapcss.ts） */
export function mapStrip(bs: BattleScene, m: MapStopHooks): void {
  const strip = el('div', 'hd-mapstrip', undefined, bs.ui);
  el('b', '', `第 ${m.stop}/${MAP_LAYERS} 站`, strip);
  const pts = el('span', 'hd-mapstrip-pts', undefined, strip);
  pts.appendChild(img(iconA('gold'), 18));
  const n = el('b', '', fmt(m.pts), pts);
  const track = el('i', 'hd-mapstrip-track', undefined, strip);
  const bar = el('i', 'hd-mapstrip-bar', undefined, track);
  bs.mapEl = { pts: n, bar, lastPct: -1 };
}

export function mapStripTick(bs: BattleScene, m: MapStopHooks, r: BattleResult): void {
  const me = bs.mapEl!;
  const k = Math.max(0, 1 - bs.st.tick / MAP_STOP_TICKS);
  me.bar.style.transform = `scaleX(${k.toFixed(4)})`;
  me.bar.classList.toggle('low', k < 0.2);
  if (r.destroyedPct === me.lastPct) return;
  me.lastPct = r.destroyedPct;
  const g = m.gain(r);
  me.pts.textContent = g > 0 ? `${fmt(m.pts)} +${fmt(g)}` : fmt(m.pts);
  me.pts.classList.remove('pop');
  void me.pts.offsetWidth;
  me.pts.classList.add('pop');
}

/** 星星飞进顶栏的时长（毫秒） */
const STAR_FLY_MS = 760;

/**
 * 拿到一颗星：屏幕中间先冒出一颗大金星（放大一下），再弧线飞进顶栏第 i 个星槽，槽里那颗点亮、弹一下。
 * 以前只弹一行「拿到第 N 颗星」的字，和别的提示混在一起；减少动效时直接点亮
 */
function flyStar(bs: BattleScene, slot: HTMLImageElement, i: number): void {
  const lit = (): void => {
    slot.src = img(iconA('star'), 1).src;
    slot.classList.remove('pop');
    void slot.offsetWidth;
    slot.classList.add('pop');
  };
  const root = bs.ui.getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  if (REDUCED || to.width === 0) return lit();
  const size = 64;
  const star = img(iconA('star'), size, 'hd-img hd-starfly');
  bs.ui.appendChild(star);
  const x0 = root.width / 2 - size / 2;
  const y0 = root.height * 0.36 - size / 2;
  star.style.cssText += `position:absolute;left:${x0}px;top:${y0}px;z-index:40;pointer-events:none;filter:drop-shadow(0 3px 0 #2b1a15)`;
  const dx = to.left - root.left + to.width / 2 - (x0 + size / 2);
  const dy = to.top - root.top + to.height / 2 - (y0 + size / 2);
  const k = to.height / size;
  star.setAttribute('aria-label', `拿到第 ${i + 1} 颗星`);
  const anim = star.animate(
    [
      { transform: 'translate(0,0) scale(.3) rotate(-30deg)', opacity: 0 },
      { transform: 'translate(0,0) scale(1.25) rotate(0deg)', opacity: 1, offset: 0.25 },
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0.4 },
      { transform: `translate(${dx * 0.55}px,${dy * 0.3 - 40}px) scale(${(1 + k) / 2}) rotate(160deg)`, opacity: 1, offset: 0.72 },
      { transform: `translate(${dx}px,${dy}px) scale(${k}) rotate(360deg)`, opacity: 1 },
    ],
    { duration: STAR_FLY_MS, easing: 'ease-in-out' },
  );
  void anim.finished.then(
    () => {
      star.remove();
      lit();
    },
    () => star.remove(),
  );
}

export function updateHud(bs: BattleScene): void {
  const s = bs.st;
  const left = Math.max(0, (bs.d.map ? MAP_STOP_TICKS : BATTLE_TICKS) - s.tick) / TICKS_PER_SEC;
  bs.timeEl.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  const scout = bs.scouting();
  bs.scoutEl.style.display = scout ? '' : 'none';
  const r = battleResult(s);
  bs.pctEl.textContent = `${r.destroyedPct}%`;
  if (bs.d.map && bs.mapEl) mapStripTick(bs, bs.d.map, r);
  for (let i = bs.lastStars; i < r.stars; i++) {
    const im = bs.starsEl[i];
    if (im) flyStar(bs, im, i);
    sfx('star');
  }
  bs.lastStars = Math.max(bs.lastStars, r.stars);
  bs.endBtn.textContent = s.landed.some(Boolean) ? '结束' : '撤退';
  // 兵倒光那一刻不改 sig（不走 afterSelect），这里每拍看：变了才动提示条（瞄技能时让给瞄准提示）
  const down = allDown(bs);
  const was = bs.endBtn.classList.contains('hd-endglow');
  bs.endBtn.classList.toggle('hd-endglow', down);
  if (bs.selSkill < 0 && (down || was)) {
    const t = down ? downText(bs) : '';
    if (bs.hintEl.textContent !== t) hint(bs, t);
  }
  funHud(bs);
  tutRefresh(bs);
}

/** 新手引导（第 5 步）：先点船卡 → 点沙滩 → 能量够了放炮击 */
export function tutRefresh(bs: BattleScene): void {
  const t = bs.tut;
  if (tutStep() !== 5 || bs.ended || bs.paused) return t.hide();
  const s = bs.st;
  const root = bs.ui;
  const sk = bs.d.setup.army.skills;
  const cost = sk[0] ? (SKILLS[sk[0].kind].levels[sk[0].level - 1]?.energy ?? 99) : 99;
  if (bs.selSkill >= 0) return t.show('aim', '再点敌人的建筑，炮弹就打过去了', null);
  if (s.landed.some(Boolean) && s.energy >= cost && !bs.skillUsed && sk[0]) {
    return t.show('skill', '能量够了！点“' + SKILLS[sk[0].kind].name + '”，再点敌人的建筑', () => rectOf(bs.skillsEl.querySelector('.hd-skill'), root));
  }
  if (bs.selBoat >= 0) return t.show('beach', '再点一下绿色的沙滩，兵就上岛了', null);
  if (!s.landed.every(Boolean)) return t.show('card', '先点船卡，选一队兵', () => rectOf(bs.boatsEl.querySelector('.hd-boat:not(.done)'), root));
  t.hide();
}
