/**
 * 结算页的"分享"（0.13.0，仓库根 docs/social.md 1.1）：画和分享由 kit 的 `arcade-kit/share` 做，两个玩法共用；结算页出来时才去碰 kit 的画布和 DOM。
 * 卡上的数据（掼蛋）由 guandan/share-card.ts 拼，只有公开的东西，不画任何人的手牌。
 */
import type { PreparedShare, ShareCard } from 'arcade-kit/share';

/** 掼蛋的主题色（和封面、图标的红一样） */
export const SHARE_ACCENT = '#b3202a';

/** mm:ss */
export function clockText(ms: number): string {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** 斗地主每日残局的卡（docs/doudizhu.md 第 6 节）：日期、题名、用时、分数；不画任何人的手牌。date 是北京时间日期 YYYY-MM-DD */
export function dailyPuzzleCard(d: { date: string; name: string; ms: number; score: number; tries: number; hints: number }, name: string | null): ShareCard {
  return {
    game: '斗地主',
    title: `每日残局 · ${d.name}`,
    big: { value: `${d.score} 分`, label: '越快越高' },
    stats: [
      { label: '用时', value: clockText(d.ms) },
      { label: '重来', value: `${d.tries} 次` },
      { label: '提示', value: `${d.hints} 次` },
    ],
    line: d.tries + d.hints === 0 ? '一遍过，没看提示' : d.hints === 0 ? '重来了几次，终于破了' : '看了提示也算破了',
    accent: SHARE_ACCENT,
    // 卡上的日期按题目的那一天写（正午避开时区边界）
    date: new Date(`${d.date}T12:00:00+08:00`),
    ...(name ? { player: { name } } : {}),
  };
}

/** 分享出去的链接：游戏地址；好友房带房间码（点开就进那个房间） */
export function shareUrl(origin: string, path: string, room: string | null): string {
  return `${origin}${path}${room ? `?room=${room}` : ''}`;
}

let icon: HTMLImageElement | null = null;

/**
 * 结算页一出来就先画卡（0.13.1，kit 0.12.3 的 prepareShare）：iOS 只许在点击的那一下里调系统分享，点了再画就过期了、只能出预览。
 * 返回"分享"按钮的点击处理：卡画好了就在点击里同步调系统分享，还没画好等画完再试（调不起来 kit 退回预览）。
 * 图标用 favicon（同源，画进画布不污染）；没加载好 kit 跳过图标照常出卡
 */
export function prepareResult(card: ShareCard, room: string | null): () => void {
  if (!icon) {
    icon = new Image();
    icon.src = './favicon.svg';
  }
  const art = icon;
  let ready: PreparedShare | null = null;
  const loading = import('arcade-kit/share').then(({ prepareShare }) => {
    ready = prepareShare({ ...card, art }, { url: shareUrl(location.origin, location.pathname, room), fileName: 'guandan.png' });
    return ready;
  });
  return () => {
    // 前面不能有 await：这一行就在点击的处理函数里
    if (ready) void ready.share();
    else void loading.then((p) => p.share());
  };
}
