/**
 * /friends：好友页；/f/<码>：别人分享的好友链接（docs/platform-backend.md 5.6、5.7）。
 * 不按昵称搜人，只能靠好友码或链接加；对别人只显示昵称，不显示用户名。
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiFail, errorText, type FriendLists, type Profile, type Relation } from '../../api.ts';
import { PageTabs, Paged, useMedia } from '../../features/fit/Fit.tsx';
import { bestPartner } from '../../lib/mates.ts';
import { Modal } from '../../features/modal/Modal.tsx';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { playError, playSuccess } from '../../lib/sound.ts';
import { Empty, Field, FormError, LoadError, Panel, Skeleton, useWritable } from '../../ui.tsx';
import { Avatar, Blocked, Friend, Incoming, Outgoing, useAction } from './FriendsPeople.tsx';
import { MeetupButton, MeetupStrip, useMeetupRows } from './Meetups.tsx';

import './friends.css';

/** 宽屏并排：左边我的好友码和加好友，中间好友列表，有请求时右边再加一栏请求（三栏都放得下才并排）；其余尺寸用页签 */
/** 名单不超过这个数就按内容高排、不翻页（一页肯定放得下）；多了才撑满剩下的高度翻页 */
const FEW_ROWS = 3;
/** 够高才按内容高：手机横屏、360×640 这类矮屏三个人加标题、页签已经放不下，照旧撑满、按高度翻页 */
const ROOMY = '(min-height: 700px)';

const WIDE = '(min-width: 1100px) and (min-height: 600px)';
/** 卡片头放得下"约一局"的宽度，更窄时"约一局"挪进列表顶上的约局条；手机横屏再窄也放卡片头：约局条多一行，名单就一个人都放不下 */
const HEAD_ROOMY = '(min-width: 600px), (max-height: 500px) and (orientation: landscape)';

/** 没登录、停服、连不上时好友页和好友链接都显示的提示；返回 null 表示可以往下走。 */
function useGate(from: string): ReactNode | null {
  const { loading, user, service } = useSession();
  if (loading) return <Skeleton rows={3} />;
  if (service === 'off') return <p className="note">账号服务暂时休息，过一会儿再来看。</p>;
  if (service === 'unreachable') return <p className="note">连不上服务器，点上面的"重试"。</p>;
  if (!user) {
    return (
      <>
        <p>登录后才能加好友。</p>
        <Link className="btn btn--primary" href={`/login?from=${encodeURIComponent(from)}`}>
          去登录
        </Link>
      </>
    );
  }
  return null;
}

export function FriendsPage() {
  const gate = useGate('friends');
  if (gate) return <Panel icon="people" title="好友">{gate}</Panel>;
  return <Friends />;
}

