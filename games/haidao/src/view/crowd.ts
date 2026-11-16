/**
 * 登陆战的"挤开"：规则里同一落点的近战兵可以站得几乎重合（只有 ±24 的小道偏移），精灵比这宽，看着像一个人。
 * 画面层按显示位置把挤在一起的兵互相推开一点（只影响显示，规则位置、命中、伤害都不动）。
 *
 * 纯函数、无随机：同样的输入得到同样的目标偏移；每个兵的当前偏移再按时间平滑追过去（approach），
 * 所以兵靠拢、散开、被打死时都是连续变化，不跳。tests/crowd.test.ts 锁住。
 */

export interface CrowdItem {
  id: number;
  x: number;
  y: number;
  /** 显示半径（逻辑单位）：两个兵的间距取两人半径之和；不给按 CROWD_D / 2 */
  r?: number;
}

/** 小兵互相推开的最小间距（逻辑单位，1 格 = 100）：约一个精灵的宽；壮汉这类大个子由调用方给更大的 r */
export const CROWD_D = 56;
/** 单个兵最多被推开多远：不能离目标太远，免得看着像没在打 */
export const CROWD_MAX = 80;
/** 守岛的敌人最多被推开多远：比登陆战小，炮弹、伤害数字按规则位置落，推远了像没打中 */
export const CROWD_MAX_TD = 40;

/**
 * 算每个兵的目标偏移（写进 ox/oy，下标和 items 对齐）。
 * 做 3 轮松弛：每轮把距离小于 d 的一对各推开一半差额；被建筑或海挡住的兵把推力沿墙边滑开（不缩小）；用网格哈希，只比较相邻格，兵再多也是线性的。
 */
export function crowdOffsets(items: readonly CrowdItem[], ox: Float64Array, oy: Float64Array, d = CROWD_D, max = CROWD_MAX, rounds = 5, blocked?: (x: number, y: number) => boolean): void {
  // 网格边长按最大的一对间距取，保证相邻格就够
  let cell = d;
  for (const it of items) if (it.r !== undefined) cell = Math.max(cell, it.r * 2);
  const n = items.length;
  for (let i = 0; i < n; i++) {
    ox[i] = 0;
    oy[i] = 0;
  }
  if (n < 2) return;
  for (let r = 0; r < rounds; r++) {
    const grid = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const k = cellKey(Math.floor((items[i]!.x + ox[i]!) / cell), Math.floor((items[i]!.y + oy[i]!) / cell));
      const l = grid.get(k);
      if (l) l.push(i);
      else grid.set(k, [i]);
    }
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = items[i]!;
      const ax = a.x + ox[i]!;
      const ay = a.y + oy[i]!;
      const gx = Math.floor(ax / cell);
      const gy = Math.floor(ay / cell);
      for (let cy = gy - 1; cy <= gy + 1; cy++) {
        for (let cx = gx - 1; cx <= gx + 1; cx++) {
          const l = grid.get(cellKey(cx, cy));
          if (!l) continue;
          for (const j of l) {
            if (j <= i) continue;
            const b = items[j]!;
            let dx = b.x + ox[j]! - ax;
            let dy = b.y + oy[j]! - ay;
            let dist = Math.hypot(dx, dy);
            const want = (a.r ?? d / 2) + (b.r ?? d / 2);
            if (dist >= want) continue;
            if (dist < 1e-6) {
              // 完全重合：按两人编号定一个方向，保证同样输入同样结果
              const ang = (a.id * 2.39996 + b.id * 1.61803) % (Math.PI * 2);
              dx = Math.cos(ang);
              dy = Math.sin(ang);
              dist = 1;
            }
            const push = (want - dist) / 2 / dist;
            px[i] = px[i]! - dx * push;
            py[i] = py[i]! - dy * push;
            px[j] = px[j]! + dx * push;
            py[j] = py[j]! + dy * push;
          }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const it = items[i]!;
      const x0 = ox[i]!;
      const y0 = oy[i]!;
      let nx = x0 + px[i]!;
      let ny = y0 + py[i]!;
      const m = Math.hypot(nx, ny);
      if (m > max) {
        nx = (nx / m) * max;
        ny = (ny / m) * max;
      }
      // 不能被推进建筑或海里。起点本身就在挡住的地方（贴着墙打）不查，免得动不了。
      // 落点被挡时不缩小偏移，而是沿墙滑开：建筑占地是横平竖直的方块，把这一轮的推力投影到墙边（保留平行于墙的分量，
      // 并补足被墙吃掉的长度），挑不被挡又最顺着原方向的那个；正对着墙推（没有平行分量）按编号定左右，让贴墙的一排兵各自往两边散
      if (blocked && !blocked(it.x, it.y) && blocked(it.x + nx, it.y + ny)) {
        const dx = px[i]!;
        const dy = py[i]!;
        const len = Math.hypot(dx, dy);
        const side = it.id % 2 === 0 ? 1 : -1;
        const sx = dx === 0 ? side : Math.sign(dx);
        const sy = dy === 0 ? side : Math.sign(dy);
        const cands: Array<[number, number]> = [
          [dx, 0],
          [0, dy],
          [sx * len, 0],
          [0, sy * len],
          [-sx * len, 0],
          [0, -sy * len],
        ];
        let bx = 0;
        let by = 0;
        let best = -Infinity;
        for (const [cx, cy] of cands) {
          let tx = x0 + cx;
          let ty = y0 + cy;
          const tm = Math.hypot(tx, ty);
          if (tm > max) {
            tx = (tx / tm) * max;
            ty = (ty / tm) * max;
          }
          if (blocked(it.x + tx, it.y + ty)) continue;
          // 顺着原推力的程度；反方向的候选（-sx、-sy）只在别无选择时用，所以加一个大负数垫底
          const score = (tx - x0) * dx + (ty - y0) * dy - (cx * dx + cy * dy < 0 || (cx === 0 && cy === 0) ? 1e6 : 0) + (cx !== 0 || cy !== 0 ? 1e-3 * Math.hypot(tx - x0, ty - y0) : 0);
          if (score > best) {
            best = score;
            bx = tx;
            by = ty;
          }
        }
        // 都被挡就留在原偏移
        nx = best === -Infinity ? x0 : bx;
        ny = best === -Infinity ? y0 : by;
      }
      ox[i] = nx;
      oy[i] = ny;
    }
  }
}

function cellKey(cx: number, cy: number): number {
  return (cx + 512) * 1024 + (cy + 512);
}

/** 当前偏移按时间追目标偏移（指数平滑，和帧率无关）：dt 毫秒，tau 约 140 毫秒 */
export function approach(cur: number, target: number, dt: number, tau = 140): number {
  return target + (cur - target) * Math.exp(-Math.max(0, dt) / tau);
}
