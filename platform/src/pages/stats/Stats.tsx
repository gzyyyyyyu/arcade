/**
 * 战绩页（docs/platform-backend.md 5.10；一屏放下见 docs/ui.md 第 9、11 节）：/me/stats 是自己的，/u/<用户 id> 是别人的（好友列表、排行榜点进来）。
 * 顶上一排页签：总览 + 玩过的每个游戏。总览 = 玩家名片条 + 徽章墙和各游戏概览并排等高；游戏页签 = 这个游戏的局数、胜率、
 * 最大一把、本周净赢和称号墙。战绩对登录的人公开，余额不在这里。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { api, errorText, type Relation, type StatsResponse } from '../../api.ts';
import { gameName, num, signed, tone } from '../../lib/format.ts';
import { GAMES } from '../../../shared/games.ts';
import { PageTabs, Paged } from '../../features/fit/Fit.tsx';
import { Link, useLocation } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { loadTitles } from '../../lib/titles.ts';
import { playSuccess } from '../../lib/sound.ts';
import { Empty, FormError, LoadError, Panel, Skeleton, useSubmit, useWritable } from '../../ui.tsx';
import { friendLink, ShareButton, statsCard } from '../../features/share/Share.tsx';
import { pickBadge } from '../../features/share/share-pick.ts';
import { badgesOf, BADGE_COUNT, unlockedCount } from '../../features/badges/badges.ts';
import { BadgeWall } from './StatsBadges.tsx';
import { GameTab } from './StatsGame.tsx';
import { rateText, statsTabs } from './stats-logic.ts';
import './stats-card.css';

/** 按大厅的顺序排，大厅里没有的放最后 */
const order = (id: string) => {
  const i = GAMES.findIndex((g) => g.id === id);
  return i < 0 ? GAMES.length : i;
};

/** /me/stats → me；/u/<id> → id */
function statsTarget(pathname: string): string | null {
  if (pathname === '/me/stats') return 'me';
  const m = /^\/u\/([A-Za-z0-9_-]{22})$/.exec(pathname);
  return m ? m[1]! : null;
}

/**
 * 晒战绩卡上挂在昵称旁边的称号：拿过称号的几个游戏的 titles.json 都读一遍，交给 pickBadge 排除自嘲的、挑最近的。
 * 读不到的游戏当没有名字（不挂）
 */
function useBadge(data: StatsResponse | null): string | null {
  const [badge, setBadge] = useState<string | null>(null);
  const games = data?.relation === 'self' ? data.games : null;
  const key = games ? Object.entries(games).map(([g, c]) => `${g}:${c.titles.map((t) => t.id).join(',')}`).join(';') : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在称号集合（key）变了时重读：games 每次渲染都是新对象，直接依赖会反复请求
  useEffect(() => {
    setBadge(null);
    if (!games) return;
    const ids = Object.keys(games).filter((g) => games[g]!.titles.length > 0);
    let alive = true;
    void Promise.all(ids.map((g) => loadTitles(g).then((c) => [g, c] as const))).then((pairs) => {
      if (!alive) return;
      const catalogs = Object.fromEntries(pairs);
      setBadge(pickBadge(games, (g, id) => catalogs[g]?.[id]?.name));
    });
    return () => {
      alive = false;
    };
    // 只在称号变了时重读：games 每次渲染都是新对象
  }, [key]);
  return badge;
}

