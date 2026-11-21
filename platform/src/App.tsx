import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { GAMES, type GameEntry } from '../shared/games.ts';
import { CoinIcon, LogoMark, PeopleIcon, ShieldIcon, SpeakerIcon, TrophyIcon } from './icons.tsx';
import { setSoundOn, soundOn, subscribeSound } from './lib/sound.ts';
import { playUrl } from './lib/play.ts';
import { Link, navigate, useLocation } from './router.tsx';
import { HotkeyHelp, useHotkeys } from './features/hotkeys/Hotkeys.tsx';
import { api, type Overtake } from './api.ts';
import { useSession, useVisible } from './session.tsx';
import { FeedButton } from './features/feed/Feed.tsx';
import { InviteBar, useHasInvites, useInvitePolling } from './features/invites/Invites.tsx';
import { useLobbyPresence } from './lib/presence.ts';
import { useWallet } from './features/wallet/Wallet.tsx';
import { num, signed } from './lib/format.ts';
import { useCountUp } from './lib/countup.ts';
import { playCoins } from './lib/sound.ts';
import { burstCoins } from './features/coinfly/burst.ts';
import './features/coinfly/coinfly.css';
import { chipsTotal, decideChipsFx } from './lib/chips-fx-logic.ts';
import { setLatestTotal, takePending } from './lib/chips-fx.ts';
import { enterGame, quiet, watchBackFx } from './lib/enter-fx.ts';
import { useRecentGames } from './features/recent/recent.tsx';
import { Paged, useMedia } from './features/fit/Fit.tsx';
import { relativeTime } from './features/recent/recent-logic.ts';
import { LobbyTour } from './features/lobby-tour/LobbyTour.tsx';

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
      // 页面马上要换掉：一直停在"正在打开…"
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

