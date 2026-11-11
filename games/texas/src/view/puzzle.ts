/**
 * 每日牌局谜题的界面（docs/features.md 13.11，规则在 src/puzzle/）：每天 5 道题连着答，每道揭晓（对错、本题得分、赢面对要的赢面的条、一句话、抽一次看看），
 * 5 道答完一张总结卡：总分、每道对错、连续完成天数、交榜的结果、晒一下。答到一半关了，再打开接着答下一道；答完再打开是总结卡。
 * 键盘 1/2/3 选、Esc 关；竖屏手机上按钮不小于 44 px。
 * 日期按北京时间（UTC+8，没有夏令时）在这里算好交给规则：规则核心不碰时间。
 */
import type { Card } from '../core/cards.ts';
import { puzzlesFor, PER_DAY, type Choice, type Puzzle } from '../puzzle/index.ts';
import { dayStatus, liveStreak, markSent, record, type PuzzleSave } from '../puzzle/progress.ts';
import { DAY_FULL, FULL, dayTotal, puzzleBoardId, scoreOf } from '../puzzle/score.ts';
import { makeCard, setCard } from './art.ts';
import { el, toggle } from './dom.ts';
import { must } from '../must.ts';

/** 北京日期 YYYY-MM-DD */
export const beijingDate = (now: number = Date.now()): string => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);

/** "10月30日" */
export const dayLabel = (date: string): string => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

/** 标题页入口上的状态：还没开始、答到第几道、总分，加连续完成天数 */
export function puzzleStatus(save: PuzzleSave, today: string): { state: 'new' | 'part' | 'done'; text: string; streak: number } {
  const st = dayStatus(save, today);
  const streak = liveStreak(save, today);
  if (st.complete) return { state: 'done', text: `${st.total} 分`, streak };
  if (st.answered) return { state: 'part', text: `第 ${st.answered + 1} 道`, streak };
  return { state: 'new', text: '未开始', streak };
}

const fmt = (p: Puzzle, n: number): string => (p.unit === 'bb' ? `${n} 个大盲` : String(n));

/** 局面里的数字，一句话 */
function infoLine(p: Puzzle): string {
  if (p.choices.some((c) => c.id === 'shove')) return `底池 ${fmt(p, p.pot)} · 全下要再投 ${fmt(p, p.call)}`;
  if (p.unit === 'bb') return `底池 ${fmt(p, p.pot)} · 要再补 ${fmt(p, p.call)} 跟他`;
  return `底池 ${p.pot}（含他这一注 ${p.call}）· ${p.allIn ? '他全下，' : ''}你要跟 ${p.call}`;
}

/** 晒一下要的数 */
export interface DaySummary {
  total: number;
  oks: boolean[];
  streak: number;
  day: string;
}

export interface PuzzleView {
  /** 当前存档（答一道存一次） */
  save: PuzzleSave;
  onSave(s: PuzzleSave): void;
  /** 5 道答完交每日榜（榜名、总分）；返回是否交上；单独部署没有，给 null */
  submit: ((board: string, total: number) => Promise<boolean>) | null;
  /** 晒一下；单独部署没有就不给 */
  share: ((s: DaySummary) => void) | null;
  onClose(): void;
}

