/**
 * 守岛伤害数字的"扎堆合并"（纯函数，tests/tddmg.test.ts 锁住）。
 * DamageNumbers 已经把同一个目标的伤害累加成一个数；这里再处理另一种情况：十几个敌人挤在入口，
 * 每个目标一个数字会互相盖住。短时间窗里、挨得很近的几个目标共用同一个键，合成一个"这一团受了多少伤"的数字。
 * 用墙钟毫秒（不是规则拍），4 倍速下窗口仍是 0.3 秒的真实时间，数字停留够读。
 */

/** 合并窗口（毫秒）和半径（世界像素） */
export const DMG_WINDOW_MS = 300;
export const DMG_RADIUS = 56;

interface Rec {
  id: number;
  key: string;
  x: number;
  y: number;
  t: number;
}

export class DmgClusters {
  private recs: Rec[] = [];

  /** 这一下伤害该用哪个键：自己最近有数字就沿用；窗口内附近有别的目标的数字就并进去；否则用自己的键 */
  keyFor(id: number, x: number, y: number, now: number): string {
    const recs = this.recs;
    for (let i = recs.length - 1; i >= 0; i--) if (now - recs[i]!.t > DMG_WINDOW_MS || now < recs[i]!.t) recs.splice(i, 1);
    let key = `e${id}`;
    let own: Rec | undefined;
    let near: Rec | undefined;
    let nearD = DMG_RADIUS * DMG_RADIUS;
    for (const r of recs) {
      if (r.id === id) own = r;
      else {
        const d = (r.x - x) * (r.x - x) + (r.y - y) * (r.y - y);
        if (d < nearD) {
          nearD = d;
          near = r;
        }
      }
    }
    if (own) key = own.key;
    else if (near) key = near.key;
    if (own) {
      own.x = x;
      own.y = y;
      own.t = now;
    } else recs.push({ id, key, x, y, t: now });
    return key;
  }

  clear(): void {
    this.recs.length = 0;
  }
}
