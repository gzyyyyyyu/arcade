/** 录像在列表里怎么写（纯函数，不碰 DOM） */
import { fmtClock } from '../content/clock.ts';
import { RULES_VERSION } from '../core/state.ts';
import type { ReplayRecord } from './format.ts';


export function replayTitle(r: ReplayRecord): string {
  const s = r.setup;
  if (s.rush) return '每日 · 首领连战';
  const mode = s.mode === 'raid' ? '夜探' : s.endless ? '无尽' : '守夜';
  const daily = r.summary.daily ? '每日 · ' : '';
  return `${daily}${mode} · 危险${s.danger}`;
}

export function replayResult(r: ReplayRecord): string {
  const x = r.summary;
  if (r.setup.mode === 'raid') return x.loot > 0 ? `带出 ${x.loot.toLocaleString('zh-CN')} 铜钱` : x.quit ? '认输' : '没撤出';
  // 连战：录像的小结里没有打倒几只（要重放才知道），写全清没有和用时
  if (r.setup.rush) return `${x.won ? '全清' : x.quit ? '认输' : '没打完'} · ${fmtClock(x.seconds)} · 斩${x.kills.toLocaleString('zh-CN')}`;
  if (x.won) return `天亮 · 斩${x.kills.toLocaleString('zh-CN')}`;
  return `${x.quit ? '认输' : '倒下'} · ${fmtClock(x.seconds)} · 斩${x.kills.toLocaleString('zh-CN')}`;
}

export function isOutdated(r: ReplayRecord): boolean {
  return r.rules !== RULES_VERSION;
}

export const OUTDATED_TEXT = '旧版本，可能放不对';

/** 旧规则版本的连战录像不放：选择码和菜单随版本变，放歪了会停在菜单里出不来 */
export function isBlocked(r: ReplayRecord): boolean {
  return !!r.setup.rush && isOutdated(r);
}

export const BLOCKED_TEXT = '版本不同，放不了';
