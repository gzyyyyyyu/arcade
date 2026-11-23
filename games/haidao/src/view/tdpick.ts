/**
 * 守岛选木台 / 塔的判定（画面层，规则不动）。顺序和基地一致（DESIGN.md 第 6 节「建筑选中与遮挡」）：
 * 占地格优先 → 不透明像素（高塔的塔身、塔顶，前面的优先）→ 同一点连点循环。
 * 只认 2×2 的占地格的话：点狙击塔、喷火塔高出地面的塔身什么也点不中，塔身盖住后面的木台时也没法选到前面这座。
 */
import type { TdScene } from './TdScene.ts';
import Phaser from 'phaser';
import { depthOf, footCenter, iso } from './iso.ts';
import { alphaAt, artBox } from './textures.ts';
import { newCycle, pick, type Cycle, type PickItem } from './basepick.ts';
import { slotLift } from './tdcliff.ts';

/** 像素透明度高于它才算"点在塔上"（0–255），和基地一致 */
const ALPHA_MIN = 24;

/** 每块木台一项：占地 2×2（高台的占地跟着画面抬高）；有塔的取塔图的真实深度 */
function slotItems(bs: TdScene): PickItem[] {
  const tower = new Map<number, number>();
  for (const sp of bs.tsp.values()) if (sp.slot >= 0) tower.set(sp.slot, sp.img.depth);
  return bs.s.slots.map((q, i) => {
    const f = footCenter(q.x, q.y, 2);
    return { id: i, x: q.x, y: q.y, size: 2, depth: tower.get(i) ?? depthOf(f.gx, f.gy), lift: slotLift(bs.s, i) };
  });
}

/** 塔图（狙击塔、喷火塔是镂空的木架）上"算点中"的容差：离不透明像素 14 个 CSS 像素以内都算，镂空处手指也点得到 */
const TOL_CSS = 14;

function opaqueAt(bs: TdScene, key: string, im: Phaser.GameObjects.Image, wx: number, wy: number): boolean {
  const bx = artBox(key) ?? { l: 0, t: 0, r: im.width, b: im.height };
  const tx = (wx - (im.x - im.originX * im.displayWidth)) / im.scaleX;
  const ty = (wy - (im.y - im.originY * im.displayHeight)) / im.scaleY;
  if (tx < bx.l || tx > bx.r || ty < bx.t || ty > bx.b) return false;
  if (!bs.textures.exists(key)) return true;
  return alphaAt(bs.textures, key, Math.floor(tx), Math.floor(ty)) > ALPHA_MIN;
}

/** (wx, wy) 在第 slot 块木台上那座塔的不透明像素上（或附近）吗：九个取样点，先按外框快速排除 */
function hitTower(bs: TdScene, slot: number, wx: number, wy: number): boolean {
  for (const sp of bs.tsp.values()) {
    if (sp.slot !== slot) continue;
    const im = sp.img;
    if (!im.visible) return false;
    const d = TOL_CSS / bs.cc.z;
    for (const [ox, oy] of [[0, 0], [-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, -d], [-d, d], [d, d]] as const) {
      if (opaqueAt(bs, sp.key, im, wx + ox, wy + oy)) return true;
    }
    return false;
  }
  return false;
}

export { newCycle, type Cycle };

/** 点中的木台下标；cycle 传了就按连点循环（点按用），悬停、按下不传 */
export function slotAt(bs: TdScene, wx: number, wy: number, cycle?: Cycle): number | null {
  if (Number.isNaN(wx)) return null;
  return pick(slotItems(bs), wx, wy, (i, x, y) => hitTower(bs, i, x, y), cycle, 8 / bs.cc.z);
}

/** 在 hoverG 上画第 si 块木台的占地菱形：悬停淡一点，按下实一点；si < 0 清掉 */
export function drawSlotDiamond(bs: TdScene, si: number, pressed: boolean): void {
  bs.hoverG.clear();
  const q = bs.s.slots[si];
  if (!q) return;
  const up = slotLift(bs.s, si);
  const pts = [iso(q.x, q.y), iso(q.x + 2, q.y), iso(q.x + 2, q.y + 2), iso(q.x, q.y + 2)].map((p) => new Phaser.Math.Vector2(p.x, p.y - up));
  bs.hoverG.fillStyle(0xffe885, pressed ? 0.45 : 0.25).fillPoints(pts, true).lineStyle(3, pressed ? 0xffffff : 0xffe885, 0.95).strokePoints(pts, true);
}
