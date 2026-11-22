/**
 * 茶馆擂台的页面（DESIGN.md 7 节）：四种打法各一张卡，看打到第几桌、拿没拿称号，开擂或接着打；一桌打完在结算弹窗里记擂台。
 * 规则在 game/ladder.ts，这里只读写本机记录（mahjong.ladder）和画。纯娱乐，不碰筹码。
 */
import { readText, writeJson } from '../storage.ts';
import { endTable, LADDER_KEY, LADDER_LEVELS, LADDER_MODES, parseLadder, TABLES, type LadderData, type LadderMode, type TableOutcome } from '../game/ladder.ts';
import type { CloudState } from '../net/cloud.ts';
import { button, el } from './dom.ts';
import { LEVEL_NAME } from './text.ts';
import { ladderChoiceOf } from './variants/pages.ts';
import './ladder.css';

/** 三个称号，一种打法一个 */
export const TITLE_NAME: Record<LadderMode, string> = { xz: '血战擂主', xl: '血流擂主', x3: '三人擂主', rc: '立直擂主' };

export function readLadder(): LadderData {
  return parseLadder(readText(LADDER_KEY));
}

/** 写完本机记录要通知的（有平台时是云存档，app/cloud.ts 接上） */
let written: (() => void) | null = null;
export const onLadderWrite = (f: () => void): void => {
  written = f;
};

export function writeLadder(d: LadderData): void {
  // 存不上（隐私模式、满了）：这一桌照打，只是擂台记不住，也不通知云存档
  if (writeJson(LADDER_KEY, d)) written?.();
}

const modeName = (m: LadderMode): string => ladderChoiceOf(m).choice.chip;
const tableName = (t: number): string => `第 ${t + 1} 桌（${LEVEL_NAME[LADDER_LEVELS[t]!]}）`;

/** 主页"擂台"胶囊上的字 */
export function ladderLabel(): string {
  const d = readLadder();
  if (d.run) return `第 ${d.run.table + 1} 桌`;
  return d.titles.length ? `${d.titles.length} 个称号` : '去打擂';
}

/** 牌桌顶栏：擂台第几桌 */
export const ladderTitle = (table: number): string => `擂台第 ${table + 1} 桌`;

interface LadderPageOpts {
  onExit(): void;
  /** 开一轮新的（有没打完的一轮先确认放弃，由调用的人管） */
  onStart(mode: LadderMode): void;
  /** 接着打这一轮的这一桌 */
  onResume(): void;
  onQuit(): void;
  /** 云存档的云朵（没有平台时不给） */
  cloud?: { state(): CloudState; on(f: (s: CloudState) => void): () => void; tap(s: CloudState): void };
}

/** 云朵上的字；带小红点的是同步停下了 */
const CLOUD_TEXT: Record<CloudState, string> = {
  off: '',
  out: '未登录',
  ok: '已同步',
  syncing: '同步中',
  pending: '待上传',
  merged: '已合并',
  paused: '暂停同步',
  full: '存储满了',
};
const CLOUD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 18.5z"/></svg>';

function cloudBadge(head: HTMLElement, c: NonNullable<LadderPageOpts['cloud']>): void {
  const b = button('ld-cloud', head, '', () => c.tap(c.state()));
  b.insertAdjacentHTML('afterbegin', CLOUD_ICON);
  const label = el('span', '', b);
  const paint = (s: CloudState): void => {
    // 换页以后按钮没了：不再听
    if (!b.isConnected) return void stop();
    b.hidden = s === 'off';
    b.dataset.state = s;
    label.textContent = CLOUD_TEXT[s];
  };
  const stop = c.on(paint);
  paint(c.state());
}

/** 三桌的小圆点：赢过的、正在打的、还没到的 */
function pips(box: HTMLElement, won: number, at: number | null): void {
  const row = el('div', 'ld-pips', box);
  for (let t = 0; t < TABLES; t++) {
    const p = el('span', `ld-pip${t < won ? ' won' : ''}${t === at ? ' at' : ''}`, row, String(t + 1));
    p.title = tableName(t);
  }
}

