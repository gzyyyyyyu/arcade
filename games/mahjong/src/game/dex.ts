/**
 * 番型 / 役种图鉴（收集册，DESIGN.md 第 7 节）：只管"记什么、怎么数"，纯函数，不碰画面和存储。
 * 只记自己和出来的那一手：别人的和牌谁都看得见，但图鉴是自己的收集进度，记别人的没有意义。
 * 记录按 id 数次数，两种玩法各一张，互不串；存在哪、怎么展示是画面层的事（view/dex.ts）。
 */
import type { RcEvent } from '../core/variants/riichi/index.ts';
import type { FanId, XzEvent } from '../core/variants/sichuan-xuezhan/index.ts';

/**
 * last：最后记过的那一手的标识（dexKey），刷新页面后同一手不再记；
 * fresh：新收集、还没在图鉴页看过的（"玩法:id"，如 "xz:qing"），打开图鉴页看过就清掉。老数据都没有这两项
 */
export type DexRecord = { xz: Record<string, number>; rc: Record<string, number>; last?: string; fresh?: string[] };
export type DexVariant = 'xz' | 'rc';

/**
 * 图鉴里列出的番型 / 役（规则表里的那些）。"自摸加番"是算分的附加项、不是牌型，不列；
 * 立直的白发中、场风、自风在规则表里合成一行"役牌"，这里也合成 yakuhai
 */
export const XZ_DEX: readonly FanId[] = ['ping', 'pengpeng', 'qing', 'qidui', 'longqidui', 'jiangdui', 'yaojiu', 'jingou', 'gen', 'gangkai', 'gangpao', 'qianggang', 'haidi', 'haidipao', 'tianhu', 'dihu'];
export const RC_YAKU_DEX: readonly string[] = [
  'riichi', 'ippatsu', 'tsumo', 'pinfu', 'tanyao', 'iipeikou', 'yakuhai', 'rinshan', 'chankan', 'haitei', 'double_riichi', 'chiitoi', 'sanshoku', 'ittsu', 'chanta', 'toitoi',
  'sanankou', 'sanshoku_pon', 'sankantsu', 'shousangen', 'honroutou', 'ryanpeikou', 'junchan', 'honitsu', 'chinitsu',
];
export const RC_YAKUMAN_DEX: readonly string[] = ['kokushi', 'daisangen', 'suuankou', 'shousuushii', 'daisuushii', 'tsuuiisou', 'ryuuiisou', 'chinroutou', 'chuuren', 'suukantsu', 'tenhou', 'chiihou'];
/** 河底捞鱼（houtei）和海底摸月合在一行（规则表里写在一起），记到 haitei */
const RC_ALIAS: Record<string, string> = { haku: 'yakuhai', hatsu: 'yakuhai', chun: 'yakuhai', yakuhai_round: 'yakuhai', yakuhai_seat: 'yakuhai', houtei: 'haitei' };

export const dexIds = (variant: DexVariant): readonly string[] => (variant === 'xz' ? XZ_DEX : [...RC_YAKU_DEX, ...RC_YAKUMAN_DEX]);

export const emptyDex = (): DexRecord => ({ xz: {}, rc: {} });

/** 从存储里读出来的东西不可信：形状不对的丢掉，次数不是正整数的那一项丢掉 */
export function parseDex(raw: unknown): DexRecord {
  const out = emptyDex();
  if (typeof raw !== 'object' || raw === null) return out;
  const last = (raw as Record<string, unknown>).last;
  if (typeof last === 'string' && last) out.last = last;
  const fresh = (raw as Record<string, unknown>).fresh;
  if (Array.isArray(fresh)) {
    const ok = fresh.filter((f): f is string => typeof f === 'string' && /^(xz|rc):.+/.test(f));
    // 只留确实收集过的：次数被清掉或坏掉的那一项，"新"也没有意义（下面读完 xz / rc 再筛）
    if (ok.length) out.fresh = [...new Set(ok)];
  }
  for (const k of ['xz', 'rc'] as const) {
    const part = (raw as Record<string, unknown>)[k];
    if (typeof part !== 'object' || part === null || Array.isArray(part)) continue;
    for (const [id, n] of Object.entries(part)) if (typeof n === 'number' && Number.isInteger(n) && n > 0) out[k][id] = n;
  }
  if (out.fresh) {
    const keep = out.fresh.filter((f) => (out[f.slice(0, 2) as DexVariant][f.slice(3)] ?? 0) > 0);
    if (keep.length) out.fresh = keep;
    else delete out.fresh;
  }
  return out;
}

