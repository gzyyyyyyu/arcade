/**
 * 首领连战（DESIGN.md 2.5）：按种子抽这一局的构筑和关卡。纯函数、只用 sfc32 的 'rush' 流，同种子同图逐位相同，
 * 所以录像只存种子就能重放，每日挑战同一天全服一样。
 */
import { SCHOOL_IDS, SCHOOLS, type SchoolId } from '../content/guide.ts';
import type { EnemyKind } from '../content/enemies.ts';
import type { MapId } from '../content/maps.ts';
import { RUSH, RUSH_BASIC, RUSH_BUILD, RUSH_MAP_SPECIAL, RUSH_SPECIAL, RUSH_STAGES } from '../content/rush.ts';
import { midBossOf } from '../content/waves.ts';
import { PASSIVES, WEAPONS, type PassiveId, type WeaponId } from '../content/weapons.ts';
import { Rng } from './rng.ts';
import type { World } from './state.ts';

export interface RushPlan {
  school: SchoolId;
  weapons: { id: WeaponId; level: number; evolved: boolean }[];
  passives: { id: PassiveId; level: number }[];
  /** 每一关上场的怪 */
  stages: EnemyKind[][];
  /** 一共几只（结算的 N/M 里的 M） */
  total: number;
}

/** 一局连战的战果（结算、交榜、分享卡都按它）：打倒几只、一共几只、全清没有、用了几拍、正在打的那一关打掉了几成（0–1） */
export interface RushResult {
  down: number;
  total: number;
  cleared: boolean;
  ticks: number;
  progress: number;
}

export function rushResult(w: World): RushResult | null {
  if (!w.rush) return null;
  let hp = 0;
  let max = 0;
  for (let i = 0; i < w.eRush.length; i++) {
    if (!w.eRush[i] || !w.eAlive[i]) continue;
    hp += Math.max(0, w.eHp[i]!);
    max += w.eHpMax[i]!;
  }
  const cleared = w.rushEnd >= 0;
  return { down: w.rushDown, total: w.rush.total, cleared, ticks: cleared ? w.rushEnd : Math.min(w.tick, RUSH.limit), progress: max > 0 ? 1 - hp / max : 0 };
}

export function rushPlan(seed: number, map: MapId): RushPlan {
  const rng = new Rng(seed, 'rush');
  const school = SCHOOL_IDS[rng.int(SCHOOL_IDS.length)]!;
  const sc = SCHOOLS[school];
  const pick2 = (r: readonly [number, number]): number => r[0] + rng.int(r[1] - r[0] + 1);
  // 构筑：流派的前三件（第一件满级、可能进化），有时带第四件；进化就带上它要的被动
  const main = sc.weapons[0]!;
  const evo = WEAPONS[main].evolve;
  const evolved = !!evo && rng.chance(RUSH_BUILD.evolve);
  const weapons: RushPlan['weapons'] = [
    { id: main, level: RUSH_BUILD.main, evolved },
    { id: sc.weapons[1]!, level: pick2(RUSH_BUILD.second), evolved: false },
    { id: sc.weapons[2]!, level: pick2(RUSH_BUILD.third), evolved: false },
  ];
  if (rng.chance(RUSH_BUILD.fourth)) weapons.push({ id: sc.weapons[3]!, level: RUSH_BUILD.fourthLevel, evolved: false });
  const passives: RushPlan['passives'] = [];
  const addPassive = (id: PassiveId): void => {
    if (!passives.some((p) => p.id === id)) passives.push({ id, level: Math.min(PASSIVES[id].max, pick2(RUSH_BUILD.passive)) });
  };
  if (evolved && evo) addPassive(evo.with);
  // 再从流派想要的被动里挑一件（前四件里没拿的抽，免得总是同一件）
  const more = sc.passives.slice(0, 4).filter((id) => !passives.some((p) => p.id === id));
  addPassive(more[rng.int(more.length)]!);
  // 关卡：常规精英按"抽完一轮再重来"抽，少撞车；特色精英优先用这张图自己的
  let bag: EnemyKind[] = [];
  const basic = (): EnemyKind => {
    if (bag.length === 0) bag = [...RUSH_BASIC];
    return bag.splice(rng.int(bag.length), 1)[0]!;
  };
  const own = RUSH_MAP_SPECIAL[map];
  const special = (first: boolean): EnemyKind => (first && own ? own : RUSH_SPECIAL[rng.int(RUSH_SPECIAL.length)]!);
  let firstSpecial = true;
  const stages = RUSH_STAGES.map((st) =>
    st.map((k): EnemyKind => {
      if (k === 'lord') return midBossOf(map);
      if (k === 'boss') return k;
      if (k === 's') {
        const e = special(firstSpecial);
        firstSpecial = false;
        return e;
      }
      return basic();
    }),
  );
  // 第 2、3 关的先后按种子换
  if (rng.chance(0.5)) [stages[1], stages[2]] = [stages[2]!, stages[1]!];
  return { school, weapons, passives, stages, total: stages.reduce((a, s) => a + s.length, 0) };
}
