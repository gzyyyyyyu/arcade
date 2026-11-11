import Phaser from 'phaser';
import type { BuildingKind } from '../core/types.ts';
import type { PlaceCheck } from './basefeel.ts';

export interface Node {
  img: Phaser.GameObjects.Image;
  key: string;
  bubble?: Phaser.GameObjects.Container;
  bubbleKind?: 'gold' | 'wood';
}

export interface Place {
  kind: BuildingKind;
  id?: number;
  level: number;
  size: number;
  x: number;
  y: number;
  valid: boolean;
  ghost: Phaser.GameObjects.Image;
  diamond: Phaser.GameObjects.Graphics;
  /** 手机：虚影旁边的 ✓ / ✕（松手后出现，拖的时候藏起来）；电脑上鼠标左键直接放下，没有它们 */
  ok: HTMLButtonElement;
  no: HTMLButtonElement;
  float: HTMLElement;
  /** 底栏标签里的一句话：能放 / 压到哪座 / 出界 */
  why: HTMLElement;
  /** 底栏的操作提示（鼠标 / 手指两套说法） */
  hint: HTMLElement;
  /** 虚影的落点（世界坐标，占地中心）：每帧在它上面加浮动和晃动 */
  bx: number;
  by: number;
  check: PlaceCheck | null;
  /** 手指正按着拖（拖的时候不显示 ✓ / ✕）；按下的位置和有没有拖动过（没拖 = 点一下，把虚影挪过去） */
  dragging: boolean;
  press: { x: number; y: number } | null;
  moved: boolean;
  /** 鼠标按住拖出一排城墙 */
  mouseLine: boolean;
  /** 放不下时点了一下：虚影左右晃（剩余毫秒） */
  shake: number;
  /** 城墙：一次拖出一排（只放合法的格子） */
  line?: Array<{ x: number; y: number }>;
  lineFrom?: { x: number; y: number };
  lineCells?: Array<{ x: number; y: number; ok: boolean }>;
  costEl?: HTMLElement;
}

export const SHORT: Record<string, string> = { no_gold: '还差一些金币', no_wood: '还差一些木材', locked: '主寨等级还没到，没解锁', limit: '这种建筑的名额满了', blocked: '这里放不下', max: '已经是最高级', need_armory: '军械所等级还没到，先升级军械所', one_captain: '一场只能带一个船长', need_hq: '先升级主寨', need_stars: '星星还没攒够，先去出海拿星' };

export const CAT_ORDER = ['resource', 'storage', 'army', 'defense'];

/** 个人面板按钮的图标：三角帽加头像（线稿，和静音钮同一套画法） */
export const CAPTAIN_ICON = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2b1a15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 11 12 3l9.5 8-9.5 2z" fill="#2b1a15"/><circle cx="12" cy="8.4" r="1" fill="#f9f0da" stroke="none"/><path d="M6 14.5c0 4 2.7 6.5 6 6.5s6-2.5 6-6.5" /><path d="M9.5 16.5h.01M14.5 16.5h.01" stroke-width="2.6"/></svg>';

export const v2 = (p: { x: number; y: number }): Phaser.Math.Vector2 => new Phaser.Math.Vector2(p.x, p.y);

/** 开 / 关建筑面板时镜头挪过去、挪回来的时长 */
export const PANEL_CAM_MS = 360;
