import { lazy, Suspense, type ComponentType } from 'react';
import { LogoMark } from './icons.tsx';
import { Link, navigate, useLocation } from './router.tsx';
import { HotkeyHelp, useHotkeys } from './features/hotkeys/Hotkeys.tsx';
import { useSession } from './session.tsx';
import { InviteBar, useInvitePolling } from './features/invites/Invites.tsx';
import { useLobbyPresence } from './lib/presence.ts';
import { Home } from './pages/lobby/Lobby.tsx';
import { AccountButton, SoundToggle } from './features/topbar/TopBar.tsx';
import { Skeleton } from './ui.tsx';

/**
 * 各页面按需加载：大厅首屏只带首页要用的（React 加卡片），点进哪页再下那一页的代码。
 * 大多数人打开大厅就直接进游戏了，用不到管理、好友、账号这些页面。
 */
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] }), reloadForNewVersion));

/** 同一个地址上次因为分块加载失败而重载的时间（sessionStorage，平台的 key 加 arcade. 前缀） */
const RELOADED_KEY = 'arcade.reloaded';
const RELOAD_WINDOW_MS = 10_000;

/**
 * 分块加载失败多半是发版了：一天部署好几次，旧的分块文件随之没了，开着没刷新的大厅再点进别的页就是 404。
 * 整页重载这个地址拿新版；同一个地址 10 秒内只重载一次，再失败（真断网，或存不了记录）就停下来让人自己刷新，免得来回重载。
 */
function reloadForNewVersion(): Promise<{ default: ComponentType }> {
  const href = location.href;
  const now = Date.now();
  try {
    const last = JSON.parse(sessionStorage.getItem(RELOADED_KEY) ?? 'null') as { href?: string; at?: number } | null;
    const recent = last?.href === href && typeof last.at === 'number' && now - last.at >= 0 && now - last.at < RELOAD_WINDOW_MS;
    if (!recent) {
      sessionStorage.setItem(RELOADED_KEY, JSON.stringify({ href, at: now }));
      location.assign(href);
      // 页面马上要换掉：一直停在加载占位上
      return new Promise(() => {});
    }
  } catch {
    // 存不了记录就不自动重载
  }
  return Promise.resolve({ default: PageLoadFailed });
}

function PageLoadFailed() {
  return (
    <p className="note" data-testid="page-load-failed">
      网络不好，刷新试试。{' '}
      <button className="btn btn--small" type="button" onClick={() => location.reload()}>
        刷新
      </button>
    </p>
  );
}
/** 页面代码还在下载：页面卡片的框加灰条（只有一行小字时网慢像白屏卡住） */
function PageLoading() {
  return (
    <div className="panel page-loading">
      <p className="page-loading__title">正在打开…</p>
      <Skeleton rows={4} />
    </div>
  );
}
const LoginPage = page(() => import('./pages/auth/Login.tsx'), 'LoginPage');
const InviteLinkPage = page(() => import('./pages/auth/Login.tsx'), 'InviteLinkPage');
const ForgotPage = page(() => import('./pages/auth/Forgot.tsx'), 'ForgotPage');
const MePage = page(() => import('./pages/me/Me.tsx'), 'MePage');
const PrivacyPage = page(() => import('./pages/privacy/Privacy.tsx'), 'PrivacyPage');
const AdminPage = page(() => import('./pages/admin/Admin.tsx'), 'AdminPage');
const FriendsPage = page(() => import('./pages/friends/Friends.tsx'), 'FriendsPage');
const FriendCodePage = page(() => import('./pages/friends/Friends.tsx'), 'FriendCodePage');
const WalletPage = page(() => import('./pages/wallet/Wallet.tsx'), 'WalletPage');
const StatsPage = page(() => import('./pages/stats/Stats.tsx'), 'StatsPage');
const BoardsPage = page(() => import('./pages/boards/Boards.tsx'), 'BoardsPage');
const FeedPage = page(() => import('./pages/feed/Feed.tsx'), 'FeedPage');

/** 账号相关的页面；不在表里的地址都当首页。 */
const ACCOUNT_PAGES: Record<string, ComponentType> = {
  '/login': LoginPage,
  '/forgot': ForgotPage,
  '/me': MePage,
  '/privacy': PrivacyPage,
  '/admin': AdminPage,
  '/friends': FriendsPage,
  '/wallet': WalletPage,
  '/me/stats': StatsPage,
  '/boards': BoardsPage,
  '/feed': FeedPage,
};

