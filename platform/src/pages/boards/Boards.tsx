/**
 * /boards 排行（docs/architecture.md 第 4 节"排行榜分两层"，docs/ui.md 第 9、11 节）：一屏放下，不滚。
 * 顶上一排页签："总榜"（全站本周净赢）+ 每个登记了 featuredDaily（代表性每日榜）的游戏；
 * 游戏页签 = 这个游戏的本周净赢 + 最多一个代表性每日榜，宽屏两块并排等高，窄屏用页签切。
 * 右上"全部 / 只看好友"一键切换；点名字进那个人的战绩页。数据最多晚 5 分钟（服务端每个 isolate 的缓存）。
 */
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { api, errorText, type LeaderboardResponse, type ScoreBoard } from '../../api.ts';
import { PageTabs, useMedia } from '../../features/fit/Fit.tsx';
import { loadDailyFormat, type ScoreFormat } from '../../lib/scores.ts';
import { signed, tone } from '../../lib/format.ts';
import { GAMES } from '../../../shared/games.ts';
import { Link } from '../../router.tsx';
import { useSession, useVisible } from '../../session.tsx';
import { LoadError, Panel, Skeleton } from '../../ui.tsx';
import { type BoardTab, boardTabs } from './boards-logic.ts';
import { type CardData, type Row, RankCard } from './BoardsCard.tsx';
import './boards.css';

type Scope = 'all' | 'friends';

/** 矮屏（手机横屏、小窗口）放不下领奖台，直接排成列表 */
const COMPACT = '(max-height: 600px), (max-width: 480px) and (max-height: 700px)';

type Loaded = { board: ScoreBoard; format: ScoreFormat };

function WeeklyCard({ tab, data, scope, compact }: { tab: BoardTab; data: LeaderboardResponse | null; scope: Scope; compact: boolean }) {
  const b = data?.boards[tab.weekly!];
  // 页签已经写了是哪个游戏，卡片标题不再带游戏名；晒战绩的卡要离开这一页看，照旧带上
  let card: CardData = 'loading';
  if (b) {
    const fmt = (v: number) => ({ text: signed(v), tone: tone(v) });
    card = {
      rows: b.entries.map((e) => ({ ...e, ...fmt(e.value) })),
      me: b.me ? { rank: b.me.rank, userId: '', displayName: '', isMe: true, ...fmt(b.me.value) } : null,
      // 榜上只有赢了的：我不在榜上就是这周还没赢（没打、输了、打平都算）
      meNote: b.me ? undefined : '这周还没赢，赢了就上榜',
    };
  } else if (data) card = { rows: [], me: null };
  return (
    <RankCard
      testId="board-weekly"
      title="本周净赢"
      sub="带筹码的局 · 周一 0 点清零"
      data={card}
      compact={compact}
      empty={scope === 'friends' ? '这周你和好友还没人上榜' : '这周还没人上榜'}
      share={{ board: `本周净赢·${tab.game?.name ?? '总榜'}`, friends: scope === 'friends' }}
    />
  );
}

