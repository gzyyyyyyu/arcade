/**
 * 试炼页的「好友最好」（docs/design-play.md 2.6）：读这关固定榜 `trial-<id>` 的好友范围，取好友里第一名（不含自己）和我的名次。
 * 只读看得见的卡、打开试炼页时读一次（页内缓存，关页清掉），不轮询、不写。
 */
import { readBoard, type BoardDeps, type BoardResult } from './api.ts';
import type { TrialId } from '../content/trials.ts';

export interface FriendBest {
  /** 好友里成绩最好的（不含自己）；没有好友上榜为 null */
  top: { name: string; score: number } | null;
  /** 我在好友里排第几（没上榜 null） */
  myRank: number | null;
}

/** 读榜结果 → 好友最好；没登录、读不到的回 null（卡上就不写） */
export function friendBest(r: BoardResult): FriendBest | null {
  if (r.kind !== 'ok') return null;
  const top = r.entries.find((e) => !e.isMe);
  return { top: top ? { name: top.displayName, score: top.score } : null, myRank: r.me?.rank ?? null };
}

/** 一次打开试炼页的缓存：同一关只读一次 */
export class FriendBests {
  private readonly got = new Map<TrialId, Promise<FriendBest | null>>();
  private readonly deps: BoardDeps;
  constructor(deps: BoardDeps) {
    this.deps = deps;
  }

  get(id: TrialId): Promise<FriendBest | null> {
    let p = this.got.get(id);
    if (!p) {
      p = readBoard(this.deps, `trial-${id}`, 'friends').then(friendBest);
      this.got.set(id, p);
    }
    return p;
  }
}
