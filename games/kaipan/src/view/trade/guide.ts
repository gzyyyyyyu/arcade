import Phaser from 'phaser';
import { isLesson, lessonAdvice, lessonDays, mindById, mindMoment, type GameState, type LessonAdvice, type MindId, type MindMoment } from '../../core/index.ts';
import { getSettings } from '../../platform/settings.ts';
import type { Rect } from '../rect.ts';
import { sound } from '../sound.ts';
import { COLOR, PHONE } from '../theme.ts';
import { TUTORIAL_ORDER, eligibleSteps, loadTutorial, markStep, setTutorialOn, tutorialCard, type StepHit, type TutorialStep } from '../tutorial.ts';
import { addImage, addPill } from '../ui/art.ts';
import { Button } from '../ui/button.ts';
import { addText } from '../ui/text.ts';
import { GUIDE_BOX_KEY } from '../ui/tooltip.ts';
import { viewOf } from '../viewport.ts';
import { TOP } from './layout.ts';

const W = 280;
const DEPTH = 250;
const GAP = 16;
/** 气泡底边两颗按钮（左「跳过全部引导」16+100、右「下一步」100+16）之间的空当，留出箭头半宽 16 */
const BTN_GAP: [number, number] = [116 + 16, W - 116 - 16];
/** 每个交易日盘前最多冒几个气泡（剩下的明天再说） */
const PER_DAY = 3;
const FREE: readonly TutorialStep[] = ['goal', 'colors'];
/** 讲完就算数的「说明」类步骤（玩家看到后接着操作也记为看过）；其余要玩家动手 */
const INFO: readonly TutorialStep[] = ['chat', 'heat', 'chain', 'boards'];
/**
 * 要玩家真的点一下才往下走的步骤：气泡上不放「下一步」，只写去点哪（试玩反馈：一路点下一步就跳过了操作）。
 * 卖出那步不在这里：不想卖正在涨的股票的人不能被逼着卖，它保留「知道了」；加仓、卖一半也算做过。
 */
const ACTION: Partial<Record<TutorialStep, string>> = { rec: '点「买入」试试', open: '点「开盘」试试' };

type Side = 'left' | 'right' | 'below' | 'above';

/** 各步骤气泡优先放在目标的哪一侧。 */
const SIDES: Record<TutorialStep, readonly Side[]> = {
  goal: ['below', 'left'],
  colors: ['above', 'below'],
  chat: ['left', 'below'],
  rec: ['left', 'above'],
  open: ['above', 'left', 'right'],
  heat: ['right', 'below'],
  chain: ['above', 'below', 'left', 'right'],
  boards: ['above', 'below', 'left', 'right'],
  sell: ['below', 'above', 'left', 'right'],
  bill: ['below', 'above'],
};

/** 新手课建议、心法例子要指的地方 */
export type GuideSpot = { kind: 'rec'; rec: number } | { kind: 'sell'; slot: number } | { kind: 'card'; stockId: string } | { kind: 'open' };

/**
 * 气泡有三种：教程一步、新手课「老师傅」的建议（只在新手课里出，这时不出教程）、心法卡（局面里出现当场例子、这张还没亮时弹一次）。
 * 摆放、箭头、避让只有一份（place / draw）。
 */
type Bubble = { kind: 'tutorial'; hit: StepHit } | { kind: 'coach'; advice: LessonAdvice } | { kind: 'mind'; moment: MindMoment };

/** 气泡里画什么（三种气泡共用一个画法） */
interface Body {
  head: string;
  /** 教程进度点：第 k 步 / 共 n 步 */
  dots: [number, number] | null;
  line: string;
  chips: readonly { icon: string; text: string; tone?: 'up' | 'down' | 'accent' }[];
  /** 小字补一句（心法那句话） */
  sub: string | null;
  /** 要玩家去点的地方（有它就不放主按钮） */
  todo: string | null;
  /** 主按钮 */
  next: { label: string; onClick: () => void } | null;
  /** 左下角的次按钮 */
  close: { label: string; tip: string; onClick: () => void };
  sides: readonly Side[];
}

