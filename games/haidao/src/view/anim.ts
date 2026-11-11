import type Phaser from 'phaser';
import { DEATH_MS, deathPose, type DeathPose } from './motion.ts';
import type { Particles } from './fx.ts';
import { DFX_DUST, DFX_DUST_SMALL, DFX_EMBER, DFX_SMOKE, deathFx, type DeathStyle } from './rig.ts';
import type { Rig } from './rigsprite.ts';
import { DYING_DEPTH_DROP, dyingDim } from './dyinglook.ts';

/** 动作的 Phaser 侧小件（曲线和数学在 motion.ts、rig.ts）：死亡倒下列表。战斗和守岛两个场景共用 */

interface RigDying {
  rig: Rig;
  t0: number;
  ms: number;
  done: (rig: Rig) => void;
  /** 倒下时放尘土、黑烟的粒子池（不传就不放）、上一帧的进度、烟的序号 */
  pt?: Particles;
  k0: number;
  n: number;
}

interface Dying {
  img: Phaser.GameObjects.Image;
  t0: number;
  /** 倒向：1 = 向右倒，-1 = 向左倒（背对打来的方向，这里取朝向的反面） */
  dir: number;
  y0: number;
  sx: number;
  sy: number;
}

/**
 * 倒下再淡出（不是瞬间消失）：接手一张已经在场上的兵图，DEATH_MS 里先后仰倒地、落地压一下、再淡出，到时销毁。
 * 每帧由场景的 update 调 step；不用补间（死亡密集时不新建补间对象），对象就是原来那张图，不新建。
 */
export class DyingList {
  private list: Dying[] = [];
  private rigs: RigDying[] = [];
  private pose: DeathPose = { angle: 0, dy: 0, sy: 1, alpha: 1 };
  /** 命中停顿时传 0，倒下的动作也跟着冻住 */
  timeScale = 1;
  private clock = 0;

  add(img: Phaser.GameObjects.Image, face: number): void {
    this.list.push({ img, t0: this.clock, dir: face >= 0 ? -1 : 1, y0: img.y, sx: img.scaleX, sy: img.scaleY });
  }

  /** 分件骨架倒下：被打飞或跪倒（rig.ts 的 deathStyle 选）、帽子飞出去、淡出；演完调 done（放回对象池） */
  addRig(rig: Rig, face: number, style: DeathStyle, done: (rig: Rig) => void, pt?: Particles): void {
    rig.die(style, face);
    // 倒下的压到同格活人下面（深度按格子排，半档就够），扎堆时活人不被倒地的盖住
    rig.c.setDepth(rig.c.depth - DYING_DEPTH_DROP);
    this.rigs.push({ rig, t0: this.clock, ms: rig.deathMs, done, pt, k0: 0, n: 0 });
  }

  /** dt 毫秒；传场景 update 的 delta */
  step(dt: number): void {
    this.clock += Math.min(dt, 50) * this.timeScale;
    for (let i = this.rigs.length - 1; i >= 0; i--) {
      const d = this.rigs[i]!;
      const k = (this.clock - d.t0) / d.ms;
      if (k >= 1 || !d.rig.active) {
        this.rigs.splice(i, 1);
        d.done(d.rig);
        continue;
      }
      d.rig.stepDeath(k);
      d.rig.c.setAlpha(d.rig.c.alpha * dyingDim(k));
      if (d.pt && d.rig.kind) this.fx(d, k);
      d.k0 = k;
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i]!;
      const k = (this.clock - d.t0) / DEATH_MS;
      if (k >= 1 || !d.img.active) {
        d.img.destroy();
        this.list.splice(i, 1);
        continue;
      }
      deathPose(this.pose, k);
      d.img.setRotation(this.pose.angle * d.dir).setY(d.y0 + this.pose.dy).setAlpha(this.pose.alpha).setScale(d.sx, d.sy * this.pose.sy);
    }
  }

  private readonly spot = { x: 0, y: 0 };
  private fx(d: RigDying, k: number): void {
    const f = deathFx(d.rig.deathKind ?? 'kneel', d.k0, k);
    if (!f) return;
    const p = d.rig.deathSpot(this.spot);
    if (f & DFX_DUST) d.pt!.bodyDust(p.x, p.y, 4);
    if (f & DFX_DUST_SMALL) d.pt!.bodyDust(p.x, p.y, 2);
    if (f & (DFX_SMOKE | DFX_EMBER)) d.pt!.charSmoke(p.x, p.y, d.n++);
  }

  get size(): number {
    return this.list.length + this.rigs.length;
  }

  /** 场景重开时丢掉没演完的（图已经随场景销毁） */
  clear(): void {
    this.list.length = 0;
    this.rigs.length = 0;
  }
}
