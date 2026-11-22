/**
 * 角色的法器池（2.0，所有者 11-01）：每个角色只会在升级三选一、宝箱、合成 / 双修里碰到自己池里的法器和被动，
 * 池里有 2–3 个主修流派的完整成套件加几件跨流派的搭配件。这样新法器不会稀释老流派，每个角色的卡池也更像这个角色。
 * 池由「主修流派的单子（content/guide.ts）+ 几件跨流派的搭配件」算出来：被动 = 池里每件法器的进化被动 + 主修流派要的被动 + 仙桃、朱砂。
 * 实盘局和娱乐局一样按池抽。
 */
import { CHARACTER_IDS, type CharacterId } from './meta.ts';
import { SCHOOLS, type SchoolId } from './guide.ts';
import { WEAPONS, type PassiveId, type WeaponId } from './weapons.ts';

export interface CharacterPool {
  /** 主修流派（2–3 个） */
  schools: SchoolId[];
  weapons: WeaponId[];
  passives: PassiveId[];
}

/** 每个角色：起手法器、主修流派、几件跨流派的搭配件（包括专属搭配的料） */
const SPEC: Record<CharacterId, { start: WeaponId; schools: SchoolId[]; extra: WeaponId[] }> = {
  // 近战成长：剑修 + 五雷；阴律斩要判官笔，引魂鹤铃要纸鹤
  xiaodao: { start: 'sword', schools: ['sword', 'wood'], extra: ['brush', 'crane', 'mirror', 'shield', 'tide'] },
  // 远程连发：符箓 + 烈火；买路符钱要铜钱镖
  fushi: { start: 'talisman', schools: ['talisman', 'fire'], extra: ['dart', 'coins', 'bell'] },
  // 近战走位：剑修 + 水府；一苇渡江要竹篙（水府单子里有）
  jianxia: { start: 'flysword', schools: ['sword', 'water'], extra: ['brush', 'dart', 'abacus', 'shield'] },
  // 肉盾：镇守 + 阵法；晨钟暮鼓要阵旗
  pang: { start: 'bell', schools: ['ward', 'array'], extra: ['thunder', 'crane', 'talisman', 'petals', 'spring', 'gourd'] },
  // 控场：镇守 + 烈火；爆竹驱年要鞭炮
  gengfu: { start: 'shield', schools: ['ward', 'fire'], extra: ['crane'] },
  // 续航辅助：五雷 + 纸兵；花灯会要长明灯
  caiyao: { start: 'petals', schools: ['wood', 'paper'], extra: ['lamp', 'crane', 'shield', 'mirror', 'spring'] },
  // 召唤：纸兵 + 幽冥；阴兵借道要招魂幡
  zhijiang: { start: 'zhibing', schools: ['paper', 'ghost'], extra: ['thunder', 'shield', 'flag'] },
  // 走位控场：水府 + 阵法；渡魂灯要竹篙 + 长明灯
  baidu: { start: 'pole', schools: ['water', 'array'], extra: ['lamp', 'bell', 'coins'] },
  // 经济：聚财 + 符箓；财源滚滚要铜钱镖 + 算盘
  huolang: { start: 'dart', schools: ['wealth', 'talisman'], extra: ['bell', 'mirror', 'gourd', 'petals'] },
  // 陷阱控制：阵法 + 幽冥；两仪阵要阵旗 + 八卦镜
  yinyang: { start: 'flag', schools: ['array', 'ghost'], extra: ['thunder', 'gourd', 'zhibing'] },
};

/*
 * 搭配件的来由（DESIGN 3.3e）：池里没人拿、对这个角色也凑不出东西的件换成能合上搭配的，或者干脆拿掉。
 * 剑侠加金钟罩（鹤翼金身、乾坤护阵），铜钱镖、判官笔有新搭配，算盘留着（拿走就只剩货郎一个池）；胖师叔拿符咒（铃符、符火燎原）；
 * 采药女拿寒泉（雷雨）；货郎拿火葫芦（符火燎原、铃焰）；纸匠不拿长明灯（已有 15 个搭配）；阴阳先生拿火葫芦（铃焰、火五行套）。
 * 小道士拿龙王令（笔走龙蛇剑侠、小道士共享；他九成的局有判官笔，只差这一件）。
 * 试过采药女加勾魂锁（雷劫锁魂）：她的花灯会 69% → 62%，过了「专属掉 1 个点就不做」的止损线，没加
 */

