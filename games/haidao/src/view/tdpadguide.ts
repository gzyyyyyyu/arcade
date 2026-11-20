import type Phaser from 'phaser';
import type { TdScene } from './TdScene.ts';
import { footCenter, iso, depthOf } from './iso.ts';
import { isoRing } from './tdfx.ts';
import { EASE } from './motion.ts';
import { feelOn } from './feel.ts';
import { DEPTH } from './depth.ts';
import { MARK_FONT, guideVisible, markScale } from './padguide.ts';
import { openerLeft, towerName } from './td-ui.ts';
import type { NextStep } from './td-ui.ts';
import { slotLift } from './tdcliff.ts';

/**
 * 开局的木台高亮：只在倒数里、只圈战役写了开局造法（TdLevel.opener）的那几块，头上写造什么塔；造了就收起那块，第一波开打后全收。
 * 别的关和海盗来袭开局不另圈：预告卡「下一座造」那一块的金圈（syncGoalMark）就是开局该造的地方，两套圈指不同的台子会打架
 */
interface PadMark {
  slot: number;
  ring: Phaser.GameObjects.Ellipse;
  arrow: Phaser.GameObjects.Text;
}

/** 每个场景现在画着的金圈（开局造法和卡片目标两套共用），fitMarks 每帧按镜头缩放调字 */
const live = new WeakMap<TdScene, Set<PadMark>>();