/** 代表性每日榜：今天的榜名来自 /api/leaderboard 的 daily；只看好友时比这周每人最好的一天（docs/social.md 1.5） */
function DailyCard({ tab, board, scope, compact }: { tab: BoardTab; board: string | null; scope: Scope; compact: boolean }) {
  const { game, sub } = tab.daily!;
  const title = `${game.name}每日·${sub!.name}`;
  const name = sub!.name;
  const week = scope === 'friends';
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 是"再试一次"的重读计数
  useEffect(() => {
    if (!board && !week) return;
    let alive = true;
    setLoaded(null);
    setError(null);
    Promise.all([week ? api.friendsWeek(game.id, sub!.id) : api.board(game.id, board!, scope), loadDailyFormat(game.id, sub!.id)]).then(
      ([b, format]) => alive && setLoaded({ board: b, format }),
      (e: unknown) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [game.id, sub, board, scope, week, tick]);
  let card: CardData = 'loading';
  if (!board && !week) card = { rows: [], me: null };
  else if (error) card = { error: errorText(error), retry: () => setTick((t) => t + 1) };
  else if (loaded) {
    const { board: b, format } = loaded;
    const mk = (score: number): Pick<Row, 'text'> => ({ text: format.score(score) });
    card = {
      rows: b.entries.map((e) => ({ ...e, ...mk(e.score) })),
      me: b.me ? { rank: b.me.rank, userId: '', displayName: '', isMe: true, ...mk(b.me.score) } : null,
    };
  }
  return (
    <RankCard
      testId="board-daily"
      title={name}
      sub={week ? '每日挑战 · 好友比这周最好的一天' : '每日挑战 · 今天大家打同一局'}
      data={card}
      compact={compact}
      empty={week ? '这周你和好友还没人上榜' : '今天还没人上榜'}
      share={{ board: `${title}${week ? '（本周）' : ''}`, friends: week }}
    />
  );
}

export function BoardsPage() {
  const { loading, user } = useSession();
  // 隐藏了的游戏不给页签（总榜是全站本周净赢的合计，不拆游戏）
  const visible = useVisible(GAMES);
  const tabs = useMemo(() => boardTabs(visible), [visible]);
  const [scope, setScope] = useState<Scope>('all');
  const [tabId, setTabId] = useState('total');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const compact = useMedia(COMPACT);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 是"再试一次"的重读计数
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setError(null);
    api.leaderboard(scope).then(
      (r) => alive && setData(r),
      (e: unknown) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [user, scope, tick]);

  if (loading) return <Panel icon="trophy" title="排行榜" className="boards-page"><Skeleton rows={4} /></Panel>;
  if (!user) {
    return (
      <Panel icon="trophy" title="排行榜" className="boards-page">
        <p>登录以后才能看排行榜。</p>
        <Link className="btn btn--primary" href="/login?next=%2Fboards">
          去登录
        </Link>
      </Panel>
    );
  }

  const toggle = (
    // biome-ignore lint/a11y/useSemanticElements: 按钮组保持现有布局，fieldset 自带边框和内边距
    <div className="seg" role="group" aria-label="看谁">
      {(['all', 'friends'] as const).map((s) => (
        <button key={s} type="button" className={scope === s ? 'seg__on' : ''} aria-pressed={scope === s} onClick={() => setScope(s)}>
          {s === 'all' ? '全部' : '只看好友'}
        </button>
      ))}
    </div>
  );
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]!;
  const weekly = tab.weekly ? <WeeklyCard tab={tab} data={error ? null : data} scope={scope} compact={compact} /> : null;
  const daily = tab.daily ? <DailyCard tab={tab} board={data?.daily[tab.daily.key] ?? null} scope={scope} compact={compact} /> : null;

  let body: ReactNode;
  if (error) body = <LoadError onRetry={() => setTick((t) => t + 1)}>{errorText(error)}</LoadError>;
  else if (weekly && daily) {
    // 宽屏两块并排等高，窄屏用页签切（fit.tsx）；换游戏重新挂载，页签回到第一个
    body = (
      <PageTabs
        key={tab.id}
        label="本周净赢和每日榜"
        tabs={[
          { id: 'weekly', name: '本周净赢', body: weekly },
          { id: 'daily', name: tab.daily!.sub!.name, body: daily },
        ]}
      />
    );
  } else body = <div className="boards-solo">{weekly ?? daily}</div>;

  return (
    <Panel icon="trophy" title="排行榜" className="boards-page" action={toggle}>
      <div className="boards-tabs" role="tablist" aria-label="哪个榜">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tab.id} className={t.id === tab.id ? 'tabs__on' : ''} onClick={() => setTabId(t.id)} data-testid={`btab-${t.id}`}>
            {t.name}
          </button>
        ))}
      </div>
      <div className="boards-body" data-testid="board-body">
        {body}
      </div>
    </Panel>
  );
}
