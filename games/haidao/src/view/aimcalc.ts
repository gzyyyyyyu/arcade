/**
 * 登陆战“落点预览”的纯计算（不依赖 Phaser / DOM，tests/aimcalc.test.ts 锁住）：
 * 技能的作用圈、信号弹会标哪一座建筑、一队兵落下后散开的范围。
 * 规则在 core/battle.ts 的 doAction：这里照它的判法算，只用来画预览和提前拦下“放了也没用”的点按，不改规则。
 */
import { UNIT, type BBuilding } from '../core/types.ts';
import { BUILDING_KINDS, isDecoKind } from '../content/buildings.ts';

/** 登陆时兵在落点周围散开的半宽（格；规则里是 ±60 单位） */
export const LAND_SPREAD = 0.6;

/** 不会被信号弹标记的东西：装饰、地雷、焦油（规则的 isDeco 加 mine / tar） */
const NOT_FLARE = new Set<string>(['mine', 'tar', ...BUILDING_KINDS.filter(isDecoKind)]);

/** 点 (x, y)（单位）到建筑占地矩形的距离平方 */
function d2Rect(x: number, y: number, b: BBuilding): number {
  const dx = Math.min(Math.max(x, b.x * UNIT), (b.x + b.size) * UNIT) - x;
  const dy = Math.min(Math.max(y, b.y * UNIT), (b.y + b.size) * UNIT) - y;
  return dx * dx + dy * dy;
}

/** 信号弹落在 (x, y)（单位）、作用半径 radius（格）时标哪一座建筑：半径内最近、没被毁、看得见的；没有返回 undefined（规则里这时整个技能不生效） */
export function flareTarget(buildings: readonly BBuilding[], x: number, y: number, radius: number): BBuilding | undefined {
  const r = Math.round(radius * UNIT);
  let best: BBuilding | undefined;
  let bestD = r * r + 1;
  for (const b of buildings) {
    if (b.destroyed || NOT_FLARE.has(b.kind) || !b.revealed) continue;
    const d = d2Rect(x, y, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** 炮击圈里（建筑占地碰到圈）有多少座建筑会挨炮：画预览时给圈里的建筑描边用 */
export function barrageHits(buildings: readonly BBuilding[], x: number, y: number, radius: number): BBuilding[] {
  const r = Math.round(radius * UNIT);
  return buildings.filter((b) => !b.destroyed && !NOT_FLARE.has(b.kind) && b.revealed && d2Rect(x, y, b) <= r * r);
}

/** 格坐标下的圆（n 个点），投影到屏幕就是一个扁椭圆 */
export function ringCells(gx: number, gy: number, radius: number, n = 40): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([gx + Math.cos(a) * radius, gy + Math.sin(a) * radius]);
  }
  return out;
}

/** 技能点在“能生效”的位置吗：只有信号弹会因为没目标而失效，别的技能点哪都生效 */
export function skillCanCast(kind: string, buildings: readonly BBuilding[], x: number, y: number, radius: number): boolean {
  return kind !== 'flare' || flareTarget(buildings, x, y, radius) !== undefined;
}

/** 选中技能后的提示条：说清点哪里、圈里发生什么（原来一句“点岛上任意处”，信号弹其实要点在建筑附近） */
export function skillHint(kind: string, name: string): string {
  if (kind === 'flare') return '点敌人的建筑，兵都先去打它';
  if (kind === 'medkit') return '点自己的兵，圈里的兵回血';
  if (kind === 'barrage') return '点要炮击的地方，圈里的建筑挨炮';
  return `点岛上任意处，放${name}`;
}
