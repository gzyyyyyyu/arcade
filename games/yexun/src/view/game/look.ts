/**
 * 一件法器在界面上叫什么、用哪个图标：进化了用进化名，合成了（合成的主件）用合成名，初成的带「·初成」。
 * HUD、暂停、结算都从这里取，免得各写一套。
 */
import { MERGES, WEAPONS } from '../../content/weapons.ts';
import type { OwnedWeapon, World } from '../../core/index.ts';

export function weaponLook(w: World, o: OwnedWeapon): { icon: string; name: string; half?: boolean } {
  const m = MERGES.find((x) => x.a === o.id && w.merges.includes(x.id));
  // 规则 63 的初成：名字后面带「·初成」，图标那边按 half 加虚线框和「初」角标
  if (m) return w.mergeHalf.includes(m.id) ? { icon: m.icon, name: `${m.name}·初成`, half: true } : { icon: m.icon, name: m.name };
  const def = WEAPONS[o.id];
  if (o.evolved && def.evolve) return { icon: def.evolve.icon, name: def.evolve.name };
  return { icon: def.icon, name: def.name };
}