interface GuideHost {
  /** 当前局面 */
  state(): GameState;
  /** 一步要指向的区域（世界坐标）；拿不到时返回 null（这一步先不出） */
  target(hit: StepHit): Rect | null;
  /** 新手课建议、心法例子指的区域；拿不到返回 null */
  spot(at: GuideSpot): Rect | null;
  /** 档案里已经亮了的心法 */
  minds(): readonly MindId[];
  /** 点了「记住了」：这张心法亮起来 */
  learnMind(id: MindId): void;
  /** 此刻可点的控件区域：气泡尽量不盖住它们 */
  avoid(): Rect[];
  /** 气泡出现 / 消失（通知自动化） */
  changed(): void;
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function grow(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 };
}

/** 新手课里点了「我自己来」的那一局（换局、读档重开画面都还记得这一局不再出建议） */
let coachOffFor = '';

const COACH_TODO: Record<LessonAdvice['kind'], string> = { buy: '点「买入」选「试一口」', sell: '点「卖出」', wait: '点「开盘」' };

function bubbleKey(b: Bubble): string {
  if (b.kind === 'tutorial') return b.hit.step;
  if (b.kind === 'coach') return 'coach';
  return `mind-${b.moment.id}`;
}

function adviceSpot(a: LessonAdvice): GuideSpot {
  return a.kind === 'buy' ? { kind: 'rec', rec: a.rec } : a.kind === 'sell' ? { kind: 'sell', slot: a.slot } : { kind: 'open' };
}

/**
 * 分步教程的气泡：在恰当时机用大箭头指向一个区域，一句不超过 15 字的话 + 图标签，带「k/N」进度、「下一步」与「跳过」。
 * 气泡摆在目标旁边、尽量不盖住此刻能点的按钮；结算动画期间收起，结束后按局面重新判断（被打断也能接着出）。
 * 进度与触发条件见 view/tutorial.ts。
 */
export class Guide {
  private readonly scene: Phaser.Scene;
  private readonly host: GuideHost;
  private root: Phaser.GameObjects.Container | null = null;
  private ring: Phaser.GameObjects.Graphics | null = null;
  /** 指向目标的大箭头（随高亮框一起销毁） */
  private arrow: Phaser.GameObjects.Graphics | null = null;
  /** 这一步画不画大箭头（藏起再显示时照旧） */
  private arrowOn = false;
  private next: Button | null = null;
  private close: Button | null = null;
  private current: Bubble | null = null;
  /** 这一局点过「记住了」的心法（档案存失败时也不再弹） */
  private dismissed = new Set<MindId>();
  private placedFor = '';
  private suspended = false;
  /** 当天盘前已经冒过的步骤 */
  private day = -1;
  private shown = new Set<TutorialStep>();

  constructor(scene: Phaser.Scene, host: GuideHost) {
    this.scene = scene;
    this.host = host;
  }

  /** 正在显示的步骤（自动化与截图用）。 */
  get step(): TutorialStep | null {
    const c = this.current;
    return this.root?.visible && c?.kind === 'tutorial' ? c.hit.step : null;
  }

  private tutorialStep(): TutorialStep | null {
    const c = this.current;
    return c?.kind === 'tutorial' ? c.hit.step : null;
  }

  /** 按局面决定显示哪个气泡（没有可出的就收起）。 */
  sync(s: GameState): void {
    if (this.suspended) return;
    if (s.phase === 'premarket' && s.dayIndex !== this.day) {
      this.day = s.dayIndex;
      this.shown.clear();
    }
    const picked = this.pick(s);
    if (!picked) {
      this.clear();
      return;
    }
    const { bubble, target } = picked;
    const key = bubbleKey(bubble);
    const extra = bubble.kind === 'tutorial' ? bubble.hit.stockId : bubble.kind === 'coach' ? `${bubble.advice.kind}:${bubble.advice.why}` : bubble.moment.text;
    const sig = `${key}:${extra}:${Math.round(target.x)},${Math.round(target.y)},${Math.round(target.w)},${Math.round(target.h)}`;
    if (this.root && this.placedFor === sig) {
      this.root.setVisible(true);
      this.ring?.setVisible(true);
      this.arrow?.setVisible(this.arrowOn);
      return;
    }
    const fresh = !this.current || bubbleKey(this.current) !== key;
    this.current = bubble;
    this.placedFor = sig;
    if (bubble.kind === 'tutorial' && s.phase === 'premarket') this.shown.add(bubble.hit.step);
    this.draw(this.body(bubble, s), target);
    if (fresh) sound.cue({ type: 'guide' });
    this.host.changed();
  }

