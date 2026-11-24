import Phaser from 'phaser';
import { formatMoney, fx, itemView, rewardView, validate, weeklyInfo, weeklyRule, type CalendarView, type EventView, type GameState, type RewardView } from '../../core/index.ts';
import { avatarKey, hasArt, itemKey } from '../assets.ts';
import { BILL_MS } from './billTiming.ts';
import type { Animator } from '../fx/anim.ts';
import { addBackdrop, shake } from '../fx/effects.ts';
import { goldGlint, sparkles } from '../fx/particles.ts';
import { EVENT_ORDER, eventOptionForKey, shortItemName } from '../labels.ts';
import { sound } from '../sound.ts';
import { ROLE_WORD } from '../glossary.ts';
import { COLOR, FS, ITEM_KIND_COLOR, RARITY_COLOR, THEME_COLOR, TYPE, signColor, textOn } from '../theme.ts';
import { addGlyph, addImage, addPaper, addPill } from '../ui/art.ts';
import { actionButtons, iconChip, moneyShort, dialogW } from '../ui/dialog.ts';
import { DONE_H, doneButton, extraChip } from './tempoFx.ts';
import { bindTooltip } from '../ui/tooltip.ts';
import { Button } from '../ui/button.ts';
import { StockGuy } from '../ui/stockGuy.ts';
import { addText, fitWidth, markCut, setWrap } from '../ui/text.ts';
import { phoneLayout, viewOf } from '../viewport.ts';

const DEPTH = 200;

/** 浮层：遮罩 + 内容，统一深度，销毁时一起走。 */
function overlay(scene: Phaser.Scene, dim = 0.45): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0).setDepth(DEPTH);
  c.add(addBackdrop(scene, dim));
  return c;
}

interface BillInfo {
  month: number;
  name: string;
  amount: number;
  before: number;
  after: number;
  paid: boolean;
  credit: boolean;
  /** 突发账单明细（总额已含在 amount 里） */
  extras: { name: string; amount: number }[];
  /** 月供之外另付给银行的利息（没借钱为缺省） */
  interest?: number;
  /** 有月度目标的月份：目标叫什么、达成没有（写在账单上） */
  goal?: { name: string; done: boolean };
  /** 短局（最后一个月之外）：剩下的账单加首付还差多少，作为一行收据（labels.ts 的 downPaymentRow） */
  downPayment?: { label: string; value: string; enough: boolean };
}


/**
 * 月底账单：账单纸从桌面滑上来、各行依次出现、总数滚动砸下，盖「还上了」或「没还上」章；信用卡代还单独提示。
 * quick（设置里「月底账单：简短」）：直接出完整的账单和章，不播舞台。返回浮层，由调用方决定停留多久后销毁。
 */