export function showLadder(box: HTMLElement, o: LadderPageOpts): void {
  box.replaceChildren();
  const root = el('div', 'ladder-page', box);
  const h = el('div', 'ld-head', root);
  button('ld-back', h, '‹ 主页', o.onExit);
  el('b', 'ld-title', h, '茶馆擂台');
  if (o.cloud) cloudBadge(h, o.cloud);
  // 规矩画成一条路线（三桌 → 称号）加几个短标签，不写成一段段长句（11-22 打磨）
  const intro = el('div', 'ld-intro', root);
  const steps = el('div', 'ld-steps', intro);
  LADDER_LEVELS.forEach((l, t) => {
    const step = el('div', 'ld-step', steps);
    el('span', 'ld-pip', step, String(t + 1));
    el('span', 'ld-step-name', step, `${LEVEL_NAME[l]}桌`);
    el('span', 'ld-arrow', steps).setAttribute('aria-hidden', 'true');
  });
  const goal = el('div', 'ld-step goal', steps);
  el('span', 'ld-pip won', goal, '★');
  el('span', 'ld-step-name', goal, '拿称号');
  const how = el('div', 'ld-how', intro);
  for (const t of ['每桌打一局，不输分就过', '输了从第一桌重来', '中途离开下次接着打', '纯娱乐，不算筹码']) el('span', 'ld-tag', how, t);
  const d = readLadder();
  const cards = el('div', 'ld-cards', root);
  for (const m of LADDER_MODES) {
    const card = el('div', `ld-card${d.titles.includes(m) ? ' got' : ''}`, cards);
    card.dataset.mode = m;
    el('b', 'ld-name', card, modeName(m));
    const run = d.run?.mode === m ? d.run : null;
    pips(card, run ? run.table : (d.best[m] ?? 0), run ? run.table : null);
    el('div', 'ld-title-badge', card, d.titles.includes(m) ? TITLE_NAME[m] : `称号：${TITLE_NAME[m]}`);
    if (run) {
      el('div', 'ld-note', card, `正在打${tableName(run.table)}`);
      button('act go ld-go', card, `接着打第 ${run.table + 1} 桌`, o.onResume).dataset.act = 'resume';
      button('act soft ld-quit', card, '放弃这一轮', o.onQuit);
    } else {
      const best = d.best[m] ?? 0;
      el('div', 'ld-note', card, best ? `最远赢到第 ${best} 桌` : '还没打过');
      button('act go ld-go', card, d.titles.includes(m) ? '再打一轮' : '开擂', () => o.onStart(m)).dataset.act = 'start';
    }
  }
}

interface LadderEnd {
  outcome: TableOutcome;
  mode: LadderMode;
  /** 刚打完的是第几桌 */
  table: number;
}

/**
 * 一桌打完：按净分记擂台（只记一次：这一轮记着的单机存档号还是这一场才记），在结算弹窗里写一行结果。
 * 记过了（结算重画）或者对不上（这一轮已经放弃、换了），回 null，只写一句"擂台"不再记
 */
export function ladderEnd(box: HTMLElement, soloId: string, mode: LadderMode, table: number, net: number): LadderEnd | null {
  const d = readLadder();
  const line = el('div', 'ladder-end', box);
  if (!d.run || d.run.solo !== soloId) {
    el('b', 'le-head', line, `擂台${tableName(table)}`);
    return null;
  }
  const r = endTable(d, net);
  writeLadder(r.d);
  line.classList.add(r.outcome);
  const text: Record<TableOutcome, string> = {
    next: `${tableName(table)}赢了！下一桌：${LEVEL_NAME[LADDER_LEVELS[table + 1] ?? 'hard']}`,
    clear: `三桌全赢！拿到称号「${TITLE_NAME[mode]}」`,
    out: `${tableName(table)}输了，这一轮擂台到此为止`,
  };
  el('b', 'le-head', line, text[r.outcome]);
  pips(line, r.outcome === 'clear' ? TABLES : r.outcome === 'next' ? table + 1 : table, r.outcome === 'next' ? table + 1 : null);
  return { outcome: r.outcome, mode, table };
}
