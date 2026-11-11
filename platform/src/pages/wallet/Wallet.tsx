/**
 * /wallet：我的筹码。余额、领补给、桌上的筹码（在哪个游戏、怎么拿回来）、今天实盘还能赢多少。
 * 规则见 docs/economy.md 第 3、4 节；筹码不能买、不能换、不能转（docs/project.md 底线）。
 * 一屏放下不滚动（docs/ui.md 第 11 节）：电脑上左栏是余额加走势加补给、桌上的筹码、这周和今天的实盘，右栏是"最近进出"（按游戏分页签、翻页），两栏等高；
 * 窄屏（手机竖屏、横屏）改成页签：筹码 / 这周 / 进出。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { flyCoins } from '../../features/coinfly/coinfly.ts';
import '../../features/coinfly/coinfly.css';
import { api, errorText, type LedgerEntry, type Stake, type Wallet } from '../../api.ts';
import { gameName, num, signed, timeText, tone } from '../../lib/format.ts';
import { GAMES } from '../../../shared/games.ts';
import { Paged, PageTabs, useMedia } from '../../features/fit/Fit.tsx';
import { LedgerRow } from '../../features/ledger/Ledger.tsx';
import { playUrl } from '../../lib/play.ts';
import { Link } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { Empty, FormError, LoadError, Panel, Skeleton, useSubmit, useWritable } from '../../ui.tsx';
import { useWallet } from '../../features/wallet/Wallet.tsx';
import { CoinIcon } from '../../icons.tsx';
import { weekTrend } from '../../features/wallet/wallet-trend.ts';
import './wallet-card.css';
import './wallet.css';

const gameOf = (id: string) => GAMES.find((g) => g.id === id);

/** 领不了补给的原因（服务端的判断见 worker/api/wallet/state.ts 的 relief，这里按同样的顺序说） */
function reliefBlocked(w: Wallet, reliefTo: number): string | null {
  if (w.canRelief && w.writesLeft > 0) return null;
  const onTable = w.stakes.reduce((t, s) => t + s.amount, 0);
  if (w.balance + onTable >= reliefTo) {
    return onTable ? `钱包加桌上的还有 ${num(w.balance + onTable)}，不到 ${num(reliefTo)} 才能领` : `筹码还够用，不到 ${num(reliefTo)} 才能领`;
  }
  if (w.writesLeft <= 0) return '今天操作太多了，明早 0 点再领';
  return '今天领过了，明天再来';
}

function StakeRow({ s }: { s: Stake }) {
  const g = gameOf(s.game);
  const room = s.mode === 'server';
  return (
    <div className="stake">
      <div className="stake__head">
        <strong>{gameName(s.game)}</strong>
        <span className="stake__mode">{room ? '好友房' : '单机'}</span>
        {g && (
          <a className="inline-link" href={playUrl(g)}>
            去{g.name}
          </a>
        )}
        <span className="stake__amount">{num(s.amount)}</span>
      </div>
      <p className="note">
        {timeText(s.at)} 带上桌。
        {room
          ? '回房间点“离开房间”结回；直接关页面，房间没人约 10 分钟后自动结回。'
          : `回那一桌离桌；放着不管，${timeText(s.until)} 原样退回。`}
      </p>
    </div>
  );
}

/** 今天各游戏实盘的净赢和上限，一句话一个游戏 */
function capsText(game: string, c: { net: number; cap: number }): string {
  const left = Math.max(0, c.cap - c.net);
  const today = c.net >= 0 ? `赢了 ${num(c.net)}` : `输了 ${num(-c.net)}`;
  return left > 0 ? `${gameName(game)}：今天实盘${today}，还能再赢 ${num(left)}。` : `${gameName(game)}：今天实盘${today}，到顶了，明天再来赢。`;
}

/**
 * 这周带筹码的局赢了多少（接口的 week，和排行页"本周净赢"同一个数）：合计一个大数，每个游戏一根横条，赢的往右绿、输的往左红。
 * "今天"不放：流水只留最近 30 笔，拿它算今天的会对不上
 */
function WeekSummary({ week }: { week: Record<string, number> }) {
  const list = Object.entries(week).filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const total = list.reduce((t, [, v]) => t + v, 0);
  const max = Math.max(1, ...list.map(([, v]) => Math.abs(v)));
  return (
    <div className="week-sum" data-testid="week-summary">
      <p className="week-sum__total" title="北京时间每周一 0 点清零，和排行榜的本周净赢一样">
        <span className="note">本周净赢</span>
        <strong className={tone(total) ?? ''}>{signed(total)}</strong>
      </p>
      {list.length === 0 ? (
        <p className="note">这周还没打带筹码的局。</p>
      ) : (
        <ul className="week-bars">
          {list.map(([g, v]) => (
            <li key={g} className="week-bars__row">
              <span className="week-bars__name">{gameName(g)}</span>
              <span className="week-bars__track" aria-hidden="true">
                <span className={`week-bars__bar ${v > 0 ? 'week-bars__bar--up' : 'week-bars__bar--down'}`} style={{ width: `${(Math.abs(v) / max) * 50}%` }} />
              </span>
              <span className={`week-bars__value ${tone(v) ?? ''}`}>{signed(v)}</span>
            </li>
          ))}
        </ul>
      )}
          </div>
  );
}

