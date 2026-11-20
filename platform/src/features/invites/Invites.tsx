/**
 * 收邀请（docs/social.md 1.3）：登录了、页面在前台时每 30 秒问一次（只读），切回前台马上问一次。
 * 有就在顶上弹一条"老王叫你来掼蛋 [去] [不了]"，顶栏的"好友"带红点。游戏页由 kit 的 social 部件弹同样的条，这里只管平台页面。
 * 点"去"先记"不了"再跳（到了游戏页 kit 不会再弹同一条），点"不了"马上收起。问失败不提示，下一次照问。
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, type Invite } from '../../api.ts';
import { gameName } from '../../lib/format.ts';

const EVERY_MS = 30_000;

let list: Invite[] = [];
const listeners = new Set<() => void>();
const set = (next: Invite[]) => {
  list = next;
  for (const f of listeners) f();
};
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
const live = () => list.filter((v) => v.until > Date.now());

export function useInvitePolling(loggedIn: boolean): void {
  useEffect(() => {
    if (!loggedIn) {
      set([]);
      return;
    }
    const poll = () => {
      if (!document.hidden) api.invites().then((r) => set(r.invites), () => {});
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

function drop(id: string): Promise<void> {
  set(list.filter((v) => v.id !== id));
  return api.dismissInvite(id).catch(() => {});
}

/** 顶上那一条：先到期的先弹 */
export function InviteBar() {
  useSyncExternalStore(subscribe, () => list);
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