function build(id: CharacterId, extra: readonly WeaponId[]): CharacterPool {
  const { start, schools } = SPEC[id];
  const weapons: WeaponId[] = [start];
  for (const s of schools) for (const w of SCHOOLS[s].weapons) if (!weapons.includes(w)) weapons.push(w);
  for (const w of extra) if (!weapons.includes(w)) weapons.push(w);
  const passives: PassiveId[] = [];
  const add = (p: PassiveId): void => {
    if (!passives.includes(p)) passives.push(p);
  };
  for (const w of weapons) {
    const evo = WEAPONS[w].evolve;
    if (evo) add(evo.with);
  }
  for (const s of schools) for (const p of SCHOOLS[s].passives) add(p);
  add('xiantao');
  add('zhusha');
  return { schools, weapons, passives };
}

/** 每个角色的池（界面、图鉴、可达性、局内抽卡都按它） */
export const CHARACTER_POOLS = Object.fromEntries(CHARACTER_IDS.map((id) => [id, build(id, SPEC[id].extra)])) as Record<CharacterId, CharacterPool>;

/** 起手法器（和 meta.ts CHARACTERS[id].start 一致，测试锁住；新角色在 meta 里还没有时用这里的） */
export const POOL_START: Record<CharacterId, WeaponId> = Object.fromEntries(CHARACTER_IDS.map((id) => [id, SPEC[id].start])) as Record<CharacterId, WeaponId>;

const SETS: Record<string, { w: Set<string>; p: Set<string> }> = Object.fromEntries(
  CHARACTER_IDS.map((id) => [id, { w: new Set<string>(CHARACTER_POOLS[id].weapons), p: new Set<string>(CHARACTER_POOLS[id].passives) }]),
);

/** 这个角色的池里有没有这件法器 / 被动（不认识的角色按小道士） */
export function inPool(character: string | undefined, id: string): boolean {
  if (character === 'all') return true;
  const s = SETS[character ?? 'xiaodao'] ?? SETS.xiaodao!;
  return s.w.has(id) || s.p.has(id);
}

// ───────────────────────── 开局配置（所有者 11-06 定 A + B） ─────────────────────────

/** 每个流派的核心件：流派单子上「成型要先有它」的那一件（和机器人路线 tools/bots.ts ROUTES 的第一件一致，测试锁住） */
export const SCHOOL_CORE: Record<SchoolId, WeaponId> = {
  sword: 'sword',
  talisman: 'talisman',
  ward: 'bell',
  wood: 'thunder',
  fire: 'gourd',
  paper: 'zhibing',
  water: 'spring',
  array: 'flag',
  ghost: 'banner',
  wealth: 'dart',
};

/** 角色的两个主修流派 */
export const mainSchools = (id: CharacterId): readonly SchoolId[] => SPEC[id].schools;

/** 起手件所在的主修流派之外的那个（「另一主修」）：起手件所在流派先按核心件、再按流派单子找，都找不到或两个都有按 SPEC 里排第一的 */
export function altSchool(id: CharacterId): SchoolId {
  const { start, schools } = SPEC[id];
  const own = schools.find((s) => SCHOOL_CORE[s] === start) ?? schools.find((s) => SCHOOLS[s].weapons.includes(start)) ?? schools[0]!;
  return schools.find((s) => s !== own) ?? own;
}

/**
 * 换掉的第二件起手：按规则选出来的核心件单拿开不了局（招魂幡不出伤害、雷符前期顶不住，
 * 0.19.0 实盘雪原中档普通机器人胜率只有正常起手的零头），换成另一主修流派单子里胜率最接近正常起手的那件（量法见 DESIGN 3.7）。
 * `npm run sim:starts` 守着：每个角色两件起手，第二件的胜率不低于正常起手的一半
 */
export const ALT_START_FIX: Partial<Record<CharacterId, WeaponId>> = {
  // 实盘雪原中档、普通机器人、心法带另一主修，100 局胜率；正常起手（同样带心法）：小道士桃木剑 88%、纸匠纸兵 80%、阴阳先生阵旗 95%
  xiaodao: 'petals', // 雷符 43%；花瓣 83%、符咒 94%
  zhijiang: 'bell', // 招魂幡 13%；镇魂铃 90%、判官笔 31%、勾魂锁 32%
  yinyang: 'bell', // 招魂幡 4%；镇魂铃 98%、判官笔 18%、勾魂锁 23%
};

/** A：第二件起手法器 = 另一主修流派的核心件（主线 11-06：按规则定，不逐个手挑），个别换掉（ALT_START_FIX） */
export function altStart(id: CharacterId): WeaponId {
  return ALT_START_FIX[id] ?? SCHOOL_CORE[altSchool(id)];
}

/** B：心法让这个流派单子上的法器和被动在升级三选一里权重 ×XINFA_MUL，再保底一张这个流派的卡（core/step.ts guarantee），外加一条特色（content/xinfa.ts） */
export const XINFA_MUL = 1.5;
