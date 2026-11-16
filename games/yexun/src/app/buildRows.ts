import { SCHOOL_IDS, SCHOOLS } from '../content/guide.ts';
import { ELEMENT_SET, MERGES, PASSIVE_IDS, PASSIVES, SCHOOL_SETS, TYPE_SETS, WEAPONS } from '../content/weapons.ts';
import type { OwnedWeapon, World } from '../core/index.ts';
import { weaponLook } from '../view/game/look.ts';
import { upgradeNeed } from '../view/ui/mergeHint.ts';
import type { BuildRow } from '../view/ui/screens.ts';

/** 进化还差什么（13.4：卡片和暂停页写清"还差哪个被动"） */
export function evolveHint(w: World, o: OwnedWeapon): string | undefined {
  const evo = WEAPONS[o.id].evolve;
  if (!evo || o.evolved) return undefined;
  const has = (w.passives[evo.with] ?? 0) > 0;
  const p = PASSIVES[evo.with].name;
  if (o.level >= 8) return has ? `下个宝箱进化成${evo.name}` : `还差${p}就能进化`;
  return `满级 + ${p}${has ? '（已有）' : ''} → ${evo.name}`;
}

/** 凑成的套装，写成"剑 2 件 · 暴击 +8%"；流派套件（"阵法·3"）写成"阵法 3 件 · …" */
export function setLines(w: World): string[] {
  return w.sets.map((s) => {
    if (s.includes('·')) {
      const [name, n] = s.split('·') as [string, string];
      const id = SCHOOL_IDS.find((x) => SCHOOLS[x].name === name);
      const desc = id && id in SCHOOL_SETS ? SCHOOL_SETS[id as keyof typeof SCHOOL_SETS][Number(n) - 2] : '';
      return `${name} ${n} 件 · ${desc}`;
    }
    const k = s.slice(0, -1);
    const n = Number(s.slice(-1));
    const desc = k in TYPE_SETS ? TYPE_SETS[k as keyof typeof TYPE_SETS][n - 2] : ELEMENT_SET[n - 2];
    return `${k} ${n} 件 · ${desc}`;
  });
}

/** 规则 63 的初成：这件是哪个初成搭配的主件，就写升大成还差什么（只差练满时写成「再把 X、Y 练满升大成」） */
function upgradeHint(w: World, o: OwnedWeapon): string | undefined {
  const m = MERGES.find((x) => x.a === o.id && w.mergeHalf.includes(x.id));
  if (!m) return undefined;
  const left = upgradeNeed(w, m);
  if (left.length === 0) return '下个宝箱升大成';
  const full = '满级';
  if (left.every((x) => x.endsWith(full))) return `再把 ${left.map((x) => x.slice(0, -full.length)).join('、')} 练满升大成`;
  return `还差 ${left.join('、')} 升大成`;
}

/** 暂停页和结算页的"本局法器"行：法器加被动 */
export const buildRows = (w: World): BuildRow[] => [
  ...w.weapons.map((o) => ({ ...weaponLook(w, o), level: o.evolved ? 9 : o.level, dmg: o.dmg, kills: o.kills, hint: upgradeHint(w, o) ?? evolveHint(w, o) })),
  ...PASSIVE_IDS.filter((id) => w.passives[id] !== undefined).map((id) => ({ icon: PASSIVES[id].icon, name: PASSIVES[id].name, level: w.passives[id]!, dmg: -1, kills: 0 })),
];
