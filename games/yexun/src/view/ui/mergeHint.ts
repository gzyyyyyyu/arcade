/**
 * 三选一卡片上的合成提示：拿了这张，离某个合成（含双修）只差一步或正好凑成，就在卡上标出来。
 * 老的合成要两件法器各自：在手、升到满级、有进化用的那件被动（都进化后宝箱里合成）；双修（1.1）一件进化、另一件满级就行；规则 55 的早合搭配两件各升到几级就行。
 * 把这些"缺口"数一遍：这张卡补上一个缺口、补完剩 0 个 = "凑成"；剩 1 个 = "再拿 X"。纯函数，单测在 tests/view/merge-hint.test.ts。
 */
import { liveAllows, MAX_WEAPON_LEVEL, MERGE_STAGE, MERGES, mergeFor, PASSIVES, WEAPONS, type MergeDef, type WeaponId } from '../../content/weapons.ts';
import type { Choice, World } from '../../core/index.ts';
import { mergeReach } from '../../content/combos.ts';
import { poolsFor } from '../../content/pools.ts';

export interface MergeHint {
  /** 卡上的短字："凑成 诛邪剑阵！" / "再拿 朱砂 → 诛邪剑阵" */
  text: string;
  /** 凑成了（缺口为 0） */
  ready: boolean;
  id: MergeDef['id'];
  color: string;
  dual: boolean;
  /** 规则 63 的两段式：这张卡推的是哪一段（half 合初成、full 初成升大成）；规则 62 以前没有 */
  stage?: 'half' | 'full';
}

/** 一件法器离"能拿去合成"还缺什么；card 是假设拿了的这张卡 */
function gaps(w: World, id: WeaponId, card: Choice | null): string[] {
  const def = WEAPONS[id];
  const o = w.weapons.find((x) => x.id === id);
  if (o?.evolved) return [];
  const takes = card?.kind === 'weapon' && card.id === id;
  const out: string[] = [];
  if (!o && !takes) out.push(def.name);
  const level = (o?.level ?? 0) + (takes ? 1 : 0);
  if (level < MAX_WEAPON_LEVEL) out.push(`${def.name}满级`);
  const evo = def.evolve;
  if (evo && (w.passives[evo.with] ?? 0) === 0 && !(card?.kind === 'passive' && card.id === evo.with)) out.push(PASSIVES[evo.with].name);
  return out;
}

/** 一件法器离"满级"还缺什么（双修的另一件只要满级） */
function levelGaps(w: World, id: WeaponId, card: Choice | null, lv = MAX_WEAPON_LEVEL): string[] {
  const def = WEAPONS[id];
  const o = w.weapons.find((x) => x.id === id);
  if (o?.evolved) return [];
  const takes = card?.kind === 'weapon' && card.id === id;
  const out: string[] = [];
  if (!o && !takes) out.push(def.name);
  if ((o?.level ?? 0) + (takes ? 1 : 0) < lv) out.push(lv === MAX_WEAPON_LEVEL ? `${def.name}满级` : `${def.name}升到 ${lv} 级`);
  return out;
}

/** 一个合成还缺的：老合成两件都要能进化；双修一件进化、另一件满级，两种搭法取缺得少的 */
function need(w: World, m: MergeDef, card: Choice | null): string[] {
  // 早合的搭配（规则 55、56）：两件各升到 early 级就行，进化了的当然也算；规则 57 起和别的双修一样
  if (m.early && !w.new57) return [...levelGaps(w, m.a, card, m.early), ...levelGaps(w, m.b, card, m.early)];
  if (!m.dual) return [...gaps(w, m.a, card), ...gaps(w, m.b, card)];
  const x = [...gaps(w, m.a, card), ...levelGaps(w, m.b, card)];
  const y = [...levelGaps(w, m.a, card), ...gaps(w, m.b, card)];
  return y.length < x.length ? y : x;
}

/** 规则 63：合初成还缺的（两件各到 MERGE_STAGE.halfLevel 级） */
function needHalf(w: World, m: MergeDef, card: Choice | null): string[] {
  return [...levelGaps(w, m.a, card, MERGE_STAGE.halfLevel), ...levelGaps(w, m.b, card, MERGE_STAGE.halfLevel)];
}

/** 初成升大成还缺的（暂停页、结算页的「再把 X、Y 练满升大成」用） */
export const upgradeNeed = (w: World, m: MergeDef): string[] => need(w, m, null);

export function mergeHint(w: World, card: Choice): MergeHint | null {
  if (card.kind === 'coins') return null;
  let best: { m: MergeDef; left: string[]; stage?: 'half' | 'full' } | null = null;
  // 抽卡按谁的池：模拟器的 --pool（all = 不限池）优先，平时是出战的角色
  const who = w.setup.pool ?? w.setup.character ?? 'xiaodao';
  for (const m of MERGES) {
    // 规则 63：初成的还要提示升大成；没合的提示合初成
    const half = w.mergeHalf.includes(m.id);
    if (w.merges.includes(m.id) && !half) continue;
    // 这个角色合不出的不提示：别人的专属、实盘暂不放的（老卡池）、料或进化被动不在他的法器池里的（content/combos.ts；老卡池不看池）
    if (!mergeFor(m, w.setup.character, (v) => w.contentFrom(v)) || !liveAllows(w.oldPool, m.id)) continue;
    if (!w.oldPool && who !== 'all' && mergeReach(m, who, poolsFor(w.armsCombos)) !== 'ok') continue;
    const stage = half ? 'full' : w.mergeStages ? 'half' : undefined;
    const gap = stage === 'half' ? needHalf : need;
    const before = gap(w, m, null);
    const left = gap(w, m, card);
    // 这张卡得真补上一个缺口，而且补完最多只剩一个
    if (left.length >= before.length || left.length > 1) continue;
    if (!best || left.length < best.left.length) best = { m, left, ...(stage ? { stage } : {}) };
  }
  if (!best) return null;
  const { m, left, stage } = best;
  const tag = stage === 'half' ? '·初成' : stage === 'full' ? '·大成' : '';
  return {
    text: left.length === 0 ? (stage === 'full' ? `${m.name} 升大成！` : `凑成 ${m.name}${tag}！`) : `再拿 ${left[0]} → ${m.name}${tag}`,
    ready: left.length === 0,
    id: m.id,
    color: m.color,
    dual: !!m.dual,
    ...(stage ? { stage } : {}),
  };
}