/** 顶部玩家名片：头像、昵称、称号数、本周净赢、徽章进度；数据都来自已有的 /api/stats 响应，不新增请求 */
function PlayerCard({ name, mine, titles, week, hasGames, unlocked, children }: { name: string; mine: boolean; titles: number; week: number; hasGames: boolean; unlocked: number; children?: ReactNode }) {
  const pct = Math.round((unlocked / BADGE_COUNT) * 100);
  return (
    <section className="pcard" data-testid="player-card" aria-label="玩家名片">
      <span className="account__avatar pcard__avatar" aria-hidden="true">
        {Array.from(name)[0]}
      </span>
      <div className="pcard__who">
        <div className="pcard__name">{name}</div>
        <div className="pcard__tag">{mine ? '这是你的街机名片' : '街机厅玩家'}</div>
      </div>
      <dl className="pcard__nums">
        <div>
          <dt>称号</dt>
          <dd>{titles}</dd>
        </div>
        {hasGames && (
          <div>
            <dt>本周净赢</dt>
            <dd className={tone(week)}>{signed(week)}</dd>
          </div>
        )}
      </dl>
      <div className="pcard__badges">
        <div className="pcard__badgehead">
          <span>徽章</span>
          <span>
            <strong data-testid="badges-count">{unlocked}</strong> / {BADGE_COUNT}
          </span>
        </div>
        <div className="pcard__bar" role="progressbar" aria-label="徽章解锁进度" aria-valuemin={0} aria-valuemax={BADGE_COUNT} aria-valuenow={unlocked}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      {children && <div className="pcard__act">{children}</div>}
    </section>
  );
}

/** 别人的战绩页上：加好友、接受请求，或者说明现在是什么关系 */
function FriendAction({ userId, relation, onChange }: { userId: string; relation: Relation; onChange: (r: Relation) => void }) {
  const writable = useWritable();
  const add = useSubmit(async () => {
    const r = await api.sendFriendRequestTo(userId);
    onChange(r.status === 'friends' ? 'friends' : 'pending_out');
  });
  const accept = useSubmit(async () => {
    await api.acceptFriend(userId);
    playSuccess();
    onChange('friends');
  });
  if (relation === 'friends') return <p className="note">你们是好友。</p>;
  if (relation === 'pending_out') return <p className="note" data-testid="friend-pending">已经发了好友请求，等对方接受。</p>;
  const act = relation === 'pending_in' ? accept : add;
  return (
    <div className="row">
      <button className="btn btn--primary" type="button" data-testid="add-friend" aria-busy={act.busy} disabled={act.busy || !writable} onClick={() => void act.onSubmit()}>
        {act.busy ? '请稍等…' : relation === 'pending_in' ? '对方想加你，接受' : '加好友'}
      </button>
      <FormError text={act.error} />
    </div>
  );
}

/** 总览右边的"各游戏概览"：每个玩过的游戏一行（局数、胜率、本周净赢右对齐），点一行进那个游戏的页签 */
function Overview({ games, onPick }: { games: [string, StatsResponse['games'][string]][]; onPick: (g: string) => void }) {
  return (
    <section className="scard" data-testid="overview">
      <h3 className="scard__title">各游戏概览</h3>
      <div className="ov-head" aria-hidden="true">
        <span>游戏</span>
        <span>局数</span>
        <span>胜率</span>
        <span title="北京时间周一清零">本周净赢</span>
      </div>
      <Paged
        items={games}
        keyOf={([g]) => g}
        label="游戏翻页"
        render={([g, c]) => (
          <button type="button" className="ov-row" data-testid={`career-${g}`} onClick={() => onPick(g)}>
            <strong>{gameName(g)}</strong>
            <span>{c.rounds > 0 ? num(c.rounds) : '—'}</span>
            <span>{rateText(c)}</span>
            <span className={tone(c.wnet)} title="本周净赢（北京时间周一清零）">
              {signed(c.wnet)}
            </span>
          </button>
        )}
      />
    </section>
  );
}