/** last：这是最近玩的那个游戏时，上次玩的时间（卡上写"上次玩 · 多久以前"，按钮写"继续玩"） */
function GameCard({ game, last = null }: { game: GameEntry; last?: number | null }) {
  const playable = game.status === 'playable';
  const { loading, slow, user, service } = useSession();
  // 问 /api/me 超时、连不上时不知道登没登录：照样给"进入游戏"，游戏自己有登录闸门，没登录会跳去登录页
  const unknown = !user && (slow || service === 'unreachable');
  // 今天带筹码上过桌的人数：跟着钱包一起问的（只有登录了才有），没有就不显示
  const { playing: counts, week } = useWallet();
  const playing = counts[game.id] ?? 0;
  // 本周净赢：这周在这个游戏带筹码玩过才有
  const wnet = Object.hasOwn(week, game.id) ? week[game.id]! : null;
  return (
    <article className={`card${playable ? '' : ' card--coming'}`} data-game={game.id}>
      {/* 介绍和标签叠在封面上：电脑上悬停或键盘移到卡上才浮出来，卡片平时只有封面、名字、一句话和按钮；手机上不显示 */}
      <div className="card__media">
        {/* 400 宽的小图（npm run cover -- --small）给手机短卡和电脑一倍屏，2 倍屏的电脑才拿 800 宽的原图：首屏封面少下一半多 */}
        <img
          className="card__cover"
          src={game.cover}
          srcSet={`${game.cover.replace(/\.webp$/, '-400.webp')} 400w, ${game.cover} 800w`}
          sizes="(max-width: 560px) 112px, 400px"
          alt={`${game.name}封面`}
          width={800}
          height={450}
          loading="lazy"
          decoding="async"
        />
        <div className="card__more">
          <p className="card__desc">{game.desc}</p>
          <ul className="card__tags">
            {game.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="card__body">
        {/* 人数牌子骑在封面和正文的分界线上：原来压在封面右上角，挡住封面上的标题字 */}
        {playable && playing > 0 && (
          <span className="card__playing" data-testid={`playing-${game.id}`}>
            <PeopleIcon />
            今天 {playing} 人玩过
          </span>
        )}
        {last !== null && (
          <span className="card__kicker" data-testid={`last-${game.id}`}>
            上次玩 · {relativeTime(last, Date.now())}
          </span>
        )}
        <h2 className="card__title">
          {game.name}
          {wnet !== null && (
            <span className={`card__week${wnet > 0 ? ' up' : wnet < 0 ? ' down' : ''}`} data-testid={`week-${game.id}`}>
              本周 {signed(wnet)}
            </span>
          )}
        </h2>
        <p className="card__tagline">{game.tagline}</p>
        {!playable ? (
          <span className="card__play card__play--disabled">敬请期待</span>
        ) : loading && !slow ? (
          <span className="card__play card__play--disabled">请稍等…</span>
        ) : user || unknown ? (
          // 只有一个按钮：好友房在游戏里开、进；叫人、邀请、好友页的"加入"都直接链到游戏的 ?room=
          <a className="card__play" href={playUrl(game)} data-tour="play" onClick={(e) => enterGame(e, playUrl(game), game.id, e.currentTarget.closest('.card')?.querySelector('.card__cover') ?? null)}>
            {last !== null ? '继续玩' : '进入游戏'}
          </a>
        ) : (
          // 测试期要登录才能玩（游戏那边也会挡）：登录后直接回这个游戏
          <Link className="card__play" href={`/login?from=${game.id}`}>
            登录后才能玩
          </Link>
        )}
      </div>
    </article>
  );
}

function Home({ deleted }: { deleted: boolean }) {
  const { user, notice: announcement } = useSession();
  const { wallet } = useWallet();
  const onTable = (wallet?.stakes.length ?? 0) > 0;
  const { games, last } = useRecentGames(user?.id ?? '');
  // 电脑上一页放下全部游戏；手机、横屏、矮窗口按剩下的高度翻页
  const wide = useMedia('(min-width: 960px) and (min-height: 600px)');
  // 横幅只在注销后这一次显示：记下来，再把 ?deleted=1 从网址里去掉，刷新或分享出去都不会再冒出来
  const [notice] = useState(deleted);
  // 刚从某个游戏回来：满屏封面缩回那张卡（enter-fx.ts）；浏览器后退从往返缓存恢复时也在这里收拾残留的封面
  useEffect(() => watchBackFx((id) => document.querySelector(`.lobby-grid [data-game="${id}"] .card__cover`)), []);
  useEffect(() => {
    if (!deleted) return;
    const url = new URL(location.href);
    url.searchParams.delete('deleted');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }, [deleted]);
  return (
    <div className="lobby">
      {notice && <p className="banner">账号已经注销，数据都删掉了。</p>}
      {/* 首屏最多一条提示（docs/ui.md 信息密度）：公告 > 桌上的筹码 > 超越提醒，管理员撤下公告后后面的才出来 */}
      {user && announcement ? (
        <p className="banner banner--notice" data-testid="notice">
          <strong className="banner__tag">公告</strong>
          {announcement.text}
        </p>
      ) : (
        <>
          <LobbyNudge />
          {user && !onTable && <OvertakeNudge />}
        </>
      )}
      {/* 游戏格子吃掉剩下的高（一屏放下不滚，docs/ui.md 第 11 节）：最近玩的排第一张，写"上次玩"、按钮是"继续玩" */}
      <main className="lobby__games">
        <Paged
          className={wide ? 'lobby-grid lobby-grid--all' : 'lobby-grid'}
          grid
          fixed={wide ? Infinity : undefined}
          items={games}
          keyOf={(g) => g.id}
          render={(g) => <GameCard game={g} last={last?.id === g.id ? last.at : null} />}
          label="翻看更多游戏"
          testId="lobby-pages"
        />
      </main>
      <LobbyTour />
    </div>
  );
}

/**
 * 大厅提醒：有筹码压在桌上时直达那个游戏。首屏顶栏以下最多一条提示（docs/ui.md 信息密度），所以领补给不再占一条：
 * 钱包页里领，能领时顶栏筹码牌子上亮红点（WalletBadge）。用登录时已经问过的 /api/wallet，不多发请求；从游戏回大厅是整页加载，会重新问。
 */
function LobbyNudge() {
  const { user } = useSession();
  const { wallet } = useWallet();
  if (!user || !wallet?.stakes.length) return null;
  const { stakes } = wallet;
  const onTable = stakes.reduce((t, s) => t + s.amount, 0);
  // 同一个游戏可以有好几份（比如德州单机加好友房）：按不同的游戏算，只有一个游戏就直达它
  const games = new Set(stakes.map((s) => s.game));
  const g = games.size === 1 ? GAMES.find((x) => games.has(x.id)) : undefined;
  const where = stakes.length === 1 && stakes[0]!.mode === 'server' ? '好友房' : '';
  const parts = stakes.length > 1 ? `（${stakes.length} 份）` : '';
  return (
    <div className="nudges" data-testid="nudges">
      {/* 手机上也是页面顶上的一条（原来是底部固定条）：字太长时中间那段先省略，游戏名和数字留着 */}
      <p className="banner nudge nudge--stake" data-testid="nudge-stake">
        <span className="nudge__what">
          <span className="nudge__keep">{g ? g.name : games.size > 1 ? `${games.size} 个游戏` : ''}</span>
          <span className="nudge__mid">{g ? `${where}桌上还有` : games.size > 1 ? '的桌上还有' : '桌上还有'}</span>
          <span className="nudge__keep">
            {' '}
            {num(onTable)}
            {parts}
          </span>
        </span>
        {g ? (
          <a className="inline-link" href={playUrl(g)}>
            回去接着打
          </a>
        ) : (
          <Link className="inline-link" href="/wallet">
            去看看
          </Link>
        )}
      </p>
    </div>
  );
}

const overtakeGame = (o: Overtake) => o.gameId;

/**
 * 好友超过了我这周的每日挑战纪录（docs/social.md 1.5）：打开大厅时问一次，读的时候比、不存；有好几个游戏只提第一个没被隐藏的。
 * 问失败就不提，不打扰。
 */
function OvertakeNudge() {
  const [all, setAll] = useState<Overtake[]>([]);
  useEffect(() => {
    let alive = true;
    api.overtakes().then((r) => alive && setAll(r.overtakes), () => {});
    return () => {
      alive = false;
    };
  }, []);
  const o = useVisible(all, overtakeGame)[0];
  const g = o && GAMES.find((x) => x.id === o.gameId);
  if (!o || !g) return null;
  // 一天几个每日榜的游戏说是哪个子榜："夜巡·守夜"
  const sub = Array.isArray(g.daily) ? g.daily.find((x) => x.id === o.board) : undefined;
  return (
    <p className="banner nudge" data-testid="nudge-overtake">
      <span>
        <strong>{o.by.displayName}</strong>超过了你这周的{g.name}
        {sub ? `·${sub.name}` : ''}每日挑战纪录
      </span>
      <a className="inline-link" href={playUrl(g)}>
        去挑战
      </a>
    </p>
  );
}

/** 顶栏上指向当前页的那一项标成 aria-current（styles.css 画暖色底）：手机上没有侧栏，靠它看出在哪一页 */
const here = (path: string, href: string) => (path === href ? ({ 'aria-current': 'page' } as const) : {});

/** 右上角：没登录是"登录"，登录了是头像（昵称第一个字）加昵称；管理员前面多一个"管理"。所有页面都是这同一组、同样的顺序 */
function AccountButton() {
  const { loading, user, service } = useSession();
  const path = useLocation().pathname;
  if (loading) return <span className="topbar"><span className="account account--loading" aria-hidden="true" /></span>;
  // 停服档登也登不上，连不上时不知道登没登录：顶上的提示已经说明了，不放入口
  if (service === 'off' || service === 'unreachable') return null;
  // 已经在登录、找回页上了，右上角再放一个"登录"是多余的
  if (!user && (path === '/login' || path === '/forgot')) return null;
  if (!user) {
    return (
      <span className="topbar">
        <Link className="account" href="/login">
          登录
        </Link>
      </span>
    );
  }
  return (
    <span className="topbar">
      {user.isAdmin && (
        <Link className="account account--admin" href="/admin" {...here(path, '/admin')}>
          <ShieldIcon />
          管理
        </Link>
      )}
      <Link className="account account--nav" href="/boards" {...here(path, '/boards')}>
        <TrophyIcon />
        <span className="account__label">排行</span>
      </Link>
      <FeedButton me={user.id} />
      <FriendsLink path={path} />
      <WalletBadge path={path} />
      <Link className="account" href="/me" title="我的账号" {...here(path, '/me')}>
        <span className="account__avatar" aria-hidden="true">
          {Array.from(user.displayName)[0]}
        </span>
        <span className="account__name">{user.displayName}</span>
      </Link>
    </span>
  );
}

/** 顶栏的"好友"：有还没过期的邀请时带红点（docs/social.md 1.3） */
function FriendsLink({ path }: { path: string }) {
  const dot = useHasInvites();
  return (
    <Link className="account account--nav" href="/friends" data-testid="friends-link" data-tour="friends" {...here(path, '/friends')}>
      <PeopleIcon />
      <span className="account__label">好友</span>
      {dot && <span className="dot" role="img" aria-label="有人叫你" data-testid="invite-dot" />}
    </Link>
  );
}

/** 顶栏的筹码小牌子：点开进钱包页。还在读时数字位置放一个不带字的占位（写"筹码"像是坏了），读不到才写"筹码"，入口照样在 */
function WalletBadge({ path }: { path: string }) {
  const { wallet, error } = useWallet();
  const shown = useCountUp(wallet?.balance ?? null);
  // 刚从游戏回来且总数（余额 + 桌上筹码）变了：数字从旧值滚到新值，多了再迸一撮金币（chips-fx.ts）；只在钱包第一次读到时比一次
  const [rolled, setRolled] = useState<number | null>(null);
  const numEl = useRef<HTMLSpanElement>(null);
  const checked = useRef(false);
  useEffect(() => {
    if (!wallet) return;
    setLatestTotal(chipsTotal(wallet));
    if (checked.current) return;
    checked.current = true;
    const fx = decideChipsFx(takePending(), { total: chipsTotal(wallet), balance: wallet.balance }, Date.now());
    if (fx.kind === 'none' || quiet()) return;
    const badge = numEl.current?.parentElement;
    if (fx.kind === 'burst' && badge) {
      burstCoins(badge, 8);
      playCoins();
    }
    const to = wallet.balance;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      setRolled(t >= 1 ? null : Math.round(fx.from + (to - fx.from) * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setRolled(fx.from);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wallet]);
  // 刷新后余额变多了（赢了、领了）响一下；第一次读到不响
  const last = useRef<number | null>(null);
  const bal = wallet?.balance ?? null;
  useEffect(() => {
    if (bal !== null && last.current !== null && bal > last.current) playCoins();
    last.current = bal;
  }, [bal]);
  // 今天能领补给：牌子上亮红点，进钱包页领（原来大厅有一整条领补给提示，占首屏）
  const canRelief = !!wallet && wallet.canRelief && wallet.writesLeft > 0;
  return (
    <Link className="account account--chips" href="/wallet" title={canRelief ? '我的筹码（今天能领补给）' : '我的筹码'} data-testid="wallet-badge" data-tour="chips" {...here(path, '/wallet')}>
      <CoinIcon />
      {wallet ? <span className="chips-num" ref={numEl}>{num(rolled ?? shown)}</span> : error ? <span className="chips-num">筹码</span> : <span className="chips-num chips-num--wait" role="img" aria-label="筹码" />}
      {canRelief && <span className="dot" role="img" aria-label="今天能领补给" data-testid="relief-dot" />}
    </Link>
  );
}

/** 页脚的声音开关：大厅点按的那一声"嗒"（src/lib/sound.ts） */
function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, soundOn);
  return (
    <button className="foot__sound" type="button" data-sound-toggle aria-pressed={on} data-testid="sound-toggle" onClick={() => setSoundOn(!on)}>
      <SpeakerIcon on={on} />
      {on ? '声音：开' : '声音：关'}
    </button>
  );
}

/** 做好了电脑版排版的页面：电脑上主区放开成两栏（styles.css 的 .desk），手机上照旧是中间一窄列 */
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
            <Suspense fallback={<p className="note page-loading">正在打开…</p>}>
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
        <span>全部游戏内容均为虚构 · 美术与音频为原创程序生成</span>
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
