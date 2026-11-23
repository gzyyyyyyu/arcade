/**
 * 听牌速判的画面（DESIGN.md 7 节）：60 秒一轮，每题一手 13 张清一色，把听的牌全点出来再"提交"，全对才得分。
 * 出题和计分在 core/puzzles/ting.ts（纯函数），最好成绩在 game/ting.ts；这里读写本机的 mahjong.ting，
 * 计时、键盘（1–9 切换、Enter 提交 / 下一题、Esc 回主页）和演出都是画面层的事，离开页面由返回的收尾函数清掉。
 * 只是娱乐：不碰筹码、不接钱包。
 */
import { readText, writeJson } from '../storage.ts';
import { ROUND_SECONDS, answer, startRound, tingQuestion, tingTier, type RoundState, type TingQuestion } from '../core/puzzles/ting.ts';
import { TING_KEY, dailyOf, finishDaily, markSent, noteDaily, parseTing, recordTing, settleDaily, startDaily, tingBoard, type DailyTing, type TingData } from '../game/ting.ts';
import { tingKey } from '../core/puzzles/ting.ts';
import { prepareCard, tingCardOf } from './share.ts';
import { todayCN } from './daily.ts';
import { celebrate } from './fx.ts';
import { play } from './sound.ts';
import { tileName, tileUrl } from './tiles.ts';
import { button, el } from './dom.ts';
import { submitScore } from '../net/scores.ts';
import './ting.css';

/** 答完一题亮出答案停多久（点一下可以跳过） */
const REVEAL_MS = 1100;

function readTing(): TingData {
  return parseTing(readText(TING_KEY));
}

function writeTing(d: TingData): void {
  // 存不上就不记，下次主页还是旧的最好成绩，不看返回值
  writeJson(TING_KEY, d);
}

/** 主页入口上的一行字：今天打过今日一轮写分数，没打写"没做"（和每日、何切一致，主页小签放得下） */
export function tingLabel(): string {
  const d = dailyOf(readTing(), todayCN());
  return d ? `今天 ${d.score} 分` : '没做';
}

/**
 * 把今天的分数交给平台的每日榜（只有登录才交，榜没登记、断网都不吭声，不挡成绩页）。
 * 交成功才写 sent；没成功下次进页面再交
 */
async function submitDaily(d: DailyTing, userId: string): Promise<void> {
  if (await submitScore(tingBoard(d.date), d.score, userId)) writeTing(markSent(readTing(), d.date));
}

/** 进页面或主页时清账（规则见 game/ting.ts 的 settleDaily）：该交的交，没登录就留着 */
export function settleTing(userId: string | null): void {
  const today = todayCN();
  const before = readTing();
  const r = settleDaily(before, today);
  if (JSON.stringify(r.data) !== JSON.stringify(before)) writeTing(r.data);
  if (r.submit && userId) void submitDaily(r.submit, userId);
}

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 练习的随机 key：页面层可以用 crypto，核心只收 key */
function freshKey(): number[] {
  const a = new Uint32Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < 8; i++) a[i] = (Math.random() * 0x100000000) >>> 0;
  return [...a];
}

/** 听 5 种以上答对时弹的大字 */
function shout(n: number): string | null {
  if (n >= 9) return '九莲宝灯！';
  if (n >= 5) return `${'五六七八'[n - 5]}面听！`;
  return null;
}

function tile(cls: string, kind: number, parent: HTMLElement): HTMLElement {
  const t = el('span', `td-tile ${cls}`, parent);
  t.style.backgroundImage = `url("${tileUrl(kind)}")`;
  t.setAttribute('role', 'img');
  t.setAttribute('aria-label', tileName(kind));
  return t;
}

interface TingOpts {
  /** 回主页 */
  onExit(): void;
  /** 分享卡上的游戏地址 */
  shareUrl: string;
  /** 登录用户的号；没登录是 null（今日一轮照打、照记，只是不交榜） */
  userId: string | null;
}