export function StatsPage() {
  const loc = useLocation();
  const who = statsTarget(loc.pathname);
  const { loading, user } = useSession();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState('all');
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 是"再试一次"的重读计数
  useEffect(() => {
    if (!user || !who) return;
    let alive = true;
    setData(null);
    setError(null);
    setTab('all');
    api.stats(who).then(
      (r) => alive && setData(r),
      (e: unknown) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [user, who, tick]);

  const badge = useBadge(data);
  // 读取中、出错时的标题和读完一致：看自己的写"我的战绩"，不然读完标题跳一下
  const title = who === 'me' ? '我的战绩' : '战绩';

  if (loading) return <Panel icon="trophy" title={title}><Skeleton rows={4} /></Panel>;
  if (!user) {
    return (
      <Panel icon="trophy" title="战绩">
        <p>登录以后才能看战绩。</p>
        <Link className="btn btn--primary" href={`/login?next=${encodeURIComponent(loc.pathname)}`}>
          去登录
        </Link>
      </Panel>
    );
  }
  if (error) return (
      <Panel icon="trophy" title={title}>
        <LoadError onRetry={() => setTick((t) => t + 1)}>{errorText(error, { not_found: '没有找到这个人' })}</LoadError>
      </Panel>
    );
  if (!data) return <Panel icon="trophy" title={title}><Skeleton rows={4} /></Panel>;

  const mine = data.relation === 'self';
  const games = Object.entries(data.games).sort(([a], [b]) => order(a) - order(b));
  const tabs = statsTabs(data.games, order);
  const cur = tabs.find((t) => t.id === tab) ?? tabs[0]!;
  const shareable = mine && games.length > 0 && user.friendCode;
  const week = games.reduce((t, [, c]) => t + c.wnet, 0);
  const titles = games.reduce((t, [, c]) => t + c.titles.length, 0);
  const unlocked = unlockedCount(badgesOf(data.games, GAMES));
  const actions: ReactNode = mine ? (
    <>
      {/* 晒战绩：本人看自己、有战绩时才有；链接是自己的好友链接 */}
      {shareable && <ShareButton card={statsCard(data.user.displayName, data.games, badge ?? undefined)} url={friendLink(user.friendCode)} label="晒战绩" testId="share-stats" />}
      <Link className="btn btn--small" href="/wallet">
        我的筹码
      </Link>
      <Link className="btn btn--small" href="/friends">
        好友
      </Link>
    </>
  ) : (
    <FriendAction userId={data.user.userId} relation={data.relation} onChange={(relation) => setData({ ...data, relation })} />
  );

  let body: ReactNode;
  if (cur.game) {
    body = <GameTab key={cur.game} game={cur.game} c={data.games[cur.game]!} together={data.together?.[cur.game]} />;
  } else {
    body = (
      <>
        <PlayerCard name={data.user.displayName} mine={mine} titles={titles} week={week} hasGames={games.length > 0} unlocked={unlocked}>
          {actions}
        </PlayerCard>
        {games.length === 0 ? (
          <Empty
            testId="career-empty"
            action={
              <Link className="btn btn--small btn--primary" href="/">
                去大厅玩一局
              </Link>
            }
          >
            {mine ? '还没有战绩。带筹码玩一局单机实盘或好友房，这里就有了。' : '对方还没有战绩。'}
          </Empty>
        ) : (
          <PageTabs
            className="stats-ptabs"
            wide="(min-width: 700px)"
            label="徽章和各游戏"
            tabs={[
              {
                id: 'badges',
                name: '徽章墙',
                body: (
                  <section className="scard">
                    <h3 className="scard__title">徽章墙</h3>
                    <BadgeWall games={data.games} selfId={who === 'me' ? user.id : undefined} />
                  </section>
                ),
              },
              { id: 'games', name: '各游戏概览', body: <Overview games={games} onPick={setTab} /> },
            ]}
          />
        )}
      </>
    );
  }
  return (
    <Panel icon="trophy" title={mine ? '我的战绩' : `${data.user.displayName} 的战绩`} className="stats-page">
      {tabs.length > 1 && (
        <div className="pills stats-tabs" role="tablist" aria-label="哪个游戏">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === cur.id} className={t.id === cur.id ? 'tabs__on' : ''} onClick={() => setTab(t.id)} data-testid={`stab-${t.id}`}>
              {t.game ? gameName(t.game) : '总览'}
            </button>
          ))}
        </div>
      )}
      <div className={`stats-body${!cur.game && games.length === 0 ? ' stats-body--fit' : ''}`} data-testid="stats-body">
        {body}
      </div>
    </Panel>
  );
}
