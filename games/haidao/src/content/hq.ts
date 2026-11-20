import type { HqLevel } from './defs.ts';
import { BUILDINGS } from './buildings.ts';

const STARS = [0, 3, 7, 11, 16, 21, 27, 36];
const ENERGY = [6, 7, 8, 10, 12, 14, 16, 18];
/** 岛扩几圈：名额折成占地（size² × 数量 + 装饰）在 22×22 上 7 级 79%、8 级 96%，扩到 24×24、26×26 后约 67%、68%，留得出路 */
const EXT = [0, 0, 0, 0, 0, 1, 1, 2];

/** 各级主寨同类建筑名额（没写的 = 0）。震荡炮 shock 5 级 1 座、7 级 2 座（DESIGN 13）；狙击塔 sniper 6–7 级 1 座、8 级 2 座（DESIGN 14）。宝藏箱 treasure 1 / 4 / 7 级各加一个：每多一个箱子多一个要守的点，主寨高了塔也多，守得过来 */
const LIMITS: HqLevel['limits'][] = [
  { hq: 1, goldmine: 1, sawmill: 1, vault: 1, woodyard: 1, cannon: 2, gunTower: 1, statue: 1, flagpole: 1, chest: 1, wheel: 1, windmill: 1, lighthouse: 1, bonfire: 1, lookout: 1, treasure: 1, palm: 10, rock: 6 },
  { hq: 1, goldmine: 2, sawmill: 2, vault: 1, woodyard: 1, dock: 1, cannon: 2, gunTower: 2, mine: 4, wall: 10, statue: 1, flagpole: 1, chest: 1, wheel: 1, windmill: 1, lighthouse: 1, bonfire: 1, lookout: 1, treasure: 1, palm: 10, rock: 6 },
  { hq: 1, goldmine: 2, sawmill: 2, vault: 2, woodyard: 2, dock: 1, cannon: 3, gunTower: 2, mortar: 1, mine: 6, wall: 20, statue: 1, flagpole: 1, chest: 1, wheel: 1, windmill: 1, lighthouse: 1, bonfire: 1, lookout: 1, treasure: 1, palm: 10, rock: 6 },
  { hq: 1, goldmine: 3, sawmill: 3, vault: 2, woodyard: 2, dock: 1, armory: 1, cannon: 3, gunTower: 3, mortar: 1, mine: 8, wall: 30, statue: 1, flagpole: 1, chest: 1, wheel: 1, windmill: 1, lighthouse: 1, bonfire: 1, lookout: 1, treasure: 2, palm: 10, rock: 6 },
  { hq: 1, goldmine: 3, sawmill: 3, vault: 3, woodyard: 3, dock: 1, armory: 1, cannon: 4, gunTower: 4, mortar: 2, mine: 10, shock: 1, wall: 40, statue: 1, flagpole: 1, chest: 1, wheel: 1, windmill: 1, lighthouse: 1, bonfire: 1, lookout: 1, treasure: 2, palm: 10, rock: 6 },
  { hq: 1, goldmine: 4, sawmill: 4, vault: 3, woodyard: 3, dock: 1, armory: 1, cannon: 5, gunTower: 4, mortar: 2, mine: 12, flame: 2, shock: 1, sniper: 1, wall: 50, statue: 1, flagpole: 1, chest: 1, wheel: 1, windmill: 1, lighthouse: 1, bonfire: 1, lookout: 1, treasure: 2, palm: 10, rock: 6 },
  { hq: 1, goldmine: 5, sawmill: 5, vault: 4, woodyard: 4, dock: 1, armory: 1, cannon: 6, gunTower: 5, mortar: 3, mine: 14, flame: 3, harpoon: 2, rocket: 1, shock: 2, sniper: 1, wall: 55, statue: 1, flagpole: 1, chest: 1, wheel: 1, windmill: 1, lighthouse: 1, bonfire: 1, lookout: 1, treasure: 3, palm: 10, rock: 6 },
  { hq: 1, goldmine: 6, sawmill: 6, vault: 5, woodyard: 5, dock: 1, armory: 1, cannon: 7, gunTower: 6, mortar: 4, mine: 16, flame: 4, harpoon: 3, rocket: 2, tar: 8, shock: 2, sniper: 2, wall: 60, statue: 1, flagpole: 1, chest: 1, wheel: 1, windmill: 1, lighthouse: 1, bonfire: 1, lookout: 1, treasure: 3, palm: 10, rock: 6 },
];

export const HQ_LEVELS: HqLevel[] = STARS.map((needStars, i) => ({
  level: i + 1,
  needStars,
  cost: BUILDINGS.hq.levels[i]?.cost ?? { gold: 0, wood: 0 },
  limits: LIMITS[i] ?? {},
  energy: ENERGY[i] ?? 0,
  ext: EXT[i] ?? 0,
}));