/** 打开听牌速判。返回收尾函数（拆页面时调：摘掉键盘监听、清计时器） */
export function showTing(box: HTMLElement, o: TingOpts): () => void {
  box.replaceChildren();
  settleTing(o.userId);
  const root = el('div', 'ting-drill', box);
  /** 这一轮是今日一轮（日期在开始那一刻定下，跨午夜也算开始那天的）；null 是练习 */
  let dailyDate: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let wait: ReturnType<typeof setTimeout> | null = null;
  let phase: 'intro' | 'play' | 'reveal' | 'result' = 'intro';
  let key = freshKey();
  let round: RoundState = startRound();
  let index = 0;
  let q: TingQuestion = tingQuestion(key, 0);
  let picks = new Set<number>();
  /** 到这个时刻（performance.now）这一轮结束 */
  let endAt = 0;
  let bar: HTMLElement | null = null;
  let secs: HTMLElement | null = null;
  let submit: HTMLButtonElement | null = null;
  const pads = new Map<number, HTMLButtonElement>();

  const stopTimers = (): void => {
    if (timer) clearInterval(timer);
    if (wait) clearTimeout(wait);
    timer = wait = null;
  };

  const act = (e: KeyboardEvent): void => {
    // 页面已经被换掉（比如朋友的房间链接进来）：键盘监听自己撤掉
    if (!root.isConnected) return stop();
    if (e.key === 'Enter' || e.key === ' ') {
      if (document.activeElement?.tagName === 'BUTTON' && e.key === ' ') return;
      if (phase === 'play') submitNow();
      else if (phase === 'reveal') next();
      else if (phase === 'intro') begin(!dailyOf(readTing(), todayCN()));
      else if (phase === 'result') begin(false);
      else return;
      e.preventDefault();
      return;
    }
    if (phase === 'play' && /^[1-9]$/.test(e.key)) {
      e.preventDefault();
      toggle(q.suit * 9 + Number(e.key) - 1);
    }
  };
  document.addEventListener('keydown', act);
  function stop(): void {
    stopTimers();
    document.removeEventListener('keydown', act);
  }

  const head = (title: string): void => {
    const h = el('div', 'td-head', root);
    button('td-back', h, '‹ 主页', o.onExit);
    el('b', 'td-title', h, title);
  };

  // ---------- 说明屏 ----------
  function drawIntro(): void {
    phase = 'intro';
    stopTimers();
    root.replaceChildren();
    head('听牌速判');
    const card = el('div', 'td-card', root);
    el('div', 'td-lead', card, `${ROUND_SECONDS} 秒，把这手牌听的牌都点出来`);
    const ul = el('ul', 'td-rules', card);
    el('li', '', ul, '每题一手 13 张清一色，底下点出它听的所有牌，再按“提交”');
    el('li', '', ul, '全对才得分，听的种数越多分越高，连对还有加成');
    el('li', '', ul, '多点、少点都算错，错了连对清零');
    const data = readTing();
    const best = data.best;
    const today = dailyOf(data, todayCN());
    // 打过（今日一轮得 0 分也算打过）就不说"还没玩过"
    if (best > 0 || !today) el('div', 'td-best', card, best > 0 ? `本机最好 ${best} 分` : '还没玩过，来一轮试试');
    if (today) {
      // 今天已经打过：不能再打今日一轮，只剩练习
      el('div', 'td-today', card, `今天 ${today.score} 分`);
      const go = button('act go big td-go', card, '练习（不计今日成绩）', () => begin(false));
      go.dataset.act = 'practice';
    } else {
      el('div', 'td-today', card, '今日一轮：每个人这一天拿到同一套题，只能打一次');
      const go = button('act go big td-go', card, '今日一轮', () => begin(true));
      go.dataset.act = 'start';
      const pr = button('act soft td-go', card, '练习（随机题，不计今日成绩）', () => begin(false));
      pr.dataset.act = 'practice';
    }
  }

  // ---------- 开一轮 ----------
  function begin(daily = false): void {
    stopTimers();
    dailyDate = null;
    key = freshKey();
    if (daily) {
      const today = todayCN();
      // 开始的那一刻就记账：中途刷新、关页面都不能重来；记不上（今天已有记录）就当练习
      const before = readTing();
      if (!dailyOf(before, today)) {
        writeTing(startDaily(before, today));
        dailyDate = today;
        key = tingKey(today);
      }
    }
    round = startRound();
    index = 0;
    endAt = performance.now() + ROUND_SECONDS * 1000;
    timer = setInterval(tick, 100);
    drawQuestion();
  }

  function tick(): void {
    const left = Math.max(0, endAt - performance.now());
    if (bar) bar.style.width = `${(left / (ROUND_SECONDS * 1000)) * 100}%`;
    if (secs) secs.textContent = String(Math.ceil(left / 1000));
    bar?.parentElement?.classList.toggle('low', left <= 10000);
    // 答题中时间到就结束；答案亮着时等它翻过去再结束，不打断看答案
    if (left <= 0 && phase === 'play') finish();
  }

  const hud = (): void => {
    const h = el('div', 'td-hud', root);
    const t = el('div', 'td-time', h);
    bar = el('div', 'td-bar', t);
    el('i', '', bar);
    bar = bar.firstElementChild as HTMLElement;
    secs = el('b', 'td-secs', t, String(Math.max(0, Math.ceil((endAt - performance.now()) / 1000))));
    const s = el('div', 'td-stats', h);
    el('span', 'td-score', s).innerHTML = `<i>${round.score}</i> 分`;
    el('span', `td-combo${round.streak >= 2 ? ' on' : ''}`, s, round.streak >= 2 ? `连对 ${round.streak}` : '');
    tick();
  };

  // ---------- 一题 ----------
  function drawQuestion(): void {
    phase = 'play';
    q = tingQuestion(key, index);
    picks = new Set();
    pads.clear();
    root.replaceChildren();
    head('听牌速判');
    hud();
    el('div', 'td-ask', root, `第 ${index + 1} 题 · 这手牌听哪些牌？`);
    const hand = el('div', 'td-hand', root);
    for (const k of q.hand) tile('hand', k, hand);
    const pad = el('div', 'td-pad', root);
    for (let r = 0; r < 9; r++) {
      const k = q.suit * 9 + r;
      const b = button('td-key', pad, '', () => toggle(k));
      b.style.backgroundImage = `url("${tileUrl(k)}")`;
      b.setAttribute('aria-label', tileName(k));
      b.setAttribute('aria-pressed', 'false');
      el('kbd', 'td-num', b, String(r + 1));
      el('i', 'td-tick', b, '✓');
      pads.set(k, b);
    }
    submit = button('act go big td-submit', root, '提交', submitNow);
    submit.disabled = true;
    submit.dataset.act = 'submit';
    el('div', 'td-hint', root, '点牌选中，再点取消；电脑上按 1–9 选，回车提交');
  }

  function toggle(k: number): void {
    if (phase !== 'play') return;
    if (picks.has(k)) picks.delete(k);
    else picks.add(k);
    const b = pads.get(k)!;
    b.classList.toggle('on', picks.has(k));
    b.setAttribute('aria-pressed', String(picks.has(k)));
    if (submit) submit.disabled = picks.size === 0;
    play('click');
  }

  function submitNow(): void {
    if (phase !== 'play' || picks.size === 0) return;
    const r = answer(round, q.waits, [...picks]);
    round = r.state;
    phase = 'reveal';
    if (dailyDate) writeTing(noteDaily(readTing(), dailyDate, round));
    // 亮答案：选对的、漏的、选错的三种样子（样子之外各带一个字，不只靠颜色）
    for (const [k, b] of pads) {
      b.disabled = true;
      b.classList.remove('on');
      const mark = b.querySelector<HTMLElement>('.td-tick')!;
      if (r.judged.hit.includes(k)) { b.classList.add('hit'); mark.textContent = '✓'; }
      else if (r.judged.missed.includes(k)) { b.classList.add('missed'); mark.textContent = '漏'; }
      else if (r.judged.wrong.includes(k)) { b.classList.add('wrong'); mark.textContent = '×'; }
    }
    if (submit) submit.remove();
    const verdict = el('div', `td-verdict ${r.judged.ok ? 'ok' : 'bad'}`, root);
    if (r.judged.ok) {
      el('b', '', verdict, `全对！听 ${q.waits.length} 种`);
      el('span', 'td-gain', verdict, `+${r.gain}`);
    } else {
      el('b', '', verdict, r.judged.wrong.length && r.judged.missed.length ? '不对：有漏的，也有多选的' : r.judged.missed.length ? '不对：漏了几张' : '不对：多选了');
      el('span', 'td-gain', verdict, '+0');
    }
    el('div', 'td-hint', root, `听 ${q.waits.map((k) => tileName(k)).join('、')}`);
    // 分数和连击就地更新（不重画整页，免得答案闪一下）
    const sc = root.querySelector<HTMLElement>('.td-score i');
    if (sc) sc.textContent = String(round.score);
    const cb = root.querySelector<HTMLElement>('.td-combo');
    if (cb) {
      cb.classList.toggle('on', round.streak >= 2);
      cb.textContent = round.streak >= 2 ? `连对 ${round.streak}` : '';
    }
    if (r.judged.ok) {
      const big = shout(q.waits.length);
      if (big) {
        play('fanBig');
        celebrate(root, root.clientWidth / 2, 190, big, q.waits.length >= 7 ? 'zimo' : 'hu');
      } else play('win');
    } else play('land');
    root.addEventListener('click', skip);
    wait = setTimeout(next, REVEAL_MS);
  }

  const skip = (e: Event): void => {
    // 提交按钮这一下的事件还在往上冒，那时按钮已摘掉：不算跳过。回主页的按钮点了是别的意思；其余任何地方点一下跳过等待
    if (!(e.target as Node).isConnected) return;
    if ((e.target as HTMLElement).closest('.td-back')) return;
    next();
  };

  function next(): void {
    if (phase !== 'reveal') return;
    root.removeEventListener('click', skip);
    if (wait) clearTimeout(wait);
    wait = null;
    if (performance.now() >= endAt) return finish();
    index++;
    drawQuestion();
  }

  // ---------- 成绩 ----------
  function finish(): void {
    phase = 'result';
    stopTimers();
    root.removeEventListener('click', skip);
    let data = readTing();
    if (dailyDate) data = finishDaily(noteDaily(data, dailyDate, round), dailyDate);
    const r = recordTing(data, round.score);
    writeTing(r.data);
    if (dailyDate && o.userId) {
      const d = dailyOf(r.data, dailyDate);
      if (d && !d.sent) void submitDaily(d, o.userId);
    }
    root.replaceChildren();
    head('听牌速判 · 成绩');
    const card = el('div', `td-card td-result${r.record ? ' record' : ''}`, root);
    el('div', 'td-kind', card, dailyDate ? `今日一轮 · ${dailyDate}` : '练习 · 不计今日成绩');
    el('div', 'td-big', card).innerHTML = `<i>${round.score}</i><small> 分</small>`;
    if (r.record) el('div', 'td-new', card, '新纪录！');
    const st = el('div', 'td-sum', card);
    el('span', '', st, `答对 ${round.correct} 题`);
    el('span', '', st, `最长连对 ${round.bestStreak}`);
    el('span', '', st, `最好 ${r.data.best} 分`);
    const maxTier = tingTier(Math.max(0, round.answered - 1)).id;
    el('div', 'td-note', card, round.correct === 0 ? '先看清楚是顺子还是刻子，再数缺几张' : maxTier >= 2 ? '已经做到多面听的题了，很厉害' : '再来一轮，越往后越难、分越高');
    const acts = el('div', 'td-acts', root);
    const share = prepareCard(tingCardOf(dailyDate, round.score, round.correct, round.bestStreak, ROUND_SECONDS), o.shareUrl);
    button('act soft', acts, '分享', () => void share.share());
    const again = button('act go big', acts, dailyDate ? '再练一轮（练习）' : '再来一轮', () => begin(false));
    again.dataset.act = 'again';
    button('act', acts, '回主页', o.onExit);
    if (r.record) {
      play('fanGrand');
      if (!reduced()) celebrate(root, root.clientWidth / 2, 170, '新纪录！', 'zimo');
    } else play('fanSoft');
  }

  drawIntro();
  return stop;
}
