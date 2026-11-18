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


/**
 * 按字符断行：中文没有空格，Phaser 自带的按单词换行不适用。
 * 英文/数字连续片段尽量不拆开，行首避开标点。
 */
function cjkWrap(text: string, obj: Phaser.GameObjects.Text, width: number): string[] {
  const ctx = obj.context;
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const start = out.length;
    // 切成「原子」：连续的 ASCII 字母数字作为一个整体，其余逐字符
    const atoms = para.match(/[A-Za-z0-9.¥+\-×%]+|./gu) ?? [];
    let line: string[] = [];
    // 内容里的英文双引号 " 成对出现：段落里第偶数个是右引号，和中文右引号一样不能放在行首
    let quotes = 0;
    for (const atom of atoms) {
      const closing = atom === '"' && quotes % 2 === 1;
      if (atom === '"') quotes++;
      if (line.length > 0 && ctx.measureText(line.join('') + atom).width > width) {
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
      } else {
        line.push(atom);
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

export function setColor(t: Phaser.GameObjects.Text, color: number): Phaser.GameObjects.Text {
  return t.setColor(css(color));
}
