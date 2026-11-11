/**
 * 成就的存储、解锁提示和页面（规则在 game/achieve.ts）。key `mahjong.ach`：{ got, played, wins }。
 * 读写走 storage.ts：隐私模式、存满了就算了，不影响打牌。
 */
import { readJson, writeJson } from '../storage.ts';
import './achieve.css';
import { showToast } from './toast.ts';
import { achFor, achFromEvents, achKey, achProgress, ACHIEVEMENTS, emptyAch, parseAch, type AchRecord } from '../game/achieve.ts';
import type { DexVariant } from '../game/dex.ts';
import type { RcEvent } from '../core/variants/riichi/index.ts';
import type { XzEvent } from '../core/variants/sichuan-xuezhan/index.ts';
import type { ViewOf } from '../core/variants/index.ts';
import { el } from './dom.ts';
import { loadDex } from './dex.ts';

export const ACH_KEY = 'mahjong.ach';

export function loadAch(): AchRecord {
  const raw = readJson<unknown>(ACH_KEY, null);
  return raw ? parseAch(raw) : emptyAch();
}

function saveAch(r: AchRecord): void {
  // 存不上就算了，下次满足条件再解锁
  writeJson(ACH_KEY, r);
}

/** 一场打完，自己是不是第一：立直看名次；川麻没有名次，看净输赢谁最多（要严格最多） */
function firstOf(v: ViewOf, seat: number): boolean | null {
  if ('final' in v) return v.final ? v.final.rank[0] === seat : null;
  const nets = v.result?.seats.map((s) => s.net);
  if (!nets) return null;
  return nets.every((n, i) => i === seat || n < nets[seat]!);
}

/**
 * 一步走完调一次（要排在 recordDex 后面，图鉴类成就读的是刚更新的图鉴）；旁观不判。
 * scope 是这一场的号（单机存档号 / 房间码）：和记录里最后判过的那一步一样就不再判——单机重画、回到牌桌、刷新页面都会拿同一步再来一遍
 */
export function recordAch(v: ViewOf, seat: number | null, scope: string): void {
  const events: readonly (XzEvent | RcEvent)[] = v.events;
  const key = achKey(scope, v, events);
  if (seat === null || key === null) return;
  const cur = loadAch();
  if (cur.last === key) return;
  const { rec, fresh } = achFromEvents(cur, events, seat, { first: events.some((e) => e.e === 'over') ? firstOf(v, seat) : null, dex: loadDex() });
  saveAch({ ...rec, last: key });
  for (const id of fresh) showToast(MEDAL, `成就解锁：${ACHIEVEMENTS.find((a) => a.id === id)!.name}`);
}

const MEDAL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h4l1 5H8zM17 2h-4l-1 5h4z" fill="#b8322a"/><circle cx="12" cy="15" r="7" fill="#f3c86b" stroke="#a9741a" stroke-width="1.5"/><path d="M12 10.8l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#a9741a"/></svg>';

// ---------- 小册子的"成就"页 ----------

/** 成就页：顶上"已解锁 N / 总数"，已解锁的亮，没解锁的灰着写怎么达成（进度型带 N / 目标） */
export function renderAch(page: HTMLElement, variant: DexVariant): void {
  const rec = loadAch();
  const dex = loadDex();
  const list = achFor(variant);
  const got = list.filter((a) => rec.got[a.id]).length;
  const root = el('div', 'ach-page', page);
  el('p', 'ach-progress', root, `已解锁 ${got} / ${list.length}`);
  el('p', 'note', root, '只按你自己座位的公开动作判定，解锁了就一直在。');
  const ul = el('ul', 'ach-list', root);
  for (const a of list) {
    const on = rec.got[a.id] === 1;
    const li = el('li', on ? 'on' : 'lock', ul);
    const m = el('span', 'ach-medal', li);
    m.innerHTML = MEDAL;
    const body = el('div', 'ach-body', li);
    el('div', 'ach-name', body, a.name);
    const pr = on ? null : achProgress(rec, a.id, dex);
    el('div', 'ach-how', body, pr ? `${a.how}（${pr.n} / ${pr.total}）` : a.how);
  }
}
