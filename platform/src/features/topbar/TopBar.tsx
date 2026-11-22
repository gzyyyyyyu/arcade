/** 顶栏右上角（管理、排行、动态、好友、筹码牌子、头像）和页脚的声音开关：所有页面同一组、同样的顺序 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CoinIcon, PeopleIcon, ShieldIcon, SpeakerIcon, TrophyIcon } from '../../icons.tsx';
import { playCoins, setSoundOn, soundOn, subscribeSound } from '../../lib/sound.ts';
import { Link, useLocation } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { FeedButton } from '../feed/Feed.tsx';
import { useHasInvites, useMeetupDue, useOnlineFriends } from '../invites/Invites.tsx';
import { useWallet } from '../wallet/Wallet.tsx';
import { num } from '../../lib/format.ts';
import { useCountUp } from '../../lib/countup.ts';
import { burstCoins } from '../coinfly/burst.ts';
import '../coinfly/coinfly.css';
import { chipsTotal, decideChipsFx } from '../../lib/chips-fx-logic.ts';
import { setLatestTotal, takePending } from '../../lib/chips-fx.ts';
import { quiet } from '../../lib/enter-fx.ts';

/** 顶栏上指向当前页的那一项标成 aria-current（styles.css 画暖色底），靠它看出在哪一页 */
const here = (path: string, href: string) => (path === href ? ({ 'aria-current': 'page' } as const) : {});

/** 右上角：没登录是"登录"，登录了是头像（昵称第一个字）加昵称；管理员前面多一个"管理"。所有页面都是这同一组、同样的顺序 */
export function AccountButton() {
  const { loading, user, service } = useSession();
  const path = useLocation().pathname;
  if (loading) return <span className="topbar"><span className="account account--loading" aria-hidden="true" /></span>;
  // 停服档登也登不上，连不上时不知道登没登录：顶上的提示已经说明了，不放入口
  if (service === 'off' || service === 'unreachable') return null;
  // 已经在登录、找回页上了，右上角再放一个"登录"是多余的
  if (!user && (path === '/login' || path === '/forgot')) return null;
  if (!user) {
    return (
      <span className="topbar">
        <Link className="account" href="/login">
          登录
        </Link>
      </span>
    );
  }
  return (
    <span className="topbar">
      {user.isAdmin && (
        <Link className="account account--admin" href="/admin" {...here(path, '/admin')}>
          <ShieldIcon />
          管理
        </Link>
      )}
      <Link className="account account--nav" href="/boards" {...here(path, '/boards')}>
        <TrophyIcon />
        <span className="account__label">排行</span>
      </Link>
      <FeedButton me={user.id} />
      <FriendsLink path={path} />
      <WalletBadge path={path} />
      <AvatarLink path={path} name={user.displayName} />
    </span>
  );
}

/** 头像：平时进"我的账号"；有约局到点（开局前 10 分钟到开局后 30 分钟，docs/social.md 1.6）时带小点、点了去好友页看约局 */
function AvatarLink({ path, name }: { path: string; name: string }) {
  const due = useMeetupDue();
  const href = due ? '/friends' : '/me';
  return (
    <Link className="account" href={href} title={due ? '约局到点了，去好友页' : '我的账号'} data-testid="avatar-link" {...here(path, '/me')}>
      <span className="account__avatar" aria-hidden="true">
        {Array.from(name)[0]}
      </span>
      <span className="account__name">{name}</span>
      {due && <span className="dot" role="img" aria-label="约局到点了" data-testid="meetup-dot" />}
    </Link>
  );
}

/** 顶栏的"好友"：有还没过期的邀请时右上角带红点（docs/social.md 1.3）；有好友在线时左上角一个绿底数字（1.2），叠在按钮外、不占宽 */
function FriendsLink({ path }: { path: string }) {
  const dot = useHasInvites();
  const online = useOnlineFriends();
  return (
    <Link className="account account--nav" href="/friends" data-testid="friends-link" data-tour="friends" {...here(path, '/friends')}>
      <PeopleIcon />
      <span className="account__label">好友</span>
      {online > 0 && (
        <span className="account__online" role="img" aria-label={`${online} 个好友在线`} data-testid="online-count">
          {online > 9 ? '9+' : online}
        </span>
      )}
      {dot && <span className="dot" role="img" aria-label="有人叫你" data-testid="invite-dot" />}
    </Link>
  );
}

/** 顶栏的筹码小牌子：点开进钱包页。还在读时数字位置放一个不带字的占位（写"筹码"像是坏了），读不到才写"筹码"，入口照样在 */
function WalletBadge({ path }: { path: string }) {
  const { wallet, error } = useWallet();
  const shown = useCountUp(wallet?.balance ?? null);
  // 刚从游戏回来且总数（余额 + 桌上筹码）变了：数字从旧值滚到新值，多了再迸一撮金币（chips-fx.ts）；只在钱包第一次读到时比一次
  const [rolled, setRolled] = useState<number | null>(null);
  const numEl = useRef<HTMLSpanElement>(null);
  const checked = useRef(false);
  useEffect(() => {
    if (!wallet) return;
    setLatestTotal(chipsTotal(wallet));
    if (checked.current) return;
    checked.current = true;
    const fx = decideChipsFx(takePending(), { total: chipsTotal(wallet), balance: wallet.balance }, Date.now());
    if (fx.kind === 'none' || quiet()) return;
    const badge = numEl.current?.parentElement;
    if (fx.kind === 'burst' && badge) {
      burstCoins(badge, 8);
      playCoins();
    }
    const to = wallet.balance;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      setRolled(t >= 1 ? null : Math.round(fx.from + (to - fx.from) * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setRolled(fx.from);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wallet]);
  // 刷新后余额变多了（赢了、领了）响一下；第一次读到不响
  const last = useRef<number | null>(null);
  const bal = wallet?.balance ?? null;
  useEffect(() => {
    if (bal !== null && last.current !== null && bal > last.current) playCoins();
    last.current = bal;
  }, [bal]);
  // 今天能领补给：牌子上亮红点，进钱包页领（大厅不放一整条领补给提示，不占首屏）
  const canRelief = !!wallet && wallet.canRelief && wallet.writesLeft > 0;
  return (
    <Link className="account account--chips" href="/wallet" title={canRelief ? '我的筹码（今天能领补给）' : '我的筹码'} data-testid="wallet-badge" data-tour="chips" {...here(path, '/wallet')}>
      <CoinIcon />
      {wallet ? <span className="chips-num" ref={numEl}>{num(rolled ?? shown)}</span> : error ? <span className="chips-num">筹码</span> : <span className="chips-num chips-num--wait" role="img" aria-label="筹码">10,000</span>}
      {canRelief && <span className="dot" role="img" aria-label="今天能领补给" data-testid="relief-dot" />}
    </Link>
  );
}

/** 页脚的声音开关：大厅点按的那一声"嗒"（src/lib/sound.ts） */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, soundOn);
  return (
    <button className="foot__sound" type="button" data-sound-toggle aria-pressed={on} data-testid="sound-toggle" onClick={() => setSoundOn(!on)}>
      <SpeakerIcon on={on} />
      {on ? '声音：开' : '声音：关'}
    </button>
  );
}
