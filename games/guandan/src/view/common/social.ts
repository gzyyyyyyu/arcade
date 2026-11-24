/**
 * 报位置、收邀请（仓库根 docs/social.md 1.2、1.3）：用 kit 的 `arcade-kit/social`，只在有平台、已登录时挂（单独部署、没登录一个请求都不发）。
 * 掼蛋只告诉它"我在哪"：好友房里报 place: room、房间码和真人几个（"3/4"），别的时候报 place: game。
 * 进房、离开、房间里真人数变了马上报一次（presenceNow），不用等 2 分钟；平台同一人 10 秒内只记一次，所以 11 秒后再补报一次。
 */
import type { Friend, Presence, SocialHandle } from 'arcade-kit/social';
import { platformInfo } from './platform.ts';
import { seatCountOf } from '../../net/room-info.ts';
import type { RoomLink } from './room-link.ts';

/** 大厅、牌桌上的联机会话（两种玩法）里社交只看这几项 */
type LinkInfo = Pick<RoomLink<never, never, never>, 'code' | 'room' | 'status'>;

/**
 * 横条上"老王叫你来牌馆"、面板里好友"在牌馆的好友房"：只认自己；别的游戏 kit 说"一起玩""在玩游戏"。
 * 游戏 id 是 guandan，掼蛋和斗地主共用，报位置分不出玩法（显示名由平台按登记给），所以写"牌馆"
 */
const GAME_NAME: Record<string, string> = { guandan: '牌馆' };

/** 现在在哪：连着的好友房（大厅里或牌桌上）报房间，不然报在牌馆 */
export function presenceOf(s: LinkInfo | null): Presence {
  if (s?.room && s.status === 'open' && s.room.status !== 'over') {
    const n = seatCountOf(s.room);
    const humans = s.room.seats.slice(0, n).filter((x) => x.kind === 'human').length;
    return { place: 'room', game: 'guandan', room: s.code, seats: `${humans}/${n}` };
  }
  return { place: 'game', game: 'guandan' };
}

let handle: SocialHandle | null = null;
let where: (() => LinkInfo | null) | null = null;
/** 上次报出去的位置（比较用）；同样的位置不重报，kit 自己每 2 分钟还会报 */
let lastWhere = '';
let retry: ReturnType<typeof setTimeout> | undefined;
/** 补报的间隔：平台同一人 10 秒内只记第一次（刚进房那次常被前一次挤掉），过了 10 秒再报一次才记得上 */
export const PRESENCE_RETRY_MS = 11_000;

/** 启动时挂一次（main.ts 在 detectOnce 之后调）。session：现在连着的好友房会话 */
export async function mountSocialOnce(session: () => LinkInfo | null): Promise<void> {
  try {
    if (handle) return;
    const info = platformInfo();
    // 启动时那一次没问出来（unknown：慢手机上主线程忙着烘纹理常超时）交给 kit 的 mountSocial 按 SOCIAL_DETECT_RETRY 再问
    if (info.platform === false || (info.platform === true && !info.user)) return;
    where = session;
    const { mountSocial } = await import('arcade-kit/social');
    handle = await mountSocial({ platform: info, where: () => presenceOf(session()), gameName: (id) => GAME_NAME[id] });
  } finally {
    settle();
  }
}

/** 挂没挂上已经有结论（单独部署、没登录也算）：刚进页面就点开好友房面板时，读好友列表先等它，不然那一下读到的是空的 */
let settle: () => void = () => {};
const settled = new Promise<void>((r) => (settle = r));

/**
 * "叫朋友来"面板的层级：要盖住房间弹窗 #online（8500，online.ts），不然面板在 DOM 里却看不见、点不到；
 * 又要在"请横过来"（9000，orientation.ts）和出错面板（9500，errors.ts）之下。tests/view/share-card.test.ts 从源码里核对这几个数
 */
export const INVITE_Z = 8800;

/**
 * 房间里的"叫朋友来"：kit 的面板，列好友、"叫 TA 来"、复制邀请链接。没挂上（单独部署、没登录）时只有复制链接。
 * 链接按现在的页面地址拼（单独部署时站点不一样），点开就进这个房间
 */
export async function openInvitePanel(code: string, name = '掼蛋'): Promise<void> {
  const inv = { game: 'guandan', room: code, url: `${location.origin}${location.pathname}?room=${code}`, text: `来打${name}！房间码 ${code}`, zIndex: INVITE_Z };
  if (handle) {
    handle.openInvite(inv);
    return;
  }
  const { openInvite } = await import('arcade-kit/social');
  openInvite({ ...inv, friends: false });
}

/**
 * 报一条名场面到好友动态（feed.ts 挑的）：只有挂上了 social（有平台、已登录）才报，不然一个请求都不发。
 * 平台超了每天 10 条也静默 204，结果不用管
 */
export function postFeed(m: { moment: string; n?: number }): void {
  if (!handle) return;
  void import('arcade-kit/social').then(({ postMoment }) => postMoment('guandan', m.moment, m.n));
}

/** 好友房面板顶上"好友在打"那一行的一桌：谁在、房间码、真人几个 */
export interface FriendTable {
  names: string[];
  room: string;
  seats: string;
}

/** 面板里最多摆几桌：手机横屏（844×390）一屏放得下 */
export const FRIEND_TABLES_MAX = 2;

/** 好友列表（好友房面板打开、开完房时各读一次）：没挂 social（单独部署、没登录）、读不到都是空的 */
async function friendsNow(): Promise<readonly Friend[]> {
  await settled;
  if (!handle) return [];
  const { fetchFriends } = await import('arcade-kit/social');
  return (await fetchFriends()) ?? [];
}

/** 有没有好友可叫：有才在开完房时自动弹"叫朋友来"（没好友时那个面板只剩复制链接，房间面板上本来就有） */
export async function hasFriends(): Promise<boolean> {
  return (await friendsNow()).length > 0;
}

/** 在线、在牌馆好友房里的好友，按房间并成一桌（同一桌的人写在一行），先列人多的 */
export function friendTables(list: readonly Friend[]): FriendTable[] {
  const byRoom = new Map<string, FriendTable>();
  for (const f of list) {
    const w = f.where;
    if (!f.online || w?.place !== 'room' || w.game !== 'guandan' || !w.room) continue;
    const t = byRoom.get(w.room) ?? { names: [], room: w.room, seats: w.seats ?? '' };
    t.names.push(f.name);
    byRoom.set(w.room, t);
  }
  return [...byRoom.values()].sort((a, b) => b.names.length - a.names.length).slice(0, FRIEND_TABLES_MAX);
}

/** 现在哪几桌有好友 */
export async function fetchFriendTables(): Promise<FriendTable[]> {
  return friendTables(await friendsNow());
}

/**
 * 位置可能变了（进房、离开、房间里有人坐下或走了）：和上次报的不一样才报，11 秒后按那时的位置补报一次。
 * online.ts 在房间的每个事件上调，没变就什么都不做
 */
export function presenceNow(): void {
  if (!handle || !where) return;
  const key = JSON.stringify(presenceOf(where()));
  if (key === lastWhere) return;
  lastWhere = key;
  handle.presenceNow(true);
  clearTimeout(retry);
  retry = setTimeout(() => handle?.presenceNow(true), PRESENCE_RETRY_MS);
}
