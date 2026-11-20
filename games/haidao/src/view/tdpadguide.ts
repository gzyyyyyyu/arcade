import type Phaser from 'phaser';
import type { TdScene } from './TdScene.ts';
import { tdPreview, tdRoutes } from '../core/index.ts';
import { footCenter, iso, depthOf } from './iso.ts';
import { isoRing } from './tdfx.ts';
import { EASE } from './motion.ts';
import { feelOn } from './feel.ts';
import { el } from './ui.ts';
import { recommendPads, guideVisible } from './padguide.ts';
import { openerLeft, openerText, towerName } from './td-ui.ts';
import type { HeldStep } from './td-ui.ts';

/**
 * 开局的木台高亮：只在倒数里、只对挑出来的几块空木台；造了就收起那块，第一波开打后全收。
 * 海盗来袭按路线挑（recommendPads）；战役写了开局造法（TdLevel.opener）的关圈那几块，头上写造什么塔
 */
interface PadMark {
  slot: number;
  ring: Phaser.GameObjects.Ellipse;
  arrow: Phaser.GameObjects.Text;
}

/** 金圈加头上的字，开局造法的木台和「钱够就升级」的那座塔同一个样子；label 为空只画 ▼ */
function addMark(bs: TdScene, slot: number, label: string, lift: number): PadMark {
  const sl = bs.s.slots[slot]!;
  const f = footCenter(sl.x, sl.y, 2);
  const p = iso(f.gx, f.gy);
  const d = depthOf(f.gx, f.gy);
  const rg = isoRing(1.5);
  const ring = bs.add.ellipse(p.x, p.y + 2, rg.w, rg.h, 0xffe885, 0.22).setStrokeStyle(4, 0xffe885, 0.95).setDepth(d - 0.4);
  // 有字的小一号、两行，箭头的底边和海盗来袭的 ▼ 对齐
  const arrow = bs.add
    .text(p.x, label ? p.y - 30 - lift : p.y - 44, label ? `${label}\n▼` : '▼', { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${(label ? 20 : 28) * bs.r}px`, align: 'center', color: '#ffe885', stroke: '#2b1a15', strokeThickness: 5 * bs.r })
    .setOrigin(0.5, label ? 1 : 0.5)
    .setScale(1 / bs.r)
    .setDepth(d + 0.2);
  if (feelOn()) {
    // 脉动：圈放大淡出再回来，箭头上下点；一轮 1 秒、60 帧里都是连续的
    bs.tweens.add({ targets: ring, scale: 1.18, alpha: 0.55, duration: 500, yoyo: true, repeat: -1, ease: EASE.recover });
    bs.tweens.add({ targets: arrow, y: arrow.y - 12, duration: 500, yoyo: true, repeat: -1, ease: EASE.recover });
  }
  return { slot, ring, arrow };
}

function dropMark(bs: TdScene, m: PadMark): void {
  bs.tweens.killTweensOf([m.ring, m.arrow]);
  m.ring.destroy();
  m.arrow.destroy();
}
interface GuideState {
  s: unknown;
  marks: PadMark[];
  hint: HTMLElement | null;
  done: boolean;
}
const states = new WeakMap<TdScene, GuideState>();

function clear(bs: TdScene, st: GuideState): void {
  for (const m of st.marks) dropMark(bs, m);
  st.marks = [];
  st.hint?.remove();
  st.hint = null;
}

export function syncPadGuide(bs: TdScene): void {
  const s = bs.s;
  const op = s.level.opener;
  if (!bs.d.home && !op?.length) return;
  let st = states.get(bs);
  // 重开一局（状态对象换了）：旧的画面对象随场景已经没了，别再碰
  if (st && st.s !== s) {
    st.marks = [];
    st = undefined;
  }
  if (!st) {
    st = { s, marks: [], hint: null, done: false };
    states.set(bs, st);
  }
  if (st.done) return;
  if (st.marks.length === 0) {
    if (!guideVisible(s.wave, s.tick, s.next, s.over, 1)) {
      if (s.wave > 0 || s.over) st.done = true;
      return;
    }
    // 开局只挑一次，造塔后不再换新的推荐（只收起造了的那块）
    // 只看第一波真走的地面路（预告给的）：别的路这时没有敌人，推荐了也白造；预告里没有地面路就看全部
    const used = new Set((tdPreview(s, 1)[0]?.lanes ?? []).filter((l) => !l.fly).map((l) => l.lane));
    const all = tdRoutes(s);
    const picks = op?.length
      ? op.map((o) => o.slot).filter((i) => (s.slots[i]?.tower ?? 0) < 0)
      : recommendPads(s.slots, used.size > 0 ? all.map((r) => ({ ...r, open: r.open && used.has(r.lane) })) : all, 3);
    if (picks.length === 0) {
      st.done = true;
      return;
    }
    for (const slot of picks) {
      const kind = op?.find((o) => o.slot === slot)?.kind;
      st.marks.push(addMark(bs, slot, kind ? towerName(kind) : '', 0));
    }
    st.hint = el('div', 'hd-hint hd-padhint', op?.length ? `金圈的木台${openerText(op)}` : '在路边的木台造塔', bs.ui);
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

/**
 * 卡上定住的下一步在场上描金圈：要造的木台头上写塔名、要升的那座塔头上写「升级」（同种塔有好几座时卡上只写塔名分不清是哪座）。
 * 开局造法还没造完时不画（开局造法自己的金圈在），HeldStep 换了才重画
 */
const goalMarks = new WeakMap<TdScene, { s: unknown; step: HeldStep['step']; mark: PadMark | null }>();
export function syncGoalMark(bs: TdScene): void {
  const s = bs.s;
  const step = s.over || openerLeft(s) ? null : (bs.next?.step ?? null);
  const cur = goalMarks.get(bs);
  if (cur?.s === s && cur.step === step) return;
  // 重开一局时旧的圈随场景已经没了，别再碰
  if (cur?.s === s && cur.mark) dropMark(bs, cur.mark);
  // 塔比木台高，「升级」抬到塔顶上面
  goalMarks.set(bs, { s, step, mark: step ? (step.up ? addMark(bs, step.slot, '升级', 72) : addMark(bs, step.slot, towerName(step.kind), 0)) : null });
}
