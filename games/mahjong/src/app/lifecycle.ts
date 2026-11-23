/**
 * 离开牌桌、房间的清理：停单机、断房间、拆牌桌和互动，集中在这一处。
 */
import { dropFun } from './fun.ts';
import { stopMatch } from './match-flow.ts';
import { stopFollow, setRoomInUrl } from './room-flow.ts';
import { session } from './session.ts';
import { idleTitle, paintTop, title } from './shell.ts';

/** 放掉牌桌上的一切：停跟随和排队、单机、房间连接、互动、牌桌 */
export function dispose(): void {
  stopFollow();
  stopMatch();
  session.arrive = null;
  session.autoSit = false;
  session.solo?.stop();
  session.solo = null;
  session.online?.close();
  session.online = null;
  dropFun();
  session.table?.destroy();
  session.table = null;
}

/** 离开牌桌、房间回到主页或选桌页：告诉好友我不在房里了，放掉牌桌，地址栏去掉房间号，标题回到游戏名 */
export function teardown(): void {
  // 从房间回来：马上告诉好友我不在房里了
  if (session.reported !== null) {
    session.reported = null;
    session.social?.presenceNow(true);
  }
  dispose();
  setRoomInUrl(null);
  title.textContent = idleTitle();
  paintTop();
}
