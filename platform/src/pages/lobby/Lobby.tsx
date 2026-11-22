/**
 * 大厅：游戏卡片网格（按高度翻页）、桌上有筹码时的「回去接着打」、被超过时的提醒。地址 / 显示这一页（App.tsx 按地址挑）。
 */
import { useEffect, useState } from 'react';
import { GAMES, type GameEntry } from '../../../shared/games.ts';
import { PeopleIcon } from '../../icons.tsx';
import { playUrl } from '../../lib/play.ts';
import { Link } from '../../router.tsx';
import { api, type Overtake } from '../../api.ts';
import { useSession, useVisible } from '../../session.tsx';
import { useWallet } from '../../features/wallet/Wallet.tsx';
import { num, signed } from '../../lib/format.ts';
import { enterGame, watchBackFx } from '../../lib/enter-fx.ts';
import { useRecentGames } from '../../features/recent/recent.tsx';
import { Paged, useMedia } from '../../features/fit/Fit.tsx';
import { relativeTime } from '../../features/recent/recent-logic.ts';
import { LobbyTour } from '../../features/lobby-tour/LobbyTour.tsx';

/**
 * last：这是最近玩的那个游戏时，上次玩的时间（卡上写"上次玩 · 多久以前"，按钮写"继续玩"）。
 * main：这张卡的按钮是大厅唯一的主按钮（实心橙，docs/ui.md 第 2 节一屏一个），别的卡是次按钮
 */
function GameCard({ game, last = null, main = false }: { game: GameEntry; last?: number | null; main?: boolean }) {
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
          style={game.coverX === undefined ? undefined : { objectPosition: `${game.coverX}% 50%` }}
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
            <span className="card__kicker-label">上次玩 · </span>
            {relativeTime(last, Date.now())}
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
          <a className={`card__play${main ? ' card__play--main' : ''}`} href={playUrl(game)} aria-label={last !== null ? '继续玩' : '进入游戏'} data-tour="play" onClick={(e) => enterGame(e, playUrl(game), game.id, e.currentTarget.closest('.card')?.querySelector('.card__cover') ?? null)}>
            {/* 手机短卡上只写两个字"继续""进入"：省下的宽给一句话，360 宽也不用省略号。包一层：按钮是带间距的弹性盒，拆成两块会隔开 */}
            {last !== null ? (
              <span>
                继续<span className="card__play-more">玩</span>
              </span>
            ) : (
              <span>
                进入<span className="card__play-more">游戏</span>
              </span>
            )}
          </a>
        ) : (
          // 测试期要登录才能玩（游戏那边也会挡）：登录后直接回这个游戏
          <Link className="card__play" href={`/login?from=${game.id}`} aria-label="登录后才能玩">
            <span>
              登录<span className="card__play-more">后才能玩</span>
            </span>
          </Link>
        )}
      </div>
    </article>
  );
}

export function Home({ deleted }: { deleted: boolean }) {
  const { user, notice: announcement } = useSession();
  const { wallet } = useWallet();
  const onTable = (wallet?.stakes.length ?? 0) > 0;
  const { games, last } = useRecentGames(user?.id ?? '');
  // 电脑上一页放下全部游戏；手机、横屏、矮窗口按剩下的高度翻页
  const wide = useMedia('(min-width: 960px) and (min-height: 600px)');
  // 手机竖屏、横屏一条一行（styles.css 同一条媒体查询）：带「本周」「今天几人玩过」的卡高一截，按每张实际高度装页，不按最高那张让每页都少放
  const oneCol = useMedia('(max-width: 599px), (max-height: 500px)');
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
          uneven={oneCol}
          items={games}
          keyOf={(g) => g.id}
          // 主按钮一屏一个：桌上有筹码时是提示条的"回去接着打"，否则是最近玩的那张"继续玩"；都没有就全是次按钮
          render={(g) => <GameCard game={g} last={last?.id === g.id ? last.at : null} main={!onTable && last?.id === g.id} />}
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
  // 和下面压成一行的样式同一个条件：窄屏只说"桌上"，游戏名、金额都不用省略号截
  const narrow = useMedia('(pointer: coarse), (max-width: 959px)');
  if (!user || !wallet?.stakes.length) return null;
  const { stakes } = wallet;
  const onTable = stakes.reduce((t, s) => t + s.amount, 0);
  // 同一个游戏可以有好几份（比如德州单机加好友房）：按不同的游戏算，只有一个游戏就直达它
  const games = new Set(stakes.map((s) => s.game));
  const g = games.size === 1 ? GAMES.find((x) => games.has(x.id)) : undefined;
  const where = stakes.length === 1 && stakes[0]!.mode === 'server' ? '好友房' : '';
  const mid = narrow ? '桌上' : g ? `${where}桌上还有` : games.size > 1 ? '的桌上还有' : '桌上还有';
  const parts = stakes.length > 1 ? `（${stakes.length} 份）` : '';
  return (
    <div className="nudges" data-testid="nudges">
      {/* 手机上也是页面顶上的一条（原来是底部固定条）：说法换短；万一还放不下，中间那段先省略，游戏名和数字留着 */}
      <p className="banner nudge nudge--stake" data-testid="nudge-stake">
        <span className="nudge__what">
          <span className="nudge__keep">{g ? g.name : games.size > 1 ? `${games.size} 个游戏` : ''}</span>
          <span className="nudge__mid">{mid}</span>
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
