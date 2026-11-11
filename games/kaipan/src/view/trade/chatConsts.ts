import type Phaser from 'phaser';
import type { Rect } from '../rect.ts';
import { PHONE as PHONE_MODE } from '../theme.ts';
import { shortLine } from './chatFluff.ts';
import { PHONE_RECT as PHONE } from './layout.ts';

/** 战绩短写：「1/2」，新来的写「新」。 */
export function recShort(record: string): string {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(record);
  return !m || m[2] === '0' ? '新' : `${m[1]}/${m[2]}`;
}

/** 连涨 / 连跌的短说法。 */
export function streakText(n: number): string {
  return n >= 2 ? `连涨${n}天` : n <= -2 ? `连跌${-n}天` : n === 1 ? '昨天涨' : n === -1 ? '昨天跌' : '昨天平';
}

/** 和大环境比（画面层自己的说法，不用行话）：差距 ±1 个点以内算随大流。 */
export function vsLabel(d: number | null): { word: string; sign: number } | null {
  if (d === null) return null;
  if (d > 1) return { word: '跑赢大环境', sign: 1 };
  if (d < -1) return { word: '跑输大环境', sign: -1 };
  return { word: '随大环境', sign: 0 };
}

/**
 * 手机屏幕区域（外框内缩 14）。真手机横屏（0.5.5）上群聊在右边的标签页里：不画手机外框和群名条
 * （标签页上写群名人数），消息和推荐卡分成「群聊」「推荐」两页。
 */
export const INSET = PHONE_MODE ? 4 : 14;
export const SX = PHONE.x + INSET;
export const SW = PHONE.w - INSET * 2;
export const HEADER_H = PHONE_MODE ? 0 : 50;
export const BODY_Y = PHONE.y + INSET + HEADER_H;
export const BODY_H = PHONE.y + PHONE.h - INSET - BODY_Y;
export const PAD = 8;
export const CX = SX + PAD;
export const CW = SW - PAD * 2;
export const AVATAR = 32;
/**
 * 逐条冒出的总时长上限（毫秒，1 倍速）：一天从按开盘到能再操作按设计时长算不超过 8 秒，
 * 群聊热闹的日子（十几条）以前单这两段就要 3 秒多。
 */
export const INTRO_MAX = 900;
export const AFTER_CLOSE_MAX = 800;
/** 收盘盖「说对了 / 说错了」合计不超过 0.3 秒 */
export const JUDGE_MAX = 300;
export const BUBBLE_X = CX + AVATAR + 6;
export const BUBBLE_W = CW - AVATAR - 6;
/** 0.5.1 推荐卡：题材顶条 + 名字角色 + 5 天走势与连涨 + 推荐人战绩 + 一句理由 */
export const REC_H = 106;
/** 推荐多（FOMO 给 4 条）、消息又多时的扁推荐卡：小人缩小，理由仍保留一行，全文在悬停提示里 */
export const REC_H_FLAT = 68;
/** 消息特别多的日子（比如开了 FOMO 和小道消息）：推荐卡再压一档，保证当天消息完整显示 */
export const REC_H_MINI = 56;
export const GAP = 6;

/** 气泡里的短话：一行放得下多少字就留多少（13 号字约 15 字），整句在悬停提示里。 */
export function bubbleLine(text: string, size: number): string {
  return shortLine(text, '', Math.floor((BUBBLE_W - 20) / size));
}

export interface MsgNode {
  index: number;
  friendId: string;
  /** 名字旁边的战绩（收盘揭晓后跟着规则层更新） */
  rec: Phaser.GameObjects.Text;
  root: Phaser.GameObjects.Container;
  bubble: Rect;
  /** 这条消息（含名字行）的顶边 */
  top: number;
}
