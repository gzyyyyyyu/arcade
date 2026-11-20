import type Phaser from 'phaser';
import type { TdScene } from './TdScene.ts';
import { tdPreview, tdRoutes } from '../core/index.ts';
import { footCenter, iso, depthOf } from './iso.ts';
import { isoRing } from './tdfx.ts';
import { EASE } from './motion.ts';
import { feelOn } from './feel.ts';
import { el } from './ui.ts';
import { recommendPads, guideVisible } from './padguide.ts';
import { openerText, towerName } from './td-ui.ts';
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
 * 预告卡写「钱够就升级 火枪塔」时，场上那座塔描金圈、头上写「升级」：同种塔有好几座时卡上只写塔名分不清是哪座。
 * 跟着卡上定住的下一步走（HeldStep 换了才重画），卡上不是升级就收起
 */
const upMarks = new WeakMap<TdScene, { s: unknown; step: HeldStep['step']; mark: PadMark | null }>();
export function syncUpMark(bs: TdScene, held: HeldStep | undefined): void {
  const s = bs.s;
  const step = s.over ? null : (held?.step ?? null);
  const cur = upMarks.get(bs);
  if (cur?.s === s && cur.step === step) return;
  // 重开一局时旧的圈随场景已经没了，别再碰
  if (cur?.s === s && cur.mark) dropMark(bs, cur.mark);
  // 塔比木台高，字抬到塔顶上面
  upMarks.set(bs, { s, step, mark: step && step.slot >= 0 ? addMark(bs, step.slot, '升级', 72) : null });
}
