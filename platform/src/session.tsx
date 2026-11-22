/** 登录状态：有登录提示 cookie 才去问 /api/me，没登录的访客不发任何请求。 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiFail, isNetworkFail, type Notice, setUnauthorizedHandler, type User } from './api.ts';
import { hiddenGameIds, NO_PREFS, visibleOf } from '../shared/game-prefs.ts';

/** 登录后服务端设的提示 cookie（不是 HttpOnly）：有它才调接口，没登录的人一个请求都不发。 */
function hasLoginHint(): boolean {
  return document.cookie.split(';').some((c) => c.trim().startsWith('__Host-arcade_li='));
}

/**
 * ok：正常；readonly：服务器忙，只能看不能改；off：账号服务暂停（接口明确回了 busy）；
 * unreachable：连不上（断网，或者回来的不是我们的接口，比如 Cloudflare 的出错页），可以重试。
 */
export type Service = 'ok' | 'readonly' | 'off' | 'unreachable';

interface SessionState {
  /** 还在问服务器（只在有登录提示 cookie 时出现；超时重试期间也算）。 */
  loading: boolean;
  /** 第一次问 /api/me 超时或网络出错了，正在后台重试：大厅卡片不再等，直接给"进入游戏"（游戏有自己的登录闸门）。 */
  slow: boolean;
  user: User | null;
  service: Service;
  /** 云存档暂停（存档预算用完或停增长档）：游戏里的进度先存在本机。 */
  savesPaused: boolean;
  /** 大厅公告，管理员在管理页发、撤 */
  notice: Notice | null;
  /** 我看不到的游戏（管理员的默认 + 我的偏好，shared/game-prefs.ts）；没登录是空的 */
  hidden: ReadonlySet<string>;
  hiddenDefault: readonly string[];
  setUser: (u: User | null) => void;
  setHiddenDefault: (ids: string[]) => void;
  /** 重新问一次 /api/me（"重试"按钮、在别的设备改过昵称）。 */
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(hasLoginHint);
  const [user, setUser] = useState<User | null>(null);
  const [service, setService] = useState<Service>('ok');
  const [savesPaused, setSavesPaused] = useState(false);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [hiddenDefault, setHiddenDefault] = useState<string[]>([]);
  /** 公告、默认隐藏是哪个账号的 /api/me 读来的：刚登录、注册（回应里没有这两样）时补读一次 */
  const [metaFor, setMetaFor] = useState<string | null>(null);

  // 超时（8 秒，api.ts）或网络出错时再试 2 次，隔 1、2 秒；三次都不行才算"连不上"
  const refresh = useCallback(async () => {
    setLoading(true);
    for (let attempt = 0; ; attempt++) {
      try {
        const me = await api.me();
        setUser(me.user);
        setService(me.service);
        setSavesPaused(me.saves === 'paused');
        setNotice(me.notice ?? null);
        setHiddenDefault(me.hiddenDefault ?? []);
        setMetaFor(me.user?.id ?? null);
        setSlow(false);
        break;
      } catch (e) {
        if (isNetworkFail(e) && attempt < 2) {
          setSlow(true);
          await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
          continue;
        }
        // 只有接口明确说 busy 才是停服；断网、网关出错页都算"连不上"，给重试
        setService(e instanceof ApiFail && e.code === 'busy' ? 'off' : 'unreachable');
        setUser(null);
        break;
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (hasLoginHint()) void refresh();
  }, [refresh]);

  const userId = user?.id ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在换了账号时看一次；读完 metaFor 跟上就不再读
  useEffect(() => {
    // 退出、掉线：清掉上个账号读来的公告和默认，同号重登时会补读 /api/me
    if (!userId) {
      setMetaFor(null);
      setNotice(null);
      setHiddenDefault([]);
      return;
    }
    if (metaFor !== userId && !loading) void refresh();
  }, [userId]);

  // 任何请求回 401 unauthorized：会话在别处失效了（改了密码、退出其他设备、过期），这里也当成没登录
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  // loading 只表示"第一次还没读到人"：已经登录时后台再读一次（改完昵称、登录后补读）不该把页面换成骨架，
  // 不然页面整个卸掉重画，我的账号、管理页选中的页签回到第一个，安全页签里没存好的恢复码也跟着丢
  const prefs = user ? user.gamePrefs : NO_PREFS;
  // 登录、注册的回应里没有默认（只有 /api/me 给）：刚登录时先按偏好算，补读完 /api/me 再算一遍
  const hidden = useMemo(() => (user ? hiddenGameIds(hiddenDefault, prefs) : new Set<string>()), [user, hiddenDefault, prefs]);
  return (
    <Ctx.Provider value={{ loading: loading && !user, slow, user, service, savesPaused, notice, hidden, hiddenDefault, setUser, setHiddenDefault, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionState {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession 要在 SessionProvider 里用');
  return s;
}

const idOf = (g: { id: string }) => g.id;

/** 按隐藏偏好过滤：游戏表（大厅、继续玩、排行页签）按 id；别的东西（动态）给 gameOf */
export function useVisible<T extends { id: string }>(games: readonly T[]): T[];
export function useVisible<T>(items: readonly T[], gameOf: (x: T) => string): T[];
export function useVisible<T>(items: readonly T[], gameOf: (x: T) => string = idOf as unknown as (x: T) => string): T[] {
  const { hidden } = useSession();
  return useMemo(() => visibleOf(items, hidden, gameOf), [items, hidden, gameOf]);
}
