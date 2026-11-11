/**
 * 动态页 /feed：好友动态的全部（最近 7 天、最多 50 条），一屏放下不滚（docs/ui.md 第 11 节）：
 * 列表按剩下的高度分页，电脑上排两列，放不下的翻页；每条的说明默认两行，长的点"展开"在弹窗里看。
 * 顶栏"动态"浮层的"看全部"、好友页的入口都进这里。
 */
import { FeedList } from '../../features/feed/Feed.tsx';
import { Link } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { Panel, Skeleton } from '../../ui.tsx';

export function FeedPage() {
  const { loading, user, service } = useSession();
  return (
    <div className="feedpage">
      <Panel icon="people" title="好友动态">
        {loading ? (
          <Skeleton rows={3} />
        ) : service === 'off' || service === 'unreachable' ? (
          <p className="note">现在连不上账号服务，过一会儿再来看。</p>
        ) : !user ? (
          <>
            <p>登录后才能看好友动态。</p>
            <Link className="btn btn--primary" href="/login?next=%2Ffeed">
              去登录
            </Link>
          </>
        ) : (
          <FeedList me={user.id} />
        )}
      </Panel>
    </div>
  );
}
