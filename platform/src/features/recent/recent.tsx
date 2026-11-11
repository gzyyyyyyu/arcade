/**
 * 大厅游戏的先后：最近玩过的排前面，第一张卡写"上次玩 · 多久以前"、按钮是"继续玩"。
 * 原来另有一张"继续玩"大横幅，和下面同一个游戏的卡重复（docs/ui.md 第 11 节"同一个内容一屏只出现一次"），并进第一张卡。
 * 数据不多发请求：钱包流水和桌上筹码是大厅登录时本来就问过的（useWallet），再加浏览器本地记的"点过进入游戏"。
 */
import { useEffect, useMemo } from 'react';
import { type GameEntry, GAMES } from '../../../shared/games.ts';
import { useWallet } from '../wallet/Wallet.tsx';
import { gameOfHref, LOCAL_MAX, mergeRecent, parseLocal, pushLocal, RECENT_KEY } from './recent-logic.ts';

/** 按账号分开存：同一个浏览器换账号登录，看不到上一个人点过的游戏 */
const keyOf = (userId: string) => `${RECENT_KEY}.${userId}`;

function readLocal(userId: string) {
  try {
    return parseLocal(localStorage.getItem(keyOf(userId)));
  } catch {
    return [];
  }
}

/** 页面上任何指向 /games/<id>/ 的链接被点，就记一条（存不了就算了） */
function useRecordEntries(userId: string): void {
  useEffect(() => {
    if (!userId) return;
    const onClick = (ev: MouseEvent) => {
      const a = (ev.target as Element | null)?.closest?.('a[href]');
      if (!a) return;
      const g = gameOfHref(GAMES, a.getAttribute('href') ?? '', location.href);
      if (!g) return;
      try {
        localStorage.setItem(keyOf(userId), JSON.stringify(pushLocal(readLocal(userId), g.id, Date.now())));
      } catch {
        // 隐私模式等存不了：不影响进游戏
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [userId]);
}

/** 大厅里游戏的顺序和"上次玩"的那一个；没登录、没玩过的人按目录顺序，last 是 null */
export function useRecentGames(userId: string): { games: GameEntry[]; last: { id: string; at: number } | null } {
  const { wallet, ledger } = useWallet();
  // 跟着用户 id 读：刚打开页面时还不知道是谁（会话还在问），等知道了再读这个人的记录
  const local = useMemo(() => (userId ? readLocal(userId) : []), [userId]);
  useRecordEntries(userId);
  const items = userId ? mergeRecent(GAMES, ledger, wallet?.stakes ?? [], local, Math.max(LOCAL_MAX, GAMES.length)) : [];
  const seen = new Set(items.map((r) => r.id));
  const games = [...items.flatMap((r) => GAMES.filter((g) => g.id === r.id)), ...GAMES.filter((g) => !seen.has(g.id))];
  return { games, last: items[0] ? { id: items[0].id, at: items[0].at } : null };
}
