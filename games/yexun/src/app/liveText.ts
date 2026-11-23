import type { LiveRecord, Outcome } from '../platform/live.ts';
import { netDown } from '../platform/messages.ts';
import { LIVE_TIERS, type LiveTier } from '../content/live.ts';

/** 结回以后的那一份记录 → 结算页那一行 */
export const recordText = (rec: Readonly<LiveRecord> | null): string => {
  if (!rec) return '带回完成';
  if (rec.step === 'done') return liveText({ kind: 'ok', credited: rec.credited ?? 0, capped: rec.capped ?? 0 });
  if (rec.wait) return liveText({ kind: 'retry', why: rec.wait });
  return liveText({ kind: 'bug', error: rec.error ?? rec.step });
};
const liveText = (o: Outcome): string =>
  o.kind === 'ok'
    ? `带回 ${o.credited.toLocaleString('zh-CN')} 筹码${o.capped > 0 ? `（今天的上限扣下 ${o.capped.toLocaleString('zh-CN')}）` : ''}`
    : o.kind === 'retry'
      ? o.why === 'login'
        ? '登录以后自动带回'
        : netDown('这一份没丢，联网以后自动带回')
      : o.kind === 'unavailable'
        ? '这里没有钱包，实盘不可用'
        : '带回这会儿没成，筹码不会丢，稍后再打开看看';

/** 筹码不够带一份：写手上多少（读到了的话）、这一档要多少、去哪补 */
const poorText = (tier: LiveTier, chips: number | null): string => {
  const need = `${LIVE_TIERS[tier].name}档要 ${LIVE_TIERS[tier].stake.toLocaleString('zh-CN')}`;
  return `${chips === null ? '筹码不够带一份' : `手上 ${chips.toLocaleString('zh-CN')} 筹码`}，${need}。钱包每天能领补给`;
};

/** 实盘带入没成时给玩家的一句话（筹码都没动） */
export const buyinWhy = (o: Exclude<Outcome, { kind: 'ok' }>, ctx: { tier: LiveTier; chips: number | null }): string =>
  o.kind === 'reject'
    ? o.error === 'no_funds'
      ? poorText(ctx.tier, ctx.chips)
      : o.error === 'at_table'
        ? '上一份还没结完，等它结完再开'
        : o.error === 'limit'
          ? '今天的实盘次数用完了，明天再来'
          : o.error === 'storage'
            ? '浏览器存储写不进（满了或禁用了），记不下这一份，筹码没动'
            : '这会儿带不进去，筹码没动，稍后再试'
    : o.kind === 'retry'
      ? o.why === 'login'
        ? '先登录再玩实盘'
        : netDown('筹码没动')
      : o.kind === 'unavailable'
        ? '这里没有钱包，实盘不可用'
        : '带入出了问题，过一会儿再试';
