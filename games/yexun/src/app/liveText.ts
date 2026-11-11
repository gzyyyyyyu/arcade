import type { LiveRecord, Outcome } from '../platform/live.ts';
import { netDown } from '../platform/messages.ts';

/** 结回以后的那一份记录 → 结算页那一行 */
export const recordText = (rec: Readonly<LiveRecord> | null): string => {
  if (!rec) return '结回完成';
  if (rec.step === 'done') return liveText({ kind: 'ok', credited: rec.credited ?? 0, capped: rec.capped ?? 0 });
  if (rec.wait) return liveText({ kind: 'retry', why: rec.wait });
  return liveText({ kind: 'bug', error: rec.error ?? rec.step });
};
const liveText = (o: Outcome): string =>
  o.kind === 'ok'
    ? `结回 ${o.credited.toLocaleString('zh-CN')} 筹码${o.capped > 0 ? `（今天的上限扣下 ${o.capped.toLocaleString('zh-CN')}）` : ''}`
    : o.kind === 'retry'
      ? o.why === 'login'
        ? '登录以后自动结回'
        : netDown('这一份没丢，联网以后自动结回')
      : o.kind === 'unavailable'
        ? '这里没有钱包，实盘不可用'
        : '结回这会儿没成，筹码不会丢，稍后再打开看看';

/** 实盘带入没成时给玩家的一句话（筹码都没动） */
export const buyinWhy = (o: Exclude<Outcome, { kind: 'ok' }>): string =>
  o.kind === 'reject'
    ? o.error === 'no_funds'
      ? '筹码不够带一份'
      : o.error === 'at_table'
        ? '上一份还没结完，等它结完再开'
        : o.error === 'limit'
          ? '今天的实盘次数用完了，明天再来'
          : '这会儿带不进去，筹码没动，稍后再试'
    : o.kind === 'retry'
      ? o.why === 'login'
        ? '先登录再玩实盘'
        : netDown('筹码没动')
      : o.kind === 'unavailable'
        ? '这里没有钱包，实盘不可用'
        : '带入出了问题，过一会儿再试';
