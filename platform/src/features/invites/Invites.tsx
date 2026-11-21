/**
 * 收邀请（docs/social.md 1.3）：登录了、页面在前台时每 30 秒问一次（只读），切回前台马上问一次。
 * 有就在顶上弹一条"老王叫你来掼蛋 [去] [不了]"，顶栏的"好友"带红点。游戏页由 kit 的 social 部件弹同样的条，这里只管平台页面。
 * 点"去"先记"不了"再跳（到了游戏页 kit 不会再弹同一条），点"不了"马上收起。问失败不提示，下一次照问。
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, type InvitePoll, type Meetup } from '../../api.ts';
import { gameName } from '../../lib/format.ts';
import { isDue } from '../meetup/meetup-logic.ts';

const EVERY_MS = 30_000;

// 同一次轮询还带回约局和在线好友数（docs/social.md 1.6、1.2）：顶栏"好友"的在线数、头像的约局小点、好友页的约局都读这里
const EMPTY: InvitePoll = { invites: [], meetups: [], mine: null, online: 0 };
let state: InvitePoll = EMPTY;
const listeners = new Set<() => void>();
const set = (next: InvitePoll) => {
  state = next;
  for (const f of listeners) f();
};
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
const live = () => state.invites.filter((v) => v.until > Date.now());

/** 马上问一次（约局、取消之后用，不等下一个 30 秒） */
export function pollInvites(): Promise<void> {
  return api.invites().then(set, () => {});
}

export function useInvitePolling(loggedIn: boolean): void {
  useEffect(() => {
    if (!loggedIn) {
      set(EMPTY);
      return;
    }
    const poll = () => {
      if (!document.hidden) void pollInvites();
    };
    poll();
    const timer = setInterval(poll, EVERY_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [loggedIn]);
}

/** 还有没过期的邀请：顶栏"好友"的红点 */
export function useHasInvites(): boolean {
  return useSyncExternalStore(subscribe, () => live().length > 0);
}

/** 几个好友在线：顶栏"好友"上的小绿数字 */
export function useOnlineFriends(): number {
  return useSyncExternalStore(subscribe, () => state.online);
}

/** 好友约的局和我约的局（好友页） */
export function useMeetups(): { meetups: Meetup[]; mine: InvitePoll['mine'] } {
  const s = useSyncExternalStore(subscribe, () => state);
  return { meetups: s.meetups, mine: s.mine };
}

/** 有约局到点了（好友约的或我约的）：顶栏头像的小点。随轮询刷新，30 秒一档足够 */
export function useMeetupDue(): boolean {
  return useSyncExternalStore(subscribe, () => {
    const now = Date.now();
    return state.meetups.some((m) => isDue(m.at, now)) || (!!state.mine && isDue(state.mine.at, now));
  });
}

function drop(id: string): Promise<void> {
  set({ ...state, invites: state.invites.filter((v) => v.id !== id) });
  return api.dismissInvite(id).catch(() => {});
}

/** 顶上那一条：先到期的先弹 */
export function InviteBar() {
  useSyncExternalStore(subscribe, () => state);
  // 点了"去"马上有反应：按钮变"正在进…"，等关掉邀请、跳进游戏。这条留在列表里直到跳走（先移走会看不到"正在进…"、
  // 下一条顶上来被误标），按邀请 id 记
  const [goingId, setGoingId] = useState<string | null>(null);
  const v = live()[0];
  if (!v) return null;
  const going = goingId === v.id;
  const go = async () => {
    setGoingId(v.id);
    await api.dismissInvite(v.id).catch(() => {});
    location.assign(`/games/${encodeURIComponent(v.game)}/?room=${encodeURIComponent(v.room)}`);
  };
  return (
    <div className="banner invite" data-testid="invite-bar">
      <span>
        <strong>{[...v.from.name].slice(0, 12).join('')}</strong>
        叫你来{gameName(v.game)}
      </span>
      <span className="row">
        <button className="btn btn--small btn--primary" type="button" disabled={going} aria-busy={going} onClick={() => void go()}>
          {going ? '正在进…' : '去'}
        </button>
        <button className="btn btn--small" type="button" disabled={going} onClick={() => void drop(v.id)}>
          不了
        </button>
      </span>
    </div>
  );
}
