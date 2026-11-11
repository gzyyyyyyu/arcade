/**
 * 排行页的一块榜（卡片）：标题（右边晒战绩）、"我"的名次、领奖台、<Paged> 翻页的列表。
 * 卡片一律按内容高，不撑满一屏把内容挤在顶上；名单要翻页时一页放几条按排行区剩下的高度算（boardRoom），页面不滚（docs/ui.md 第 11 节）。
 * 人少（列表最多 FIT_ROWS 行，bcard--fit）时不量、一次画完。矮屏（compact）要翻页时照旧撑满剩下的高度、量列表自己（bcard--fill）：
 * 按外框估的高度在矮屏上差几像素就裁掉一行（844×390 名单裁掉一截）。
 */
import type { ReactNode } from 'react';
import { Paged } from '../../features/fit/Fit.tsx';
import { Link } from '../../router.tsx';
import { friendLink, rankCard, ShareButton } from '../../features/share/Share.tsx';
import { useSession } from '../../session.tsx';
import { Empty, LoadError, Skeleton } from '../../ui.tsx';
import { podiumSplit } from './boards-logic.ts';

export interface Row {
  rank: number | null;
  userId: string;
  displayName: string;
  isMe: boolean;
  text: string;
  tone?: 'up' | 'down';
}

export interface Share {
  board: string;
  friends: boolean;
}

/** 晒战绩：全站前 10 名，或者只看好友时第一名 */
const SHARE_TOP = 10;
/**
 * 名单要翻页时一页放几行：从列表顶往下，到排行页外框能长到的底边（外框的父容器底），扣掉外框和卡片各自的下内边距、边框，能放几行就放几行。
 * 外框和卡片都按内容高、不撑满，列表量不出自己能有多高，所以按外框的父容器算（模块级函数，引用不变，<Paged> 不会每次重挂监听）。
 */
function boardRoom(list: HTMLElement): number {
  const card = list.closest<HTMLElement>('.bcard');
  const page = list.closest<HTMLElement>('.boards-page');
  const limit = page?.parentElement;
  if (!card || !page || !limit) return list.clientHeight;
  const below = (el: HTMLElement) => {
    const cs = getComputedStyle(el);
    return parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
  };
  return limit.getBoundingClientRect().bottom - below(limit) - list.getBoundingClientRect().top - below(card) - below(page);
}

/** 列表最多这么多行时一定放得下（最矮的非矮屏也够），一次画完，不用量 */
const FIT_ROWS = 3;

export function PlayLink() {
  return (
    <Link className="btn btn--small btn--primary" href="/">
      去玩一局
    </Link>
  );
}

function MyShare({ me, share }: { me: Row | null; share?: Share }) {
  const { user } = useSession();
  if (!me || !share || !user || me.rank === null || me.rank > (share.friends ? 1 : SHARE_TOP)) return null;
  const { rank, text } = me;
  return <ShareButton card={rankCard(user.displayName, share.board, rank, text, share.friends)} url={friendLink(user.friendCode)} label="晒战绩" testId="share-rank" />;
}

function Name({ r }: { r: Row }) {
  return (
    <Link className="rank__name" href={`/u/${r.userId}`}>
      {r.displayName}
      {r.isMe && <span className="rank__me">我</span>}
    </Link>
  );
}

/** meNote：我不在榜上时"我"那一行写的话（周净赢榜只排赢了的，输了、打平的写"这周还没赢"） */
export type CardData = { rows: Row[]; me: Row | null; meNote?: string } | 'loading' | { error: string; retry: () => void };

export function RankCard({ title, sub, data, empty, share, compact, testId, aside }: { title: string; sub?: string; data: CardData; empty: string; share?: Share; compact: boolean; testId: string; aside?: ReactNode }) {
  let body: ReactNode;
  let fit = true;
  let shareMe: Row | null = null;
  if (data === 'loading') body = <Skeleton rows={3} />;
  else if ('error' in data) body = <LoadError onRetry={data.retry}>{data.error}</LoadError>;
  else if (!data.rows.length) {
    body = (
      <Empty testId="board-empty" action={<PlayLink />}>
        {empty}
      </Empty>
    );
  } else {
    const { rows, me, meNote } = data;
    const { stand, rest } = podiumSplit(rows, compact);
    fit = rest.length <= FIT_ROWS;
    shareMe = me;
    // 我在前三名里（领奖台或列表头几行一眼看得到、自己那格高亮）就不再单写一行"我：第 N 名"，免得同一个人写两遍；
    // 矮屏不显示卡片标题，晒战绩没地方放，"我"那一行照旧留着、按钮放在行里
    const mineLine = me && (compact || me.rank === null || me.rank > 3);
    body = (
      <div className="bcard__ranks" data-testid="ranks">
        {mineLine && (
          <p className="bcard__mine" data-testid="my-rank">
            <span>
              我：{me.rank === null ? '50 名以后' : `第 ${me.rank} 名`} · <b className={`rank__value${me.tone ? ` ${me.tone}` : ''}`}>{me.text}</b>
            </span>
            {compact && <MyShare me={me} share={share} />}
          </p>
        )}
        {!me && meNote && (
          <p className="bcard__mine" data-testid="my-rank">
            <span>我：{meNote}</span>
          </p>
        )}
        {stand.length > 0 && (
          <ol className={`podium podium--${stand.length}`}>
            {stand.map((r) => (
              <li key={r.userId} className={`rank podium__item podium__item--${r.rank}${r.isMe ? ' rank--me' : ''}`}>
                <span className={`rank__no rank__no--${r.rank}`}>{r.rank}</span>
                <span className="podium__avatar" aria-hidden="true">
                  {Array.from(r.displayName || '我')[0]}
                </span>
                <Name r={r} />
                <span className={`rank__value${r.tone ? ` ${r.tone}` : ''}`}>{r.text}</span>
                <span className="podium__step" aria-hidden="true" />
              </li>
            ))}
          </ol>
        )}
        {rest.length > 0 && (
          <Paged
            className="ranks"
            items={rest}
            keyOf={(r) => `${r.rank}-${r.userId}`}
            label="榜单翻页"
            testId="rank-pages"
            // 按内容高的卡不量高度、一次画完：卡高随条数变，量出的条数又改卡高会来回跳（React #185）
            fixed={fit ? Infinity : undefined}
            room={compact ? undefined : boardRoom}
            render={(r) => (
              <div className={`rank${r.isMe ? ' rank--me' : ''}`}>
                <span className={`rank__no${r.rank !== null && r.rank <= 3 ? ` rank__no--${r.rank}` : ''}`}>{r.rank ?? '—'}</span>
                <Name r={r} />
                <span className={`rank__value${r.tone ? ` ${r.tone}` : ''}`}>{r.text}</span>
              </div>
            )}
          />
        )}
      </div>
    );
  }
  return (
    <section className={`bcard${fit ? ' bcard--fit' : compact ? ' bcard--fill' : ''}`} data-testid={testId}>
      <header className="bcard__head">
        <h3 className="bcard__title">{title}</h3>
        {sub && <span className="bcard__sub">{sub}</span>}
        {aside}
        {!compact && <MyShare me={shareMe} share={share} />}
      </header>
      {body}
    </section>
  );
}
