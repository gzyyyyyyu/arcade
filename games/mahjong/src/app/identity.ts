/**
 * 我是谁：昵称、平台登录信息、单独部署（没有平台）的判断。
 * 单独部署没有登录、钱包和实盘，"大厅"回游戏首页，好友房用游客身份（昵称自己填，存 NICK_KEY）。
 */
import { readText, removeKey, writeText } from '../storage.ts';
import { detectPlatform, withNickname, type PlatformInfo } from 'arcade-kit/client';
import { prefs } from './prefs.ts';
import { session } from './session.ts';
import { home } from './shell.ts';

const NICK_KEY = 'mahjong.nick';

export function nick(): string {
  return readText(NICK_KEY) ?? '';
}

export function setNick(name: string): void {
  // 存不上就这一次有效，不看返回值
  if (name) writeText(NICK_KEY, name);
  else removeKey(NICK_KEY);
  session.myName = name || '我';
}

export async function loadMe(): Promise<void> {
  const p = await detectPlatform();
  session.platformInfo = p;
  if (p.platform === false) {
    session.standalone = true;
    session.myName = nick() || '我';
    home.href = './';
    home.querySelector('span')!.textContent = '首页';
    if (prefs.stakes !== 'fun') prefs.stakes = 'fun';
    return;
  }
  const name = p.platform === true ? (p.user as { displayName?: unknown } | null)?.displayName : undefined;
  if (typeof name === 'string' && name) session.myName = name;
}

/** 登录的玩家号（交每日榜用）：单独部署、没登录都是 null */
export function userIdOf(p: PlatformInfo | undefined): string | null {
  const id = p?.platform === true ? (p.user as { id?: unknown } | null)?.id : undefined;
  return typeof id === 'string' ? id : null;
}

/** 开房、进房的地址：单独部署时带上昵称（服务端会清洗，不合格就叫"游客1234"） */
export const withNick = (url: string): string => (session.standalone ? withNickname(url, nick()) : url);