/**
 * 这一手和牌后哪些是第一次和出来的（图鉴里从 0 变 1）："玩法:id"，按图鉴顺序。
 * 再和一次的、本来就和过的都不算；一手和出好几样新的，全部返回（提示合成一条）
 */
export function dexNewIds(before: DexRecord, after: DexRecord): string[] {
  const out: string[] = [];
  for (const k of ['xz', 'rc'] as const) {
    for (const id of dexIds(k)) if ((before[k][id] ?? 0) === 0 && (after[k][id] ?? 0) > 0) out.push(`${k}:${id}`);
  }
  return out;
}

/** 把新收集的记进 fresh（去重、不改传进来的）；没有新的原样返回 */
export function dexAddFresh(record: DexRecord, ids: readonly string[]): DexRecord {
  if (!ids.length) return record;
  return { ...record, fresh: [...new Set([...(record.fresh ?? []), ...ids])] };
}

/** 某个玩法的图鉴页看过了：清掉那个玩法的"新"，另一个玩法的留着；没有可清的原样返回 */
export function dexMarkSeen(record: DexRecord, variant: DexVariant): DexRecord {
  const left = (record.fresh ?? []).filter((f) => !f.startsWith(`${variant}:`));
  if (left.length === (record.fresh ?? []).length) return record;
  const { fresh: _old, ...rest } = record;
  return left.length ? { ...rest, fresh: left } : rest;
}

/** 新收集的提示文字：三样以内全写出来，更多的写前两样加"等 N 样" */
export function dexToastText(names: readonly string[]): string {
  const n = names.length;
  return `图鉴 +${n}：${n <= 3 ? names.join('、') : `${names.slice(0, 2).join('、')}等 ${n} 样`}`;
}

/**
 * 这一步里自己和牌的标识：这一场的号（单机存档号 / 房间码）+ 第几局 + 牌墙余量 + 每个和牌的牌和点炮者。
 * 都是刷新后不变的信息；这一步没有自己的和牌返回 null
 */
export function dexKey(scope: string, v: { round?: number; wind?: number; hand?: number; honba?: number; wall: number }, events: readonly (XzEvent | RcEvent)[], seat: number | null): string | null {
  if (seat === null) return null;
  const wins = events.filter((e) => (e.e === 'hu' || e.e === 'win') && e.seat === seat).map((e) => `${(e as { tile: number }).tile}.${(e as { from: number | null }).from ?? 'z'}`);
  if (!wins.length) return null;
  return [scope, v.round ?? `${v.wind}-${v.hand}-${v.honba}`, v.wall, seat, ...wins].join('|');
}

/** 这一步里自己和出来的番型 / 役各 +1，返回新记录（不改传进来的）；旁观（seat 为 null）不记 */
export function dexFromEvents(record: DexRecord, events: readonly (XzEvent | RcEvent)[], seat: number | null): DexRecord {
  if (seat === null) return record;
  const next: DexRecord = { xz: { ...record.xz }, rc: { ...record.rc } };
  let hit = false;
  const add = (k: DexVariant, id: string): void => {
    next[k][id] = (next[k][id] ?? 0) + 1;
    hit = true;
  };
  for (const e of events) {
    if (e.e === 'hu' && e.seat === seat) {
      for (const it of e.items) add('xz', it.id);
    } else if (e.e === 'win' && e.seat === seat) {
      // 三种役牌、两种风合成一行：一手牌里有几个也只算和过一次（按"这一手和出了什么"数，不按张数）
      const ids = new Set(e.score.yaku.map((y) => RC_ALIAS[y.id] ?? y.id));
      for (const id of ids) add('rc', id);
    }
  }
  return hit ? next : record;
}

/** 收集进度：和过的有几种 / 一共几种（只数图鉴列出的，宝牌这类附加项不算） */
export function dexProgress(record: DexRecord, variant: DexVariant): { got: number; total: number } {
  const ids = dexIds(variant);
  return { got: ids.filter((id) => (record[variant][id] ?? 0) > 0).length, total: ids.length };
}
