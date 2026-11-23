/** 管理页：全站筹码统计（近 30 天，每天一行）。 */
import { useEffect, useState } from 'react';
import { api, errorText, type WalletDayStats } from '../../api.ts';
import { Link } from '../../router.tsx';
import { Empty, FormError, Panel, Skeleton } from '../../ui.tsx';
import { num, gameName } from './common.ts';
import { AdminTable, type Col } from './AdminLayout.tsx';

/**
 * 全站筹码统计（docs/economy.md 第 6 节）：Cron 每天凌晨记一次前一天的。"庄家"是带入 − 带回 − 退回：
 * 正数是玩家输给电脑的（筹码的去处），负数是赢电脑的（来源）。总量涨太快就调数值。
 */
export function WalletStats() {
  const [days, setDays] = useState<WalletDayStats[] | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let alive = true;
    api.admin.walletStats().then(
      (r) => alive && setDays(r.days),
      (e: unknown) => alive && setLoadError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, []);
  const sum = (d: WalletDayStats, k: 'in' | 'out' | 'back' | 'capped') => Object.values(d.games).reduce((a, g) => a + g[k], 0);
  const cols: Col<WalletDayStats>[] = [
    { key: 'day', label: '日期', cell: (d) => d.day.slice(5), w: 'minmax(3em, 0.8fr)' },
    { key: 'total', label: '总量', num: true, cell: (d) => num(d.total), w: 'minmax(0, 1.3fr)' },
    { key: 'wallets', label: '钱包', num: true, cell: (d) => d.wallets },
    { key: 'grant', label: '新号送', num: true, cell: (d) => num(d.grant) },
    { key: 'relief', label: '补给', num: true, cell: (d) => num(d.relief) },
    { key: 'admin', label: '管理员调整', num: true, cell: (d) => num(d.admin ?? 0) },
    { key: 'exchange', label: '兑换', num: true, cell: (d) => num(d.exchange ?? 0) },
    { key: 'house', label: '庄家', num: true, cell: (d) => num(sum(d, 'in') - sum(d, 'out') - sum(d, 'back')) },
    { key: 'capped', label: '到顶没进', num: true, cell: (d) => num(sum(d, 'capped')) },
    {
      key: 'games',
      label: '各游戏',
      full: true,
      cell: (d) =>
        Object.keys(d.games).length > 0 ? (
          <ul className="per-game">
            {Object.entries(d.games).map(([g, x]) => (
              <li key={g}>
                <b>{gameName(g)}</b>{' '}
                <span>
                  <span>带入 {num(x.in)}</span> · <span>带回 {num(x.out)}</span> · <span>退回 {num(x.back)}</span>
                  {x.ex ? <> · <span>兑换 {num(x.ex)}</span></> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          '—'
        ),
    },
  ];
  return (
    <Panel icon="coin" title="筹码统计" className="apanel">
      {loadError && <FormError text={loadError} />}
      {!days && !loadError && <Skeleton rows={3} />}
      {days && days.length === 0 && (
        <Empty
          action={
            <Link className="btn btn--small" href="/admin">
              回概览看今天
            </Link>
          }
        >
          还没有记录：每天凌晨 3 点多记一次前一天的。
        </Empty>
      )}
      {days && days.length > 0 && <AdminTable cols={cols} rows={days} keyOf={(d) => d.day} testId="wallet-stats" label="筹码统计" />}
    </Panel>
  );
}
