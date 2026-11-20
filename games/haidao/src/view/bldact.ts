/**
 * 基地里建筑的标志动作：哪种建筑做什么、什么时候做、摆到什么角度（纯函数，不依赖 Phaser，tests/bldact.test.ts 锁住）。
 * 画面一侧在 basebldfx.ts，只按这里算出来的节奏和角度摆已有的对象、往粒子池里放粒子。
 * 全部按编号错开、由时间算出来，同种建筑不齐步，也不用随机数。
 */
import type { BuildingKind } from '../core/types.ts';

/**
 * 动作种类：
 * - glint：金光一闪，隔几下蹦一枚金币（金矿、金库）；
 * - sparks：铁砧上叮一下溅几颗火星（军械所）；
 * - bubble：坑里冒个泡（焦油池）；
 * - mist：雾灯冒一团紫雾（迷雾塔）；
 * - spin：锯轮转（伐木场，换 4 张烘好的帧）；
 * - swing：吊着的东西来回晃（船坞的货箱、木料场的原木捆）；
 * - patrol：炮管隔一阵转去看另一个方向（会转的防御塔，转法沿用 turret.ts）。
 */
export type BldAct = 'glint' | 'sparks' | 'bubble' | 'mist' | 'spin' | 'swing' | 'patrol';

export const BLD_ACT: Partial<Record<BuildingKind, BldAct>> = {
  goldmine: 'glint',
  vault: 'glint',
  armory: 'sparks',
  tar: 'bubble',
  fogTower: 'mist',
  sawmill: 'spin',
  dock: 'swing',
  woodyard: 'swing',
  cannon: 'patrol',
  gunTower: 'patrol',
  mortar: 'patrol',
  flame: 'patrol',
  harpoon: 'patrol',
  rocket: 'patrol',
  shock: 'patrol',
  sniper: 'patrol',
};

/** 编号散列到 0..1（确定性） */
export function idHash(id: number, salt = 0): number {
  let h = (Math.imul(id | 0, 2654435761) ^ Math.imul(salt | 0, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** 放粒子的动作每一下的平均间隔（毫秒）：手机拉长一半 */
const BEAT_MS: Record<'glint' | 'sparks' | 'bubble' | 'mist', number> = { glint: 2600, sparks: 1700, bubble: 900, mist: 1500 };

/**
 * 第 n 下和第 n+1 下之间隔多久（毫秒）：平均 BEAT_MS，按编号和第几下在 ±35% 里错开。
 * 军械所是"叮、叮"两下一组：组内 260 毫秒，组间照常
 */
export function beatGap(act: 'glint' | 'sparks' | 'bubble' | 'mist', id: number, n: number, low: boolean): number {
  if (act === 'sparks' && n % 2 === 0) return 260;
  const base = BEAT_MS[act] * (low ? 1.5 : 1);
  return Math.round(base * (0.65 + 0.7 * idHash(id, n)));
}

/** 第一下什么时候来（毫秒）：同一个岛上的几座不一起开始 */
export function firstBeat(id: number): number {
  return Math.round(300 + idHash(id, 997) * 1800);
}

/** 金矿 / 金库这一下是不是蹦金币（每 3 下有 1 下），其余只闪 */
export const coinBeat = (id: number, n: number): boolean => (n + id) % 3 === 0;

/** 锯轮现在是第几帧：每帧 90 毫秒，4 帧一循环（帧序往前走，转向一致） */
export function sawFrame(t: number, id: number, frames: number, low: boolean): number {
  const ms = low ? 140 : 90;
  return Math.floor(t / ms + id * 3) % frames;
}

/**
 * 吊着的东西的摆角（弧度，0 = 竖直往下）：一个周期 2.4–3.2 秒的单摆，幅度 0.16–0.24，
 * 每隔一阵（第几个周期按编号）被风推一下幅度大一点，不是死板的等幅摆
 */
export function swingAngle(t: number, id: number): number {
  const period = 2400 + idHash(id, 3) * 800;
  const amp = 0.16 + idHash(id, 5) * 0.08;
  const ph = idHash(id, 7) * Math.PI * 2;
  const cyc = Math.floor(t / period + ph / (Math.PI * 2));
  const gust = (cyc + id) % 4 === 0 ? 1.45 : 1;
  return amp * gust * Math.sin((t / period) * Math.PI * 2 + ph);
}

/** 巡视偏离待机朝向的几个角度（弧度）：0 出现得最多，看一眼又回来 */
const LOOK = [0, 0.9, 0, -0.7, 0.35, 0, -1.1, 0.6] as const;
/**
 * 炮台巡视：隔 3.5–5.5 秒换一个要看的方向（地面角，弧度），中间停着不动；转过去的速度和加减速由 turret.ts 的 aimStep 管。
 * home = 待机朝向
 */
export function patrolAim(home: number, t: number, id: number): number {
  const hold = 3500 + idHash(id, 11) * 2000;
  const k = Math.floor(t / hold + idHash(id, 13) * LOOK.length);
  return home + LOOK[(k + id) % LOOK.length]!;
}

/** 世界坐标的一点在不在镜头里（外扩 margin） */
export function inView(x: number, y: number, v: { x: number; y: number; width: number; height: number }, margin: number): boolean {
  return x >= v.x - margin && x <= v.x + v.width + margin && y >= v.y - margin && y <= v.y + v.height + margin;
}
