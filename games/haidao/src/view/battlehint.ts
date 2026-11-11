/**
 * 登陆战里「第一次见到某种防御」的提示（纯函数，不依赖 Phaser / DOM；画面在 funui.ts 的 defenseHint）。
 * 哪些防御算新的、提示几个、写什么都在这里，数字（射程等）读内容表，不写死。
 * 已见过的记在本地存储 haidao.hint.defense（JSON 数组），tests/battlehint.test.ts 锁住。
 */
import { BUILDINGS } from '../content/index.ts';
import type { BuildingKind } from '../core/types.ts';

export const DEFENSE_KEY = 'haidao.hint.defense';

/** 要提示的防御，按这个固定顺序挑（隐藏的和近身打不到的放前面，先教最容易吃亏的） */
export const HINT_ORDER: readonly BuildingKind[] = ['mine', 'tar', 'mortar', 'flame', 'wall', 'harpoon', 'rocket', 'shock', 'sniper'];
/** 一次最多提示几种，避免弹一串 */
export const HINT_MAX = 2;

const range = (k: BuildingKind): number => BUILDINGS[k].levels[0]?.range ?? 0;

/** 每种一句大白话：它会干什么、怎么对付（≤ 30 字） */
export function hintText(k: BuildingKind): string {
  switch (k) {
    case 'mine':
      return '地雷藏在地里，踩到才炸——先派便宜的兵探路';
    case 'tar':
      return '焦油藏在地里，踩到就变慢——先派便宜的兵探路';
    case 'mortar':
      return `臼炮打得远（${range(k)} 格）、炸一片，近身就打不到——派壮汉贴上去`;
    case 'flame':
      return '喷火塔近身烧一片，别扎堆——先用远程拆它';
    case 'wall':
      return '城墙挡路，兵会绕或砸墙——派炸药兵炸开';
    case 'harpoon':
      return `鱼叉炮射程远（${range(k)} 格）、一发很疼——别让大个子单独冲`;
    case 'rocket':
      return '火箭塔一次打好几个，还带溅射——兵分散着上';
    case 'shock':
      return '震荡炮会把兵震晕——被震的先别管，补兵上';
    case 'sniper':
      return `狙击塔射程最远（${range(k)} 格），专打船长船医——后排躲远点`;
    default:
      return '';
  }
}

/** 这局第一次见到的防御：按固定顺序、最多 max 个；已见过的和没有说明的不出 */
export function newDefenses(kinds: Iterable<BuildingKind>, seen: ReadonlySet<string>, max = HINT_MAX): BuildingKind[] {
  const have = new Set(kinds);
  return HINT_ORDER.filter((k) => have.has(k) && !seen.has(k)).slice(0, max);
}

/** 哪些战斗不弹：首领关（有自己的战前弹层）、机器人代打、回放和异步攻防、寻宝航线、悬赏 */
export function hintAllowed(d: { auto: boolean; pvp?: unknown; map?: unknown; bounty?: boolean }, boss: boolean): boolean {
  return !boss && !d.auto && !d.pvp && !d.map && !d.bounty;
}

/** 读存储里的已见列表：坏数据当空 */
export function parseSeen(raw: string | null): Set<string> {
  try {
    const a: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
