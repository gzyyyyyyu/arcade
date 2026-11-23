import type Phaser from 'phaser';
import type { TdScene } from './TdScene.ts';
import { footCenter, iso, depthOf } from './iso.ts';
import { isoRing } from './tdfx.ts';
import { EASE } from './motion.ts';
import { feelOn } from './feel.ts';
import { DEPTH } from './depth.ts';
import { MARK_FONT, guideVisible, markScale } from './padguide.ts';
import { tdGarrisonOptions } from '../core/index.ts';
import { app } from './app.ts';
import { uiRoot } from './ui.ts';
import { garrisonLine, garrisonShort, openerLeft, towerName } from './td-ui.ts';
import type { NextStep } from './td-ui.ts';
import { slotLift } from './tdcliff.ts';

/**
 * 开局的木台高亮：只在倒数里、只圈战役写了开局造法（TdLevel.opener）的那几块，头上写造什么塔；造了就收起那块，第一波开打后全收。
 * 别的关和海盗来袭开局不另圈：预告卡「下一座造」那一块的金圈（syncGoalMark）就是开局该造的地方，两套圈指不同的台子会打架
 */
interface PadMark {
  slot: number;
  ring: Phaser.GameObjects.Ellipse | null;
  arrow: Phaser.GameObjects.Text;
  /** 字本来的世界 x、底边 y（塔头正上方；金字的脉动在这上面往上点） */
  x: number;
  y: number;
  /** 白字：字本身（摆到塔下面时箭头朝上）、塔脚的世界 y、上次摆位的时间 */
  label: string;
  foot: number;
  placedAt: number;
}

/** 金字脉动往上点的幅度（addMark 的 tween） */
const GOLD_BOB = 12;

/** 每个场景现在画着的金圈（开局造法和卡片目标两套共用），fitMarks 每帧按镜头缩放调字 */
const live = new WeakMap<TdScene, Set<PadMark>>();

