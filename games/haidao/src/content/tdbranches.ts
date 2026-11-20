/**
 * 守岛里塔的分叉怎么算：分叉 id、名字和选法沿用 branches.ts（基地上选的分叉原样带进守岛），
 * 效果按守岛自己的一套解释。登陆战和攻防快照继续只读 branches.ts，这里改什么都碰不到攻防。
 * 和 branches.ts 的区别只有三处：
 * - 没有"穿甲"和"能打飞的"开关：打不打得动、打不打得到全看 core/td2types.ts 的克制表（例外写在 TD_BRANCH_DAMAGE）；
 * - 加农炮"穿甲弹"改成"对重甲再加伤害"（heavyPct）；
 * - 火箭"高射"能打飞禽（TD_BRANCH_DAMAGE 的 airPct），说明跟着改。
 */
import { BRANCHES } from './branches.ts';
import type { BranchMod } from '../core/tdtypes.ts';

/** 守岛里分叉的效果：BranchMod 去掉穿甲和防空开关，加上"对重甲再多几成" */
export type TdBranchMod = Omit<BranchMod, 'pierce' | 'antiAir'> & {
  /** 打重甲时伤害倍率再加多少个百分点（加在克制表的倍率上） */
  heavyPct?: number;
};

/** 守岛和基地写法不同的分叉：效果和说明 */
const OVERRIDE: Readonly<Record<string, { mod: TdBranchMod; desc: string }>> = {
  'cannon.pierce': { mod: { heavyPct: 30, dmgPct: 10 }, desc: '打重甲再加三成' },
  'sniper.pierce': { mod: { heavyPct: 50, dmgPct: 10 }, desc: '打重甲不再减半' },
  'rocket.flak': { mod: { airFirst: true, dmgPct: 25 }, desc: '能打鹦鹉，先打鹦鹉' },
};

function strip(m: BranchMod): TdBranchMod {
  const { pierce: _p, antiAir: _a, ...rest } = m;
  void _p;
  void _a;
  return rest;
}

/** 分叉 id → 守岛里的效果 */
export const TD_BRANCH_MOD: ReadonlyMap<string, TdBranchMod> = new Map(BRANCHES.map((b) => [b.id, OVERRIDE[b.id]?.mod ?? strip(b.mod)]));

/** 分叉 id → 守岛里的说明（界面在守岛的分叉卡上显示这一句，基地里仍显示 branches.ts 的 desc） */
export const TD_BRANCH_DESC: ReadonlyMap<string, string> = new Map(BRANCHES.map((b) => [b.id, OVERRIDE[b.id]?.desc ?? b.desc]));
