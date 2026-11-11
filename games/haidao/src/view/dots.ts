import { collect, upgrade } from '../core/index.ts';
import type { Profile } from '../core/types.ts';

/** 基地底部操作栏的红点：现在有事可做的提示（纯函数，tests/dots.test.ts 锁住） */
export interface Dots {
  /** 有建筑现在升得起（资源、主寨等级、星数都够） */
  upgrade: boolean;
  /** 金矿 / 伐木场里有能领的（仓库没满） */
  collect: boolean;
  /** 有没看过的防守记录（别人来打过你） */
  attacked: boolean;
}

/** 能升级的建筑 id（按存档顺序） */
export function upgradable(p: Profile): number[] {
  return p.base.buildings.filter((b) => upgrade(p, b.id).ok).map((b) => b.id);
}

export function baseDots(p: Profile, unseenDefenses: number): Dots {
  return {
    upgrade: p.base.buildings.some((b) => upgrade(p, b.id).ok),
    collect: p.base.buildings.some((b) => (b.kind === 'goldmine' || b.kind === 'sawmill') && (b.stored ?? 0) >= 1 && collect(p, b.id).ok),
    attacked: unseenDefenses > 0,
  };
}
