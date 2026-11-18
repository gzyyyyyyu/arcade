/**
 * 全局应用上下文：当前会话、启动参数、场景切换。场景之间通过它共享会话，不各存一份。
 */
import type Phaser from 'phaser';
import type { CloudSync } from './common/cloud.ts';
import type { NetSession } from './guandan/net.ts';
import type { Session } from './guandan/session.ts';
import type { DdzSession } from './doudizhu/session.ts';
import type { DdzNetSession } from './doudizhu/net.ts';
import type { LaunchParams } from '../debug/params.ts';

export const app = {
  game: null as Phaser.Game | null,
  session: null as Session | null,
  /** 斗地主的单机会话（牌馆 0.28.0）；斗地主牌桌用它 */
  ddz: null as DdzSession | null,
  /** 联机会话（好友房）；在牌桌上时优先用它 */
  net: null as NetSession | null,
  /** 斗地主的联机会话（牌馆 ⑤）；斗地主牌桌优先用它，没有再用单机的 ddz */
  ddzNet: null as DdzNetSession | null,
  params: null as LaunchParams | null,
  /** 云存档（main.ts 启动） */
  cloud: null as CloudSync | null,
  /** 当前世界宽度、高度（宽随窗口宽高比变化；高在横屏和牌桌是 720，竖屏的主页更高，theme.ts 的 worldSizeFor） */
  width: 1280,
  height: 720,
  /** 进牌桌前把世界换成横屏的尺寸（竖屏主页的世界牌桌用不了；main.ts 装上） */
  toTableWorld: null as (() => void) | null,
  /** 启动耗时（毫秒） */
  bootMs: 0,
  ready: false,
  /** #app 改过几次尺寸（冒烟核对放大、地址栏收放时有没有乱写） */
  fits: 0,
};
