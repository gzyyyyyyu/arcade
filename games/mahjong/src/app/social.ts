/**
 * 好友：报位置、收邀请、叫朋友来（docs/social.md 1.2、1.3，kit 的 arcade-kit/social；没平台、没登录时不挂）。
 */
import { inviteUrl, mountSocial, openInvite, type Invite, type Presence } from 'arcade-kit/social';
import type { KitTheme } from 'arcade-kit/theme';
import { GAME_NAME } from '../view/text.ts';
import { leave, leaveRoom } from './leave.ts';
import { GAME_ID } from './report.ts';
import { enterRoom } from './room-flow.ts';
import { inMatch, session } from './session.ts';

/** kit 的面板（叫朋友来、邀请横条）用雀馆弹窗同一套颜色（css/base.css 的 :root 变量），不然是 kit 默认的深棕，和别的弹窗不是一套（看图第 23 条） */
const THEME: KitTheme = { bg: 'var(--panel)', fg: 'var(--ink)', soft: 'var(--surface-hi)', border: 'var(--line)' };

/** 开发服务器上把社交部件的流水记在 window.__socialLog，冒烟看 */
const devLog = (): ((l: string) => void) | undefined =>
  import.meta.env.DEV ? (l: string) => ((window as { __socialLog?: string[] }).__socialLog ??= []).push(l) : undefined;

/**
 * 叫朋友来（docs/social.md 1.3，kit 的"叫朋友来"面板）：登录了列好友、每人一个"叫他来"，底下复制邀请链接；
 * 单独部署、没登录（social 没挂上）只有复制邀请链接（能系统分享就分享）。链接带房间号，朋友点开登录后直接进房
 */
export function share(): void {
  const online = session.online;
  if (!online) return;
  const code = online.state.code;
  const log = devLog();
  const o = { game: GAME_ID, room: code, url: new URL(`?room=${code}`, location.href).toString(), text: `来${GAME_NAME}打一把，房间号 ${code}`, ...(log ? { log } : {}) };
  if (session.social) session.social.openInvite(o);
  else openInvite({ ...o, friends: false, theme: THEME });
}

/** 我在哪：好友房里报房间号和几个真人，别的时候是"在玩雀馆" */
function whereAmI(): Presence {
  const s = session.online?.state;
  // 匹配桌好友进不来，不报房间号（报了好友那边会给"去"，点了是 4004）
  if (!s?.room || inMatch()) return { place: 'game', game: GAME_ID };
  const humans = s.room.seats.filter((x) => x.kind === 'human').length;
  return { place: 'room', game: GAME_ID, room: s.code, seats: `${humans}/${s.room.seats.length}` };
}

/** 点邀请的"去"：打到一半先照常确认离开（实盘的结回照旧），取消了就留下 */
async function goInvite(inv: Invite): Promise<void> {
  const unfinishedSolo = (): boolean => !!session.solo && session.solo.save.state.phase !== 'over';
  if (session.online) await leaveRoom();
  else if (unfinishedSolo()) await leave();
  if (session.online || unfinishedSolo()) return;
  if (inv.game === GAME_ID) enterRoom(inv.room, false);
  else location.assign(inviteUrl(inv));
}

export async function startSocial(): Promise<void> {
  const log = devLog();
  session.social = await mountSocial({
    ...(session.platformInfo ? { platform: session.platformInfo } : {}),
    where: whereAmI,
    theme: THEME,
    // kit 不认识任何游戏；别的游戏叫什么只有平台知道，横条上就说"一起玩"
    gameName: (id) => (id === GAME_ID ? GAME_NAME : undefined),
    onGo: (inv) => void goInvite(inv),
    ...(log ? { log } : {}),
  });
}
