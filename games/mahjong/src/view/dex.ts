/**
 * 图鉴的存储和页面（规则在 game/dex.ts）。key `mahjong.dex`：{ xz, rc, last?, fresh? }，番型 / 役的 id → 和出来的次数，只记自己和出来的。
 * 读写走 storage.ts：隐私模式、存满了就算了，不影响打牌。
 */
import { readJson, writeJson } from '../storage.ts';
import type { RcEvent } from '../core/variants/riichi/index.ts';
import type { XzEvent } from '../core/variants/sichuan-xuezhan/index.ts';
import { YAKU_NAME, type YakuId } from '../core/variants/riichi/index.ts';
import { dexAddFresh, dexFromEvents, dexMarkSeen, dexNewIds, dexProgress, dexToastText, emptyDex, parseDex, type DexRecord, type DexVariant } from '../game/dex.ts';
import { el } from './dom.ts';
import { BOOK, showToast } from './toast.ts';
import { FAN_NAME } from './text.ts';

export const DEX_KEY = 'mahjong.dex';

export function loadDex(): DexRecord {
  const raw = readJson<unknown>(DEX_KEY, null);
  return raw ? parseDex(raw) : emptyDex();
}

function saveDex(r: DexRecord): void {
  // 存不上就算了，下次和牌再记
  writeJson(DEX_KEY, r);
}

/**
 * 一步走完调一次：自己（seat）这一步和了牌就记进图鉴；seat 为 null（旁观）不记。
 * key 是这一手的标识（dexKey）：和记录里最后一手一样就不再记——单机重画、回到牌桌、刷新页面都会拿同一手再来一遍
 */
export function recordDex(events: readonly (XzEvent | RcEvent)[], seat: number | null, key: string | null): void {
  if (seat === null || key === null) return;
  const cur = loadDex();
  if (cur.last === key) return;
  const next = dexFromEvents(cur, events, seat);
  if (next === cur) return;
  const ids = dexNewIds(cur, next);
  saveDex({ ...dexAddFresh({ ...next, ...(cur.fresh ? { fresh: cur.fresh } : {}) }, ids), last: key });
  // 第一次和出来的番型 / 役：弹一条"图鉴 +N"（一手好几样新的合成一条），在页面上标"新"直到看过
  if (ids.length) showToast(BOOK, dexToastText(ids.map(dexName)));
}

function dexName(key: string): string {
  const id = key.slice(3);
  if (key.startsWith('xz:')) return (FAN_NAME as Record<string, string>)[id] ?? id;
  return id === 'yakuhai' ? '役牌' : (YAKU_NAME[id as YakuId] ?? id);
}

/** 图鉴一行：id、名字、番数、一句说明、可选的牌例（由规则小册子从自己的表里整理好交过来） */
export interface DexRow {
  id: string;
  name: string;
  han: string;
  desc: string;
  /** 牌例画在说明下面（和规则表一样），由调用方画 */
  draw?: (parent: HTMLElement) => void;
}

/** 图鉴页：顶上一行进度，下面每个番型 / 役一行；没和过的整行变灰 */
export function renderDex(page: HTMLElement, variant: DexVariant, groups: { title?: string; rows: DexRow[] }[]): void {
  const rec = loadDex();
  const fresh = new Set(rec.fresh ?? []);
  // 打开图鉴页就算看过：这次画的页上还标着"新"，下次打开就没有了
  const seen = dexMarkSeen(rec, variant);
  if (seen !== rec) saveDex(seen);
  const { got, total } = dexProgress(rec, variant);
  el('p', 'dex-progress', page, `已收集 ${got} / ${total}`);
  el('p', 'note', page, '只记你自己和出来的牌型，每和一次加一次。');
  for (const g of groups) {
    if (g.title) el('h2', '', page, g.title);
    const table = el('table', 'dex', page);
    for (const r of g.rows) {
      const n = rec[variant][r.id] ?? 0;
      const tr = el('tr', n > 0 ? '' : 'lock', table);
      const nm = el('td', 'n', tr, r.name);
      if (n > 0 && fresh.has(`${variant}:${r.id}`)) el('span', 'dex-new', nm, '新');
      el('td', 'f', tr, r.han);
      const d = el('td', 'd', tr, r.desc);
      r.draw?.(d);
      el('div', 'cnt', d, n > 0 ? `和过 ${n} 次` : '还没和过');
    }
  }
}