function Friends() {
  const { service } = useSession();
  const roomy = useMedia(ROOMY);
  const few = (n: number) => roomy && n <= FEW_ROWS;
  const [data, setData] = useState<FriendLists | null>(null);
  const [blocks, setBlocks] = useState<Profile[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const wide = useMedia(WIDE);
  const headRoomy = useMedia(HEAD_ROOMY);
  const meetupNew = !headRoomy && (data?.friends.length ?? 0) > 0;
  const meetupRows = useMeetupRows(meetupNew);
  // 最佳搭档：好友里做搭档赢得最多的那个
  const best = data ? bestPartner(data.friends) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: version 是手动重载计数，变化时重新拉取好友列表
  useEffect(() => {
    let alive = true;
    void Promise.all([api.friends(), api.blocks()]).then(
      ([f, b]) => {
        if (!alive) return;
        setData(f);
        setBlocks(b.blocks);
        setLoadError('');
      },
      (e: unknown) => alive && setLoadError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [version]);

  // 一屏放下（docs/ui.md 第 9、11 节）：电脑上左栏是我的好友码和加好友，中栏好友列表，有请求时右栏是请求，各栏等高、列表翻页；
  // 手机和矮屏用页签："好友"（带动态入口）、"请求"（有才出现）、"加好友"、"好友码"
  const lists: Array<{ key: string; title: string; rows: Profile[]; row: (p: Profile) => ReactNode }> = [];
  if (data && data.incoming.length > 0) lists.push({ key: 'in', title: `想加你的人（${data.incoming.length}）`, rows: data.incoming, row: (p) => <Incoming p={p} onChanged={reload} /> });
  if (data && data.outgoing.length > 0) lists.push({ key: 'out', title: `等对方接受（${data.outgoing.length}）`, rows: data.outgoing, row: (p) => <Outgoing p={p} onChanged={reload} /> });
  if (blocks && blocks.length > 0) {
    lists.push({ key: 'block', title: `屏蔽的人（${blocks.length}）`, rows: blocks, row: (p) => <Blocked p={p} onChanged={reload} /> });
  }
  const requests = lists.map((l) => (
    <Panel key={l.key} icon="people" title={l.title} className={`friends-req friends-${l.key === 'in' ? 'incoming' : 'late'}${few(l.rows.length) ? ' friends-req--few' : ''}`}>
      {l.key === 'block' && <p className="note">屏蔽的人发来的请求你看不到，也加不了你。对方不会知道自己被屏蔽了。</p>}
      <div className="friends-req__fill">
        <Paged items={l.rows} keyOf={(p) => p.userId} render={l.row} fixed={few(l.rows.length) ? Number.POSITIVE_INFINITY : undefined} className="people" label={l.title} />
      </div>
    </Panel>
  ));

  // 没有好友时的入口：电脑上两栏都在，直接把焦点给分享按钮；窄屏先切到"好友码"页签
  const goInvite = () => {
    const tab = document.querySelector<HTMLElement>('[data-testid="ptab-code"]');
    if (tab) tab.click();
    else document.querySelector<HTMLElement>('[data-testid="share-link"]')?.focus();
  };
  const friendsPanel = !data ? (
    <Panel icon="people" title="好友" className={`friends-list${roomy ? ' friends-list--few' : ''}`}>
      {loadError ? <LoadError onRetry={reload}>{loadError}</LoadError> : <Skeleton rows={3} />}
    </Panel>
  ) : (
    <Panel
      icon="people"
      title={`好友（${data.friends.length}）`}
      className={`friends-list${few(data.friends.length + meetupRows) ? ' friends-list--few' : ''}`}
      action={headRoomy && data.friends.length > 0 ? <MeetupButton /> : undefined}
    >
      <MeetupStrip friends={data.friends} withNew={meetupNew} />
      {data.friends.length === 0 ? (
        <Empty
          action={
            <button className="btn btn--small" type="button" onClick={goInvite}>
              去发我的好友链接
            </button>
          }
        >
          还没有好友。把好友链接发给朋友，对方点开就能加你。
        </Empty>
      ) : (
        <Paged items={data.friends} keyOf={(p) => p.userId} render={(p) => <Friend p={p} best={p.userId === best} onChanged={reload} />} fixed={few(data.friends.length + meetupRows) ? Number.POSITIVE_INFINITY : undefined} className="people" label="好友翻页" testId="friends-paged" />
      )}
    </Panel>
  );

  const tabs = wide
    ? [
        {
          id: 'side',
          name: '加好友',
          body: (
            <div className="friends-side">
              <MyCode />
              <AddByCode />
            </div>
          ),
        },
        { id: 'friends', name: '好友', body: friendsPanel },
        ...(requests.length ? [{ id: 'req', name: '请求', body: <div className="friends-side">{requests}</div> }] : []),
      ]
    : [
        { id: 'friends', name: '好友', body: friendsPanel },
        ...(requests.length ? [{ id: 'req', name: data?.incoming.length ? `请求 ${data.incoming.length}` : '请求', body: <div className="friends-side">{requests}</div> }] : []),
        { id: 'add', name: '加好友', body: <AddByCode /> },
        { id: 'code', name: '好友码', body: <MyCode /> },
      ];

  return (
    <div className="friends-page">
      {service === 'readonly' && <p className="banner">服务器有点忙，现在只能看、不能改，明天再来。</p>}
      <PageTabs tabs={tabs} wide={WIDE} className={`friends-tabs${requests.length ? ' friends-tabs--3' : ''}`} label="好友页" />
    </div>
  );
}

/** 我的好友码和分享链接；可以换一个（旧链接马上失效）。 */
function MyCode() {
  const { user, setUser } = useSession();
  const writable = useWritable();
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');
  const [done, setDone] = useState(false);
  const [renew, setRenew] = useState(false);
  const { busy, error, run } = useAction();
  const link = `${location.origin}/f/${user!.friendCode}`;
  const copyLink = () =>
    navigator.clipboard.writeText(link).then(
      () => setCopy('done'),
      () => setCopy('failed'),
    );
  // 手机上用系统的分享面板（微信、QQ 都在里面）；电脑上没有就直接复制
  const canShare = typeof navigator.share === 'function';
  const share = () =>
    navigator.share({ title: '小游戏街机厅', text: `${user!.displayName} 叫你来街机厅一起玩，点链接加我好友：`, url: link }).catch((e: unknown) => {
      // 用户自己关了分享面板不算失败；别的原因（比如不让分享）退回复制
      if (!(e instanceof DOMException && e.name === 'AbortError')) void copyLink();
    });
  return (
    <Panel icon="people" title="我的好友码" className="friends-code">
      <p className="code-big" data-testid="my-friend-code">
        {user!.friendCode}
      </p>
      <p className="note">
        把链接发给朋友，对方点开就能加你：
        <br />
        <span className="mono link-text" data-testid="my-friend-link">
          {link}
        </span>
      </p>
      <div className="row">
        <button className="btn btn--primary btn--big" type="button" data-testid="share-link" onClick={() => void (canShare ? share() : copyLink())}>
          {canShare ? '分享给朋友' : copy === 'done' ? '已复制，发给朋友吧' : '复制我的好友链接'}
        </button>
        {canShare && (
          <button className="btn" type="button" onClick={() => void copyLink()}>
            {copy === 'done' ? '已复制' : '复制链接'}
          </button>
        )}
        {/* 不常用、会让旧链接失效：和分享按钮排一行（横屏放得下），点开在弹窗里说清楚再换（选项不折叠，docs/ui.md） */}
        <button className="btn btn--small friends-code__renew" type="button" onClick={() => setRenew(true)}>
          换一个好友码
        </button>
      </div>
      {copy === 'failed' && <p className="form-error">复制不了，长按上面的链接手动复制</p>}
      <Modal open={renew} title="换一个好友码" onClose={() => setRenew(false)} className="modal__box--narrow" testId="renew-code">
        <div className="form">
          <p className="note">链接发给了不想加的人，就换一个。换了以后旧链接马上失效，已经加上的好友不受影响。每天最多换 3 次。</p>
          <FormError text={error} />
          {done && <p className="ok">换好了</p>}
          <button
            className="btn"
            type="button"
            aria-busy={busy}
            disabled={busy || !writable}
            onClick={() =>
              void run(async () => {
                setDone(false);
                const r = await api.newFriendCode();
                setUser({ ...user!, friendCode: r.friendCode });
                setCopy('idle');
                setDone(true);
              })
            }
          >
            {busy ? '请稍等…' : '换好友码'}
          </button>
        </div>
      </Modal>
    </Panel>
  );
}

/** 手里有好友码（比如朋友念给你听）：输进来，去 /f/<码> 看看是谁。 */
function AddByCode() {
  const [code, setCode] = useState('');
  return (
    <Panel icon="people" title="加好友" className="friends-add">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.replace(/[\s-]/g, '');
          if (c) navigate(`/f/${encodeURIComponent(c)}`);
        }}
      >
        <Field label="对方的好友码" hint="8 位，不分大小写" name="friendCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} required value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn" type="submit">
          查找
        </button>
      </form>
    </Panel>
  );
}

/** 坏的百分号编码（如 /f/%E0）不让整页崩：原样交给服务端，它会回"没找到"。 */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** /f/<码>：看看这是谁，加好友。 */
export function FriendCodePage() {
  const loc = useLocation();
  const code = safeDecode(loc.pathname.slice('/f/'.length));
  const gate = useGate(`f/${code}`);
  if (gate) return <Panel icon="people" title="加好友">{gate}</Panel>;
  return <FriendCode key={code} code={code} />;
}

type Lookup = { state: 'loading' } | { state: 'missing' } | { state: 'error'; text: string } | { state: 'ok'; user: Profile; relation: Relation; blocked: boolean };

function FriendCode({ code }: { code: string }) {
  const writable = useWritable();
  const [look, setLook] = useState<Lookup>({ state: 'loading' });
  const [version, setVersion] = useState(0);
  const { busy, error, run } = useAction();

  // biome-ignore lint/correctness/useExhaustiveDependencies: version 是手动重载计数，变化时重新查好友码
  useEffect(() => {
    let alive = true;
    api.lookupFriendCode(code).then(
      (r) => alive && setLook({ state: 'ok', user: r.user, relation: r.relation, blocked: !!r.blocked }),
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiFail && e.code === 'not_found') {
          setLook({ state: 'missing' });
          playError();
        }
        else setLook({ state: 'error', text: errorText(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [code, version]);

  const toFriends = (
    <Link className="btn" href="/friends">
      去好友页
    </Link>
  );
  if (look.state === 'loading') return <Panel icon="people" title="加好友"><p className="note">正在查…</p></Panel>;
  if (look.state === 'missing') {
    return (
      <Panel icon="people" title="加好友">
        <p>没有找到这个好友码，可能对方换了新的。问问对方要一个新链接。</p>
        <div className="row">{toFriends}</div>
      </Panel>
    );
  }
  if (look.state === 'error') {
    return (
      <Panel icon="people" title="加好友">
        <FormError text={look.text} />
        <div className="row">{toFriends}</div>
      </Panel>
    );
  }
  const { user, relation, blocked } = look;
  const send = () =>
    void run(async () => {
      const r = await api.sendFriendRequest(code);
      if (r.status === 'friends') playSuccess();
      setLook({ ...look, relation: r.status === 'friends' ? 'friends' : 'pending_out' });
    });
  let body: ReactNode;
  if (relation === 'self') body = <p>这是你自己的好友码。把链接发给朋友，对方点开就能加你。</p>;
  else if (blocked) {
    body = (
      <>
        <p>你屏蔽了对方。要加好友，先解除屏蔽。</p>
        <button className="btn btn--primary" type="button" disabled={busy || !writable} onClick={() =>
            void run(async () => {
              await api.unblock(user.userId);
              setVersion((v) => v + 1);
            })
          }>
          解除屏蔽
        </button>
      </>
    );
  } else if (relation === 'friends') body = <p className="ok">你们已经是好友了。</p>;
  else if (relation === 'pending_out') body = <p className="ok">已发送，等对方接受。</p>;
  else {
    body = (
      <>
        {relation === 'pending_in' && <p>对方也想加你为好友。</p>}
        <button className="btn btn--primary" type="button" disabled={busy || !writable} onClick={send}>
          {relation === 'pending_in' ? '接受，成为好友' : '加好友'}
        </button>
      </>
    );
  }
  return (
    <Panel icon="people" title="加好友">
      <div className="people__row people__row--big">
        <Avatar name={user.displayName} />
        <span className="people__name">{user.displayName}</span>
      </div>
      <div className="form">
        {body}
        <FormError text={error} />
      </div>
      <div className="row">{toFriends}</div>
    </Panel>
  );
}
