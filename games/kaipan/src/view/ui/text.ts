import type Phaser from 'phaser';
import { COLOR, FONT, FONT_NUM, PHONE, PHONE_SCALE, RENDER_SCALE, css } from '../theme.ts';
import { phoneLayout } from '../viewport.ts';
import { NO_LINE_END, NO_LINE_START, avoidOrphan } from './wrapRules.ts';

interface TextOpts {
  size?: number;
  color?: number;
  bold?: boolean;
  /** 使用数字字体 */
  num?: boolean;
  align?: 'left' | 'center' | 'right';
  /** 自动换行宽度（按字符断行，适合中文） */
  wrap?: number;
  lineSpacing?: number;
  originX?: number;
  originY?: number;
  /** 描边色与粗细（压在图片上的文字用） */
  stroke?: number;
  strokeWidth?: number;
}


/** 每个「原子」在某个字体下的宽度（键 = 字体 + 原子）。量字是断行里最贵的一步，同一个字在同一字体下宽度不变 */
const atomWidths = new Map<string, number>();
/** 按原子宽度相加估的行宽和真实行宽（原子之间的字距）差不过这么多：3 像素或行宽的 3%，取大的；离换行宽度比这还近才整行真量 */
const wrapSlack = (width: number): number => Math.max(3, width * 0.03);

function atomWidth(ctx: CanvasRenderingContext2D, atom: string): number {
  const k = `${ctx.font}\u0000${atom}`;
  let w = atomWidths.get(k);
  if (w === undefined) {
    if (atomWidths.size > 20_000) atomWidths.clear();
    w = ctx.measureText(atom).width;
    atomWidths.set(k, w);
  }
  return w;
}

/**
 * 按字符断行：中文没有空格，Phaser 自带的按单词换行不适用。
 * 英文/数字连续片段尽量不拆开，行首避开标点。
 * 0.34.0 性能：行宽先按原子宽度相加估，离换行宽度很近（wrapSlack 以内）才整行真量，断行结果和逐个整行量一样。
 */
function cjkWrap(text: string, obj: Phaser.GameObjects.Text, width: number): string[] {
  const ctx = obj.context;
  const sum = (atoms: readonly string[]): number => atoms.reduce((a, x) => a + atomWidth(ctx, x), 0);
  const slack = wrapSlack(width);
  const tooWide = (line: readonly string[], lineW: number, atom: string): boolean => {
    const est = lineW + atomWidth(ctx, atom);
    if (est > width + slack) return true;
    if (est < width - slack) return false;
    return ctx.measureText(line.join('') + atom).width > width;
  };
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const start = out.length;
    // 切成「原子」：连续的 ASCII 字母数字作为一个整体，其余逐字符
    const atoms = para.match(/[A-Za-z0-9.¥+\-×%]+|./gu) ?? [];
    let line: string[] = [];
    let lineW = 0;
    // 内容里的英文双引号 " 成对出现：段落里第偶数个是右引号，和中文右引号一样不能放在行首
    let quotes = 0;
    for (const atom of atoms) {
      const closing = atom === '"' && quotes % 2 === 1;
      if (atom === '"') quotes++;
      if (line.length > 0 && tooWide(line, lineW, atom)) {
        if ((NO_LINE_START.has(atom) || closing) && line.length > 1) {
          // 把前面的片段带到下一行，避免标点开头（连续标点一起带走）
          const carry = [atom];
          do carry.unshift(line.pop() as string);
          while (line.length > 1 && NO_LINE_START.has(carry[0] as string));
          while (line.length > 1 && NO_LINE_END.has(line[line.length - 1] as string)) carry.unshift(line.pop() as string);
          out.push(line.join(''));
          line = carry;
        } else {
          const carry: string[] = [];
          while (line.length > 1 && NO_LINE_END.has(line[line.length - 1] as string)) carry.unshift(line.pop() as string);
          out.push(line.join('').trimEnd());
          line = atom.trim() === '' ? carry : [...carry, atom];
        }
        lineW = sum(line);
      } else {
        line.push(atom);
        lineW += atomWidth(ctx, atom);
      }
    }
    out.push(line.join(''));
    // 只在同一段里挪：上一行属于上一段时不动
    if (out.length - start >= 2) {
      const [prev, tail] = avoidOrphan(out[out.length - 2] as string, out[out.length - 1] as string);
      out[out.length - 2] = prev;
      out[out.length - 1] = tail;
    }
  }
  return out;
}
/**
 * 最小字号：再小在手机和 1 倍屏上就糊成一团（docs/ui.md 第 3 节：任何地方 ≥ 12，电脑上就是 12）。
 * 手机横屏（0.5.5）：960×444 的世界在 844×390 的屏幕上约 0.88 倍，13 号字显示出来约 11.4 像素，下面再按缩放抬到屏幕上 ≥ 12。
 */
// 0.19.5 比 SE 矮的手机按缩放再抬（640×360 是 14、568×320 是 16），见 theme.ts 的 PHONE_SCALE
export const MIN_TEXT_SIZE = PHONE ? Math.max(13, Math.ceil(12 / PHONE_SCALE)) : 12;
/**
 * 0.19.0 手机上数字的最小字号：清单要数字 ≥ 14 像素，新手机世界在最小的 SE 上是 0.928 倍，16 号约 14.8px。
 */
