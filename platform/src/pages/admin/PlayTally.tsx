/**
 * 管理页：真人对局统计（docs/platform-backend.md 5.11）。游戏结回、交分时带 tally，平台只按天累计汇总，
 * 这里把近几天的汇总按游戏、玩法、mode、档位列出：局数，时长各段的局数，输赢各段的局数。看不到是谁打的。
 */
import { useEffect, useState } from 'react';
import { api, errorText, type PlayTally as PlayTallyData } from '../../api.ts';
import { Link } from '../../router.tsx';
import { Empty, FormError, Panel, Skeleton } from '../../ui.tsx';
import { useMedia } from '../../features/fit/Fit.tsx';
import { gameName, num } from './common.ts';
import { AdminTable, type Col } from './AdminLayout.tsx';

const DAYS = [7, 30, 90] as const;
const DURS: [string, string][] = [['lt1m', '<1 分'], ['1-5m', '1–5 分'], ['5-15m', '5–15 分'], ['15-30m', '15–30 分'], ['30-60m', '30–60 分'], ['ge60m', '≥60 分']];
const OUTCOMES: [string, string][] = [['bust', '输光'], ['lose', '输'], ['even', '持平'], ['win', '赢'], ['big', '大赢'], ['na', '没写']];
const MODES: Record<string, string> = { server: '服务端算', client: '浏览器算', none: '—' };
const TIERS: Record<string, string> = { small: '小', mid: '中', big: '大', lux: '豪华', none: '—' };

export function PlayTally() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<PlayTallyData | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let alive = true;
    setData(null);
    setLoadError('');
    api.admin.playTally(days).then(
      (r) => alive && setData(r),
      (e: unknown) => alive && setLoadError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [days]);
  // 17 列只有电脑放得下；窄一点的屏幕时长和输赢两组二选一
  const all = useMedia('(min-width: 1100px)');
  const [group, setGroup] = useState<'dur' | 'outcome'>('dur');
  type Row = PlayTallyData['rows'][number];
  const cols: Col<Row>[] = [
    { key: 'game', label: '游戏', cell: (r) => gameName(r.game), w: 'minmax(0, 1.3fr)' },
    { key: 'variant', label: '玩法', cell: (r) => r.variant, w: 'minmax(0, 1.1fr)' },
    { key: 'mode', label: '模式', cell: (r) => MODES[r.mode] ?? r.mode, w: 'minmax(0, 1.3fr)' },
    { key: 'tier', label: '档位', cell: (r) => TIERS[r.tier] ?? r.tier },
    { key: 'n', label: '局数', num: true, cell: (r) => <b>{num(r.n)}</b> },
    ...(all || group === 'dur' ? DURS.map(([k, label], i): Col<Row> => ({ key: k, label, num: true, sep: i === 0, cell: (r) => num(r.dur[k] ?? 0) })) : []),
    ...(all || group === 'outcome' ? OUTCOMES.map(([k, label], i): Col<Row> => ({ key: k, label, num: true, sep: i === 0, cell: (r) => num(r.outcome[k] ?? 0) })) : []),
  ];
  return (
    <Panel icon="coin" title="真人对局" className="apanel">
      <div className="play-tally" data-testid="play-tally">
        <div className="play-tally__range">
          {/* biome-ignore lint/a11y/useSemanticElements: 按钮组保持现有布局，fieldset 自带边框和内边距 */}
          <div className="seg" role="group" aria-label="看几天">
            {DAYS.map((d) => (
              <button key={d} type="button" className={days === d ? 'seg__on' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>
                近 {d} 天
              </button>
            ))}
          </div>
          {!all && (
            // biome-ignore lint/a11y/useSemanticElements: 按钮组保持现有布局，fieldset 自带边框和内边距
            <div className="seg" role="group" aria-label="看哪一组">
              <button type="button" className={group === 'dur' ? 'seg__on' : ''} aria-pressed={group === 'dur'} onClick={() => setGroup('dur')}>
                时长
              </button>
              <button type="button" className={group === 'outcome' ? 'seg__on' : ''} aria-pressed={group === 'outcome'} onClick={() => setGroup('outcome')}>
                输赢
              </button>
            </div>
          )}
          {data && <span className="note play-tally__span">{data.from} 到 {data.to}，只有汇总，看不到是谁打的</span>}
        </div>
        {loadError && <FormError text={loadError} />}
        {!data && !loadError && <Skeleton rows={3} />}
        {data && data.rows.length === 0 && (
          <Empty
            action={
              days < DAYS[DAYS.length - 1]! ? (
                <button className="btn btn--small" type="button" onClick={() => setDays(DAYS[DAYS.length - 1]!)}>
                  看近 {DAYS[DAYS.length - 1]} 天
                </button>
              ) : (
                <Link className="btn btn--small" href="/admin">
                  回概览
                </Link>
              )
            }
          >
            这段时间还没有记录：游戏结回、交分时带上 tally 才会记。
          </Empty>
        )}
        {data && data.rows.length > 0 && <AdminTable cols={cols} rows={data.rows} keyOf={(r) => [r.game, r.variant, r.mode, r.tier].join('|')} label="真人对局" testId="tally-table" />}
      </div>
    </Panel>
  );
}
