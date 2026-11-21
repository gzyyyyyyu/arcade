import type { SkillKind, TroopKind } from '../core/types.ts';
import type { SkillDef, TroopDef, TroopLevel } from './defs.ts';

function lv(base: Omit<TroopLevel, 'hp' | 'dmg'> & { hp: number; dmg: number }, hpPct: number, dmgPct: number): TroopLevel[] {
  const out: TroopLevel[] = [];
  for (let l = 1; l <= 8; l++) {
    out.push({
      ...base,
      hp: Math.floor((base.hp * (100 + hpPct * (l - 1))) / 100),
      dmg: Math.floor((base.dmg * (100 + dmgPct * (l - 1))) / 100),
      cost: Math.floor((base.cost * (100 + 10 * (l - 1))) / 100),
    });
  }
  return out;
}

/**
 * 盾兵的盾（DESIGN 14）：正面 ±60° 来的直射只吃 frontPct%；身后 coverRadius 单位内、
 * 同在盾正面覆盖里的友军，每发直射少吃 coverCutPct%（每发只算一层）。守岛里的盾兵只用 frontPct（挡枪和炮的单体伤害）。
 */
export const SHIELD = { frontPct: 35, coverRadius: 150, coverCutPct: 30 } as const;

export const TROOPS: Record<TroopKind, TroopDef> = {
  sailor: {
    name: '水手',
    aim: 'nearest',
    housing: 1,
    unlockHq: 1,
    desc: '近战，便宜，找最近的建筑砍。',
    levels: lv({ hp: 110, dmg: 12, range: 0.8, speed: 1.6, reload: 20, cost: 8 }, 14, 14),
  },
  gunner: {
    name: '火枪手',
    aim: 'nearest',
    housing: 1,
    unlockHq: 1,
    desc: '远程 4 格，血薄，躲在后面打。',
    levels: lv({ hp: 55, dmg: 14, range: 4, speed: 1.5, reload: 28, cost: 12 }, 14, 14),
  },
  brute: {
    name: '壮汉',
    aim: 'defense',
    housing: 4,
    unlockHq: 3,
    desc: '血厚，专找防御建筑打，给后面的兵挡炮。',
    levels: lv({ hp: 520, dmg: 28, range: 0.9, speed: 1.2, reload: 40, cost: 45 }, 14, 14),
  },
  bomber: {
    name: '炸药兵',
    aim: 'wallFirst',
    housing: 2,
    unlockHq: 4,
    desc: '抱着炸药桶冲向建筑，大范围爆炸，炸完就没了。',
    levels: lv({ hp: 50, dmg: 220, range: 0.8, speed: 2, reload: 1, cost: 25, splash: 1.4 }, 12, 16),
  },
  captain: {
    name: '船长',
    aim: 'nearest',
    housing: 1,
    unlockHq: 5,
    desc: '英雄：血厚、伤害高，一场只带一个。',
    levels: lv({ hp: 1100, dmg: 55, range: 1.2, speed: 1.5, reload: 28, cost: 140 }, 14, 14),
  },
  medic: {
    name: '船医',
    aim: 'heal',
    housing: 2,
    unlockHq: 8,
    desc: '不打建筑，跟在大队后面给附近的兵回血。',
    levels: lv({ hp: 70, dmg: 16, range: 3, speed: 1.6, reload: 20, cost: 40 }, 14, 16),
  },
  cannoneer: {
    name: '火炮兵',
    aim: 'defense',
    housing: 3,
    unlockHq: 8,
    desc: '只打建筑，专打防御塔，射程很远，开火慢，伤害高。',
    levels: lv({ hp: 80, dmg: 90, range: 8, speed: 1.2, reload: 70, cost: 45 }, 14, 16),
  },
  harpooner: {
    name: '鱼叉手',
    aim: 'defense',
    housing: 1,
    unlockHq: 7,
    desc: '射得快，专找防御建筑打，血薄。',
    levels: lv({ hp: 45, dmg: 22, range: 5, speed: 1.6, reload: 14, cost: 18 }, 14, 16),
  },
  shield: {
    name: '盾兵',
    aim: 'defense',
    housing: 3,
    unlockHq: 7,
    desc: '举着大盾走在前面，正面来的炮弹、子弹只吃三成半，身后的友军也能躲一点。盾挡不住溅射和抛射（臼炮、喷火、火箭、震荡炮），被震晕时盾也放下。',
    // 血是同级壮汉的 80%，走得慢、伤害低；盾朝走的方向，打建筑时朝目标（DESIGN 14）
    levels: lv({ hp: 416, dmg: 18, range: 0.9, speed: 1.0, reload: 40, cost: 42 }, 14, 14),
  },
  grenadier: {
    name: '掷弹兵',
    aim: 'cluster',
    housing: 2,
    unlockHq: 6,
    desc: '隔着城墙往里扔手雷，一炸一小片；炸到城墙只算三成。血薄、走得慢，怕喷火和火箭。',
    // 射程 4.5 格、2.5 秒一发、1.2 格溅射；血 = 火枪手的一倍半（DESIGN 13）
    levels: lv({ hp: 82, dmg: 34, range: 4.5, speed: 1.3, reload: 50, cost: 26, splash: 1.2 }, 14, 16),
  },
};

export const TROOP_KINDS = Object.keys(TROOPS) as TroopKind[];

function skillLevels(f: (l: number) => { energy: number; dmg?: number; radius: number; heal?: number; duration?: number }) {
  return [1, 2, 3, 4, 5, 6, 7, 8].map(f);
}

export const SKILLS: Record<SkillKind, SkillDef> = {
  barrage: {
    name: '炮击',
    unlockHq: 1,
    desc: '旗舰对一小片地方开炮，只伤建筑。',
    levels: skillLevels((l) => ({ energy: 4, dmg: Math.floor((150 * (100 + 18 * (l - 1))) / 100), radius: 2.2 })),
  },
  flare: {
    name: '信号弹',
    unlockHq: 2,
    desc: '标记一座建筑，活着的兵都先去打它。',
    levels: skillLevels((l) => ({ energy: 3, radius: 3, duration: 160 + 20 * (l - 1) })),
  },
  medkit: {
    name: '补给桶',
    unlockHq: 5,
    desc: '一片范围里的兵慢慢回血。',
    levels: skillLevels((l) => ({ energy: 4, radius: 3, heal: Math.floor((30 * (100 + 20 * (l - 1))) / 100), duration: 100 })),
  },
};

export const SKILL_KINDS = Object.keys(SKILLS) as SkillKind[];
