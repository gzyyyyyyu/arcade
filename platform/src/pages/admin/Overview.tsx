/** 管理页·概览：今天的数字卡片和各游戏、"管理筹码"入口，近 7 天趋势图和每天明细表（一屏放下，见 layout.tsx）。 */
import { useEffect, useState } from 'react';
import { type AdminOverview, api, errorText, type WalletDayStats } from '../../api.ts';
import { LoadError, Panel, Skeleton } from '../../ui.tsx';
import { WALLET_GAMES } from '../../../shared/games.ts';
import { DAY } from '../../../shared/weekly.ts';
import { Paged } from '../../features/fit/Fit.tsx';
import { AdminChipsButton } from './AdminChips.tsx';
import { AdminTable, AdminTabs, type Col, useAdminWide } from './AdminLayout.tsx';
import { gameName, num } from './common.ts';

const games = (d: WalletDayStats) => Object.entries(d.games);
const sum = (d: WalletDayStats, k: 'in' | 'out') => games(d).reduce((t, [, g]) => t + g[k], 0);
/** 早期的记录没有人数，写"—" */
const dash = (n: number | undefined) => (n === undefined ? '—' : num(n));
/** 卡片里放不下七八位数：十万以上写成"万"，悬停看准数 */
const big = (n: number) =>
  Math.abs(n) >= 100_000 ? `${(n / 10_000).toLocaleString('zh-CN', { maximumFractionDigits: Math.abs(n) >= 10_000_000 ? 0 : 1 })} 万` : num(n);

