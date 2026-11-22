/** /me 的"云存档"页签：各游戏存了什么，只显示份数、大小和更新时间，内容是游戏自己的格式。 */
import { useEffect, useState } from 'react';
import { api, ApiFail, type SaveSlot } from '../../api.ts';
import { timeText } from '../../lib/format.ts';
import { GAMES } from '../../../shared/games.ts';
import { Paged } from '../../features/fit/Fit.tsx';
import { useSession } from '../../session.tsx';
import { useWallet } from '../../features/wallet/Wallet.tsx';

export type SaveRow = { id: string; name: string; slots: SaveSlot[] | null; error: string };

/**
 * 页面一打开就并发读每个游戏的存档（不等切到这个页签）：每个游戏单独读，一个读不到（出错、超限）不连累别的。
 * 等钱包先读完再发：每个游戏一个请求，一起发会把 /api/wallet 挤到后面排队（HTTP/1.1 同一站点最多 6 条连接），顶栏的筹码牌子半天出不来数。
 */
export function useSaves(): SaveRow[] {
  const [rows, setRows] = useState<SaveRow[]>(GAMES.map((g) => ({ id: g.id, name: g.name, slots: null, error: '' })));
  const { wallet, error } = useWallet();
  const walletDone = wallet !== null || error !== null;
  useEffect(() => {
    if (!walletDone) return;
    let alive = true;
    void Promise.allSettled(GAMES.map((g) => api.saves(g.id))).then((results) => {
      if (!alive) return;
      setRows(
        GAMES.map((g, i) => {
          const r = results[i]!;
          return r.status === 'fulfilled'
            ? { id: g.id, name: g.name, slots: r.value.saves, error: '' }
            : { id: g.id, name: g.name, slots: null, error: r.reason instanceof ApiFail ? r.reason.message : '读不到，过一会儿再试' };
        }),
      );
    });
    return () => {
      alive = false;
    };
  }, [walletDone]);
  return rows;
}

/** 说明和"先暂停"的提示（宽屏放左卡，窄屏放列表上面）；宽屏给 rows 时下面加一块汇总，左卡不只一句话、下半空着 */
export function SavesNote({ rows }: { rows?: SaveRow[] }) {
  const { savesPaused } = useSession();
  return (
    <>
      <p className="note">游戏里登录后，档案、战绩和新手教程进度会自动存到这里，换台设备也能接着玩。打到一半的那一局不存。</p>
      {rows && <SavesSum rows={rows} />}
      {savesPaused && (
        <p className="banner banner--inline" data-testid="saves-paused">
          服务器有点忙，云存档先暂停了。游戏里的进度先存在这台设备上，过后再同步。
        </p>
      )}
    </>
  );
}

/** 汇总：几个游戏有存档、一共几份、最近一次；还有游戏没读完时不写（数会跳） */
function SavesSum({ rows }: { rows: SaveRow[] }) {
  if (rows.some((r) => r.slots === null && !r.error)) return null;
  const slots = rows.flatMap((r) => r.slots ?? []);
  if (slots.length === 0) return <p className="saves-sum__empty">还没有游戏存过档。进游戏登录后玩一局，就会出现在右边。</p>;
  const games = rows.filter((r) => r.slots?.length).length;
  return (
    <dl className="saves-sum" data-testid="saves-sum">
      <div>
        <dt>有存档的游戏</dt>
        <dd className="tnum">{games}</dd>
      </div>
      <div>
        <dt>一共</dt>
        <dd className="tnum">{slots.length} 份</dd>
      </div>
      <div>
        <dt>最近一次</dt>
        <dd className="tnum">{timeText(Math.max(...slots.map((s) => s.updatedAt)))}</dd>
      </div>
    </dl>
  );
}

export function SavesList({ rows }: { rows: SaveRow[] }) {
  return (
    <Paged
      className="me-list"
      items={rows}
      keyOf={(r) => r.id}
      label="云存档翻页"
      testId="saves"
      render={(r) => (
        <div className="saves-row" data-testid={`saves-${r.id}`}>
          <span className="saves__game">{r.name}</span>
          <span className={`saves__info${r.error ? ' saves__info--error' : ''}`}>
            {r.error
              ? r.error
              : r.slots === null
                ? '读取中…'
                : r.slots.length === 0
                  ? '还没有存档'
                  : `已存 ${r.slots.length} 份 · 最近 ${timeText(Math.max(...r.slots.map((s) => s.updatedAt)))}`}
          </span>
        </div>
      )}
    />
  );
}
