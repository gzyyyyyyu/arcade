/**
 * 每日何切的画面（DESIGN.md 7 节）：一页走完五道题——看牌、选一张、点第二下打出、揭晓牌效，最后出成绩卡。
 * 题和打分都在 game/hekiri.ts（纯函数）；这里读写本机的 mahjong.hekiri，并在第一次做完时把分数交给平台的每日榜（失败不吭声）。
 * 今天是几号由 todayCN（北京时间）算好；整页的键盘：←/→ 换牌、Enter 打出 / 下一题、Esc 回主页。
 */
import { readText, writeJson } from '../storage.ts';
import {
  HEKIRI_KEY,
  MARK_TEXT,
  POINTS,
  QUESTIONS,
  evaluate,
  hekiriBoard,
  hekiriStreak,
  markOf,
  parseHekiri,
  puzzlesOf,
  recordHekiri,
  scoreOf,
  type Choice,
  type HekiriData,
  type Mark,
  type Puzzle,
} from '../game/hekiri.ts';
import { prepareCard, hekiriCardOf } from './share.ts';
import { celebrate } from './fx.ts';
import { play } from './sound.ts';
import { tileName, tileUrl } from './tiles.ts';
import { button, el } from './dom.ts';
import { submitScore } from '../net/scores.ts';
import { todayCN } from './daily.ts';
import './hekiri.css';

function readHekiri(): HekiriData {
  return parseHekiri(readText(HEKIRI_KEY));
}

function writeHekiri(d: HekiriData): void {
  // 存不上就不记，下次入口还是"今天还没做"，不看返回值
  writeJson(HEKIRI_KEY, d);
}

/** 主页入口上的一行：今天做没做、得了几分 */
export function hekiriToday(): { score: number | null; streak: number } {
  const d = readHekiri();
  const today = todayCN();
  return { score: d.days[today]?.score ?? null, streak: hekiriStreak(d, today) };
}

const SHANTEN_NAME = ['打完就听牌', '差 1 张听牌', '差 2 张听牌', '差 3 张听牌', '差 4 张听牌'];
const EFF_MAX = 12;
const MONTH_DAY = (date: string): string => `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日`;
const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 一小张牌 */
function tile(cls: string, kind: number, parent: HTMLElement, tag: 'button' | 'span' = 'span'): HTMLElement {
  const t = el(tag, `hk-tile ${cls}`, parent);
  t.style.backgroundImage = `url("${tileUrl(kind)}")`;
  t.setAttribute('role', 'img');
  t.setAttribute('aria-label', tileName(kind));
  return t;
}

interface HekiriOpts {
  /** 回主页 */
  onExit(): void;
  /** 分享卡上的游戏地址 */
  shareUrl: string;
  /** 登录的玩家号：有才交榜（单独部署、没登录都是 null） */
  userId: string | null;
}

