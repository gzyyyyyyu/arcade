/** 结算：打完后的存档结算调度（finish）、战役结算框（showResult）、失败建议和归咎圈、战利品飞入、稀有宝箱 */
import { CAMPAIGN } from '../content/index.ts';
import { trimText } from './basefeel.ts';
import { aliveByBoat, armyCost, battleResult, hqLevel, startCampaign, totalStars } from '../core/index.ts';
import { UNIT, type BattleResult, type Res, type BBuilding, type TroopKind } from '../core/types.ts';
import { app, fmt } from './app.ts';
import { bArt, iconA, troopF } from './art.ts';
import { lootChestArt } from './art/index.ts';
import { topBlame } from './fxlayout.ts';
import { vibrate } from './feel.ts';
import type { Ach } from './meta.ts';
import { nextUnlock } from './unlock.ts';
import { sfx } from './audio/sfx.ts';
import { playBeats } from './audio/beats.ts';
import { resultBeats, resultTimes, resultTiming } from './audio/result.ts';
import { adviceLines } from './battleadvice.ts';
import { lossStreakOf, NO_EXTRA, settleOutcome, type Extra } from './battlesettle.ts';
import { tutSet, tutStep } from './tutorial.ts';
import { trainBattleEnd } from './trainplay.ts';
import { badgePopup, button, el, img, openModal, toast } from './ui.ts';
import { TITLES, rewardName } from './battlecommon.ts';
import type { BattleScene } from './BattleScene.ts';
import { DEPTH } from './depth.ts';
import { battleEnd } from './endfx.ts';