/** 打开今天的谜题；返回关闭函数 */
export function openPuzzle(parent: HTMLElement, v: PuzzleView, date: string = beijingDate()): () => void {
  const ps = puzzlesFor(date);
  let save = v.save;
  /** 刚答完交榜还在路上 */
  let pending = false;
  let noteEl: HTMLElement | null = null;
  const mask = el('div', 'mask pz-mask', parent);
  const box = el('div', 'pz', mask);
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', '今日谜题');

  const head = el('div', 'pz-head', box);
  const x = el('button', 'pz-x', head, '✕');
  x.type = 'button';
  x.setAttribute('aria-label', '关闭');
  el('b', 'pz-title', head, '今日谜题');
  el('span', 'pz-date', head, dayLabel(date));
  const dots = el('span', 'pz-dots', head);
  const dotEls = Array.from({ length: PER_DAY }, () => el('i', '', dots));
  const body = el('div', 'pz-body', box);

  const run = (): PuzzleSave['days'][string] | undefined => save.days[date];
  const oks = (): boolean[] => (run()?.picks ?? []).map((pk, i) => pk === must(ps[i], 'ps[i]').answer);

  function drawDots(current: number): void {
    const o = oks();
    dotEls.forEach((d, i) => {
      d.className = i < o.length ? (o[i] ? 'ok' : 'bad') : i === current ? 'cur' : '';
    });
    dots.setAttribute('aria-label', `第 ${Math.min(current + 1, PER_DAY)} / ${PER_DAY} 题`);
  }

  function next(): void {
    const n = dayStatus(save, date).answered;
    if (n >= PER_DAY) summary(false);
    else question(n, null);
  }

  /** 第 i 道；answered 是已经选了的（刷新后接着答时前几道不再出现，只有刚答完的那一道会带着揭晓） */
  function question(i: number, answered: string | null): void {
    const p = must(ps[i], 'ps[i]');
    body.textContent = '';
    box.classList.remove('done', 'fresh', 'sum');
    drawDots(i);
    const left = el('div', 'pz-left', body);
    const right = el('div', 'pz-right', body);
    const tag = el('div', 'pz-name', left);
    el('b', '', tag, `第 ${i + 1} / ${PER_DAY} 题`);
    el('span', '', tag, p.name);
    el('p', 'pz-sit', left, p.situation);
    const felt = el('div', 'pz-felt', left);
    const boardRow = el('div', 'pz-row pz-board', felt);
    const slots: HTMLDivElement[] = [];
    for (let k = 0; k < 5; k++) {
      const slot = el('div', 'pz-slot', boardRow);
      slots.push(slot);
      const c = p.board[k];
      if (c !== undefined) slot.appendChild(upCard(c));
    }
    const heroRow = el('div', 'pz-row pz-hero', felt);
    for (const c of p.hero) heroRow.appendChild(upCard(c, 'mine'));
    el('div', 'pz-cap', felt, '你的牌');
    el('div', 'pz-info', felt, infoLine(p));
    el('p', 'pz-range', left, p.rangeText);

    const choicesEl = el('div', 'pz-choices', right);
    el('div', 'pz-ask', choicesEl, '怎么办？');
    const btns = new Map<string, HTMLButtonElement>();
    p.choices.forEach((c: Choice, k: number) => {
      const b = el('button', 'pz-ch', choicesEl);
      b.type = 'button';
      b.dataset.id = c.id;
      el('kbd', '', b, String(k + 1));
      el('span', '', b, c.label);
      b.addEventListener('click', () => pick(c.id));
      btns.set(c.id, b);
    });
    const reveal = el('div', 'pz-reveal hidden', right);

    const show = (choice: string, score: number, fresh: boolean): void => {
      const ok = choice === p.answer;
      box.classList.add('done');
      box.classList.toggle('fresh', fresh);
      for (const [id, b] of btns) {
        b.disabled = true;
        toggle(b, 'right', id === p.answer);
        toggle(b, 'wrong', id === choice && !ok);
        toggle(b, 'mine', id === choice);
      }
      reveal.classList.remove('hidden');
      reveal.textContent = '';
      const verdict = el('div', ok ? 'pz-verdict ok' : 'pz-verdict bad', reveal);
      el('b', '', verdict, ok ? '✓ 答对了' : '✗ 答错了');
      el('span', '', verdict, ok ? '' : `该${must(p.choices.find((c) => c.id === p.answer), 'p.choices.find((c) => c.id === p.answer)').label}`);
      el('span', 'pz-score', verdict, `本题 ${score} 分`);
      const bar = el('div', 'pz-bar', reveal);
      const preflop = p.stage === 'pre' && p.choices.some((c) => c.id === 'shove');
      const fill = el('div', 'pz-fill', bar);
      const need = el('div', 'pz-need', bar);
      need.style.left = `${p.need}%`;
      el('span', '', need, `${preflop ? '不亏要' : '要'} ${p.need}%`);
      el('span', 'pz-eq', bar, `${preflop ? '被跟时' : '你'} ${p.equity}%`);
      // 先 0 再长到真值，揭晓时条是长出来的
      fill.style.width = fresh ? '0%' : `${p.equity}%`;
      fill.classList.toggle('above', p.equity > p.need);
      if (fresh) requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${p.equity}%`)));
      el('p', 'pz-why', reveal, p.why);

      // 抽一次看看：补满公共牌、亮出他的牌
      const sample = el('div', 'pz-sample', reveal);
      el('span', 'pz-s-cap', sample, '抽一次看看');
      const vc = el('span', 'pz-s-cards', sample);
      for (const c of p.sample.villain) vc.appendChild(upCard(c, 'small'));
      el('span', `pz-s-res ${p.sample.result}`, sample, p.sample.result === 'win' ? '这次你赢了' : p.sample.result === 'lose' ? '这次你输了' : '这次平分');
      el('span', 'pz-s-note', sample, '一次结果说明不了对错');
      p.sample.runout.forEach((c, k) => {
        const slot = must(slots[p.board.length + k], 'slots[p.board.length + k]');
        slot.classList.add('runout');
        const card = makeCard();
        slot.appendChild(card);
        const flip = (): void => setCard(card, c);
        if (fresh) window.setTimeout(flip, 500 + k * 220);
        else flip();
      });

      const actions = el('div', 'pz-actions', reveal);
      const nb = el('button', 'pz-next', actions, i + 1 >= PER_DAY ? '看总结' : '下一题');
      nb.type = 'button';
      nb.addEventListener('click', next);
      nb.focus();
    };

    function pick(id: string): void {
      if (box.classList.contains('done') || !btns.has(id)) return;
      const score = scoreOf(p, id);
      save = record(save, date, id, score);
      v.onSave(save);
      drawDots(i + 1);
      const st = dayStatus(save, date);
      // 第 5 道答完就交榜：先记"没交上"再交，中途关掉、刷新都不会再交第二次（一天只交一次）
      if (st.complete && v.submit) {
        save = markSent(save, date, false);
        v.onSave(save);
        pending = true;
        void v.submit(puzzleBoardId(date), st.total).then((ok) => {
          pending = false;
          save = markSent(save, date, ok);
          v.onSave(save);
          if (noteEl?.isConnected) drawNote(noteEl);
        });
      }
      show(id, score, true);
    }
    if (answered !== null) show(answered, run()?.scores[i] ?? 0, false);
    else btns.values().next().value?.focus();
    qPick = pick;
    qChoices = p.choices;
  }

  /** 总结卡 */
  function summary(fresh: boolean): void {
    const r = run();
    const total = dayTotal(r?.scores ?? []);
    const o = oks();
    body.textContent = '';
    box.classList.remove('done', 'fresh');
    box.classList.add('sum');
    box.classList.toggle('fresh', fresh);
    qPick = null;
    drawDots(PER_DAY);
    const card = el('div', 'pz-sum', body);
    // 电脑上左边总分和结果、右边 5 道的明细（一屏放下），竖屏叠成一列
    const sl = el('div', 'pz-sum-l', card);
    const sr = el('div', 'pz-sum-r', card);
    el('div', 'pz-sum-t', sl, '今天的 5 道题');
    const big = el('div', 'pz-total', sl);
    el('b', '', big, String(total));
    el('small', '', big, `/ ${DAY_FULL} 分`);
    const rows = el('div', 'pz-res', sr);
    ps.forEach((p, k) => {
      // 满分 ✓、0 分 ✗，拿到部分分是"差一点"（选了次优的路，不算全错）
      const sc = r?.scores[k] ?? 0;
      const kind = sc >= FULL ? 'ok' : sc > 0 ? 'near' : o[k] ? 'ok' : 'bad';
      const row = el('div', kind, rows);
      el('span', '', row, kind === 'ok' ? '✓' : kind === 'near' ? '△' : '✗');
      el('b', '', row, p.name);
      el('em', '', row, kind === 'near' ? `差一点 ${sc} 分` : `${sc} 分`);
    });
    const streak = liveStreak(save, date);
    el('div', 'pz-line', sl, streak >= 2 ? `连续完成 ${streak} 天` : streak === 1 ? '今天完成了，明天再来连起来' : '');
    noteEl = el('div', 'pz-line pz-board-note', sl);
    drawNote(noteEl);
    const actions = el('div', 'pz-actions', sl);
    if (v.share) {
      const sb = el('button', 'pz-share', actions, '晒一下');
      sb.type = 'button';
      sb.addEventListener('click', () => v.share!({ total, oks: o, streak, day: date }));
    }
    const cb = el('button', 'pz-close', actions, '收起');
    cb.type = 'button';
    cb.addEventListener('click', close);
  }

  /** 交榜的结果一句话：单独部署没有榜，不写 */
  function drawNote(n: HTMLElement): void {
    const sent = run()?.sent;
    n.textContent = !v.submit ? '' : pending ? '正在交今日榜…' : sent ? '已上今日榜' : '今日榜没交上：连不上，稍后再试；分数已记在本机';
    toggle(n, 'hidden', !n.textContent);
  }

  // 键盘：1/2/3 选（还没答的时候）、Esc 关
  let qPick: ((id: string) => void) | null = null;
  let qChoices: readonly Choice[] = [];
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    const k = Number(e.key);
    if (e.ctrlKey || e.metaKey || e.altKey || !Number.isInteger(k) || k < 1) return;
    const c = qChoices[k - 1];
    if (c && qPick) qPick(c.id);
  };
  document.addEventListener('keydown', onKey);
  x.addEventListener('click', close);
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close();
  });

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    mask.remove();
    v.onClose();
  }

  const st = dayStatus(save, date);
  if (st.complete) summary(false);
  else question(st.answered, null);
  return close;
}

function upCard(c: Card, cls = ''): HTMLDivElement {
  const d = makeCard(cls);
  setCard(d, c);
  return d;
}