export const MIN_NUM_SIZE_PHONE = Math.max(16, Math.ceil(14 / PHONE_SCALE));
/** 只有数字、金额、涨跌符号的文字（没标 num 的也按数字算最小字号） */
const NUMERIC = /^[\s¥+\-−↑↓%.,0-9万亿×/:]*[0-9][\s¥+\-−↑↓%.,0-9万亿×/:]*$/;

export function addText(scene: Phaser.Scene, x: number, y: number, content: string, opts: TextOpts = {}): Phaser.GameObjects.Text {
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: opts.num ? FONT_NUM : FONT,
    fontSize: `${Math.max((opts.num || NUMERIC.test(content)) && phoneLayout(scene) ? MIN_NUM_SIZE_PHONE : MIN_TEXT_SIZE, opts.size ?? 14)}px`,
    fontStyle: opts.bold ? 'bold' : 'normal',
    color: css(opts.color ?? COLOR.ink),
    align: opts.align ?? 'left',
    // 与相机 zoom 一致，文字纹理按实际像素栅格化
    resolution: RENDER_SCALE,
    lineSpacing: opts.lineSpacing ?? 4,
  };
  const wrapWidth = opts.wrap;
  if (wrapWidth !== undefined) {
    style.wordWrap = { callback: (t: string, obj: Phaser.GameObjects.Text) => cjkWrap(t, obj, wrapWidth) };
  }
  if (opts.stroke !== undefined) {
    style.stroke = css(opts.stroke);
    style.strokeThickness = opts.strokeWidth ?? 4;
  }
  const t = scene.add.text(x, y, content, style);
  t.setOrigin(opts.originX ?? 0, opts.originY ?? 0);
  return t;
}

/** 给已有文字加上按字符断行（中文）。 */
export function setWrap(t: Phaser.GameObjects.Text, width: number): Phaser.GameObjects.Text {
  return t.setWordWrapCallback((s: string, obj: Phaser.GameObjects.Text) => cjkWrap(s, obj, width));
}

/** 单行文字比 room 宽时从尾巴上截字、补省略号（至少留 min 个字）；没截就原样返回。 */
export function fitWidth(t: Phaser.GameObjects.Text, room: number, min = 2): Phaser.GameObjects.Text {
  let cut = Array.from(t.text);
  while (t.width > room && cut.length > min) {
    cut = cut.slice(0, -1);
    t.setText(`${cut.join('')}…`);
  }
  return t;
}

/**
 * 「名字 + 数字」一行放不下时只缩名字（名字截成「…」，再不够就整段名字不要），数字原样留着：
 * 数字不截断（docs/ui.md 第 10 节）。t 的内容会被换成 head + tail。
 */
export function fitKeepTail(t: Phaser.GameObjects.Text, head: string, tail: string, room: number): Phaser.GameObjects.Text {
  t.setText(`${head}${tail}`);
  let cut = Array.from(head);
  while (t.width > room && cut.length > 1) {
    cut = cut.slice(0, -1);
    t.setText(`${cut.join('')}…${tail}`);
  }
  if (t.width > room) t.setText(tail.trimStart());
  return t;
}

/**
 * 一行放不下时按逗号、分号、顿号、间隔号「·」分行，不在词中间按字数硬折（硬折会把「上岸」的「岸」、「新手」的「手」单独甩到下一行）。
 * 在「·」处断开时去掉行尾的点。只靠量宽度（t.width），文字要用不带 wrap 的 addText 先建好；某一小句自己就超宽时才退回按字折行。
 */
export function clauseWrap(t: Phaser.GameObjects.Text, width: number): Phaser.GameObjects.Text {
  const full = t.text;
  if (t.width <= width) return t;
  const lines: string[] = [];
  let cur = '';
  // 不用正则的后行断言：iOS 16.4 以前的 Safari 不认
  for (const part of (full.match(/[^，；、·]*[，；、·]?/g) ?? [full]).filter((p) => p !== '')) {
    t.setText(cur + part);
    if (cur && t.width > width) {
      lines.push(cur);
      cur = part.trimStart();
    } else cur += part;
  }
  lines.push(cur);
  const clean = lines.map((l) => l.replace(/\s*·\s*$/, ''));
  let tooWide = false;
  for (const l of clean) {
    t.setText(l);
    if (t.width > width) tooWide = true;
  }
  t.setText(clean.join('\n'));
  if (tooWide) setWrap(t, width);
  return t;
}

/** 改描边：和 setColor 一样，Phaser 不管变没变都重画，没变就不动 */
export function setStroke(t: Phaser.GameObjects.Text, color: string, thickness: number): Phaser.GameObjects.Text {
  const same = t.style.strokeThickness === thickness && (thickness === 0 || t.style.stroke === color);
  return same ? t : t.setStroke(color, thickness);
}

/** 改文字颜色。Phaser 的 setColor 不管颜色变没变都整张重画、再传一遍纹理，交易页每天都给几百个文字设颜色，大多没变：没变就不动 */
export function setColor(t: Phaser.GameObjects.Text, color: number): Phaser.GameObjects.Text {
  const c = css(color);
  return t.style.color === c ? t : t.setColor(c);
}