/** 钱包卡里的本周走势：只用页面已有的流水倒推，不另外请求 */
function WeekTrend({ balance, ledger }: { balance: number; ledger: LedgerEntry[] }) {
  const t = useMemo(() => weekTrend(balance, ledger, Date.now()), [balance, ledger]);
  if (!t.path) return <p className="wcard__empty">这周还没有进出</p>;
  return (
    <div className="wcard__trend">
      <div className="wcard__trend-head">
        <span>本周走势</span>
        <span className={tone(t.change) ?? ''}>{signed(t.change)}</span>
      </div>
      <svg className={`wcard__svg ${tone(t.change) ?? ''}`} viewBox="0 0 100 48" preserveAspectRatio="none" role="img" aria-label={`本周走势，共 ${signed(t.change)}`}>
        <path className="wcard__area" d={`${t.path} L100 48 L0 48 Z`} />
        <path className="wcard__line" d={t.path} />
      </svg>
    </div>
  );
}

const OTHER = '_other';
// 桌上的筹码（一条约 70 高）和进出记录（一行 36 高）最多这么多条时面板按内容高；再多按高度翻页
const FIT_STAKES = 2;
const FIT_LEDGER = 3;
const WIDE = '(min-width: 960px) and (min-height: 600px)';

export function WalletPage() {
  const { loading, user, service } = useSession();
  const { wallet, reliefTo, winUnits, ledger, week, error, refresh, set } = useWallet();
  const [only, setOnly] = useState<string | null>(null);
  const wide = useMedia(WIDE);
  // 竖屏够高（≥700）时桌上没筹码，或者这周没打带筹码的局（"这周"只剩一行），就把"这周"并进"筹码"页签，少一个页签
  const tall = useMedia('(min-height: 700px)');
  const writable = useWritable();
  const reliefBtn = useRef<HTMLButtonElement>(null);
  const relief = useSubmit(async () => {
    try {
      const w = (await api.relief()).wallet;
      // 金币从按钮飞进顶栏的筹码牌子，落地再改余额（牌子数字跟着滚、响金币声）；关了动效的直接改
      const badge = document.querySelector('[data-testid="wallet-badge"]');
      if (reliefBtn.current && badge) await flyCoins(reliefBtn.current, badge);
      set(w);
      // 再问一次，"最近进出"里才有刚领的这笔（一天就一次，不在补给接口里多回流水）
      void refresh();
    } catch (e) {
      // 被拒时多半是别处刚改了钱包（比如游戏里刚带入）：刷新一下，按钮和原因跟着对上
      void refresh();
      throw e;
    }
  });
  // 打开钱包页时刷新一次（顶栏的余额是登录时问的）
  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  if (loading) return <Panel icon="coin" title="我的筹码"><Skeleton rows={3} /></Panel>;
  if (service === 'off') return <Panel icon="coin" title="我的筹码"><p className="note">账号服务暂时休息，过一会儿再来看。</p></Panel>;
  if (service === 'unreachable') return <Panel icon="coin" title="我的筹码"><p className="note">连不上服务器，点上面的"重试"。</p></Panel>;
  if (!user) {
    return (
      <Panel icon="coin" title="我的筹码">
        <p>还没登录。</p>
        <Link className="btn btn--primary" href="/login">
          去登录
        </Link>
      </Panel>
    );
  }
  if (!wallet) {
    return (
      <Panel icon="coin" title="我的筹码">
        {error ? (
          <LoadError onRetry={() => void refresh()}>{errorText(error)}</LoadError>
        ) : (
          <Skeleton rows={3} />
        )}
      </Panel>
    );
  }
  const blocked = reliefBlocked(wallet, reliefTo);
  // 列表很短（一页肯定放得下）时面板按内容高，不撑满一屏留一大块空框；多了才吃剩下的高、交给 <Paged> 翻页。
  // 按内容高时 <Paged> 不量高度、一次画完（fixed），不然面板高随条数变、量出的条数又改面板高，来回跳（React #185）
  const stakesFit = wallet.stakes.length <= FIT_STAKES;
  const caps = Object.entries(wallet.caps);
  // 筛选：流水里出现过的游戏各一个，没有游戏的（补给、新号、管理员调整）归"其他"
  const games = [...new Set(ledger.flatMap((e) => (e.g ? [e.g] : [])))];
  const hasOther = ledger.some((e) => !e.g);
  const shown = only === null ? ledger : ledger.filter((e) => (only === OTHER ? !e.g : e.g === only));
  const flowFit = shown.length <= FIT_LEDGER;

  const card = (
    <Panel icon="coin" title="我的筹码" className="wallet-page__card">
      <div className="wcard">
        <div className="wcard__top">
          <CoinIcon size={40} />
          <div className="wcard__main">
            <span className="wcard__label">余额</span>
            <strong className="wcard__balance" data-testid="wallet-balance">
              {num(wallet.balance)}
            </strong>
          </div>
          <div className="wcard__relief wallet__relief">
            <button ref={reliefBtn} className="btn btn--primary" type="button" aria-busy={relief.busy} disabled={!!blocked || relief.busy || !writable} onClick={() => void relief.onSubmit()}>
              {relief.busy ? '请稍等…' : '领补给'}
            </button>
          </div>
        </div>
        <WeekTrend balance={wallet.balance} ledger={ledger} />
        <p className="wcard__note" data-testid="relief-hint">每天一次，连桌上的补到 {num(reliefTo)}</p>
        {blocked && <p className="wcard__note" data-testid="relief-why">{blocked}</p>}
        <FormError text={relief.error} />
        <p className="wcard__note">筹码没有现金价值：不能买、不能换、不能转。</p>
        {wallet.fresh && <p className="wcard__note">新号送的 {num(wallet.balance)}，第一次在游戏里用时到账。</p>}
      </div>
    </Panel>
  );
  const stakes = (
    <Panel icon="coin" title="桌上的筹码" className={`wallet-page__stakes${wallet.stakes.length === 0 ? ' wallet-page__stakes--none' : ''}${stakesFit ? ' wallet-page__stakes--fit' : ''}`}>
      {wallet.stakes.length === 0 ? (
        <p className="note" data-testid="stakes-none">没有，都在钱包里。</p>
      ) : (
        <Paged className="wallet-page__stakelist" testId="stakes" items={wallet.stakes} keyOf={(s) => `${s.game}:${s.ref}`} render={(s) => <StakeRow s={s} />} label="翻桌上的筹码" fixed={stakesFit ? Infinity : undefined} />
      )}
    </Panel>
  );
  // 这周没打带筹码的局、也没有今天的上限提示：收成一行大白话，不留一大块空（原来标题和"本周净赢 0"之间全空）
  const weekNone = !Object.values(week).some((v) => v !== 0) && caps.length === 0;
  const weekPanel = weekNone ? (
    <Panel icon="coin" title="这周的输赢" className="wallet-page__week wallet-page__week--none">
      <p className="note" data-testid="week-none">
        这周还没打带筹码的局
      </p>
    </Panel>
  ) : (
    <Panel icon="coin" title="这周的输赢" className="wallet-page__week">
      <WeekSummary week={week} />
      {caps.length > 0 && (
        <div className="wallet-page__caps" title={`单机实盘每个游戏每天最多赢 ${winUnits} 份（一份按今天带上桌最多的那一次算），好友房不限`}>
          {caps.map(([g, c]) => (
            <p key={g} className="note">
              {capsText(g, c)}
            </p>
          ))}
          
        </div>
      )}
    </Panel>
  );
  const flow = (
    <Panel icon="coin" title="最近进出" className={`wallet-page__flow${flowFit ? ' wallet-page__flow--fit' : ''}`}>
      {games.length + (hasOther ? 1 : 0) > 1 && (
        // biome-ignore lint/a11y/useSemanticElements: 按钮组保持现有布局，fieldset 自带边框和内边距
        <div className="chips" role="group" aria-label="看哪个游戏">
          {[[null, '全部'] as const, ...games.map((g) => [g, gameName(g)] as const), ...(hasOther ? [[OTHER, '补给和其他'] as const] : [])].map(([id, label]) => (
            <button key={id ?? 'all'} type="button" className={only === id ? 'chips__on' : ''} aria-pressed={only === id} onClick={() => setOnly(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {shown.length > 0 ? (
        <Paged key={only ?? 'all'} className="wallet-page__ledger" testId="ledger" items={shown} keyOf={(e) => `${e.at}:${e.t}:${e.a}:${e.g ?? ''}`} render={(e) => <LedgerRow e={e} day as="div" />} label="翻进出记录" fixed={flowFit ? Infinity : undefined} />
      ) : (
        <Empty action={<Link className="btn btn--small" href="/">去大厅玩一局</Link>}>还没有进出，去玩一局带筹码的吧。</Empty>
      )}
      <p className="note">只留最近 30 笔；10 月 16 日以前的没记下来。</p>
    </Panel>
  );
  // 宽屏两栏等高：左栏卡片加桌上的加这周，右栏进出；窄屏分页签。桌上没筹码时那块收成一行，空出来的高给"这周"
  const tabs = wide
    ? [
        { id: 'left', name: '筹码', body: <>{card}{stakes}{weekPanel}</> },
        { id: 'flow', name: '进出', body: flow },
      ]
    : (wallet.stakes.length === 0 || weekNone) && tall
      ? [
          { id: 'chips', name: '筹码', body: <>{card}{stakes}{weekPanel}</> },
          { id: 'flow', name: '进出', body: flow },
        ]
      : [
          { id: 'chips', name: '筹码', body: <>{card}{stakes}</> },
          { id: 'week', name: '这周', body: weekPanel },
          { id: 'flow', name: '进出', body: flow },
        ];
  return (
    <div className="wallet-page">
      {service === 'readonly' && <p className="banner">服务器有点忙，现在只能看、不能改，明天再来。</p>}
      <PageTabs key={wide ? 'wide' : 'narrow'} tabs={tabs} wide={WIDE} label="钱包分页" />
    </div>
  );
}
