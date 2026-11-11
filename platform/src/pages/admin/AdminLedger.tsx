/**
 * 管理页用户详情里的钱包流水（最近 30 笔，新的在前）：和 src/features/ledger/Ledger.tsx 同样的行（类名共用 ledger.css），
 * 但按剩下的高度翻页，不按天分组、不用"再看更多"——管理页要一屏放下。
 */
import type { LedgerEntry } from '../../api.ts';
import { Paged } from '../../features/fit/Fit.tsx';
import { signed, tone } from '../../lib/format.ts';
import '../../features/ledger/ledger.css';
import { gameName, num, timeText } from './common.ts';

const KIND_TEXT: Record<LedgerEntry['t'], string> = {
  grant: '新号送的',
  buyin: '带入',
  settle: '结回',
  refund: '放弃退回',
  expire: '到期退回',
  relief: '领补给',
  admin: '管理员调整',
};

export function AdminLedger({ entries }: { entries: LedgerEntry[] }) {
  const rows = entries.map((e, i) => ({ e, i }));
  return (
    <Paged
      className="ledger alist"
      testId="ledger"
      label="流水翻页"
      items={rows}
      keyOf={(r) => `${r.e.at}-${r.i}`}
      render={({ e }) => (
        <div className="ledger__row">
          <span className="ledger__time">{timeText(e.at)}</span>
          <span className={`ledger__kind ledger__kind--${e.t}`}>{KIND_TEXT[e.t]}</span>
          <span className="ledger__what">
            {e.g ? gameName(e.g) : ''}
            {e.capped ? <small>到顶没进 {num(e.capped)}</small> : null}
          </span>
          <span className={`ledger__amount ${tone(e.a) ?? ''}`}>{signed(e.a)}</span>
        </div>
      )}
    />
  );
}
