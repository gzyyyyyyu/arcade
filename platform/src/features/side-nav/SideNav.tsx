/**
 * 账号类子页面在宽屏（≥1200）上的左侧导航：大厅、排行、动态、好友、钱包、战绩、账号一列排开，
 * 当前页暖色底加左侧竖条；有它的时候顶栏不再放排行、动态、好友（side-nav.css）。手机和窄屏不显示，那里顶栏的图标按钮就是导航，再放一列只会挤掉内容。
 */
import type { ReactNode } from 'react';
import { useFeedFresh } from '../feed/Feed.tsx';
import { ChartIcon, CoinIcon, FeedIcon, HomeIcon, PeopleIcon, TrophyIcon, UserIcon } from '../../icons.tsx';
import { useHasInvites } from '../invites/Invites.tsx';
import { useSession } from '../../session.tsx';
import { Link } from '../../router.tsx';
import './side-nav.css';

const ITEMS: readonly { href: string; name: string; icon: ReactNode }[] = [
  { href: '/', name: '大厅', icon: <HomeIcon /> },
  { href: '/boards', name: '排行', icon: <TrophyIcon /> },
  { href: '/feed', name: '动态', icon: <FeedIcon /> },
  { href: '/friends', name: '好友', icon: <PeopleIcon /> },
  { href: '/wallet', name: '钱包', icon: <CoinIcon /> },
  { href: '/me/stats', name: '战绩', icon: <ChartIcon /> },
  { href: '/me', name: '账号', icon: <UserIcon /> },
];

export function SideNav({ path }: { path: string }) {
  // 顶栏的"动态""好友"在这里藏起来了，它们的红点也得跟到侧栏上，不然有人叫你、有新动态都看不到
  const me = useSession().user?.id ?? '';
  const dots: Record<string, ReactNode> = {
    '/feed': useFeedFresh(me) && <span className="dot" role="img" aria-label="有新动态" data-testid="sidenav-feed-dot" />,
    '/friends': useHasInvites() && <span className="dot" role="img" aria-label="有人叫你" data-testid="sidenav-invite-dot" />,
  };
  return (
    <nav className="sidenav" aria-label="页面">
      <ul>
        {ITEMS.map((it) => {
          const on = it.href === path;
          return (
            <li key={it.href}>
              <Link className={on ? 'sidenav__item sidenav__item--on' : 'sidenav__item'} href={it.href} aria-current={on ? 'page' : undefined}>
                {it.icon}
                {it.name}
                {dots[it.href]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