export async function playBill(scene: Phaser.Scene, anim: Animator, b: BillInfo, quick = false): Promise<Phaser.GameObjects.Container> {
  const c = overlay(scene);
  const W = 320;
  const H = 400;
  const V = viewOf(scene);
  // 手机横屏高度只够放下账单本身：卡片往左挪一点，印章和信用卡提示放在右边
  // 竖屏版左右没地方：卡片居中，印章骑在账单下沿（不盖「剩下」的钱），信用卡提示放在印章下面
  const ph = phoneLayout(scene) && V.w > V.h;
  const pt = phoneLayout(scene) && !ph;
  const x = Math.round(V.w / 2 - W / 2 - (ph ? 90 : 0));
  const y = ph ? Math.round((V.h - H) / 2) : pt ? Math.round((V.h - H) / 2 - 30) : 150;
  const card = scene.add.container(x, y);
  card.add(addImage(scene, W / 2, H / 2, 'ui:bill_card', W, H));
  card.add(addText(scene, 190, 42, `${b.month}月账单`, { size: 24, bold: true, originX: 0.5, originY: 0.5 }));
  const stage = !quick && !anim.instant;
  const rowNodes: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[][] = [];
  /** 金额行：出现时数字从 0 滚到位（和 rowNodes 同下标；没有金额的行、目标行为 null） */
  const rolls: ({ value: Phaser.GameObjects.Text; to: number } | null)[] = [];
  const row = (ty: number, k: string, v: string, color: number = COLOR.ink, money?: number): void => {
    const value = addText(scene, W - 30, ty, v, { size: 16, bold: true, num: true, color, originX: 1 });
    // 突发账单的名目可能很长：在金额左边折行，字号也小一号
    const room = W - 30 - value.width - 34 - 12;
    let label = addText(scene, 34, ty, k, { size: 15, color: COLOR.muted });
    if (label.width > room) {
      label.destroy();
      label = addText(scene, 34, ty - 2, k, { size: 13, color: COLOR.muted, wrap: room, lineSpacing: 1 });
    }
    card.add([label, value]);
    rowNodes.push([label, value]);
    rolls.push(money === undefined ? null : { value, to: money });
  };
  const extra = b.extras.reduce((n, e) => n + e.amount, 0);
  const rows: [string, string, number?, number?][] = [[b.name, formatMoney(b.amount - extra), undefined, b.amount - extra]];
  for (const e of b.extras.slice(0, 3)) rows.push([e.name, formatMoney(e.amount), COLOR.danger, e.amount]);
  if (b.extras.length > 0) rows.push(['一共要还', formatMoney(b.amount), undefined, b.amount]);
  if (b.interest && b.interest > 0) rows.push(['利息', formatMoney(b.interest), COLOR.danger, b.interest]);
  rows.push(['还前账户', formatMoney(b.before), COLOR.muted, b.before]);
  // 这笔账单吃掉账户的几成：保守打法被账单慢慢放血时一眼看得出来（也补上收据中间那行空线）
  if (b.before > 0 && rows.length < 4) rows.push(['占账户', `${Math.min(999, Math.round((b.amount / b.before) * 100))}%`, b.amount > b.before ? COLOR.danger : COLOR.muted]);
  if (b.downPayment) rows.push([b.downPayment.label, b.downPayment.value, b.downPayment.enough ? COLOR.up : COLOR.accentDark]);
  const step = rows.length <= 3 ? 44 : Math.floor(170 / rows.length);
  rows.forEach(([k, v, color, money], i) => row(98 + i * step, k, v, color, money));
  const totalLabel = b.paid ? (b.credit ? `${itemView('credit').name}垫上了` : '剩下') : '还差';
  const totalValue = b.paid ? formatMoney(b.after) : formatMoney(b.amount - b.before);
  card.add(addText(scene, 40, 308, totalLabel, { size: 15, color: COLOR.muted, originY: 0.5 }));
  const total = addText(scene, W - 40, 308, totalValue, { size: 24, bold: true, num: true, color: b.paid ? COLOR.ink : COLOR.danger, originX: 1, originY: 0.5 });
  card.add(total);
  // 本月目标：写在账单上（靶心图标，达成绿字、没达成灰字）
  if (b.goal) {
    const g = addText(scene, W / 2 + 12, 350, `本月目标「${b.goal.name}」${b.goal.done ? '达成' : '没达成'}`, { size: 13, bold: true, color: b.goal.done ? COLOR.up : COLOR.muted, originX: 0.5, originY: 0.5 });
    const icon = addGlyph(scene, g.x - g.width / 2 - 12, 350, 'target', 18);
    if (!b.goal.done) icon.setTint(0xbbb0b6);
    card.add([icon, g]);
    rowNodes.push([icon, g]);
    rolls.push(null);
  }
  c.add(card);
  sound.cue({ type: 'bill' });
  if (stage) {
    // 纸从桌面（画面底下）滑上来；各行、总数先藏着，依次出现
    for (const n of rowNodes.flat()) n.setAlpha(0);
    total.setAlpha(0);
    card.y = V.h + 40;
    await anim.count(V.h + 40, y, BILL_MS.slide, (v) => card.setY(v), 'Back.easeOut');
    const per = Math.min(BILL_MS.rowMax, Math.floor(BILL_MS.rows / Math.max(1, rowNodes.length)));
    for (const [i, nodes] of rowNodes.entries()) {
      anim.fx({ targets: nodes, alpha: 1, duration: 120 }, () => nodes.forEach((n) => n.setAlpha(1)));
      // 金额从 0 滚到位（不等它滚完，下一行照常出现）
      const roll = rolls[i];
      if (roll && !anim.calm) {
        roll.value.setText(formatMoney(0));
        void anim.count(0, roll.to, 160, (v) => roll.value.active && roll.value.setText(formatMoney(v)));
      }
      // 一行一声，音调一行比一行高
      if (!anim.instant) sound.cue({ type: 'countUp', progress: (i + 1) / rowNodes.length });
      await anim.wait(per);
    }
    // 总数一行一行加减：从还前的账户依次扣掉月供、突发账单、利息，最后落到剩下的（没还上：从 0 滚到差多少）；
    // 每一步一声、数字跳一下，总时长还是 BILL_MS.count，落下时砸一下
    total.setAlpha(1);
    const to = b.paid ? b.after : b.amount - b.before;
    const cuts = b.paid ? [b.amount - extra, ...b.extras.map((e) => e.amount), b.interest ?? 0].filter((v) => v > 0) : [];
    const stops: number[] = [];
    let left = b.before;
    for (const c of cuts) stops.push((left -= c));
    if (stops.length === 0 || Math.abs(stops[stops.length - 1]! - to) > 0.005) stops.push(to);
    let from = b.paid ? b.before : 0;
    const each = Math.floor(BILL_MS.count / stops.length);
    for (const [i, stop] of stops.entries()) {
      if (!anim.instant) sound.cue({ type: 'countUp', progress: (i + 1) / stops.length });
      await anim.count(from, stop, each, (v) => total.active && total.setText(formatMoney(v)));
      if (i < stops.length - 1) anim.fx({ targets: total, scale: { from: 1.12, to: 1 }, duration: 110, ease: 'Quad.easeOut' }, () => total.setScale(1));
      from = stop;
    }
    total.setText(totalValue);
    anim.fx({ targets: total, scale: { from: 1.35, to: 1 }, duration: 160, ease: 'Quad.easeIn' }, () => total.setScale(1));
  }
  for (const n of rowNodes.flat()) n.setAlpha(1);
  total.setAlpha(1);
  // 印章
  // 印章盖在账单右边（压一点卡边，不压数字）
  const stamp = (pt ? scene.add.container(x + W - 90, y + H + 20) : scene.add.container(x + W + (b.paid ? 64 : 100), y + 150)).setAngle(-14);
  if (b.paid) {
    stamp.add(addImage(scene, 0, 0, 'ui:stamp_paid', 160));
    stamp.add(addText(scene, 0, -5, '还上了', { size: 30, bold: true, color: 0xd8342c, originX: 0.5, originY: 0.5 }));
  } else {
    stamp.add(addImage(scene, 0, 0, 'ui:stamp_overdue', 220, 110));
    stamp.add(addText(scene, 0, 0, '没还上', { size: 44, bold: true, color: 0x5a2a6a, originX: 0.5, originY: 0.5 }));
  }
  c.add(stamp);
  sound.cue({ type: 'stamp', paid: b.paid, credit: b.credit });
  if (stage) {
    stamp.setScale(anim.calm ? 1.15 : 2.4).setAlpha(0);
    await anim.count(0, 1, anim.calm ? 160 : BILL_MS.stamp, (t) => stamp.setScale((anim.calm ? 1.15 : 2.4) - t * (anim.calm ? 0.15 : 1.4)).setAlpha(t), 'Cubic.easeIn');
    shake(scene, anim, 180, 0.006);
  }
  stamp.setScale(1).setAlpha(1);
  if (b.credit) {
    const nx = ph ? x + W + 150 : V.w / 2;
    const ny = ph ? y + 300 : pt ? y + H + 96 : y + H + 26;
    const note = addText(scene, nx, ny, `${itemView('credit').name}垫上了 · 下月账单×${fx('credit', 'nextBillMult')}`, { size: 16, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
    if (ph) note.setWordWrapWidth(220, true).setAlign('center');
    const pill = ph
      ? addPill(scene, nx - note.width / 2 - 16, ny - note.height / 2 - 8, note.width + 32, note.height + 16, COLOR.info)
      : addPill(scene, nx - note.width / 2 - 16, ny - 16, note.width + 32, 32, COLOR.info);
    c.add([pill, note]);
  }
  return c;
}

/** 三选一翻牌进场：第一张延迟、逐张错开、每张展开多久（毫秒，1 倍速） */
const FLIP_MS = { first: 60, step: 110, dur: 260 } as const;

/** 稀有度：几颗星（常见 1、少见 2、稀有 3）。 */
const RARITY_STARS: Record<string, number> = { common: 1, uncommon: 2, rare: 3 };

/** 奖励卡卡面上各行的纵坐标（相对卡顶）：手机上卡矮 42，图标小一号、各行往上收 */
const CARD_LAYOUT = {
  desktop: { icon: 98, iconS: 96, name: 160, big: 208 },
  // 手机世界高 404，卡片矮到 286：图标、名字、大数字再往上收
  phone: { icon: 74, iconS: 70, name: 120, big: 160 },
  // 竖屏横卡（高 ROW_CARD_H）：icon 不用（图标竖直居中），name、big 是左对齐文字那一栏
  row: { icon: 0, iconS: 72, name: 44, big: 88 },
} as const;
/** 竖屏横卡的高和右边「就要它」的宽 */
const ROW_CARD_H = 150;
const ROW_BTN_W = 104;
/** 竖屏横卡上「名字 + 大数字」那一行的中线（相对卡顶；顶上色带 40 高） */
const ROW_LINE_Y = 60;

/** 三选一奖励卡（phase = reward 时常驻，直到选择）：稀有度色框 + 大图标 + 名字 + 大数字 + 一行；详情悬停。 */
export class RewardPanel {
  readonly root: Phaser.GameObjects.Container;
  private readonly buttons: Button[] = [];
  private readonly skip: Button;
  private readonly box: { x: number; y: number; w: number; h: number };
  /** 每张卡一个外壳（原点在卡中心）：翻牌进场、悬停抬起倾斜、选中飞起、落下都转它，卡里的按钮坐标静止时不变 */
  private readonly wraps: { wrap: Phaser.GameObjects.Container; cx: number; cy: number; w: number; h: number }[] = [];
  private readonly scene: Phaser.Scene;
  private readonly anim: Animator;
  /** 已选定，正在播放离场（期间不再响应点击、悬停） */
  private leaving = false;
  /** 悬停抬起的那张（-1 没有） */
  private lifted = -1;

  constructor(scene: Phaser.Scene, s: GameState, anim: Animator, idle: boolean, onPick: (index: number) => void, onSkip: () => void) {
    this.scene = scene;
    this.anim = anim;
    this.root = overlay(scene, 0.5);
    const pick = (i: number): void => this.leave(i, () => onPick(i));
    const skipIt = (): void => this.leave(-1, onSkip);
    const cards = rewardView(s);
    const V = viewOf(scene);
    const ph = phoneLayout(scene);
    // 手机上标题贴顶、卡片矮一截（卡面排布见 CARD_LAYOUT），「都不要」和电脑一样放在卡片下方居中（放右上角会盖住顶栏的道具栏、贴着 ? 和设置）
    // 电脑上本周市场的标题上移一点，给标题和卡片之间的「本周规则」一行让地方（放更上面会压住顶栏）
    // 竖屏版屏高：标题、卡片、「都不要」整组在屏幕中间，不挤在顶上
    const pt = ph && V.h > V.w;
    const pt0 = pt ? Math.max(0, Math.round((V.h - 404) / 2)) : 0;
    const ty = ph ? 30 + pt0 : s.setup?.weekly !== undefined ? 94 : 104;
    const title = addText(scene, V.w / 2 + 22, ty, s.setup?.weekly !== undefined ? '本周市场开局 · 挑一样' : s.setup?.flash !== undefined ? '闪电盘开局 · 挑一样' : '挑一样', { size: TYPE.big + 6, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5, stroke: COLOR.ink, strokeWidth: 7 });
    const gift = addGlyph(scene, V.w / 2 - title.width / 2 - 14, ty, 'gift', ph ? 44 : 52);
    this.root.add([gift, title]);
    // 竖屏版只有 404 宽：三张竖卡各 118 宽，字被挤成孤字折行；改成上下三张横卡（图标在左、按钮在右）
    const gap = pt ? 10 : ph ? 20 : 30;
    const n = cards.length;
    const CW = pt ? V.w - 24 : Math.min(236, Math.floor((V.w - 24 - gap * (n - 1)) / n));
    // 手机世界高 404：卡片高按剩下的算（标题 58 起，下面还要放「都不要」）
    const CH = pt ? ROW_CARD_H : ph ? Math.min(308, V.h - 58 - 60) : 350;
    const top = pt ? Math.max(58, Math.round((V.h - (ROW_CARD_H * n + gap * (n - 1) + 60)) / 2) + 20) : ph ? 58 : 146;
    if (pt) {
      title.setY(top - 30);
      gift.setY(top - 30);
      // 竖屏的标题正好落在持仓卡的文字上，隔着遮罩还和底下的字糊在一起：垫一条深色圆角底
      const left = gift.x - gift.displayWidth / 2 - 14;
      const band = scene.add.rectangle(left, top - 30, title.x + title.width / 2 + 18 - left, 54, COLOR.ink, 0.72).setOrigin(0, 0.5).setRounded(27);
      this.root.addAt(band, this.root.getIndex(gift));
    }
    const x0 = pt ? 12 : V.w / 2 - (CW * n + gap * (n - 1)) / 2;
    let rare = false;
    cards.forEach((r, i) => {
      const x = pt ? x0 : x0 + i * (CW + gap);
      const y = pt ? top + i * (CH + gap) : top;
      const node = this.card(scene, r, x, y, CW, CH, idle, s, pt);
      if (r.rarity === 'rare') {
        // 金卡：卡淡入后闪一下（并行，不拖慢月底）
        rare = true;
        goldGlint(scene, anim, { x: x + 5, y: y + 5, w: CW - 10, h: CH - 10 }, this.root, FLIP_MS.first + FLIP_MS.step * i + 200);
      }
      const bAt = pt ? { x: x + CW - 14 - ROW_BTN_W, y: y + 40 + (CH - 40 - 46) / 2, w: ROW_BTN_W } : { x: x + 28, y: y + CH - 62, w: CW - 56 };
      const b = new Button(scene, bAt.x, bAt.y, { width: bAt.w, height: 46, label: '就要它', variant: 'primary', fontSize: TYPE.title, hotkey: `${i + 1}`, sound: null, onClick: () => pick(i) });
      node.add(b);
      this.buttons.push(b);
      // 外壳放在卡中心：卡本身挪回原位，静止时世界坐标不变
      const cx = x + CW / 2;
      const cy = y + CH / 2;
      const wrap = scene.add.container(cx, cy);
      node.setPosition(-cx, -cy);
      wrap.add(node);
      this.root.add(wrap);
      this.wraps.push({ wrap, cx, cy, w: CW, h: CH });
      // 翻牌进场（逐张错开）：宽度从 0 展开；减少动态效果只淡入；位置不动（自动化读到的按钮坐标始终有效）
      if (!anim.instant) {
        wrap.setAlpha(0);
        if (!anim.calm) wrap.setScale(0, 1);
        anim.fx(
          { targets: wrap, alpha: 1, scaleX: 1, duration: anim.calm ? 200 : FLIP_MS.dur, delay: FLIP_MS.first + FLIP_MS.step * i, ease: anim.calm ? 'Quad.easeOut' : 'Cubic.easeOut' },
          () => wrap.setAlpha(1).setScale(1),
        );
      }
    });
    this.enableHover(scene);
    const bottom = pt ? top + n * CH + (n - 1) * gap : top + CH;
    const skipY = bottom + (ph ? 10 : 18);
    const skipX = V.w / 2 - 60;
    this.box = { x: x0 - 6, y: top - 6, w: pt ? CW + 12 : CW * n + gap * (n - 1) + 12, h: skipY + 42 - top + 12 };
    this.skip = new Button(scene, skipX, skipY, { width: 120, height: 42, label: '都不要', variant: 'default', fontSize: TYPE.title - 2, hotkey: '0', sound: null, onClick: skipIt });
    this.root.add(this.skip);
    // 本周市场：进局第一眼就写清这一周的规则（反向群聊用红色，必须让人知道群友说的是反话）
    if (s.setup?.weekly !== undefined) {
      const week = s.setup.weekly;
      // 手机上只有「都不要」左边一块地方：只写前半句（反向群聊就是「本周群友说的全是反话」），一行放得下、不截字
      const full = weeklyInfo(week).line;
      const line = ph ? full.split(/[：，]/)[0]! : full;
      const hot = weeklyRule(week) === 'reverse';
      const wt = addText(scene, ph ? 14 : V.w / 2, ph ? skipY + 21 : 131, `本周规则：${line}`, { size: ph ? 13 : TYPE.title, bold: true, color: hot ? COLOR.danger : COLOR.white, originX: ph ? 0 : 0.5, originY: 0.5, stroke: hot ? COLOR.white : COLOR.ink, strokeWidth: 5 });
      fitWidth(wt, ph ? skipX - 28 : V.w - 60);
      this.root.add(wt);
    }
    sound.cue({ type: 'rewardShow' });
    if (rare) {
      scene.time.delayedCall(anim.instant ? 420 : FLIP_MS.first + FLIP_MS.step + 300, () => {
        if (this.root.active) sound.cue({ type: 'rareCard' });
      });
    }
  }

  /** row：竖屏横卡（图标在左，名字、大数字、说明在中间，「就要它」在右，按钮由调用方放） */
  private card(scene: Phaser.Scene, r: RewardView, x: number, y: number, w: number, h: number, idle: boolean, s: GameState, row = false): Phaser.GameObjects.Container {
    const c = scene.add.container(0, 0);
    c.add(addPaper(scene, x, y, w, h));
    const rc = RARITY_COLOR[r.rarity];
    // 稀有度色框 + 顶上一条色带和星星
    c.add(scene.add.rectangle(x + 5, y + 5, w - 10, h - 10).setOrigin(0, 0).setRounded(14).setStrokeStyle(5, rc, 1));
    c.add(scene.add.rectangle(x + 5, y + 5, w - 10, 34, rc, 0.18).setOrigin(0, 0).setRounded(12));
    const stars = RARITY_STARS[r.rarity] ?? 1;
    const sx = row ? x + 20 + ((stars - 1) * 26) / 2 + 12 : x + w / 2;
    for (let k = 0; k < stars; k++) c.add(addGlyph(scene, sx + (k - (stars - 1) / 2) * 26, y + 22, 'star', 24));
    const L = row ? CARD_LAYOUT.row : phoneLayout(scene) ? CARD_LAYOUT.phone : CARD_LAYOUT.desktop;
    // 横卡：图标在左边一栏的中间；文字从 tx 起左对齐，右边让出按钮
    const ax = row ? x + 14 + L.iconS / 2 : x + w / 2;
    const iy = row ? y + 40 + (h - 40) / 2 : y + L.icon;
    const tx = row ? x + 28 + L.iconS : ax;
    const tw = row ? w - (tx - x) - ROW_BTN_W - 24 : w - 16;
    const ox = row ? 0 : 0.5;
    if (r.item) {
      const color = ITEM_KIND_COLOR[r.item.kind] ?? COLOR.accent;
      if (hasArt(scene.textures, itemKey(r.id))) {
        // 彩色道具图标；美术还没交时退回两字徽章
        c.add(addImage(scene, ax, iy, itemKey(r.id), L.iconS));
      } else {
        c.add(scene.add.circle(ax, iy, 42, color).setStrokeStyle(3, COLOR.ink, 1));
        c.add(addText(scene, ax, iy, shortItemName(r.item.name), { size: 22, bold: true, color: textOn(color), originX: 0.5, originY: 0.5 }));
      }
    } else if (r.friend) {
      c.add(addImage(scene, ax, iy, avatarKey(r.id, 'smug'), L.iconS - 4));
    } else if (r.stock) {
      c.add(new StockGuy(scene, ax, iy + L.iconS / 2 - 4, r.stock.id, 'happy', L.iconS - 4, { idle }));
      // 风口小图标（右上角）
      c.add(addImage(scene, row ? ax + L.iconS / 2 - 8 : ax + 50, iy - 30, `theme:${r.stock.theme}`, row ? 28 : 34));
    }
    const big = r.brief.big;
    // 竖屏横卡（不是股票的）：大数字和名字放同一行，说明腾出两三行（不然说明只剩一行，「大哥涨停，同风口的再…」）
    const inline = row && !r.stock && !!big;
    const bigT = inline && big ? addText(scene, 0, y + ROW_LINE_Y, big, { size: TYPE.big, bold: true, num: true, color: COLOR.accentDark, originY: 0.5 }) : null;
    let nameRoom = bigT ? tw - bigT.width - 10 : tw;
    const nm = addText(scene, tx, inline ? y + ROW_LINE_Y : y + L.name, r.name, { size: TYPE.title + 2, bold: true, originX: ox, originY: inline ? 0.5 : 0 });
    // 名字不截：先缩一号字；横卡还和大数字挤不下，大数字挪到顶上色带的右边、名字独占一行；再放不下就折成两行
    if (nm.width > nameRoom) nm.setFontSize(TYPE.title - 2);
    if (bigT && nm.width > nameRoom) {
      bigT.setOrigin(1, 0.5).setPosition(x + w - 20, y + 22);
      nameRoom = tw;
    } else if (bigT) bigT.setX(tx + nm.width + 10);
    if (nm.width > nameRoom) {
      if (row) setWrap(nm, nameRoom);
      else fitWidth(nm, nameRoom);
    }
    c.add(nm);
    if (bigT) c.add(bigT);
    if (r.stock) {
      // 股票卡：风口 · 角色的色签放在大数字的位置
      const tc = THEME_COLOR[r.stock.theme];
      const t = addText(scene, row ? tx + 12 : ax, y + L.big, `${r.stock.themeName} · ${ROLE_WORD[r.stock.role]}`, { size: TYPE.label + 1, bold: true, color: textOn(tc), originX: ox, originY: 0.5 });
      c.add(addPill(scene, row ? tx : ax - t.width / 2 - 12, y + L.big - 14, t.width + 24, 28, tc));
      c.add(t);
    }
    if (big && !inline) c.add(addText(scene, tx, y + L.big, big, { size: TYPE.big, bold: true, num: true, color: COLOR.accentDark, originX: ox, originY: 0.5 }));
    // 说明短（≤34 字）就整句写出来，长的用短句；分类标签放在顶部色带左边
    const descShort = r.desc && [...r.desc].length <= 34 ? r.desc : r.brief.line;
    const descY = inline ? Math.max(y + ROW_LINE_Y + 22, nm.y + nm.height / 2 + 6) : big || r.stock ? y + L.big + (row ? 20 : 26) : y + L.big + 4;
    const desc = addText(scene, tx, descY, descShort, { size: TYPE.label, color: COLOR.muted, originX: ox, align: row ? 'left' : 'center', wrap: row ? tw : w - 28, lineSpacing: 2 });
    // 手机上卡矮：整句放不下就换短句，还放不下就截短（全文在悬停里），不压「就要它」
    const room = (row ? y + h - 8 : y + h - 66) - desc.y;
    if (desc.height > room && desc.text !== r.brief.line) desc.setText(r.brief.line);
    if (desc.height > room) {
      let cut = Array.from(desc.text);
      while (desc.height > room && cut.length > 4) {
        cut = cut.slice(0, -2);
        desc.setText(`${cut.join('')}…`);
        markCut(desc);
      }
    }
    c.add(desc);
    if (r.tag) {
      const tg = addText(scene, x + 16, y + 22, r.tag, { size: FS.xs, bold: true, color: textOn(rc), originY: 0.5 });
      // 标签放在星星左边，不压星星（手机上字大一号，按星星实际占的宽度算）
      // 横卡的星星靠左：标签放在星星右边
      const tagX = row ? sx + ((stars - 1) * 26) / 2 + 22 : x + 10;
      if (row || x + 22 + tg.width < ax - (stars - 1) * 13 - 18) c.add([addPill(scene, tagX, y + 12, tg.width + 12, 20, rc, false), tg.setX(tagX + 6)]);
      else tg.destroy();
    }
    // 道具的一句俏皮话放在卡面底部，放不下就不放
    if (!row && r.item?.flavor && !(r.stock && s.slots.every((x2) => x2 !== null))) {
      const fy = desc.y + desc.height + 6;
      const fl = addText(scene, ax, fy, `「${r.item.flavor}」`, { size: FS.xs, color: COLOR.dim, originX: 0.5, align: 'center', wrap: w - 36 });
      if (fy + fl.height > y + h - 70) fl.destroy();
      else c.add(fl);
    }
    // 稀有股票：满仓时提示会替换
    if (r.stock && s.slots.every((x2) => x2 !== null)) {
      c.add(addText(scene, row ? x + w - 14 - ROW_BTN_W / 2 : ax, row ? y + h - 22 : y + h - 78, row ? '会换掉一只' : '格子满了，要换掉一只', { size: TYPE.label - 1, color: COLOR.danger, originX: 0.5 }));
    }
    // 详情：悬停整张卡（横卡是按钮左边那一块）
    const hitR = row ? { x, y, w: w - ROW_BTN_W - 20, h } : { x, y, w, h: h - 70 };
    const hit = scene.add.rectangle(hitR.x, hitR.y, hitR.w, hitR.h, 0xffffff, 0.001).setOrigin(0, 0);
    c.add(hit);
    const tip = { title: `${r.name} · ${r.tag}`, body: r.item ? `${r.desc}\n${r.item.flavor}` : r.desc, color: rc };
    bindTooltip(hit, () => (row ? hitR : { x, y: y + 40, w, h: h - 110 }), () => tip);
    return c;
  }

  /**
   * 悬停：鼠标在哪张卡上，哪张抬起 10 并跟着鼠标左右微微倾斜（最多 2.5 度），移开落回。
   * 一个全局监听代替每张卡一个：卡上的「就要它」会抢走卡本身的悬停事件。减少动态效果、关动画时不动。
   */
  private enableHover(scene: Phaser.Scene): void {
    if (this.anim.calm) return;
    const onMove = (p: Phaser.Input.Pointer): void => {
      if (this.leaving || !this.root.visible) return;
      const at = this.wraps.findIndex((c) => Math.abs(p.worldX - c.cx) <= c.w / 2 && Math.abs(p.worldY - c.cy) <= c.h / 2);
      if (at >= 0) {
        const c = this.wraps[at]!;
        c.wrap.setAngle(((p.worldX - c.cx) / (c.w / 2)) * 2.5);
      }
      if (at === this.lifted) return;
      this.settle(this.lifted, false);
      this.lifted = at;
      this.settle(at, true);
    };
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMove);
    this.root.once(Phaser.GameObjects.Events.DESTROY, () => scene.input.off(Phaser.Input.Events.POINTER_MOVE, onMove));
  }

  /** 某张卡抬起或落回（带一点缩放）。 */
  private settle(i: number, up: boolean): void {
    const c = this.wraps[i];
    if (!c) return;
    this.scene.tweens.killTweensOf(c.wrap);
    this.scene.tweens.add({ targets: c.wrap, y: c.cy - (up ? 10 : 0), scale: up ? 1.03 : 1, angle: up ? c.wrap.angle : 0, duration: 130, ease: 'Quad.easeOut' });
  }

  /**
   * 选中后离场：选中的那张飞起放大淡出，其余落下淡出（约 0.3 秒），然后才执行选卡的回调。
   * 关动画或快进时立即执行；减少动态效果只淡出。picked 为 -1 是「都不要」（全部落下）。
   */
  private leave(picked: number, then: () => void): void {
    if (this.leaving) return;
    if (this.anim.instant) {
      then();
      return;
    }
    this.leaving = true;
    for (const b of [...this.buttons, this.skip]) b.setLocked(true);
    this.scene.tweens.killTweensOf(this.wraps.map((c) => c.wrap));
    const calm = this.anim.calm;
    this.anim.fx({ targets: this.skip, alpha: 0, duration: 200 });
    this.wraps.forEach((c, i) => {
      const chosen = i === picked;
      const motion = calm ? {} : chosen ? { y: c.cy - 70, scale: 1.12 } : { y: c.cy + 56, scale: 0.94 };
      this.anim.fx(
        { targets: c.wrap, alpha: 0, ...motion, duration: chosen ? 300 : 240, ease: chosen ? 'Cubic.easeOut' : 'Quad.easeIn' },
        // 只让一张卡的收尾触发回调（都不要时让第一张触发）
        i === Math.max(0, picked) ? () => then() : undefined,
      );
    });
  }

  /** 回到静止（选了稀有股票要先挑格子，取消回来时；或者这一下没有被接受）。 */
  rest(): void {
    this.leaving = false;
    this.lifted = -1;
    this.scene.tweens.killTweensOf(this.wraps.map((c) => c.wrap));
    for (const c of this.wraps) c.wrap.setPosition(c.cx, c.cy).setScale(1).setAngle(0).setAlpha(1);
    this.scene.tweens.killTweensOf(this.skip);
    this.skip.setAlpha(1);
    for (const b of [...this.buttons, this.skip]) b.setLocked(false);
  }

  press(i: number): boolean {
    return this.buttons[i]?.press() ?? false;
  }

  /** 三张卡和「都不要」所在的区域（教程用）。 */
  area(): { x: number; y: number; w: number; h: number } {
    return this.box;
  }

  buttonRects(): { x: number; y: number; w: number; h: number }[] {
    return [...this.buttons, this.skip].map((b) => b.rect());
  }

  pressSkip(): boolean {
    return this.skip.press();
  }

  setVisible(v: boolean): void {
    if (v && !this.root.visible) this.rest();
    this.root.setVisible(v);
  }

  controls(): Record<string, { x: number; y: number }> {
    if (!this.root.visible) return {};
    const out: Record<string, { x: number; y: number }> = {};
    this.buttons.forEach((b, i) => (out[`reward:${i}`] = b.center()));
    out['reward:skip'] = this.skip.center();
    return out;
  }

  destroy(): void {
    this.root.destroy();
  }
}

/** 一张稀有股票奖励卡能放进哪些格子（满仓时替换）。 */
export function rewardSlots(s: GameState, index: number): number[] {
  return s.slots.map((_, i) => i).filter((i) => validate(s, { type: 'pickReward', index, slot: i }) === null);
}

/** 事件二选一（0.5 卡牌式）：闪电图标 + 名字 + 一行情景；两个选项各一个大数字（代价 / 收益）+ 短按钮。原文在悬停。 */
export class EventPanel {
  readonly root: Phaser.GameObjects.Container;
  private readonly buttons: Button[] = [];

  constructor(scene: Phaser.Scene, ev: EventView, onChoose: (option: number) => void) {
    this.root = overlay(scene, 0.5);
    const V = viewOf(scene);
    const ph = phoneLayout(scene);
    // 手机：卡片放宽、头部和选项都收紧，情景原文最多两行（全文在悬停里），整张卡才放得进 444 高
    const L = ph
      ? { W: 720, headH: 104, storyY: 100, storyMax: 44, storyPad: 20, bottom: 16, bigY: 44, textY: 72, btnH: 46, btnUp: 58, optMin: 170, optBase: 138 }
      : { W: 560, headH: 124, storyY: 118, storyMax: 66, storyPad: 26, bottom: 32, bigY: 52, textY: 84, btnH: 54, btnUp: 70, optMin: 196, optBase: 166 };
    const W = ph ? Math.min(L.W, V.w - 12) : L.W;
    // 情景原文放回卡面（一个引号框），选项下写原句；高度按内容算
    const story = ev.text && ev.text !== ev.brief ? addText(scene, 0, 0, ev.text, { size: TYPE.label, color: COLOR.ink, wrap: W - 120, lineSpacing: 3 }) : null;
    // 选项原句不截断：先量出两边原句的高度，选项卡按长的那边长高（固定两行的话放不下就得打省略号，关键后果被截掉）
    const cw = (W - 40 * 2 - 24) / 2;
    const optText = [0, 1].map((i) => {
      const full0 = ev.options[i] ?? '';
      const label = (ev.picks[i] ?? { label: full0 }).label;
      return full0 && full0 !== label ? addText(scene, 0, 0, full0, { size: TYPE.label - 1, color: COLOR.muted, wrap: cw - 24, align: 'center', originX: 0.5, lineSpacing: 2 }) : null;
    });
    const textH = Math.max(36, ...optText.map((t) => t?.height ?? 0));
    const optH = Math.max(L.optMin, L.optBase + textH);
    // 原文一般放全；只有屏幕高度不够（手机横屏）才限到 storyMax 行数，全文在悬停里
    const storyMax = Math.max(L.storyMax, V.h - (ph ? 8 : 140) - (L.headH + L.storyPad + optH + L.bottom));
    const storyH = story ? Math.min(storyMax, story.height) + L.storyPad : 0;
    const H = L.headH + storyH + optH + L.bottom;
    const x = V.w / 2 - W / 2;
    const y = ph ? Math.max(4, Math.round((V.h - H) / 2)) : Math.max(70, Math.round(360 - H / 2));
    this.root.add(addPaper(scene, x, y, W, H));
    // 背景纹样：右上角淡淡的大闪电
    this.root.add(addGlyph(scene, x + W - 70, y + 70, 'bolt', 120).setAlpha(0.07));
    // 头：闪电徽章 + 名字 + 一行情景（悬停看原文）
    const hc = ph ? 52 : 62;
    const hx = ph ? 96 : 114;
    this.root.add(scene.add.circle(x + hc, y + hc, ph ? 30 : 36, 0xffe7a8).setStrokeStyle(3, COLOR.ink, 1));
    this.root.add(addGlyph(scene, x + hc, y + hc, 'bolt', ph ? 44 : 54));
    this.root.add(addText(scene, x + hx, y + (ph ? 20 : 32), ev.name, { size: TYPE.title + 4, bold: true }));
    const brief = addText(scene, x + hx, y + (ph ? 54 : 70), ev.brief, { size: TYPE.label + 2, color: COLOR.muted, wrap: W - hx - 26 });
    this.root.add(brief);
    const head = scene.add.rectangle(x + 20, y + 20, W - 40, ph ? 76 : 90, 0xffffff, 0.001).setOrigin(0, 0);
    this.root.add(head);
    bindTooltip(head, () => ({ x: x + 20, y: y + 20, w: W - 40, h: ph ? 76 : 90 }), () => ({ title: ev.name, body: ev.text }));
    if (story) {
      const sy = y + L.storyY;
      const box = scene.add.rectangle(x + 40, sy, W - 80, storyH - 6, 0xffffff, 0.75).setOrigin(0, 0).setRounded(12).setStrokeStyle(1.5, COLOR.edge, 1);
      this.root.add([box, addGlyph(scene, x + 60, sy + 18, 'horn', 22)]);
      let cut = Array.from(story.text);
      while (story.height > storyMax && cut.length > 10) {
        cut = cut.slice(0, -4);
        story.setText(`${cut.join('')}…`);
        markCut(story);
      }
      story.setPosition(x + 78, sy + 8);
      this.root.add(story);
    }
    // 两个选项：次选项（不做）白色在左，主选项（做）橙色在右；快捷键按位置从左往右 1、2（左 2 右 1 看着像标反了）
    const order = EVENT_ORDER;
    order.forEach((i, col) => {
      const pick = ev.picks[i] ?? { label: ev.options[i] ?? '' };
      const cx = x + 40 + col * (cw + 24);
      const cy = y + L.headH + storyH;
      const ch = optH;
      const bg = scene.add.rectangle(cx, cy, cw, ch, i === 0 ? 0xfff1c4 : COLOR.paperLo).setOrigin(0, 0).setRounded(16).setStrokeStyle(2, i === 0 ? COLOR.gold : COLOR.edge, 1);
      this.root.add(bg);
      const tone = pick.tone ?? 'plain';
      const color = tone === 'gain' ? COLOR.up : tone === 'cost' ? COLOR.danger : COLOR.accentDark;
      if (pick.big) {
        const t = addText(scene, cx + cw / 2, cy + L.bigY, pick.big, { size: TYPE.big + 4, bold: true, num: true, color, originX: 0.5, originY: 0.5 });
        if (t.width > cw - 16) t.setScale((cw - 16) / t.width);
        this.root.add(t);
      } else {
        this.root.add(addText(scene, cx + cw / 2, cy + L.bigY, '¥0', { size: TYPE.big + 4, bold: true, num: true, color: COLOR.dim, originX: 0.5, originY: 0.5 }));
      }
      // 选项原句（小字，两行内）：花多少、得到什么
      const ot = optText[i];
      if (ot) {
        ot.setPosition(cx + cw / 2, cy + L.textY);
        this.root.add(ot);
      }
      // 选项角上的小图标：花钱 / 赚钱 / 不动
      this.root.add(addGlyph(scene, cx + 22, cy + 22, tone === 'gain' ? 'moneybag' : tone === 'cost' ? 'wallet' : 'hourglass', 26));
      const b = new Button(scene, cx + 14, cy + ch - L.btnUp, {
        width: cw - 28,
        height: L.btnH,
        label: pick.label,
        variant: i === 0 ? 'primary' : 'default',
        fontSize: TYPE.title + 2,
        hotkey: `${col + 1}`,
        sound: null,
        onClick: () => onChoose(i),
      });
      const full = ev.options[i] ?? '';
      b.tooltip(() => ({ title: pick.label, body: full }));
      bg.setInteractive();
      bindTooltip(bg, () => ({ x: cx, y: cy, w: cw, h: ch }), () => ({ title: pick.label, body: full }));
      this.root.add(b);
      this.buttons[i] = b;
    });
    sound.cue({ type: 'event' });
  }

  press(i: number): boolean {
    return this.buttons[i]?.press() ?? false;
  }

  /** 数字键 n（1 起）：按屏幕上从左往右的位置选。 */
  pressKey(n: number): boolean {
    const i = eventOptionForKey(n);
    return i === null ? false : this.press(i);
  }

  controls(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    this.buttons.forEach((b, i) => (out[`event:${i}`] = b.center()));
    return out;
  }

  destroy(): void {
    this.root.destroy();
  }
}

/** 事件结果：大数字（账户变化）+ 一行 + 「继续」。 */
export function eventResult(scene: Phaser.Scene, anim: Animator, name: string, text: string, delta: number, onContinue: () => void): { root: Phaser.GameObjects.Container; button: Button } {
  const root = overlay(scene, 0.5);
  const W = 480;
  const H = 270;
  const V = viewOf(scene);
  const x = V.w / 2 - W / 2;
  const y = phoneLayout(scene) ? Math.round((V.h - H) / 2) : 200;
  root.add(addPaper(scene, x, y, W, H));
  root.add(addGlyph(scene, x + W - 70, y + H - 90, delta > 0.5 ? 'moneybag' : delta < -0.5 ? 'cry' : 'melon', 110).setAlpha(0.1));
  root.add(addGlyph(scene, x + 44, y + 42, 'bolt', 36));
  // 右上角一张表情脸，赚了笑、亏了愁、没动吃瓜
  const face = addGlyph(scene, x + W - 46, y + 42, delta > 0.5 ? 'face_happy' : delta < -0.5 ? 'face_sad' : 'face_calm', 44);
  root.add(face);
  if (!anim.instant && !anim.calm) anim.fx({ targets: face, angle: { from: -18, to: 0 }, duration: 360, ease: 'Back.easeOut' }, () => face.setAngle(0));
  root.add(addText(scene, x + 70, y + 42, name, { size: TYPE.title, bold: true, color: COLOR.muted, originY: 0.5 }));
  const has = Math.abs(delta) >= 0.5;
  if (has) {
    const big = addText(scene, W / 2 + x, y + 104, formatMoney(delta, { sign: true }), { size: TYPE.big + 16, bold: true, num: true, color: signColor(delta), originX: 0.5, originY: 0.5 });
    root.add(addImage(scene, x + W / 2 - big.width / 2 - 30, y + 104, 'fx:coin', 36));
    root.add(big);
    if (delta > 0) sparkles(scene, anim, x + W / 2, y + 104, 12);
    if (!anim.instant && !anim.calm) {
      big.setScale(0.4);
      anim.fx({ targets: big, scale: 1, duration: 260, ease: 'Back.easeOut' }, () => big.setScale(1));
    }
  }
  const body = addText(scene, x + W / 2, has ? y + 158 : y + 120, text, { size: TYPE.label + 2, color: COLOR.ink, wrap: W - 64, align: 'center', originX: 0.5, originY: 0.5, lineSpacing: 4 });
  root.add(body);
  const btns = new Phaser.GameObjects.Container(scene, x, y);
  root.add(btns);
  const button = actionButtons(scene, btns, W - 26, H - 20, { label: '继续', hotkey: '空格', onClick: onContinue }).primary as Button;
  sound.cue({ type: 'eventResult', delta });
  return { root, button };
}

/** 新月份开场（没有月度主题时）：大字月份 + 日历名，交易日和要还的钱是图标胶囊；附加说明每条一行，原句悬停。 */
export function monthIntro(scene: Phaser.Scene, cal: CalendarView, bill: { name: string; amount: number }, extras: string[], onDone: () => void): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setDepth(DEPTH);
  root.add(addBackdrop(scene, 0.45));
  const W = dialogW(scene, 480);
  const shown = extras.slice(0, 5);
  const H = 196 + DONE_H + shown.length * 38;
  const V = viewOf(scene);
  const x = V.w / 2 - W / 2;
  const y = Math.max(4, Math.round(V.h / 2 - H / 2));
  root.add(addPaper(scene, x, y, W, H));
  root.add(addGlyph(scene, x + 58, y + 58, 'calendar', 64));
  root.add(addText(scene, x + 104, y + 24, `${cal.month}月`, { size: TYPE.big + 6, bold: true, color: COLOR.accentDark }));
  const name = addText(scene, x + 104, y + 66, cal.name, { size: TYPE.title, bold: true, color: COLOR.ink });
  root.add(name);
  const nameHit = scene.add.rectangle(x + 104, y + 62, Math.max(80, name.width), 28, 0xffffff, 0.001).setOrigin(0, 0);
  root.add(nameHit);
  bindTooltip(nameHit, () => ({ x: x + 104, y: y + 62, w: name.width, h: 28 }), () => ({ title: cal.name, body: cal.desc }));
  let cx = x + 30;
  const cy = y + 120;
  for (const c of [
    iconChip(scene, 0, 0, 'calendar', `${cal.days}天`, { tip: { title: '交易日', body: `这个月有 ${cal.days} 个交易日` } }),
    iconChip(scene, 0, 0, 'house', moneyShort(bill.amount), { color: COLOR.danger, tip: { title: '月底要还', body: `${bill.name} ${formatMoney(bill.amount)}，最后一天收盘后扣` } }),
  ]) {
    c.node.setPosition(cx, cy);
    root.add(c.node);
    cx += c.w + 10;
  }
  let ly = cy + 46;
  for (const e of shown) {
    const { head, money, color } = extraChip(e);
    const rowBg = scene.add.rectangle(x + 30, ly, W - 60, 32, COLOR.paperLo).setOrigin(0, 0).setRounded(10);
    root.add([rowBg, addGlyph(scene, x + 48, ly + 16, 'bolt', 22), addText(scene, x + 66, ly + 16, head, { size: TYPE.label + 1, bold: true, originY: 0.5 })]);
    if (money) root.add(addText(scene, x + W - 42, ly + 16, money, { size: TYPE.title, bold: true, num: true, color, originX: 1, originY: 0.5 }));
    rowBg.setInteractive();
    const ry = ly;
    bindTooltip(rowBg, () => ({ x: x + 30, y: ry, w: W - 60, h: 32 }), () => ({ title: head.replace(/…$/, ''), body: e }));
    ly += 38;
  }
  root.add(doneButton(scene, x + W - 30, y + H - 14, onDone));
  sound.cue({ type: 'monthStart' });
  return root;
}
