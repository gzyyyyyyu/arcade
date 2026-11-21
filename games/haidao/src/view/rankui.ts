/**
 * 海盗王阶的界面（DESIGN 2.6）：主寨信息面板里的「海盗王阶」区（称号、两条进度条、献上钮）、升阶庆祝演出、
 * 顶栏船长钮上的王旗色点。规则全在 core/rank.ts，这里只读它给的字段、点钮调 donateRank；王阶不影响任何战斗数值。
 */
import type { BaseScene } from './BaseScene.ts';
import { BUILDINGS, RANKS, RANK_HQ } from '../content/index.ts';
import { donateRank, hqLevel, rankOf } from '../core/index.ts';
import { app, fmt } from './app.ts';
import { iconA } from './art.ts';
import { RANK_FLAG_AT, rankFlagFrames, rankHex } from './art/rankflag.ts';
import { sfx } from './audio/sfx.ts';
import { lackText } from './basefeel.ts';
import { topOf } from './basegeom.ts';
import { feelOn } from './feel.ts';
import { floatText } from './fx.ts';
import { pctOf, rankTitle, rankView } from './ranktext.ts';
import { button, costRow, el, img, toast } from './ui.ts';

/** 主寨还没到 8 级时，升级说明里加一行（放在「升到 N 级开放」那块里） */
export function rankHint(box: HTMLElement): void {
  if (hqLevel(app.profile) < RANK_HQ) el('p', 'hd-sub hd-rank-lock', `主寨 ${RANK_HQ} 级开放海盗王阶`, box);
}

/** 主寨面板里的「海盗王阶」区；主寨没到 8 级不出现（rankHint 另给一行说明）。reopen = 献完后原位重画面板 */
export function rankBlock(bs: BaseScene, body: HTMLElement, reopen: () => void): void {
  const p = app.profile;
  if (hqLevel(p) < RANK_HQ) return;
  const v = rankView(p);
  const box = el('div', 'hd-rank', undefined, body);
  const head = el('div', 'hd-rank-head', undefined, box);
  const flag = v.rank > 0 ? rankFlagFrames(v.rank)[0] : undefined;
  const pic = el('div', 'hd-rank-pic', undefined, head);
  pic.appendChild(img(flag ?? iconA('skull'), 56));
  const t = el('div', 'hd-rank-t', undefined, head);
  el('b', '', v.rank > 0 ? rankTitle(v.rank) : '还没有王阶', t);
  el('small', '', v.next ? `下一阶：${v.next.name}` : '已经是海盗王', t);
  if (!v.next) return;

  for (const k of ['gold', 'wood'] as const) {
    const row = el('div', 'hd-rank-row', undefined, box);
    row.appendChild(img(iconA(k), 22));
    const bar = el('span', 'hd-rank-bar', undefined, row);
    el('i', '', undefined, bar).style.width = `${pctOf(v.next.fund[k], v.next.cost[k])}%`;
    const n = el('span', 'hd-rank-n hd-n', `${fmt(v.next.fund[k])} / ${fmt(v.next.cost[k])}`, row);
    n.title = k === 'gold' ? '金币' : '木材';
  }
  // 和手里的比：够一次献满就不标红，免得看着像"付不起"
  const lack = lackText(v.next.left, p.res);
  if (lack) el('p', 'hd-sub hd-rank-lack', `${lack}才能升到「${v.next.name}」`, box);
  else el('p', 'hd-sub', `献上就升到「${v.next.name}」`, box);

  const r = donateRank(p);
  const go = button('', 'hd-btn-gold hd-rank-go', () => donate(bs, reopen), box, 'confirm');
  if (r.ok) {
    el('span', '', '献上', go);
    go.appendChild(costRow(v.want, p.res));
  } else {
    go.disabled = true;
    go.textContent = '献上';
  }
  el('p', 'hd-sub hd-rank-note', r.ok ? '献进去拿不回来，只换外观，不加战力。' : '手里没有金币和木材可献。', box);
}

function donate(bs: BaseScene, reopen: () => void): void {
  const before = app.profile;
  const r = donateRank(before);
  if (!r.ok) return toast(r.error === 'nothing' ? '手里没有金币和木材可献' : r.error === 'max' ? '已经是海盗王' : `主寨 ${RANK_HQ} 级开放海盗王阶`);
  const gave = { gold: before.res.gold - r.value.profile.res.gold, wood: before.res.wood - r.value.profile.res.wood };
  app.commit(r.value.profile);
  bs.refresh();
  if (r.value.ranked) celebrateRank(bs, rankOf(r.value.profile));
  else {
    sfx('coin');
    toast(`献上了 ${[gave.gold > 0 ? `${fmt(gave.gold)} 金币` : '', gave.wood > 0 ? `${fmt(gave.wood)} 木材` : ''].filter(Boolean).join('、')}`);
  }
  reopen();
}

/**
 * 升阶演出（不挡操作，逐帧由粒子池和飘字自己推进）：主寨脚下一圈光环、王旗那里两团光（旗面色加镶边色）往上冒、
 * 称号飘字、两声音效。减弱动态（feelOn 为假）时只有飘字和声音。
 */
function celebrateRank(bs: BaseScene, rank: number): void {
  const R = RANKS[rank - 1];
  const hq = app.profile.base.buildings.find((b) => b.kind === 'hq');
  const n = hq && bs.nodes.get(hq.id);
  sfx('star');
  setTimeout(() => sfx('upgradeBig'), 260);
  if (!R || !n) return;
  const at = RANK_FLAG_AT();
  const fx = n.img.x + at.dx * n.img.scaleX * bs.r;
  const fy = n.img.y + at.dy * n.img.scaleY * bs.r;
  floatText(bs, bs.r, bs.cc.z, fx, fy - 110, rankTitle(rank), rankHex(R.trim), 22);
  if (!feelOn()) return;
  bs.pt.ringBurst(n.img.x, n.img.y + 2, BUILDINGS.hq.size);
  bs.pt.ringBurst(fx, fy + 2, 1.5);
  bs.pt.bloom.flash(fx, fy - 50, 90, R.color, 900, 0.6);
  bs.pt.bloom.flash(fx, fy - 60, 60, R.trim, 700, 0.7);
  bs.pt.bloom.flash(n.img.x, topOf(bs, n) + 40, 70, R.trim, 800, 0.4);
  bs.pt.confetti(fx, fy - 70, rank >= 7);
}

/** 顶栏船长钮：有王阶时右上角挂一粒王旗主色的小点（镶边色描边），提示里写称号；没有就清掉 */
export function paintProfileRank(me: HTMLElement, rank: number): void {
  if (me.dataset.rank === String(rank)) return;
  me.dataset.rank = String(rank);
  const R = RANKS[rank - 1];
  me.classList.toggle('hd-ranked', !!R);
  if (R) {
    me.style.setProperty('--rk', rankHex(R.color));
    me.style.setProperty('--rk-trim', rankHex(R.trim));
    me.title = `船长档案：${rankTitle(rank)}`;
  } else {
    me.style.removeProperty('--rk');
    me.style.removeProperty('--rk-trim');
    me.title = '船长档案';
  }
}
