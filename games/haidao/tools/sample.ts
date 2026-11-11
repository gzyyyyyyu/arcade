/** 模拟和测试共用：某个主寨等级下"典型玩家"的部队（船坞升到相应等级、船队按等级编成、研究跟上） */
import { BUILDINGS, HQ_LEVELS, SKILLS, TROOPS, armyFor, hasBranches, newProfile, presetLayout } from '../src/core/index.ts';
import type { ArmySetup, BuildingKind, Placed, PresetStyle, Profile, SkillKind, TroopKind } from '../src/core/index.ts';
import { branchOptions } from '../src/content/branches.ts';

const FLEET: Record<number, TroopKind[]> = {
  1: ['sailor', 'gunner'],
  2: ['sailor', 'sailor', 'gunner'],
  3: ['brute', 'sailor', 'gunner', 'sailor'],
  4: ['brute', 'brute', 'gunner', 'bomber', 'sailor'],
  5: ['brute', 'brute', 'captain', 'gunner', 'bomber'],
  6: ['brute', 'brute', 'captain', 'gunner', 'gunner', 'bomber'],
  7: ['brute', 'brute', 'captain', 'harpooner', 'sailor', 'bomber'],
  8: ['brute', 'brute', 'captain', 'cannoneer', 'medic', 'sailor', 'bomber'],
};
/** 该主寨等级的典型船队编成 */
export function fleetFor(hq: number): TroopKind[] {
  return FLEET[hq] ?? FLEET[1] ?? [];
}

const RESEARCH = [1, 1, 1, 2, 3, 4, 5, 6];

export function sampleProfile(hq: number): Profile {
  const p = newProfile();
  const buildings = p.base.buildings.map((b) => (b.kind === 'hq' ? { ...b, level: hq } : b));
  let nextId = p.base.nextId;
  if (hq >= 2) buildings.push({ id: nextId++, kind: 'dock', level: hq, x: 0, y: 9 });
  const lv = RESEARCH[hq - 1] ?? 1;
  const research: Profile['research'] = { sailor: lv, gunner: lv, brute: lv, bomber: lv, captain: lv, harpooner: lv, cannoneer: lv, medic: lv, barrage: lv, flare: lv, medkit: lv };
  return { ...p, base: { buildings, nextId }, boats: (FLEET[hq] ?? FLEET[1] ?? []).map((troop) => ({ troop })), research };
}

export function sampleArmy(hq: number): ArmySetup {
  return armyFor(sampleProfile(hq));
}

/**
 * 典型满配的岛（DESIGN 10.6 配平口径）：这个主寨等级每种建筑按名额摆满、等级拉到 min(主寨, 上限)，装饰不摆，
 * 再用推荐布局 style 重摆。td = true 时带上宝藏箱（名额摆满）、确定性的分叉（同种塔按顺序轮流选）和英雄研究（等于主寨，没有军械所就是 1 级）；
 * td = false 是规则版本 5 时的样子（没有宝藏箱、分叉、英雄）。
 * shock = true 才摆震荡炮（规则版本 10 的新建筑）、sniper = true 才摆狙击塔（规则版本 11 的新建筑）：默认不摆，老的金标准、配平口径的布局逐格不变。
 */
export function fullBase(hq: number, style: PresetStyle, td: boolean, shock = false, sniper = false): Profile {
  const p = sampleProfile(hq);
  const limits = HQ_LEVELS[hq - 1]?.limits ?? {};
  const buildings: Placed[] = [{ id: 1, kind: 'hq', level: hq, x: 0, y: 0 }];
  const nth = new Map<string, number>();
  for (const [k, n] of Object.entries(limits) as [BuildingKind, number][]) {
    if (k === 'hq' || BUILDINGS[k].category === 'deco') continue;
    if (k === 'treasure' && !td) continue;
    if (k === 'shock' && !shock) continue;
    if (k === 'sniper' && !sniper) continue;
    const level = Math.min(hq, BUILDINGS[k].maxLevel);
    for (let i = 0; i < n; i++) {
      const b: Placed = { id: buildings.length + 1, kind: k, level, x: 0, y: 0 };
      if (td && hasBranches(k)) {
        const j = nth.get(k) ?? 0;
        nth.set(k, j + 1);
        const branch: string[] = [];
        const t1 = branchOptions(k, 1);
        const t2 = branchOptions(k, 2);
        if (level >= 3 && t1.length > 0) branch.push(t1[j % t1.length]!.id);
        if (level >= 6 && t2.length > 0) branch.push(t2[j % t2.length]!.id);
        if (branch.length > 0) b.branch = branch;
      }
      buildings.push(b);
    }
  }
  // 只留这个主寨等级开放了的研究（快照校验 validateBase 会拒收没开放的）
  const research: Profile['research'] = {};
  for (const [k, v] of Object.entries(p.research)) {
    const def = k in TROOPS ? TROOPS[k as TroopKind] : SKILLS[k as SkillKind];
    if (def && def.unlockHq <= hq) research[k as TroopKind] = v;
  }
  if (td && buildings.some((b) => b.kind === 'armory')) research.hero = hq;
  const base: Profile = { ...p, base: { buildings, nextId: buildings.length + 1 }, research };
  return { ...base, base: { ...base.base, buildings: presetLayout(base, style) } };
}