  /**
   * 新手课里不出教程：有心法的当场例子先讲心法（刚吃了亏的那一刻最该讲），再出老师傅的建议。
   * 别的局先出教程，没有教程可出再看有没有心法的当场例子（实盘不弹）。
   */
  private pick(s: GameState): { bubble: Bubble; target: Rect } | null {
    if (isLesson(s)) {
      const mind = this.pickMind(s);
      if (mind || coachOffFor === s.seed) return mind;
      const advice = lessonAdvice(s);
      const target = advice ? this.host.spot(adviceSpot(advice)) : null;
      return advice && target ? { bubble: { kind: 'coach', advice }, target } : null;
    }
    const hits = eligibleSteps(s, loadTutorial());
    const cur = this.tutorialStep();
    let hit: StepHit | undefined = cur ? hits.find((h) => h.step === cur) : undefined;
    if (!hit) {
      // 「目标」「红涨绿跌」各一句话，不占每天 3 步的名额
      const used = [...this.shown].filter((x) => !FREE.includes(x)).length;
      hit = hits.find((h) => h.step === 'bill' || FREE.includes(h.step) || this.shown.has(h.step) || used < PER_DAY);
    }
    if (hit) {
      const target = this.host.target(hit);
      return target ? { bubble: { kind: 'tutorial', hit }, target } : null;
    }
    return s.setup?.live ? null : this.pickMind(s);
  }

  private pickMind(s: GameState): { bubble: Bubble; target: Rect } | null {
    const moment = mindMoment(s);
    if (!moment || this.dismissed.has(moment.id) || this.host.minds().includes(moment.id)) return null;
    const target = this.host.spot(moment.stockId ? { kind: 'card', stockId: moment.stockId } : { kind: 'open' });
    return target ? { bubble: { kind: 'mind', moment }, target } : null;
  }

  private body(b: Bubble, s: GameState): Body {
    if (b.kind === 'tutorial') {
      const step = b.hit.step;
      const card = tutorialCard(step, s, b.hit.stockId, getSettings().colorScheme);
      const k = TUTORIAL_ORDER.indexOf(step) + 1;
      const n = TUTORIAL_ORDER.length;
      const todo = ACTION[step] ?? null;
      return {
        head: `${k}/${n}`,
        dots: [k, n],
        line: card.line,
        chips: card.chips,
        sub: null,
        todo,
        next: todo ? null : { label: k >= n ? '知道了' : '下一步 ›', onClick: () => this.ack() },
        // 「跳过」只写「跳过」时试玩的人以为只跳这一步：写明是全部引导（点了以后都不再出现，设置里能重开）
        close: { label: '跳过全部引导', tip: '以后都不再弹引导。想再看一遍，在设置里重新打开。', onClick: () => this.skipAll() },
        sides: SIDES[step],
      };
    }
    if (b.kind === 'coach') {
      const a = b.advice;
      const mind = mindById(a.mind);
      return {
        head: `老师傅 · 第 ${s.dayIndex + 1}/${lessonDays()} 天`,
        dots: null,
        line: a.why,
        // 试玩新人以为要赚很多才算赢：每条都带上「不亏就过」
        chips: [{ icon: 'glyph:star', text: mind.name, tone: 'accent' }, { icon: 'glyph:house', text: '不亏就过' }],
        sub: mind.line,
        todo: COACH_TODO[a.kind],
        next: null,
        close: {
          label: '我自己来',
          tip: '这一局不再给建议，自己选。',
          onClick: () => {
            coachOffFor = s.seed;
            this.clear();
            this.sync(this.host.state());
          },
        },
        sides: a.kind === 'buy' ? SIDES.rec : a.kind === 'sell' ? SIDES.sell : SIDES.open,
      };
    }
    const m = b.moment;
    const mind = mindById(m.id);
    return {
      head: `心法 · ${mind.name}`,
      dots: null,
      line: m.text,
      chips: [],
      sub: mind.line,
      todo: null,
      next: { label: '记住了', onClick: () => this.learn(m.id) },
      close: { label: '以后再说', tip: '先关掉，下次遇到再讲。', onClick: () => this.dismiss(m.id) },
      sides: m.stockId ? SIDES.sell : SIDES.open,
    };
  }