/** 打开每日何切。返回收尾函数（拆页面时调，摘掉键盘监听） */
export function showHekiri(box: HTMLElement, o: HekiriOpts): () => void {
  box.replaceChildren();
  const root = el('div', 'hekiri', box);
  const date = todayCN();
  const puzzles = puzzlesOf(date);
  /** 今天已经算过成绩：再做是练习，不改记录 */
  let practice = readHekiri().days[date] !== undefined;
  let i = 0;
  let scores: number[] = [];
  /** 选中的是第几张（手牌下标）；揭晓后是打出去的那张 */
  let sel: number | null = null;
  let revealed = false;
  let total = 0;

  const key = (e: KeyboardEvent): void => {
    // 页面已经被换掉（比如朋友的房间链接进来）：键盘监听自己撤掉
    if (!root.isConnected) return document.removeEventListener('keydown', key);
    if (e.key === 'Enter' || e.key === ' ') {
      const b = root.querySelector<HTMLButtonElement>('.hk-main[data-act]');
      if (b && !b.disabled && document.activeElement?.tagName !== 'BUTTON') {
        e.preventDefault();
        b.click();
      }
      return;
    }
    if (revealed || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const n = puzzles[i]!.hand.length;
    pick(sel === null ? (e.key === 'ArrowRight' ? 0 : n - 1) : (sel + (e.key === 'ArrowRight' ? 1 : n - 1)) % n);
  };
  document.addEventListener('keydown', key);

  const head = (): void => {
    const h = el('div', 'hk-head', root);
    button('hk-back', h, '‹ 主页', o.onExit);
    el('b', 'hk-title', h, `每日何切 · ${MONTH_DAY(date)}`);
    if (practice) el('span', 'hk-tag', h, '练习');
    el('span', 'hk-score', h).innerHTML = `<i data-total>${total}</i> 分`;
  };

  const dots = (): void => {
    const d = el('div', 'hk-dots', root);
    for (let q = 0; q < QUESTIONS; q++) {
      const s = scores[q];
      const m: Mark | null = s === undefined ? null : markOf(s);
      el('span', `hk-dot${q === i && !revealed ? ' now' : ''}${m ? ` ${m}` : ''}`, d, m ? MARK_TEXT[m] : String(q + 1));
    }
  };

  const pick = (n: number): void => {
    sel = n;
    play('click');
    drawQuestion();
  };

  /** 出题：桌上的牌 + 手牌，选中后出现"打出"按钮 */
  function drawQuestion(): void {
    const p = puzzles[i]!;
    root.replaceChildren();
    head();
    dots();
    el('div', 'hk-ask', root, `第 ${i + 1}/${QUESTIONS} 题 · 打哪张最划算？`);
    seenStrip(p);
    const hand = el('div', 'hk-hand', root);
    p.hand.forEach((k, n) => {
      const t = tile(`hand${sel === n ? ' sel' : ''}`, k, hand, 'button') as HTMLButtonElement;
      t.type = 'button';
      t.setAttribute('aria-pressed', String(sel === n));
      // 第一下选中（抬起来），再点同一张就是打出
      t.addEventListener('click', () => (sel === n ? confirm() : pick(n)));
    });
    el('div', 'hk-hint', root, sel === null ? '点一张选中，再点一次打出；打完有用的牌越多越好' : `打 ${tileName(p.hand[sel]!)}？再点一次，或按下面的按钮`);
    const b = button('act go big hk-main', root, '打出这张', confirm);
    b.dataset.act = 'confirm';
    b.disabled = sel === null;
  }

  function seenStrip(p: Puzzle): void {
    const s = el('div', 'hk-seen', root);
    el('span', 'hk-label', s, '桌上已经打出');
    const row = el('span', 'hk-row', s);
    for (const k of p.visible) tile('mini', k, row);
  }

  function confirm(): void {
    if (sel === null || revealed) return;
    const p = puzzles[i]!;
    const kind = p.hand[sel]!;
    const list = evaluate(p);
    const s = scoreOf(p, kind, list);
    scores[i] = s;
    revealed = true;
    play('discard');
    drawReveal(p, list, kind, s);
  }

  /** 揭晓：评价、前几名的打法（牌效）、有效牌；得分滚上去 */
  function drawReveal(p: Puzzle, list: readonly Choice[], kind: number, s: number): void {
    const before = total;
    total += s;
    root.replaceChildren();
    head();
    dots();
    const m = markOf(s);
    const verdict = el('div', `hk-verdict ${m}`, root);
    el('b', '', verdict, m === 'ok' ? '好牌！这就是最优打法' : m === 'near' ? '不错，离听牌一样近，但别的打法能用的牌更多' : '这张打下去，离听牌更远了');
    el('span', 'hk-pts', verdict, `+${s} 分`);
    seenStrip(p);
    const hand = el('div', 'hk-hand shown', root);
    const best = list[0]!;
    p.hand.forEach((k, n) => {
      const mine = n === sel;
      const cls = `${mine ? 'mine' : ''}${list.find((c) => c.kind === k && c.shanten === best.shanten && c.ukeire >= best.ukeire) ? ' best' : ''}`;
      const t = tile(`hand ${cls}`, k, hand);
      t.dataset.n = String(n);
    });
    rows(list, kind);
    el('div', 'hk-hint', root, '先比离听牌差几张（越少越好），一样的再比能用的牌有几张');
    const last = i === QUESTIONS - 1;
    const next = button('act go big hk-main', root, last ? '看成绩' : '下一题', last ? finish : nextQuestion);
    next.dataset.act = 'next';
    roll(before, total);
    if (m === 'ok') {
      play('win');
      celebrate(root, root.clientWidth / 2, 150, '好牌！', 'hu');
    } else play(m === 'near' ? 'chips' : 'land');
  }

  /**
   * 最多三行：你选的在前三就是前三名，不在就是前两名加你选的。
   * 不多加第四行：答差了的那题大屏、横屏、小手机都放不下要滚
   */
  function rows(list: readonly Choice[], kind: number): void {
    const box = el('div', 'hk-rows', root);
    const mine = list.find((c) => c.kind === kind)!;
    const top = list.slice(0, 3);
    const shown = top.includes(mine) ? top : [...list.slice(0, 2), mine];
    const best = list[0]!;
    shown.forEach((c) => {
      const row = el('div', `hk-row-c${c === mine ? ' mine' : ''}${c.ukeire >= best.ukeire && c.shanten === best.shanten ? ' best' : ''}`, box);
      tile('mid', c.kind, row);
      const info = el('div', 'hk-info', row);
      const line = el('div', 'hk-line', info);
      el('b', '', line, `打 ${tileName(c.kind)}`);
      if (c.ukeire >= best.ukeire && c.shanten === best.shanten) el('em', 'hk-chip best', line, '最佳');
      if (c === mine) el('em', 'hk-chip you', line, '你选的');
      el('div', 'hk-sub', info, `${SHANTEN_NAME[c.shanten] ?? `差 ${c.shanten} 张听牌`} · ${c.kinds.length} 种 ${c.ukeire} 张能用`);
      // 有效牌最多摆 12 张，多的写"+N"：差的打法能进十几种，小手机上折成三行把整页撑出一屏（360 宽）；种数和张数上一行写着
      const eff = el('div', 'hk-eff', row);
      for (const k of c.kinds.slice(0, EFF_MAX)) tile('mini', k, eff);
      if (c.kinds.length > EFF_MAX) el('span', 'hk-more', eff, `还有 ${c.kinds.length - EFF_MAX} 种`);
    });
  }

  /** 分数从旧的滚到新的 */
  function roll(from: number, to: number): void {
    const n = root.querySelector<HTMLElement>('[data-total]');
    if (!n) return;
    if (reduced() || from === to) {
      n.textContent = String(to);
      return;
    }
    n.textContent = String(from);
    const t0 = performance.now();
    const tick = (now: number): void => {
      const k = Math.min(1, (now - t0) / 600);
      n.textContent = String(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1 && n.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function nextQuestion(): void {
    i++;
    sel = null;
    revealed = false;
    drawQuestion();
  }

  /** 五题做完：记成绩（练习不记）、交榜、出成绩卡 */
  function finish(): void {
    // 已经有今天的成绩就是练习：recordHekiri 原样返回，不改记录
    const r = recordHekiri(readHekiri(), date, scores);
    const scored = r.first;
    if (scored) {
      writeHekiri(r.data);
      // 第一次做完才交（交不上不补交）
      if (o.userId) void submitScore(hekiriBoard(date), total, o.userId);
    }
    const data = r.data;
    root.replaceChildren();
    head();
    const card = el('div', `hk-result${total === QUESTIONS * POINTS ? ' perfect' : ''}`, root);
    el('div', 'hk-big', card).innerHTML = `<i>${total}</i><small> / ${QUESTIONS * POINTS}</small>`;
    el('div', 'hk-sum', card, total === 100 ? '五题全对，牌效满分！' : total >= 80 ? '眼光很准' : total >= 50 ? '还不错，明天再来' : '多看看进张，明天再战');
    const row = el('div', 'hk-marks', card);
    scores.forEach((s) => {
      const m = markOf(s);
      el('span', `hk-dot ${m}`, row, MARK_TEXT[m]);
    });
    const stats = el('div', 'hk-stats', card);
    const run = hekiriStreak(data, date);
    el('span', '', stats, !scored ? '练习，不计成绩' : `连续 ${run} 天`);
    el('span', '', stats, `最好 ${data.best ?? total} 分`);
    const acts = el('div', 'hk-acts', root);
    const share = prepareCard(hekiriCardOf(date, total, scores, scored, data.best ?? total, run), o.shareUrl);
    button('act soft', acts, '分享', () => void share.share());
    button('act', acts, '再练一遍', again);
    const home = button('act go hk-main', acts, '回主页', o.onExit);
    home.dataset.act = 'exit';
    if (total === QUESTIONS * POINTS) {
      play('fanGrand');
      celebrate(root, root.clientWidth / 2, 170, '全对！', 'zimo');
    } else play('fanSoft');
    // 往后再做都是练习
    practice = true;
  }

  /** 再做一遍：换回第一题，成绩不计（今天的成绩这时已经记下了） */
  function again(): void {
    scores = [];
    total = 0;
    i = 0;
    sel = null;
    revealed = false;
    drawQuestion();
  }

  drawQuestion();
  return () => document.removeEventListener('keydown', key);
}