/** 战利品飞进顶栏（仓库的位置）：几枚小图标从数字处弧线飞到左上角 */
function flyTo(bs: BattleScene, from: HTMLElement, kind: 'gold' | 'wood'): void {
  const root = bs.ui.getBoundingClientRect();
  const a = from.getBoundingClientRect();
  for (let i = 0; i < 5; i++) {
    const ic = img(iconA(kind), 22);
    ic.style.cssText += `;position:absolute;left:${a.left - root.left + 10}px;top:${a.top - root.top}px;z-index:60;pointer-events:none`;
    bs.ui.appendChild(ic);
    const an = ic.animate(
      [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${-(a.left - root.left) + 120 + (kind === 'wood' ? 70 : 0)}px,${-(a.top - root.top) + 20}px) scale(.6)`, opacity: 0.2 }],
      { duration: 650 + i * 90, delay: i * 70, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' },
    );
    an.onfinish = () => ic.remove();
  }
}

/**
 * 稀有掉落：宝箱弹开、光、物品跳出来。结算窗先藏起来、收下再回来（两张同宽的框叠着，像层级错位）；
 * 结算窗必须点按钮离开，它不关，只是暂时看不见
 */
function openChest(bs: BattleScene, id: string, under: HTMLElement): void {
  sfx('star');
  const mask = openModal({ cls: 'hd-badgemask', closable: true, stack: true, parent: bs.ui });
  under.style.visibility = 'hidden';
  const rm = mask.remove.bind(mask);
  mask.remove = () => {
    under.style.visibility = '';
    rm();
  };
  const box = el('div', 'hd-dialog hd-chestbox', undefined, mask);
  button('×', 'hd-x', () => mask.remove(), box).title = '关掉（Esc）';
  el('small', '', '稀有掉落！', box);
  // 合着的箱子先晃两下，换成开着的、箱口放光，物品从箱口跳到箱子上方（容器上半截留给它，不压标题）
  const chest = el('div', 'hd-chest', undefined, box);
  el('div', 'hd-chest-glow', undefined, chest);
  const shut = img(lootChestArt(false), 96, 'hd-img hd-chest-shut');
  const open = img(lootChestArt(true), 112, 'hd-img hd-chest-open');
  chest.append(shut, open);
  const nm = rewardName(id);
  const item = el('div', 'hd-chest-item', undefined, chest);
  const [type, a, b] = id.split(':');
  item.appendChild(img(type === 'skin' ? troopF(a as TroopKind, 'idle', b)[0]! : bArt(a as 'statue', 1), 64));
  el('h2', '', nm, box);
  // 船长档案钮只有头像没有字（矮竖屏还挪到了底下）：说清楚点哪
  el('p', 'hd-sub', type === 'skin' ? '回岛点船长头像 → 收藏，装备上' : '回岛点船长头像 → 收藏，摆到岛上', box);
  setTimeout(() => chest.classList.add('open'), 520);
  setTimeout(() => item.classList.add('out'), 900);
  button('收下', 'hd-btn-gold', () => mask.remove(), box).style.width = '100%';
}

/** 失败时在岛上把"杀兵最多的那座防御"圈出来（红圈弹出再呼吸），结算框后面也看得见 */
function markBlame(bs: BattleScene): void {
  const tb = topBlame(bs.deathBy);
  if (!tb) return;
  const cand = bs.st.buildings.filter((b) => b.kind === tb.kind && !b.destroyed);
  if (!cand.length) return;
  const n = bs.landPts.length || 1;
  const ax = bs.landPts.reduce((q, p) => q + p.x, 0) / n;
  const ay = bs.landPts.reduce((q, p) => q + p.y, 0) / n;
  const d2 = (b: BBuilding): number => ((b.x + b.size / 2) * UNIT - ax) ** 2 + ((b.y + b.size / 2) * UNIT - ay) ** 2;
  const b = cand.reduce((m, q) => (d2(q) < d2(m) ? q : m));
  const sp = bs.bsp.get(b.id);
  if (!sp) return;
  const g = bs.add.ellipse(sp.img.x, sp.img.y - 6, 96, 48).setStrokeStyle(5, 0xff4a3a, 1).setFillStyle(0xff4a3a, 0.18).setDepth(DEPTH.slowMark).setScale(1.6).setAlpha(0);
  bs.tweens.add({
    targets: g, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut',
    onComplete: () => bs.tweens.add({ targets: g, scale: 1.12, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
  });
}

/** 失败原因：按这场的统计给 1–2 句话，连输再加一句换打法（拼装在 battleadvice.ts） */
function lossAdvice(bs: BattleScene, res: BattleResult): string[] {
  return adviceLines(res, {
    buildings: bs.st.buildings,
    ext: bs.st.ext,
    deathBy: bs.deathBy,
    landPts: bs.landPts,
    casts: bs.casts,
    hasBrute: bs.d.setup.army.boats.some((b) => b.troop === 'brute'),
    streak: lossStreakOf(bs.d.levelId),
    dock: { have: app.profile.base.buildings.find((b) => b.kind === 'dock')?.level ?? 0, can: hqLevel(app.profile) },
  });
}

export function finish(bs: BattleScene, delay: number): void {
  if (bs.ended) return;
  bs.ended = true;
  app.inBattle = false;
  bs.selBoat = bs.selSkill = -1;
  bs.beachG.setVisible(false);
  bs.tut.hide();
  // 结算当场算完存好，延迟只管弹窗：这 1 秒多里点"大厅"、切后台、关页面，战利品和星都不会丢
  const res = { ...battleResult(bs.st), over: true };
  const mp = bs.d.map;
  if (mp) {
    // 航线一站：数每条出战船还剩几个人（没登陆的船人都在），交给航线写回；站间条由 maproute.ts 出
    const alive = aliveByBoat(bs.st, bs.d.setup.army, bs.lands);
    const energy = bs.st.energy;
    setTimeout(() => bs.ui.isConnected && mp.onFinish(res, alive, energy), Math.min(delay, 900));
    return;
  }
  if (bs.d.train) {
    const done = (): void => trainBattleEnd(bs, res);
    if (!battleEnd(bs, res.stars > 0, delay, done)) setTimeout(done, delay);
    return;
  }
  const pvp = bs.d.pvp;
  if (pvp) {
    // 异步攻防：结果由服务端重放算，弹窗由 pvp.ts 出
    const log = bs.log.slice();
    const end = bs.st.tick;
    const done = (): void => pvp.onFinish(log, end, res);
    if (!battleEnd(bs, res.stars > 0, delay, done)) bs.time.delayedCall(delay, done);
    return;
  }
  const oc = settleOutcome(app.profile, bs.d.levelId, res, { settle: bs.d.settle, bounty: bs.d.bounty });
  if (bs.d.settle) app.commit(oc.profile);
  const { loot, newStars, bonus, fresh, extra } = oc;
  // 弹窗之前先演收尾（endfx.ts，游戏时钟、点一下跳过、减弱动态时不演）；不演就按原来的真实时间延迟（慢机器上游戏时钟会拖慢）
  const show = (): void => {
    if (bs.ui.isConnected) showResult(bs, res, loot, newStars, bonus, fresh, extra);
  };
  if (!battleEnd(bs, res.stars > 0, delay, show)) setTimeout(show, delay);
}

/** 仓库满了截掉的写成「120 金、40 木」；没截返回 null */
function cutText(c: Res): string | null {
  const parts = [c.gold > 0 ? `${fmt(c.gold)} 金` : '', c.wood > 0 ? `${fmt(c.wood)} 木` : ''].filter(Boolean);
  return parts.length ? parts.join('、') : null;
}

export function showResult(bs: BattleScene, res: BattleResult, loot: Res, newStars: number, bonus: Res | null = null, fresh: Ach[] = [], extra: Extra = NO_EXTRA): void {
  app.api.scene = 'result';
  if (tutStep() === 5) tutSet(6);
  const win = res.stars > 0;
  const tm = resultTimes('battle', res.stars, win);
  playBeats(resultBeats({ kind: 'battle', stars: res.stars, win, roll: loot.gold + loot.wood > 0 }), () => bs.ui.isConnected);
  vibrate(win ? 'win' : 'lose');
  // 结算必须点按钮：点遮罩不理，Esc = 主按钮（回家）
  let main: HTMLButtonElement | undefined;
  const mask = openModal({ cls: res.stars >= 3 ? 'hd-s3' : '', closable: false, onEsc: () => main?.click(), parent: bs.ui });
  const box = el('div', `hd-dialog hd-result${res.stars === 0 ? ' hd-lose' : ''}`, undefined, mask);
  // 入场节奏（样式在 skin.ts）：框落下 → 横幅落下 → 星星依次落（--sd 是星星落完的时刻）→ 战利品滚动 → 按钮最后淡入（--fin）
  box.style.setProperty('--sd', `${tm.sd}ms`);
  box.style.setProperty('--fin', `${tm.fin}ms`);
  el('h2', '', TITLES[res.stars] ?? '', box);
  const row = el('div', 'hd-stars', undefined, box);
  row.style.justifyContent = 'center';
  for (let i = 0; i < 3; i++) {
    const im = img(iconA(i < res.stars ? 'star' : 'starEmpty'), 52);
    row.appendChild(im);
    if (i < res.stars) {
      im.style.visibility = 'hidden';
      setTimeout(() => {
        im.style.visibility = '';
        im.classList.add('drop');
      }, tm.starAt(i));
    }
  }
  el('div', 'hd-big', `摧毁 ${res.destroyedPct}%`, box);
  const lo = el('div', 'hd-loot', undefined, box);
  // 星星一颗颗落完（时间点见 audio/result.ts），战利品数字再从 0 滚到实数（ease-out），滚完图标才飞进仓库
  const rollAt = tm.rollAt;
  for (const k of ['gold', 'wood'] as const) {
    const s = el('span', 'hd-cost-i', undefined, lo);
    s.appendChild(img(iconA(k), 28));
    const num = el('b', 'hd-pos hd-n', '+0', s);
    if (loot[k] > 0) setTimeout(() => flyTo(bs, s, k), tm.flyAt);
    setTimeout(() => {
      const t0 = performance.now();
      const tick = (): void => {
        const f = Math.min(1, (performance.now() - t0) / resultTiming('battle', win).rollDur);
        num.textContent = `+${fmt(loot[k] * (1 - (1 - f) * (1 - f)))}`;
        if (f < 1 && num.isConnected) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, rollAt);
  }
  if (newStars > 0) el('p', '', `新拿到 ${newStars} 颗星，主寨升级要用`, box).style.margin = '0 0 12px';
  if (extra.streak >= 2 || extra.bonusPct > 0) {
    const st = el('p', 'hd-streak', `连胜 ×${extra.streak}${extra.bonusPct > 0 ? `  掠夺 +${extra.bonusPct}%` : ''}`, box);
    st.style.cssText = 'text-align:center;margin:0 0 8px;font-weight:900';
  }
  // 仓库满了一分没进时不说「安慰奖已经放进仓库」（金木 +0 +0 和这句对不上），改由下面满仓那行说
  if (extra.consolation && loot.gold + loot.wood > 0) {
    const cp = el('p', 'hd-consol', '安慰奖已经放进仓库，别灰心，下一场会更好', box);
    cp.style.cssText = 'text-align:center;margin:0 0 8px;font-weight:800';
  }
  // 仓库满了截掉的（以前悄悄截掉、结算不说，同一关 3 星这次少拿几百也看不出来）：写少拿多少，给一个回家就打开建造面板的入口
  const cut = cutText(extra.cut);
  if (cut && bs.d.settle) {
    app.storageCut = extra.cut;
    const cr = el('div', 'hd-cutline', undefined, box);
    el('span', '', `仓库满了，少拿 ${cut}`, cr);
    button('去扩仓库', 'hd-btn-plain', () => {
      leave();
      app.buildOnBase = true;
      app.goBase();
    }, cr);
  }
  const gifts = extra.drops.filter((d) => d.kind !== 'cosmetic') as Array<{ kind: 'gold' | 'wood'; amount: number }>;
  if (gifts.length) {
    const dr = el('div', 'hd-chips', undefined, box);
    dr.style.justifyContent = 'center';
    for (const d of gifts) {
      const c = el('span', 'hd-chip', d.kind === 'gold' ? '掉落：金币袋 ' : '掉落：木材箱 ', dr);
      c.appendChild(img(iconA(d.kind), 16));
      c.append(` +${fmt(d.amount)}`);
    }
  }
  const rare = extra.drops.find((d) => d.kind === 'cosmetic') as { kind: 'cosmetic'; id: string } | undefined;
  if (rare) setTimeout(() => mask.isConnected && openChest(bs, rare.id, mask), rollAt + 1200);
  if (bonus) {
    const bl = el('p', 'hd-bountyline', `今日悬赏完成，奖励翻倍（上面的战利品就是）。明天再来！`, box);
    bl.style.cssText = 'text-align:center;margin:0 0 10px';
  }
  // 结算页先完整呈现（星星、战利品、宝箱）；成就只在结算页写一行，玩家点离开按钮时合成一张卡弹出，不盖住结算。
  // 回家：卡在岛上弹；再打 / 下一关：先在结算页弹，点「太棒了」再进下一局，不然卡会挡在下一局的开场上
  let badgesShown = false;
  const leave = (): void => {
    if (fresh.length && !badgesShown) setTimeout(() => badgePopup(fresh), 700);
  };
  const afterBadges = (then: () => void): void => {
    if (badgesShown || !fresh.length) return then();
    badgesShown = true;
    badgePopup(fresh, then);
  };
  if (fresh.length) {
    const al = el('p', 'hd-sub', `新成就：${fresh.map((a) => a.name).join('、')}`, box);
    al.style.cssText = 'text-align:center;margin:0 0 8px';
  }
  if (res.stars === 0 && bs.d.settle) {
    markBlame(bs);
    const adv = el('div', 'hd-advice', undefined, box);
    el('b', '', '这次为什么没成功：', adv);
    for (const t of lossAdvice(bs, res)) el('p', '', t, adv);
  }
  const nu = nextUnlock(app.profile);
  if (nu) {
    const names = nu.items.map((i) => i.name).join('、');
    const tail = nu.starsLeft > 0 ? `还差 ${nu.starsLeft} 颗星` : '星数够了，回岛就能升级';
    const p = el('p', 'hd-sub', `下一个解锁：主寨 ${nu.hq} 级开放 ${names} · ${tail}`, box);
    // 只在「、」「·」和空格处换行，不把「信号弹」拆成「信号 / 弹」
    p.style.cssText = 'text-align:center;margin:0 0 12px;font-size:14px;word-break:keep-all';
  }
  if (!bs.d.settle) el('p', '', '（演示局，不记进度）', box).style.margin = '0 0 12px';
  if (bs.d.settle && !bs.d.bounty) {
    const again = el('div', 'hd-row', undefined, box);
    again.style.marginBottom = '8px';
    const go = (id: string): void => {
      const before = app.profile;
      const r = startCampaign(before, id, (Date.now() & 0x3fffffff) | 1);
      if (!r.ok) return toast(r.error === 'no_wood' ? `木材连一个兵都带不起，先回岛收一收` : '这座岛还没解锁');
      afterBadges(() => {
        app.commit(r.value.profile);
        app.startBattle(id, false, r.value.setup);
        if (r.value.trimmed) toast(trimText(r.value.trimmed, armyCost(before), before.res));
      });
    };
    button('再打一次', 'hd-btn-wood', () => go(bs.d.levelId), again);
    const idx = CAMPAIGN.findIndex((l) => l.id === bs.d.levelId);
    const next = CAMPAIGN[idx + 1];
    if (next) {
      const open = totalStars(app.profile) >= next.reqStars;
      const nb = button(open ? '下一关' : `还差 ${next.reqStars - totalStars(app.profile)} 颗星`, 'hd-btn-wood', () => go(next.id), again);
      nb.disabled = !open;
    }
  }
  main = button('回岛', 'hd-btn-gold', () => {
    leave();
    app.goBase();
  }, box);
  main.style.width = '100%';
}