  /** 「记住了」：心法亮起来（图鉴里能翻看），这张以后不再弹。 */
  private learn(id: MindId): void {
    this.dismissed.add(id);
    this.host.learnMind(id);
    this.clear();
    this.sync(this.host.state());
  }

  /** 「以后再说」：这一局不再弹这张。 */
  private dismiss(id: MindId): void {
    this.dismissed.add(id);
    this.clear();
    this.sync(this.host.state());
  }

  /** 结算动画等期间收起（不算看过）。 */
  suspend(): void {
    this.suspended = true;
    this.root?.setVisible(false);
    this.ring?.setVisible(false);
    this.arrow?.setVisible(false);
  }

  /** 动画结束：按新局面重新判断。 */
  resume(s: GameState): void {
    this.suspended = false;
    this.sync(s);
  }

  /** 玩家做了某件事：对应的步骤记为完成；正显示着的说明类步骤也算看过。 */
  acted(step: TutorialStep): void {
    const cur = this.tutorialStep();
    if (!cur && this.current) {
      // 老师傅、心法气泡：玩家动手了就收起，按新局面重判
      this.clear();
      return;
    }
    if (cur && cur !== step && INFO.includes(cur) && this.root?.visible) markStep(cur);
    markStep(step);
    if (cur === step || (cur && INFO.includes(cur))) this.clear();
  }

  /** 「知道了」：记为看过，接着看有没有下一步。 */
  private ack(): void {
    const cur = this.tutorialStep();
    if (cur) markStep(cur);
    this.clear();
    this.sync(this.host.state());
  }

  /** 「跳过教程」：以后都不再出现（设置里可以重新打开）。 */
  private skipAll(): void {
    setTutorialOn(false);
    this.clear();
  }

  private clear(): void {
    const had = this.root !== null;
    this.scene.data?.remove(GUIDE_BOX_KEY);
    this.root?.destroy();
    this.ring?.destroy();
    this.root = null;
    this.ring = null;
    this.next = null;
    this.close = null;
    this.current = null;
    this.placedFor = '';
    if (had) this.host.changed();
  }

