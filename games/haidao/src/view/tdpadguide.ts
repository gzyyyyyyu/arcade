import type Phaser from 'phaser';
import type { TdScene } from './TdScene.ts';
import { tdPreview, tdRoutes } from '../core/index.ts';
import { footCenter, iso, depthOf } from './iso.ts';
import { isoRing } from './tdfx.ts';
import { EASE } from './motion.ts';
import { feelOn } from './feel.ts';
import { el } from './ui.ts';
import { recommendPads, guideVisible } from './padguide.ts';

/** 海盗来袭开局的木台高亮：只在倒数里、只对挑出来的几块空木台；造了就收起那块，第一波开打后全收 */
interface PadMark {
  slot: number;
  ring: Phaser.GameObjects.Ellipse;
  arrow: Phaser.GameObjects.Text;
}
interface GuideState {
  s: unknown;
  marks: PadMark[];
  hint: HTMLElement | null;
  done: boolean;
}
const states = new WeakMap<TdScene, GuideState>();

function clear(bs: TdScene, st: GuideState): void {
  for (const m of st.marks) {
    bs.tweens.killTweensOf([m.ring, m.arrow]);
    m.ring.destroy();
    m.arrow.destroy();
  }
  st.marks = [];
  st.hint?.remove();
  st.hint = null;
}

export function syncPadGuide(bs: TdScene): void {
  if (!bs.d.home) return;
  const s = bs.s;
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
    const picks = recommendPads(s.slots, used.size > 0 ? all.map((r) => ({ ...r, open: r.open && used.has(r.lane) })) : all, 3);
    if (picks.length === 0) {
      st.done = true;
      return;
    }
    const still = !feelOn();
    for (const slot of picks) {
      const sl = s.slots[slot]!;
      const f = footCenter(sl.x, sl.y, 2);
      const p = iso(f.gx, f.gy);
      const d = depthOf(f.gx, f.gy);
      const rg = isoRing(1.5);
      const ring = bs.add.ellipse(p.x, p.y + 2, rg.w, rg.h, 0xffe885, 0.22).setStrokeStyle(4, 0xffe885, 0.95).setDepth(d - 0.4);
      const arrow = bs.add.text(p.x, p.y - 44, '▼', { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${28 * bs.r}px`, color: '#ffe885', stroke: '#2b1a15', strokeThickness: 5 * bs.r }).setOrigin(0.5).setScale(1 / bs.r).setDepth(d + 0.2);
      if (!still) {
        // 脉动：圈放大淡出再回来，箭头上下点；一轮 1 秒、60 帧里都是连续的
        bs.tweens.add({ targets: ring, scale: 1.18, alpha: 0.55, duration: 500, yoyo: true, repeat: -1, ease: EASE.recover });
        bs.tweens.add({ targets: arrow, y: p.y - 56, duration: 500, yoyo: true, repeat: -1, ease: EASE.recover });
      }
      st.marks.push({ slot, ring, arrow });
    }
    st.hint = el('div', 'hd-hint hd-padhint', '在路边的木台造塔', bs.ui);
  }
  // 造了的收起；倒数结束 / 第一波开打 / 全造完整个收起
  const keep = st.marks.filter((m) => s.slots[m.slot]!.tower < 0);
  for (const m of st.marks) {
    if (keep.includes(m)) continue;
    bs.tweens.killTweensOf([m.ring, m.arrow]);
    m.ring.destroy();
    m.arrow.destroy();
  }
  st.marks = keep;
  if (!guideVisible(s.wave, s.tick, s.next, s.over, keep.length)) {
    clear(bs, st);
    st.done = true;
  }
}