/** 带参数的页面：/f/<好友码>、/i/<邀请码>、/u/<用户 id>（别人的战绩）。 */
function pageFor(pathname: string): ComponentType | undefined {
  if (/^\/f\/[^/]+$/.test(pathname)) return FriendCodePage;
  if (/^\/i\/[0-9A-Za-z-]{1,20}$/.test(pathname)) return InviteLinkPage;
  if (/^\/u\/[A-Za-z0-9_-]{22}$/.test(pathname)) return StatsPage;
  return ACCOUNT_PAGES[pathname];
}



/** 做好了电脑版排版的页面：电脑上主区不限 520 宽、各页自己分栏，手机上照旧是中间一窄列 */
const DESK_PAGES = new Set(['/wallet', '/boards', '/friends', '/me', '/me/stats', '/feed']);
const isDesk = (path: string) => DESK_PAGES.has(path) || path.startsWith('/u/');

export function App() {
  const loc = useLocation();
  const { service, refresh, loading, slow, user } = useSession();
  useLobbyPresence(!!user);
  useInvitePolling(!!user);
  const Page = pageFor(loc.pathname);
  // 电脑键盘（hotkeys.ts）：数字键按大厅里的顺序开游戏；Esc 回大厅，但页面上开着弹窗、浮层时让它们自己先关
  const keys = useHotkeys({
    enabled: true,
    gameUrls: () => [...document.querySelectorAll<HTMLAnchorElement>('.lobby-grid .card__play[href]')].map((a) => a.href),
    navigate: (to) => navigate(to),
    onEscape: () => {
      if (loc.pathname !== '/' && !document.querySelector('[role="dialog"]')) navigate('/');
    },
  });
  // 导航只在顶栏一处：所有页面同一个顶栏、同样的项和位置，页面容器宽度也不跟着页面变，换页只换内容区
  return (
    <div className={!Page ? 'page' : loc.pathname === '/admin' ? 'page page--wide' : 'page page--narrow'}>
      <header className="top">
        <Link className="top__home" href="/">
          <h1 className="top__logo">
            <LogoMark />
            <span className="top__name">小游戏街机厅</span>
          </h1>
        </Link>
        <p className="top__sub">挑一个，开一局。</p>
        <AccountButton />
      </header>
      <InviteBar />
      {loading && slow && <p className="banner" data-testid="reconnecting">网络有点慢，正在重连…</p>}
      {service === 'off' && <p className="banner">账号服务暂时休息，游戏也要登录才能玩，过一会儿再来。</p>}
      {service === 'unreachable' && (
        <p className="banner">
          连不上服务器，检查一下网络。{' '}
          <button className="btn btn--small" type="button" disabled={loading} onClick={() => void refresh()}>
            {loading ? '正在连…' : '重试'}
          </button>
        </p>
      )}
      {/* 内容区吃掉顶栏和页脚剩下的高（一屏放下不滚，styles.css 的 .page__body） */}
      <div className="page__body">
      {Page ? (
        // 管理页是控制台布局，要整页宽；其余账号页面都是中间一栏。key 跟着地址换：换页时内容区重新淡入（styles.css 的 page-in）
        <div className="solo">
          <main key={loc.pathname} className={`page-in ${loc.pathname === '/admin' ? 'wide' : isDesk(loc.pathname) ? 'narrow narrow--desk' : 'narrow'}`}>
            <Suspense fallback={<PageLoading />}>
              <Page />
            </Suspense>
          </main>
        </div>
      ) : (
        <Home deleted={loc.searchParams.get('deleted') === '1'} />
      )}
      </div>
      <HotkeyHelp open={keys.helpOpen} onClose={keys.closeHelp} />
      {/* 分隔点由 CSS 加在每项外层的 span 上（加在链接里会带下划线）：手机上一项一行，不会有点挂在行尾 */}
      <footer className="foot">
        {/* 手机上换短说法：长的那句占满一行，声音开关就得单独掉到第二行 */}
        <span>
          <span className="foot__long">全部游戏内容均为虚构 · 美术与音频为原创程序生成</span>
          <span className="foot__short">内容虚构 · 美术音频原创</span>
        </span>
        <span>
          <Link href="/privacy">隐私说明</Link>
        </span>
        <span>
          <SoundToggle />
        </span>
        <span className="foot__keys">按 ? 看快捷键</span>
      </footer>
    </div>
  );
}
