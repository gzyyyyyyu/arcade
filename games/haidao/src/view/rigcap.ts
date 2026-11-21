/**
 * 同屏完整骨架的名额：一个完整骨架是十几张部件图，几波敌人叠在屏内时（守岛 td14 叫 6 波，屏内六七十个），
 * 光部件就是七八百个显示对象，手机上逐个变换、合批的开销比规则还大。屏内超过 CAP 个时，按「离屏幕中心的距离 ÷ 体型」排，
 * 前 CAP 个画完整骨架，其余换成整张图（rigsprite 的第 1 档，和镜头拉远时同一套），越大越近越先保留——首领、精英体型大，排在前面。
 *
 * 用上一帧的排名决定这一帧（一帧之差看不出来），不用为了排名把每个单位的位置先算一遍；
 * 正在完整档的分数打 HOLD 折扣，两个人在名额边上时不会每帧来回换。纯逻辑，tests/rigcap.test.ts 锁住。
 */

/** 同屏最多这么多个完整骨架（和 rig.ts 的 CROWD 同一个数：超过它姿势本来就隔帧算了） */
const RIG_CAP = 36;
/** 正在完整档的单位排名时分数乘这个（越小越不容易被挤下去） */
const HOLD = 0.8;

export class RigCap {
  private ids: number[] = [];
  private score: number[] = [];
  private order: number[] = [];
  /** null = 上一帧没超名额，谁都画完整骨架 */
  private keep: Set<number> | null = null;
  private next = new Set<number>();

  private readonly cap: number;

  constructor(cap = RIG_CAP) {
    this.cap = cap;
  }

  begin(): void {
    this.ids.length = 0;
    this.score.length = 0;
  }

  /**
   * 一个屏内、本该画完整骨架的单位报名：d2 是到屏幕中心的距离平方（屏幕像素），size 是体型（屏幕上的身高，像素）。
   * 返回这一帧能不能画完整骨架（按上一帧的排名）。
   */
  want(id: number, d2: number, size: number): boolean {
    const was = this.keep === null || this.keep.has(id);
    this.ids.push(id);
    this.score.push((d2 / Math.max(1, size * size)) * (was ? HOLD : 1));
    return was;
  }

  /** 帧末：排出下一帧的名单 */
  end(): void {
    const n = this.ids.length;
    if (n <= this.cap) {
      this.keep = null;
      return;
    }
    this.order.length = n;
    for (let i = 0; i < n; i++) this.order[i] = i;
    // 同分按编号，排法每帧一样
    this.order.sort((a, b) => this.score[a]! - this.score[b]! || this.ids[a]! - this.ids[b]!);
    this.next.clear();
    for (let i = 0; i < this.cap; i++) this.next.add(this.ids[this.order[i]!]!);
    const t = this.keep ?? new Set<number>();
    this.keep = this.next;
    this.next = t;
  }
}
