/**
 * /me：我的账号，一屏放下不滚（docs/ui.md 第 9、11 节）。内容按主题分页签：
 * 资料（昵称、好友码、改昵称、退出）、隐私（好友能看到什么）、偏好（大厅显示哪些游戏）、云存档、邀请码、安全（改密码、换恢复码、退出其他设备、注销）。
 * 宽屏（≥960×600）资料和隐私并成一个页签、左右两块等高；云存档、邀请码是左边说明、右边翻页列表；安全是左边选操作、右边表单。
 * 云存档在页面一打开就读（不等切到那个页签），别的页签各读各的。
 */
import { useState } from 'react';
import { useMedia } from '../../features/fit/Fit.tsx';
import { Link } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { Panel, Skeleton } from '../../ui.tsx';
import { useInvites } from './me-invites.tsx';
import { PrefsCard } from './MePrefs.tsx';
import { PrivacyCard, ProfileCard } from './MeProfile.tsx';
import { SafeTab } from './MeSafe.tsx';
import { SavesList, SavesNote, useSaves } from './MeSaves.tsx';
import './me.css';

const WIDE = '(min-width: 960px) and (min-height: 600px)';
const TABS = {
  wide: [
    { id: 'profile', name: '资料' },
    { id: 'prefs', name: '偏好' },
    { id: 'saves', name: '云存档' },
    { id: 'invite', name: '邀请码' },
    { id: 'safe', name: '安全' },
  ],
  narrow: [
    { id: 'profile', name: '资料' },
    { id: 'privacy', name: '隐私' },
    { id: 'prefs', name: '偏好' },
    // 窄屏六个页签：两字一个，360 宽也放得下
    { id: 'saves', name: '存档' },
    { id: 'invite', name: '邀请' },
    { id: 'safe', name: '安全' },
  ],
} as const;

export function MePage() {
  const { loading, user, service } = useSession();
  if (loading) return <Panel icon="user" title="我的账号" className="me-page"><Skeleton rows={3} /></Panel>;
  // 停服、连不上时读不到账号（不是没登录）：顶上已有提示，这里别让人去登录
  if (service === 'off') return <Panel icon="user" title="我的账号" className="me-page"><p className="note">账号服务暂时休息，过一会儿再来看。</p></Panel>;
  if (service === 'unreachable') return <Panel icon="user" title="我的账号" className="me-page"><p className="note">连不上服务器，点上面的"重试"。</p></Panel>;
  if (!user) {
    return (
      <Panel icon="user" title="我的账号" className="me-page">
        <p>还没登录。</p>
        <Link className="btn btn--primary" href="/login">
          去登录
        </Link>
      </Panel>
    );
  }
  return <MeBody readonly={service === 'readonly'} />;
}

function MeBody({ readonly }: { readonly: boolean }) {
  const wide = useMedia(WIDE);
  // 选中的页签记在地址的 ?tab= 里（只替换当前记录，不多一条历史、不触发离开提醒）：页面被重画、刷新后还停在这一页
  const [on, setOnState] = useState<string>(() => new URLSearchParams(location.search).get('tab') ?? 'profile');
  const setOn = (id: string) => {
    setOnState(id);
    const u = new URL(location.href);
    u.searchParams.set('tab', id);
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  };
  const saves = useSaves();
  const tabs = wide ? TABS.wide : TABS.narrow;
  const cur = tabs.some((t) => t.id === on) ? on : 'profile';
  return (
    <Panel icon="user" title="我的账号" className="me-page">
      {readonly && <p className="banner banner--inline">服务器有点忙，现在只能看、不能改，明天再来。</p>}
      <div className="pills me-tabs" role="tablist" aria-label="账号的哪一块">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === cur} className={t.id === cur ? 'tabs__on' : ''} onClick={() => setOn(t.id)} data-testid={`me-tab-${t.id}`}>
            {t.name}
          </button>
        ))}
      </div>
      <div className="me-body" role="tabpanel">
        {cur === 'profile' && (
          <div className={wide ? 'me-cols' : 'me-one'}>
            <ProfileCard />
            {wide && <PrivacyCard />}
          </div>
        )}
        {cur === 'privacy' && <PrivacyCard />}
        {cur === 'prefs' && (
          <div className="me-one">
            <PrefsCard />
          </div>
        )}
        {cur === 'saves' && (
          <div className={wide ? 'me-cols' : 'me-one'}>
            <div className="me-card me-card--note">
              <SavesNote rows={wide ? saves : undefined} />
            </div>
            <SavesList rows={saves} />
          </div>
        )}
        {cur === 'invite' && <InvitesTab wide={wide} />}
        {/* 安全页签切走时只藏不卸：刚换的恢复码还没存好，切到别的页签再回来不能丢，离开提醒也要一直挂着 */}
        <div className="me-keep" hidden={cur !== 'safe'}>
          <SafeTab />
        </div>
      </div>
    </Panel>
  );
}

function InvitesTab({ wide }: { wide: boolean }) {
  const { head, list } = useInvites();
  return (
    <div className={wide ? 'me-cols' : 'me-one'}>
      <div className="me-card me-card--note">{head}</div>
      {list}
    </div>
  );
}
