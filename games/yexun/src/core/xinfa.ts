/**
 * 心法特色（content/xinfa.ts 的表，DESIGN 3.7）：每拍记下「你在干什么」，命中、挨打时按它出倍数。
 * 只在带了心法的局里动；状态全是整数拍数和计数，确定性同核心。
 */
import { SCHOOLS } from '../content/guide.ts';
import type { WeaponId } from '../content/weapons.ts';
import { XINFA_FX } from '../content/xinfa.ts';
import type { Grid } from './grid.ts';
import { MAX_SHOTS, Shot, type World } from './state.ts';

export interface XinfaApi {
  hitEnemy(w: World, i: number, dmg: number, slot: number, kx: number, ky: number, knock: number, rehit: number, credit?: number): boolean;
}

/** 每拍开头（怪移动、格子重建之后，法器出手之前）：更新这一拍的状态 */
export function xinfaTick(w: World, g: Grid): void {
  const xf = w.xinfa;
  if (!xf) return;
  const s = w.xf;
  if (w.moving) {
    s.move++;
    s.still = 0;
  } else {
    s.still++;
    s.move = 0;
  }
  switch (xf) {
    case 'talisman': {
      const F = XINFA_FX.talisman;
      s.stack = Math.min(F.max, Math.floor(g.query(w, w.x, w.y, F.r) / F.per));
      break;
    }
    case 'wood': {
      const F = XINFA_FX.wood;
      if (s.still >= F.reset) s.stack = 0;
      else if (s.move > 0 && s.move % F.every === 0 && s.stack < F.max) s.stack++;
      break;
    }
    case 'wealth':
      if (w.tick - s.coinAt > XINFA_FX.wealth.keep) s.stack = 0;
      break;
    case 'paper': {
      let n = 0;
      for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Paper) n++;
      s.papers = n;
      break;
    }
    case 'array': {
      s.inZone = false;
      for (const z of w.arms.zones) {
        const dx = w.x - z.x;
        const dy = w.y - z.y;
        if ((dx < 0 ? -dx : dx) <= z.half && (dy < 0 ? -dy : dy) <= z.half) {
          s.inZone = true;
          break;
        }
      }
      break;
    }
  }
}

/** 这一下打在第 i 只怪上，心法给的伤害倍数（owner = 记功的法器，技能、火星打的没有） */
export function xinfaHitMul(w: World, owner: WeaponId | undefined, i: number): number {
  const xf = w.xinfa;
  if (!xf || owner === undefined || !SCHOOLS[xf].weapons.includes(owner)) return 1;
  const s = w.xf;
  switch (xf) {
    case 'sword': {
      const F = XINFA_FX.sword;
      const dx = w.eX[i]! - w.x;
      const dy = w.eY[i]! - w.y;
      return dx * dx + dy * dy <= F.near * F.near ? F.mul : 1;
    }
    case 'talisman':
      return 1 + s.stack * XINFA_FX.talisman.step;
    case 'ward':
      return s.still >= XINFA_FX.ward.still ? XINFA_FX.ward.mul : 1;
    case 'wood':
      return 1 + s.stack * XINFA_FX.wood.step;
    case 'water':
      return w.eSlow[i] !== 0 ? XINFA_FX.water.mul : 1;
    case 'array':
      return s.inZone ? XINFA_FX.array.mul : 1;
    case 'ghost':
      return w.hp <= w.stats.hpMax * XINFA_FX.ghost.hp ? XINFA_FX.ghost.mul : 1;
    case 'wealth':
      return 1 + s.stack * XINFA_FX.wealth.step;
    default:
      return 1;
  }
}

/** 挨打时心法给的倍数（不动如山、同袍） */
export function xinfaHurtMul(w: World): number {
  const s = w.xf;
  switch (w.xinfa) {
    case 'ward':
      return s.still >= XINFA_FX.ward.still ? XINFA_FX.ward.hurt : 1;
    case 'paper':
      return 1 - Math.min(XINFA_FX.paper.max, s.papers * XINFA_FX.paper.step);
    default:
      return 1;
  }
}

/** 这件法器打倒了第 i 只怪（伤害 d）：燎原记一颗火星，同一拍稍后结算（命中时调用方正在用格子的查询结果，这里不能再查） */
export function xinfaOnKill(w: World, owner: WeaponId | undefined, x: number, y: number, d: number): void {
  if (w.xinfa !== 'fire' || owner === undefined || !SCHOOLS.fire.weapons.includes(owner)) return;
  w.xf.splash.push(x, y, Math.max(1, Math.round(d * XINFA_FX.fire.share)));
}

/** 财运：捡到铜钱（每枚一层） */
export function xinfaCoin(w: World, n: number): void {
  if (w.xinfa !== 'wealth') return;
  const s = w.xf;
  s.stack = Math.min(XINFA_FX.wealth.max, s.stack + n);
  s.coinAt = w.tick;
}

const hits: number[] = [];

/** 燎原：结算这一拍记下的火星（火星不记功，打倒的怪不再炸） */
export function xinfaSplash(w: World, g: Grid, api: XinfaApi): void {
  const q = w.xf.splash;
  if (q.length === 0) return;
  const r = XINFA_FX.fire.r;
  for (let k = 0; k < q.length; k += 3) {
    const x = q[k]!;
    const y = q[k + 1]!;
    const n = g.query(w, x, y, r);
    hits.length = 0;
    for (let j = 0; j < n; j++) hits.push(g.out[j]!);
    for (const i of hits) api.hitEnemy(w, i, q[k + 2]!, -1, w.eX[i]! - x, w.eY[i]! - y, 0, 0, -1);
  }
  q.length = 0;
}