/** 金圈加头上的字，开局造法的木台和卡片指的那块木台 / 那座塔同一个样子；ring 为 false 只写白字（驻守塔的说明，不是「造这里」） */
function addMark(bs: TdScene, slot: number, label: string, lift: number, ring = true): PadMark {
  const sl = bs.s.slots[slot]!;
  const f = footCenter(sl.x, sl.y, 2);
  const g = iso(f.gx, f.gy);
  const p = { x: g.x, y: g.y - slotLift(bs.s, slot) };
  const d = depthOf(f.gx, f.gy);
  const rg = isoRing(1.5);
  const rgo = ring ? bs.add.ellipse(p.x, p.y + 2, rg.w, rg.h, 0xffe885, 0.22).setStrokeStyle(4, 0xffe885, 0.95).setDepth(d - 0.4) : null;
  // 字压在建筑、英雄、敌人上面（跟着木台的深度会被主寨、站在台边的英雄、登陆的人堆挡住）；圈还贴着地
  const arrow = bs.add
    .text(p.x, p.y - 30 - lift, `${label}\n▼`, { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${MARK_FONT * bs.r}px`, align: 'center', color: ring ? '#ffe885' : '#ffffff', stroke: '#2b1a15', strokeThickness: 5 * bs.r })
    .setOrigin(0.5, 1)
    .setScale(markScale(bs.cameras.main.zoom) / bs.r)
    .setDepth(DEPTH.markerTop);
  if (feelOn() && ring) {
    // 脉动（只金字：白字要按界面卡片挪位置，不跳）：圈放大淡出再回来，箭头上下点；一轮 1 秒、60 帧里都是连续的
    if (rgo) bs.tweens.add({ targets: rgo, scale: 1.18, alpha: 0.55, duration: 500, yoyo: true, repeat: -1, ease: EASE.recover });
    bs.tweens.add({ targets: arrow, y: arrow.y - GOLD_BOB, duration: 500, yoyo: true, repeat: -1, ease: EASE.recover });
  }
  const m = { slot, ring: rgo, arrow, x: p.x, y: arrow.y, label, foot: p.y + 6, placedAt: -Infinity };
  let set = live.get(bs);
  if (!set) live.set(bs, (set = new Set()));
  set.add(m);
  return m;
}

function dropMark(bs: TdScene, m: PadMark): void {
  live.get(bs)?.delete(m);
  bs.tweens.killTweensOf(m.ring ? [m.ring, m.arrow] : [m.arrow]);
  m.ring?.destroy();
  m.arrow.destroy();
}

/** 手机竖屏、横屏（和选关页分页同一条线）：塔头上整句放不下，改写短句 */
const NARROW_QUERY = '(max-width:700px), (max-height:500px)';
/** 白字离屏幕边、卡片至少留多少（CSS 像素） */
const TAG_PAD = 6;
/** 白字多久重新摆一次位（要读界面卡片的位置，不每帧读） */
const PLACE_MS = 200;

/** 每帧：镜头缩放变了（双指、全景、跟拍）就把金圈的字调回屏幕上看得清的大小；白字每隔一会儿重新摆位，避开界面卡片 */
export function fitMarks(bs: TdScene): void {
  const set = live.get(bs);
  if (!set?.size) return;
  const k = markScale(bs.cameras.main.zoom) / bs.r;
  let white = false;
  for (const m of set) {
    // 重开一局时旧对象随场景已经没了
    if (!m.arrow.active) set.delete(m);
    else {
      if (m.arrow.scaleX !== k) m.arrow.setScale(k);
      white ||= !m.ring;
    }
  }
  const now = bs.time.now;
  if (!white || now - Math.max(...[...set].filter((m) => !m.ring).map((m) => m.placedAt)) < PLACE_MS) return;
  const boxes = [...hudBoxes(uiRoot(), 3), ...[...set].filter((m) => m.ring).map((m) => markBox(bs, m))];
  for (const m of set) {
    if (m.ring) continue;
    m.placedAt = now;
    const b = placeTag(bs, m, boxes);
    boxes.push(b);
  }
}

export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
const area = (a: Box): number => Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t);
const overlap = (a: Box, b: Box): number => area({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });

/**
 * 界面层上看得见的卡片、框、按钮、提示条（CSS 像素，相对视口）：透明的外框（界面根、守岛这一页、顶栏、屏边箭头那层）往里拆，
 * 占半屏以上的（整页遮罩、层容器）不算，看不见的（display:none、透明度 0）不算
 */
export function hudBoxes(root: HTMLElement, levels = 2): Box[] {
  const out: Box[] = [];
  const big = 0.4 * innerWidth * innerHeight;
  const walk = (p: Element, depth: number): void => {
    for (const c of p.children) {
      if (!(c instanceof HTMLElement)) continue;
      const r = c.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(c);
      if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      const clear = cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.backgroundImage === 'none' && cs.borderTopWidth === '0px';
      if (clear || r.width * r.height > big) {
        if (depth > 0) walk(c, depth - 1);
        continue;
      }
      out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
  };
  walk(root, levels);
  return out;
}

/** 世界坐标 → 视口里的 CSS 像素 */
function toCss(bs: TdScene, x: number, y: number): { x: number; y: number } {
  const cam = bs.cameras.main;
  const c = bs.game.canvas.getBoundingClientRect();
  return { x: c.left + ((x - cam.worldView.x) * cam.zoom) / bs.r, y: c.top + ((y - cam.worldView.y) * cam.zoom) / bs.r };
}

/** 一个标记的字现在占的地方（CSS 像素）；金字算上脉动往上点的那一截 */
export function markBox(bs: TdScene, m: PadMark): Box {
  const t = m.arrow;
  const z = bs.cameras.main.zoom / bs.r;
  const w = t.displayWidth * z;
  const h = t.displayHeight * z;
  const p = toCss(bs, t.x, t.y);
  const top = p.y - t.originY * h - (m.ring ? GOLD_BOB * z : 0);
  return { l: p.x - w / 2, t: top, r: p.x + w / 2, b: top + h + (m.ring ? GOLD_BOB * z : 0) };
}

/**
 * 白字摆位：几个位置里挑和卡片、金字、屏幕外重叠最少的（同样少挑靠前的）——塔头正上方，左右挪半句、一句，抬高一截，塔脚下面（箭头朝上）。
 * 试玩 11-23：电脑上被「新敌人」卡盖住后半句，手机横屏塔在「第 1/8 波」框底下只露一个「阶」
 */
function placeTag(bs: TdScene, m: PadMark, boxes: Box[]): Box {
  const t = m.arrow;
  const z = bs.cameras.main.zoom / bs.r;
  const w = t.displayWidth * z;
  const h = t.displayHeight * z;
  const head = toCss(bs, m.x, m.y);
  const foot = toCss(bs, m.x, m.foot);
  const c = bs.game.canvas.getBoundingClientRect();
  const view: Box = { l: Math.max(c.left, 0) + TAG_PAD, t: Math.max(c.top, 0) + TAG_PAD, r: Math.min(c.right, innerWidth) - TAG_PAD, b: Math.min(c.bottom, innerHeight) - TAG_PAD };
  const cands: Array<{ x: number; top: number; below: boolean }> = [];
  for (const dx of [0, -w / 2, w / 2, -w, w]) cands.push({ x: head.x + dx, top: head.y - h, below: false });
  cands.push({ x: head.x, top: head.y - 2 * h, below: false }, { x: foot.x, top: foot.y, below: true });
  for (const dx of [-w / 2, w / 2, -w, w]) cands.push({ x: foot.x + dx, top: foot.y, below: true });
  let best = cands[0]!;
  let bestBox: Box | null = null;
  let bestCost = Infinity;
  for (const q of cands) {
    // 先夹进屏幕里，再算压了多少
    const x = Math.min(Math.max(q.x, view.l + w / 2), view.r - w / 2);
    const top = Math.min(Math.max(q.top, view.t), view.b - h);
    const box: Box = { l: x - w / 2 - TAG_PAD / 2, t: top, r: x + w / 2 + TAG_PAD / 2, b: top + h };
    const cost = boxes.reduce((a, b) => a + overlap(box, b), 0);
    if (cost < bestCost - 0.5) {
      bestCost = cost;
      best = { ...q, x, top };
      bestBox = box;
    }
  }
  const text = best.below ? `▲\n${m.label}` : `${m.label}\n▼`;
  if (t.text !== text) t.setText(text);
  const cam = bs.cameras.main;
  const cv = bs.game.canvas.getBoundingClientRect();
  t.setOrigin(0.5, 0);
  t.setPosition(cam.worldView.x + ((best.x - cv.left) * bs.r) / cam.zoom, cam.worldView.y + ((best.top - cv.top) * bs.r) / cam.zoom);
  return bestBox!;
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

/** 战役开局倒数里，驻守塔头上写「你的加农炮 7 级 → 驻守 3 阶」，手机上短写「加农炮 7 级→驻守 3 阶」（白字、不画圈：金字金圈是「造这里」；摆位避开界面卡片、金字和屏幕边，见 placeTag）：基地养成在这一局里看得见；第一波开打、卖掉就收 */
const tags = new WeakMap<TdScene, GuideState>();

/** 现在画着的驻守塔白字占的地方（CSS 像素，相对视口）和字：冒烟拿它量和界面卡片有没有叠 */
export function garrisonTagBoxes(bs: TdScene): Array<Box & { text: string }> {
  return (tags.get(bs)?.marks ?? []).filter((m) => m.arrow.active).map((m) => ({ ...markBox(bs, m), text: m.label }));
}

export function syncGarrisonTags(bs: TdScene): void {
  const s = bs.s;
  if (s.mode !== 'campaign') return;
  let st = tags.get(bs);
  if (!st || st.s !== s) {
    st = { s, marks: [], done: false };
    tags.set(bs, st);
  }
  if (st.done) return;
  if (!guideVisible(s.wave, s.tick, s.next, s.over, 1)) {
    clear(bs, st);
    st.done = true;
    return;
  }
  if (st.marks.length === 0) {
    const opts = tdGarrisonOptions(app.profile);
    for (const t of s.towers) {
      const o = t.garrison && t.slot !== undefined ? opts.find((q) => q.kind === t.kind) : undefined;
      if (o && t.slot !== undefined) st.marks.push(addMark(bs, t.slot, (matchMedia(NARROW_QUERY).matches ? garrisonShort : garrisonLine)({ ...o, tier: t.tier ?? o.tier }), 72, false));
    }
    if (st.marks.length === 0) st.done = true;
  }
  const keep = st.marks.filter((m) => s.slots[m.slot]!.tower >= 0);
  for (const m of st.marks) if (!keep.includes(m)) dropMark(bs, m);
  st.marks = keep;
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