  /** 气泡的位置：按优先侧依次试，沿边滑动，选第一处不盖住目标和可点控件的；都不行取盖得最少的。 */
  private place(prefer: readonly Side[], target: Rect, h: number): { x: number; y: number; side: Side; inside?: boolean } {
    const avoid = this.host.avoid().map((r) => grow(r, 4));
    const tgt = grow(target, 8);
    // 0.9.2 手机横屏：屏幕矮，气泡放到目标左右会压住顶栏（目标、日期、账户）和要点的卡片。
    // 手机上放在目标的反方向（目标在上半屏就放下面，在下半屏就放上面），并把顶栏当成不能压的
    if (PHONE) avoid.push(grow(TOP, 2));
    const minY = 8;
    const V = viewOf(this.scene);
    const clampX = (x: number): number => Math.max(8, Math.min(V.w - W - 8, x));
    const clampY = (y: number): number => Math.max(minY, Math.min(V.h - h - 8, y));
    const slides = [0, -40, 40, -80, 80, -130, 130, -190, 190];
    let best: { x: number; y: number; side: Side; cost: number } | null = null;
    const away: Side[] = target.y + target.h / 2 < V.h / 2 ? ['below', 'above'] : ['above', 'below'];
    // 手机上只放上下：放左右再沿边滑开，气泡会和指向目标的箭头脱开
    // 0.19.0 手机世界矮到 404：目标是整块推荐列表时上下都放不下，再试左右（总比放进列表里盖住「买入」好）
    const sides = PHONE ? [...away, 'left', 'right'] as Side[] : [...prefer, ...(['left', 'right', 'below', 'above'] as Side[]).filter((x) => !prefer.includes(x))];
    // 上下放时还试离目标远一点（竖屏：目标下面是群聊、上面紧贴页签，贴着放会压住页签，往上让过页签只盖空着的持仓格）
    const fars = [0, 40, 80, 120, 160];
    for (const [rank, side] of sides.entries()) {
      for (const far of side === 'left' || side === 'right' ? [0] : fars) {
        for (const d of slides) {
          let x: number;
          let y: number;
          if (side === 'left' || side === 'right') {
            x = side === 'left' ? target.x - W - GAP : target.x + target.w + GAP;
            // 很高的目标（整列看板）：气泡靠上放，别压到中间的持仓卡
            y = clampY((target.h > 300 ? target.y + 40 : target.y + target.h / 2 - h / 2) + d);
            if (x < 8 || x + W > V.w - 8) continue;
          } else {
            y = side === 'above' ? target.y - h - GAP - far : target.y + target.h + GAP + far;
            x = clampX(target.x + target.w / 2 - W / 2 + d);
            // 只差一点放不下（「挑一样」下面那条空地）：往里挪一点，只压到目标的留边，不退到压住卡片的位置
            if (y + h > V.h - 8 && y + h - (V.h - 8) <= 24) y = V.h - 8 - h;
            if (y < minY && minY - y <= 24) y = minY;
            if (y < minY || y + h > V.h - 8) continue;
          }
          const box = { x, y, w: W, h };
          const cost = overlap(box, tgt) * 4 + avoid.reduce((n, r) => n + overlap(box, r), 0);
          const score = cost + rank * 0.5 + Math.abs(d) * 0.01 + far * 0.02;
          if (cost === 0) return { x, y, side };
          if (!best || score < best.cost) best = { x, y, side, cost: score };
        }
      }
    }
    if (best) return best;
    // 目标几乎占满整屏（手机横屏上的「挑一样」）：四周都放不下，就放进目标里面，只避开按钮
    let inside: { x: number; y: number; cost: number } | null = null;
    for (let y = clampY(target.y); y <= clampY(target.y + target.h - h); y += 20) {
      for (let x = clampX(target.x); x <= clampX(target.x + target.w - W); x += 20) {
        const cost = avoid.reduce((n, r) => n + overlap({ x, y, w: W, h }, r), 0);
        if (!inside || cost < inside.cost) inside = { x, y, cost };
      }
    }
    if (inside) return { x: inside.x, y: inside.y, side: 'below', inside: true };
    return { x: clampX(target.x), y: clampY(target.y + target.h + GAP), side: 'below' };
  }