/** 今天现算，加前 6 天的趋势 */
export function Overview() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 是"再试一次"的重读计数
  useEffect(() => {
    let alive = true;
    setError('');
    api.admin.overview().then(
      (r) => alive && setData(r),
      (e: unknown) => alive && setError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [tick]);
  if (error) return <LoadError onRetry={() => setTick((t) => t + 1)}>{error}</LoadError>;
  if (!data) return <Skeleton rows={3} />;
  return <OverviewBody data={data} />;
}

/** 宽屏两栏：左边今天（数字卡片、各游戏），右边近 7 天（趋势图、每天明细）；窄屏三个页签 */
function OverviewBody({ data }: { data: AdminOverview }) {
  const wide = useAdminWide();
  const { today } = data;
  const days = [today, ...data.days];
  const tiles: [string, string, number?][] = [
    ['今天来过', num(today.visitors)],
    ['玩过筹码局', dash(today.active)],
    ['领补给（人）', dash(today.reliefCount)],
    ['新号送的', big(today.grant), today.grant],
    ['管理员调整', big(today.admin ?? 0), today.admin ?? 0],
    ['筹码总量', big(today.total), today.total],
  ];
  const todayPanel = (
    <Panel icon="coin" title="今天" className="apanel" action={<AdminChipsButton className="btn btn--primary btn--small" title="给人加减筹码（正数加、负数扣），有记录" />}>
      <div className="ov-today">
        <dl className="tiles" data-testid="overview">
          {tiles.map(([label, value, exact]) => (
            <div key={label} className="tile">
              <dt>{label}</dt>
              <dd title={exact === undefined ? undefined : num(exact)}>{value}</dd>
            </div>
          ))}
        </dl>
        {games(today).length > 0 ? (
          <Paged
            className="game-today"
            grid
            label="各游戏翻页"
            items={games(today)}
            keyOf={([g]) => g}
            render={([g, x]) => (
              <div className="game-today__item">
                <strong>{gameName(g)}</strong>
                <span className="tnum">{dash(x.players)} 人</span>
                {/* 带入、带回各自不断行，放不下就整段换行（不用"·"隔开：折行时点会悬在行尾） */}
                <span className="game-today__flow">
                  <span className="nowrap">
                    带入 <b className="tnum">{num(x.in)}</b>
                  </span>
                  <span className="nowrap">
                    带回 <b className="tnum">{num(x.out)}</b>
                  </span>
                </span>
                {x.capped ? <small>到顶没进 {num(x.capped)}</small> : null}
                {x.ex ? <small>兑换 {num(x.ex)}</small> : null}
              </div>
            )}
          />
        ) : (
          <p className="note">今天还没人带筹码玩。</p>
        )}
      </div>
    </Panel>
  );
  const chart = <TrendChart days={week(today, data.days)} />;
  const detail = <DetailTable days={days} />;
  const tabs = wide
    ? [
        { id: 'today', name: '今天', body: todayPanel },
        {
          id: 'week',
          name: '近 7 天',
          body: (
            <Panel icon="shield" title="近 7 天" className="apanel">
              {chart}
              {detail}
            </Panel>
          ),
        },
      ]
    : [
        { id: 'today', name: '今天', body: todayPanel },
        { id: 'week', name: '近 7 天', body: <Panel icon="shield" title="近 7 天" className="apanel">{chart}</Panel> },
        { id: 'detail', name: '每天明细', body: <Panel icon="shield" title="每天明细" className="apanel">{detail}</Panel> },
      ];
  return <AdminTabs tabs={tabs} label="概览分页" />;
}

/** 每天一行：日期、玩过、带入、带回、补给，第二行是各游戏当天的人数 */
function DetailTable({ days }: { days: WalletDayStats[] }) {
  const rows = days.map((d, i) => ({ d, i }));
  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'day', label: '日期', cell: ({ d, i }) => (i === 0 ? '今天' : d.day.slice(5)), w: 'minmax(3em, 0.8fr)' },
    { key: 'active', label: '玩过', num: true, cell: ({ d }) => dash(d.active) },
    { key: 'in', label: '带入', num: true, cell: ({ d }) => num(sum(d, 'in')) },
    { key: 'out', label: '带回', num: true, cell: ({ d }) => num(sum(d, 'out')) },
    { key: 'relief', label: '补给', num: true, cell: ({ d }) => num(d.relief) },
    {
      key: 'games',
      label: '各游戏人数',
      full: true,
      cell: ({ d }) => (
        <ul className="per-people">
          {WALLET_GAMES.map(({ id, name }) => (
            <li key={id}>
              {name} <b className="tnum">{d.games[id] ? dash(d.games[id]!.players) : 0}</b>
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return <AdminTable cols={cols} rows={rows} keyOf={({ d }) => d.day} testId="trend" label="每天明细" />;
}

type Day = { day: string; in: number; out: number; people: number };

/** 固定 7 天（旧的在前、今天在最后）：没记录的天画 0，x 轴不跳天 */
function week(today: WalletDayStats, past: WalletDayStats[]): Day[] {
  const byDay = new Map([today, ...past].map((d) => [d.day, d]));
  const end = Date.parse(`${today.day}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(end - (6 - i) * DAY).toISOString().slice(0, 10);
    const d = byDay.get(day);
    return { day, in: d ? sum(d, 'in') : 0, out: d ? sum(d, 'out') : 0, people: d?.active ?? 0 };
  });
}

/** 刻度取 1、2、2.5、5 乘 10 的幂，三格正好盖住最大值 */
function niceStep(max: number): number {
  const raw = Math.max(1, max) / 3;
  const p = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
}

/**
 * 近 7 天的带入、带回（并排的柱，左边刻度）和玩过筹码局的人数（柱顶的小数字）：手写 SVG，不加图表库。
 * 悬停一天，整列高亮，上面浮一张当天的数字。
 */
function TrendChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // 画布按面板的实际宽度（电脑上约 400–600）定，字不会被缩得太小
  const W = 460;
  const H = 210;
  const pad = { l: 52, r: 6, t: 22, b: 26 };
  const step = niceStep(Math.max(...days.map((d) => Math.max(d.in, d.out))));
  const top = step * 3;
  const slot = (W - pad.l - pad.r) / days.length;
  const bw = Math.min(26, slot * 0.32);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const cx = (i: number) => pad.l + slot * i + slot / 2;
  const label = (d: Day, i: number) => (i === days.length - 1 ? '今天' : d.day.slice(5));
  const h = hover === null ? null : days[hover]!;
  return (
    <figure className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`近 7 天带入、带回和玩过的人数：${days.map((d, i) => `${label(d, i)} 带入 ${num(d.in)} 带回 ${num(d.out)} ${d.people} 人`).join('；')}`}>
        {[1, 2, 3].map((k) => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={y(step * k)} y2={y(step * k)} className="chart__grid" />
            <text x={pad.l - 6} y={y(step * k) + 4} textAnchor="end" className="chart__label">
              {big(step * k)}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="chart__axis" />
        {days.map((d, i) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: 图表上悬停只是给鼠标看数值的辅助，同样的数字在下方表格里都有
          <g key={d.day} className={hover === i ? 'chart__day chart__day--on' : 'chart__day'} onMouseEnter={() => setHover(i)}>
            <rect x={pad.l + slot * i} y={pad.t - 18} width={slot} height={H - pad.t - pad.b + 18} className="chart__hit" />
            <rect x={cx(i) - bw - 1} y={y(d.in)} width={bw} height={H - pad.b - y(d.in)} rx="3" className="chart__in" />
            <rect x={cx(i) + 1} y={y(d.out)} width={bw} height={H - pad.b - y(d.out)} rx="3" className="chart__out" />
            {d.people > 0 && (
              <text x={cx(i)} y={Math.min(y(d.in), y(d.out)) - 6} textAnchor="middle" className="chart__people">
                {d.people}人
              </text>
            )}
            <text x={cx(i)} y={H - 8} textAnchor="middle" className="chart__label">
              {label(d, i)}
            </text>
          </g>
        ))}
      </svg>
      {h && hover !== null && (
        <div className="chart__tip" style={{ left: `${(cx(hover) / W) * 100}%` }} role="status">
          <strong>{label(h, hover)}</strong>
          <span>带入 {num(h.in)}</span>
          <span>带回 {num(h.out)}</span>
          <span>玩过 {h.people} 人</span>
        </div>
      )}
      <figcaption className="chart__legend">
        <span className="chart__key chart__key--in">带入</span>
        <span className="chart__key chart__key--out">带回</span>
        <span className="chart__key chart__key--people">柱顶数字：玩过筹码局的人</span>
      </figcaption>
    </figure>
  );
}
