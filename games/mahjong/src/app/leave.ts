/**
 * 离开：好友房里离开（开打了先确认）、单机离开（没打完先确认、实盘马上结算）、点顶栏"大厅"也先确认一次。
 */
import { stakesOf } from '../game/stakes.ts';
import { confirmBox } from '../view/dialog.ts';
import { NET_SETTLE_LATER } from '../view/text.ts';
import { cloud } from './cloud.ts';
import { lobby } from './routes.ts';
import { roomBack, session } from './session.ts';
import { home, stage } from './shell.ts';
import { showError } from './wallet.ts';
import { sleep, TIMING } from './timing.ts';

/** 好友房里离开：开打了先确认（实盘这一局由电脑替他打完再结回），座位交给电脑 */
export async function leaveRoom(): Promise<void> {
  const s = session.online!.state;
  const back = roomBack();
  const v = s.view;
  const playing = s.room?.status === 'playing' && v && !v.done && s.you?.seat !== null && s.you?.seat !== undefined;
  if (playing) {
    const wallet = stakesOf(v.stakes)?.wallet;
    const ok = await confirmBox(stage, wallet ? '现在离开，这一局由电脑替你打完（输赢照算），打完这一局把筹码结回钱包。离开吗？' : '离开后座位交给电脑接着打。离开吗？', '离开', '接着打');
    if (!ok) return;
    session.online!.leaveSeat();
    // 等房间收到离座再断开（结回由房间办，断开也不影响）
    await sleep(TIMING.leaveSeatGraceMs);
  }
  lobby(false, back);
}

export async function leave(): Promise<void> {
  // 离开牌桌前把待传的云存档补传一次（AGENTS.md 第 2 节第 6 条）
  cloud.flush();
  if (session.online) return leaveRoom();
  const solo = session.solo;
  if (!solo) return lobby();
  const st = stakesOf(solo.stakes)!;
  const over = solo.save.state.phase === 'over';
  if (!over) {
    const ask = st.wallet ? '现在离开会马上结算：按手上的筹码结回钱包。离开吗？' : solo.save.ladder ? '先离开，下次在擂台接着打这一桌？' : '这一场还没打完，离开就不算了。离开吗？';
    const ok = await confirmBox(stage, ask, '离开', '接着打');
    if (!ok) return;
    await solo.leave();
    lobby();
    // 结回没成（断网、平台忙）：说清楚下次会自动再结（自审 C2）
    if (st.wallet && !solo.save.done) showError(NET_SETTLE_LATER);
    return;
  }
  lobby();
}

/** 对局中点"大厅"先确认一次（实盘马上结算） */
export function installLeaveGuard(): void {
  home.addEventListener('click', (e) => {
    if (session.online) {
      e.preventDefault();
      void leaveRoom().then(() => {
        if (!session.online) location.href = home.href;
      });
      return;
    }
    const solo = session.solo;
    if (!solo || solo.save.state.phase === 'over') return;
    e.preventDefault();
    void leave().then(() => {
      if (!session.solo) location.href = home.href;
    });
  });
}
