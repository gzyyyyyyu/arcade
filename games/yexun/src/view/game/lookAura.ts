/**
 * 外观「脚下光圈」（content/meta.ts LOOKS，DESIGN 3.8a）：主角脚下一圈淡光、轻轻呼吸，走动时身后留几道渐隐的光痕。只读位置，不碰规则。
 * 一个 Graphics 每帧重画（一个椭圆 + 最多 TRAIL 个光痕），不建对象、不分配；跟着场景一起销毁。
 */
import Phaser from 'phaser';

const TRAIL = 6;
/** 隔多少毫秒落一道光痕、一道留多久 */
const TRAIL_EVERY = 110;
const TRAIL_LIFE = 600;

export class LookAura {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly fill: number;
  private readonly edge: number;
  private readonly tx = new Float64Array(TRAIL);
  private readonly ty = new Float64Array(TRAIL);
  private readonly tt = new Float64Array(TRAIL).fill(-1e9);
  private next = 0;
  private lastAt = -1e9;

  constructor(scene: Phaser.Scene, color: string, edge: string) {
    this.g = scene.add.graphics().setDepth(-399);
    this.fill = Phaser.Display.Color.HexStringToColor(color).color;
    this.edge = Phaser.Display.Color.HexStringToColor(edge).color;
  }

  update(x: number, y: number, moving: boolean, now: number): void {
    const g = this.g;
    g.clear();
    if (moving && now - this.lastAt >= TRAIL_EVERY) {
      this.tx[this.next] = x;
      this.ty[this.next] = y;
      this.tt[this.next] = now;
      this.next = (this.next + 1) % TRAIL;
      this.lastAt = now;
    }
    for (let i = 0; i < TRAIL; i++) {
      const age = (now - this.tt[i]!) / TRAIL_LIFE;
      if (age >= 1) continue;
      g.fillStyle(this.fill, 0.35 * (1 - age));
      g.fillEllipse(this.tx[i]!, this.ty[i]!, 30 * (1 - age * 0.4), 12 * (1 - age * 0.4));
    }
    const breathe = 0.85 + 0.15 * Math.sin(now * 0.004);
    g.lineStyle(3, this.edge, 0.8 * breathe);
    g.strokeEllipse(x, y, 58, 22);
    g.lineStyle(2, this.fill, breathe);
    g.strokeEllipse(x, y, 50, 18);
  }
}