/** 金圈加头上的字，开局造法的木台和卡片指的那块木台 / 那座塔同一个样子 */
function addMark(bs: TdScene, slot: number, label: string, lift: number): PadMark {
  const sl = bs.s.slots[slot]!;
  const f = footCenter(sl.x, sl.y, 2);
  const g = iso(f.gx, f.gy);
  const p = { x: g.x, y: g.y - slotLift(bs.s, slot) };
  const d = depthOf(f.gx, f.gy);
  const rg = isoRing(1.5);
  const ring = bs.add.ellipse(p.x, p.y + 2, rg.w, rg.h, 0xffe885, 0.22).setStrokeStyle(4, 0xffe885, 0.95).setDepth(d - 0.4);
  // 字压在建筑、英雄、敌人上面（以前跟着木台的深度，被主寨、站在台边的英雄、登陆的人堆挡住）；圈还贴着地
  const arrow = bs.add
    .text(p.x, p.y - 30 - lift, `${label}\n▼`, { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${MARK_FONT * bs.r}px`, align: 'center', color: '#ffe885', stroke: '#2b1a15', strokeThickness: 5 * bs.r })
    .setOrigin(0.5, 1)
    .setScale(markScale(bs.cameras.main.zoom) / bs.r)
    .setDepth(DEPTH.markerTop);
  if (feelOn()) {
    // 脉动：圈放大淡出再回来，箭头上下点；一轮 1 秒、60 帧里都是连续的
    bs.tweens.add({ targets: ring, scale: 1.18, alpha: 0.55, duration: 500, yoyo: true, repeat: -1, ease: EASE.recover });
    bs.tweens.add({ targets: arrow, y: arrow.y - 12, duration: 500, yoyo: true, repeat: -1, ease: EASE.recover });
  }
  const m = { slot, ring, arrow };
  let set = live.get(bs);
  if (!set) live.set(bs, (set = new Set()));
  set.add(m);
  return m;
}

function dropMark(bs: TdScene, m: PadMark): void {
  live.get(bs)?.delete(m);
  bs.tweens.killTweensOf([m.ring, m.arrow]);
  m.ring.destroy();
  m.arrow.destroy();
}

/** 每帧：镜头缩放变了（双指、全景、跟拍）就把金圈的字调回屏幕上看得清的大小 */
export function fitMarks(bs: TdScene): void {
  const set = live.get(bs);
  if (!set?.size) return;
  const k = markScale(bs.cameras.main.zoom) / bs.r;
  for (const m of set) {
    // 重开一局时旧对象随场景已经没了
    if (!m.arrow.active) set.delete(m);
    else if (m.arrow.scaleX !== k) m.arrow.setScale(k);
  }
}
interface GuideState {
  s: unknown;
  marks: PadMark[];
  done: boolean;
}
const states = new WeakMap<TdScene, GuideState>();

function clear(bs: TdScene, st: GuideState): void {
  for (const m of st.marks) dropMark(bs, m);
  st.marks = [];
}

export function syncPadGuide(bs: TdScene): void {
  const s = bs.s;
  const op = s.level.opener;
  if (!op?.length) return;
  let st = states.get(bs);
  // 重开一局（状态对象换了）：旧的画面对象随场景已经没了，别再碰
  if (st && st.s !== s) {
    st.marks = [];
    st = undefined;
  }
  if (!st) {
    st = { s, marks: [], done: false };
    states.set(bs, st);
  }
  if (st.done) return;
  if (st.marks.length === 0) {
    if (!guideVisible(s.wave, s.tick, s.next, s.over, 1)) {
      if (s.wave > 0 || s.over) st.done = true;
      return;
    }
    // 开局只圈一次，造了的那块收起；造什么由预告卡「先造」那一格说，这里不再另出一条同样的提示条
    const picks = op.map((o) => o.slot).filter((i) => (s.slots[i]?.tower ?? 0) < 0);
    if (picks.length === 0) {
      st.done = true;
      return;
    }
    for (const slot of picks) st.marks.push(addMark(bs, slot, towerName(op.find((o) => o.slot === slot)!.kind), 0));
  }
  // 造了的收起；倒数结束 / 第一波开打 / 全造完整个收起
  const keep = st.marks.filter((m) => s.slots[m.slot]!.tower < 0);
  for (const m of st.marks) if (!keep.includes(m)) dropMark(bs, m);
  st.marks = keep;
  if (!guideVisible(s.wave, s.tick, s.next, s.over, keep.length)) {
    clear(bs, st);
    st.done = true;
  }
}

/**
 * 预告卡这一格指的木台：第一波开打前还有没造的开局造法，指第一块；否则指卡上定住的下一步（造在哪块 / 升哪座）；都没有为 undefined。
 * 点卡上这一格镜头平移过去（panToGoal），竖屏放大时它在画面外，可见区边上指箭头（tdworld 的 drawEdges）
 */
export function goalSlot(bs: TdScene): number | undefined {
  if (bs.s.over) return undefined;
  return openerLeft(bs.s)?.[0]?.slot ?? bs.next?.step?.slot;
}

/** 镜头平移到卡上指的那块木台（缩放不变）；记一笔玩家动了镜头，停手后自动跟拍照常接回 */
export function panToGoal(bs: TdScene): void {
  const slot = goalSlot(bs);
  if (slot === undefined) return;
  const sl = bs.s.slots[slot]!;
  const w = iso(sl.x + 1, sl.y + 1);
  bs.fit.markUser();
  bs.fit.panTo(w.x, w.y);
}

/** 钱够两步时卡上、地上一起给的第二步；不够（或没有第二步、开局造法还没造完）为 null */
export function twoSteps(bs: TdScene): NextStep | null {
  const n = bs.next;
  if (!n?.step || !n.after || openerLeft(bs.s)) return null;
  return bs.s.gold >= n.step.cost + n.after.cost ? n.after : null;
}

/**
 * 卡上定住的下一步在场上描金圈：要造的木台头上写塔名、要升的那座塔头上写「升级」（同种塔有好几座时卡上只写塔名分不清是哪座）；
 * 钱够两步时第二步也圈上，和卡上写的两座对上。开局造法还没造完时不画（开局造法自己的金圈在），下一步换了、钱跨过两步的线才重画
 */
const goalMarks = new WeakMap<TdScene, { s: unknown; step: NextStep | null; after: NextStep | null; marks: PadMark[] }>();
export function syncGoalMark(bs: TdScene): void {
  const s = bs.s;
  const step = s.over || openerLeft(s) ? null : (bs.next?.step ?? null);
  const after = step ? twoSteps(bs) : null;
  const cur = goalMarks.get(bs);
  if (cur?.s === s && cur.step === step && cur.after === after) return;
  // 重开一局时旧的圈随场景已经没了，别再碰
  if (cur?.s === s) for (const m of cur.marks) dropMark(bs, m);
  // 塔比木台高，「升级」抬到塔顶上面
  const mark = (st: NextStep): PadMark => (st.up ? addMark(bs, st.slot, '升级', 72) : addMark(bs, st.slot, towerName(st.kind), 0));
  goalMarks.set(bs, { s, step, after, marks: [step, after].filter((x): x is NextStep => !!x).map(mark) });
}