  private draw(body: Body, target: Rect): void {
    this.root?.destroy();
    this.ring?.destroy();
    const s = this.scene;
    const kids: Phaser.GameObjects.GameObject[] = [];
    const head = addText(s, 16, 12, body.head, { size: 12, bold: true, color: COLOR.accentDark, num: body.dots !== null });
    kids.push(head);
    if (body.dots) {
      // 第 k/N 步：按教程顺序编号，点点表示走到哪了
      const [k, n] = body.dots;
      const dots = s.add.graphics();
      for (let i = 0; i < n; i++) {
        dots.fillStyle(i < k ? COLOR.accent : COLOR.ink, i < k ? 1 : 0.18).fillCircle(64 + i * 11, 20, i === k - 1 ? 4 : 3);
      }
      kids.push(dots);
    }
    const line = addText(s, 16, 36, body.line, { size: 17, bold: true, wrap: W - 32 });
    kids.push(line);
    let below = line.y + line.height;
    if (body.sub) {
      const sub = addText(s, 16, Math.round(below + 6), body.sub, { size: 13, color: COLOR.muted, wrap: W - 32 });
      kids.push(sub);
      below = sub.y + sub.height;
    }
    // 图标签：图标 + 数字/两三个字
    let cx = 16;
    const cy = Math.round(below + 10);
    for (const c of body.chips) {
      const tone = c.tone === 'up' ? COLOR.up : c.tone === 'down' ? COLOR.down : c.tone === 'accent' ? COLOR.accentDark : COLOR.ink;
      const label = addText(s, 0, 0, c.text, { size: 13, bold: true, color: tone, num: /^[-+¥\d]/.test(c.text) });
      const w = Math.round(label.width + 40);
      if (cx + w > W - 12) break;
      const pill = addPill(s, cx, cy, w, 28, 0xffffff);
      const icon = addImage(s, cx + 15, cy + 14, c.icon, 20);
      if (c.icon.startsWith('glyph:arrow') && c.tone && c.tone !== 'accent') icon.setTint(tone);
      label.setPosition(cx + 28, cy + 14 - label.height / 2);
      kids.push(pill, icon, label);
      cx += w + 6;
    }
    const chipsH = body.chips.length > 0 ? 28 + 12 : 2;
    const h = Math.round(cy + chipsH + 34 + 12);
    const { x, y, side, inside } = this.place(body.sides, target, h);
    const bg = s.add.rectangle(0, 0, W, h, 0xfffbe8).setOrigin(0, 0).setRounded(14).setStrokeStyle(3, COLOR.ink, 1);
    const shadow = s.add.rectangle(3, 5, W, h, COLOR.ink, 0.18).setOrigin(0, 0).setRounded(14);
    // 指向目标的小三角
    const tri = s.add.graphics();
    tri.fillStyle(0xfffbe8, 1).lineStyle(3, COLOR.ink, 1);
    const tcx = target.x + target.w / 2 - x;
    const tcy = target.y + target.h / 2 - y;
    // 气泡在目标上面时，大箭头的尾巴会伸进气泡底边那一排按钮：箭头挪到「跳过全部引导」和「下一步」之间的空当（还得落在目标上）
    const gapX = Math.max(BTN_GAP[0], Math.min(BTN_GAP[1], tcx));
    const ax = side === 'above' && x + gapX >= target.x + 12 && x + gapX <= target.x + target.w - 12 ? gapX : Math.max(22, Math.min(W - 22, tcx));
    const ay = Math.max(22, Math.min(h - 22, tcy));
    const pts =
      side === 'below'
        ? [ax - 10, 1, ax, -12, ax + 10, 1]
        : side === 'above'
          ? [ax - 10, h - 1, ax, h + 12, ax + 10, h - 1]
          : side === 'left'
            ? [W - 1, ay - 10, W + 12, ay, W - 1, ay + 10]
            : [1, ay - 10, -12, ay, 1, ay + 10];
    const p = pts as [number, number, number, number, number, number];
    if (!inside) {
      tri.fillTriangle(p[0], p[1], p[2], p[3], p[4], p[5]);
      tri.lineBetween(p[0], p[1], p[2], p[3]).lineBetween(p[2], p[3], p[4], p[5]);
    }
    const next = body.next;
    this.next = next ? new Button(s, W - 16 - 100, h - 46, { width: 100, height: 34, label: next.label, variant: 'primary', fontSize: 14, onClick: next.onClick }) : null;
    if (body.todo && !next) kids.push(addText(s, W - 16, h - 29, `${body.todo} ›`, { size: 14, bold: true, color: COLOR.accentDark, originX: 1, originY: 0.5 }));
    const close = body.close;
    this.close = new Button(s, 16, h - 43, { width: 100, height: 28, label: close.label, variant: 'ghost', fontSize: 12, onClick: close.onClick });
    this.close.tooltip(() => ({ title: close.label, body: close.tip }));
    // 吞掉气泡上的点击（不穿透到下层）
    const hit = s.add.rectangle(0, 0, W, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    this.root = s.add.container(x, y, [shadow, hit, bg, tri, ...kids, this.close, ...(this.next ? [this.next] : [])]).setDepth(DEPTH);
    // 悬停说明框避开教程气泡（第一屏两者叠在一起看不清）
    s.data.set(GUIDE_BOX_KEY, { x, y, w: W, h });
    // 目标高亮框 + 指向目标的大箭头（单独一层，不随气泡移动）
    this.ring = s.add.graphics().setDepth(DEPTH - 1);
    this.ring.lineStyle(4, COLOR.accent, 1).strokeRoundedRect(target.x - 5, target.y - 5, target.w + 10, target.h + 10, 12);
    // 气泡为让过页签离目标远了（中间隔着别的控件）：大箭头会压在那些控件上（竖屏「推荐」页签的字），不画，只留气泡尖角和高亮框
    const apart = side === 'above' ? target.y - (y + h) : side === 'below' ? y - (target.y + target.h) : 0;
    this.arrowOn = !inside && apart <= GAP + 8;
    const arrow = this.pointer(target, side, side === 'above' ? x + ax : undefined).setVisible(this.arrowOn);
    this.arrow = arrow;
    if (!(s.data.get('calm') as boolean)) {
      s.tweens.add({ targets: this.ring, alpha: { from: 1, to: 0.35 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const dx = side === 'left' ? 8 : side === 'right' ? -8 : 0;
      const dy = side === 'above' ? 8 : side === 'below' ? -8 : 0;
      s.tweens.add({ targets: arrow, x: arrow.x + dx, y: arrow.y + dy, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.root.setAlpha(0).setY(y + 8);
      s.tweens.add({ targets: this.root, y, alpha: 1, duration: 180, ease: 'Quad.easeOut' });
    }
  }

  /** 目标边上的大箭头，从气泡那一侧指向目标（挂在高亮框那一层，一起销毁）。 */
  private pointer(target: Rect, side: Side, atX?: number): Phaser.GameObjects.Graphics {
    // 0.5.1：箭头画在气泡上面一层，不会被气泡挡住
    const g = this.scene.add.graphics().setDepth(DEPTH + 1);
    // 箭头朝右画在原点左侧，再按方向旋转
    g.fillStyle(COLOR.accent, 1).lineStyle(3, COLOR.ink, 1);
    const shape = [-34, -7, -16, -7, -16, -15, 0, 0, -16, 15, -16, 7, -34, 7];
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < shape.length; i += 2) pts.push(new Phaser.Math.Vector2(shape[i], shape[i + 1]));
    g.fillPoints(pts, true).strokePoints(pts, true);
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;
    // 气泡在左边 → 箭头在目标左沿、朝右
    if (side === 'left') g.setPosition(target.x - 6, cy);
    else if (side === 'right') g.setPosition(target.x + target.w + 6, cy).setRotation(Math.PI);
    else if (side === 'above') g.setPosition(atX ?? cx, target.y - 6).setRotation(Math.PI / 2);
    else g.setPosition(cx, target.y + target.h + 6).setRotation(-Math.PI / 2);
    // 跟高亮框放进同一个 Graphics 的生命周期：框销毁时箭头一起走
    const ring = this.ring;
    ring?.once(Phaser.GameObjects.Events.DESTROY, () => g.destroy());
    return g;
  }

  /** 正在显示的气泡（步骤与区域）。 */
  box(): { step: string; rect: Rect } | null {
    if (!this.root?.visible || !this.current) return null;
    const bg = this.root.getBounds();
    return { step: bubbleKey(this.current), rect: { x: bg.x, y: bg.y, w: bg.width, h: bg.height } };
  }

  controls(): Record<string, { x: number; y: number }> {
    if (!this.root?.visible || !this.close) return {};
    return { ...(this.next ? { 'guide:next': this.next.center() } : {}), 'guide:close': this.close.center() };
  }

  destroy(): void {
    this.root?.destroy();
    this.ring?.destroy();
    this.root = null;
    this.ring = null;
  }
}
