/**
 * 好友页的"一行人"和各种请求、确认（Friends.tsx 拆出来的）：好友、想加你的人、等对方接受、屏蔽的人。
 * 一屏放下不滚（docs/ui.md 第 11 节）：这些行都放在 <Paged> 里按剩下的高度翻页，所以确认框不往行下面加高，
 * 而是在原地换掉这一行（删好友、屏蔽要先勾确认，旁边有"取消"），行高基本不变，翻页的算术不用重量。
 */
import { useState, type ReactNode } from 'react';
import { api, ApiFail, errorText, type FriendLists, type Profile, type Where } from '../../api.ts';
import { gameName } from '../../lib/format.ts';
import { togetherText } from '../../lib/mates.ts';
import { Link } from '../../router.tsx';
import { playError, playSuccess } from '../../lib/sound.ts';
import { FormError, useWritable } from '../../ui.tsx';

/** 在线的好友在哪："在掼蛋房里 · 3/4 人"、"在玩开盘"、"在大厅"；对方没报过位置就只说"在线" */
function whereText(w: Where | undefined): string {
  if (!w) return '在线';
  if (w.place === 'lobby' || !w.game) return '在大厅';
  if (w.place === 'game') return `在玩${gameName(w.game)}`;
  return `在${gameName(w.game)}房里${w.seats ? ` · ${w.seats} 人` : ''}`;
}

/** "今天来过 / 昨天来过 / N 天前来过"（服务端按北京时间算天，不给精确时间）。 */
function lastSeenText(days: number): string {
  if (days <= 0) return '今天来过';
  if (days === 1) return '昨天来过';
  return `${days} 天前来过`;
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="account__avatar" aria-hidden="true">
      {Array.from(name)[0]}
    </span>
  );
}

/** 一个按钮点了做一件事：防重复点，出错显示一句话。 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiFail) playError();
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** 一行人：头像、昵称、说明，右边是按钮；confirm 有内容时在原地换掉整行，让用户确认。 */
function Person({ p, sub, mates, children, confirm, error, stats, online }: {
  p: Profile;
  sub?: string;
  /** 搭子战绩那一行 */
  mates?: ReactNode;
  children: ReactNode;
  /** 有就换掉整行 */
  confirm?: ReactNode;
  /** 点按钮出错的一句话，接在行后面（行还在，能重试；少见，多出的高度翻页不管） */
  error?: string;
  stats?: boolean;
  online?: boolean;
}) {
  return (
    <div className={`people__item${confirm ? ' people__item--confirm' : ''}`} data-testid={`person-${p.displayName}`}>
      {confirm ?? (
        <>
          <div className="people__row">
            <span className="people__face">
              <Avatar name={p.displayName} />
              {online && <span className="people__online" role="img" aria-label="在线" />}
            </span>
            <span className="people__text">
              {stats ? (
                // 点好友的名字看对方的战绩
                <Link className="people__name people__link" href={`/u/${p.userId}`}>
                  {p.displayName}
                </Link>
              ) : (
                <span className="people__name">{p.displayName}</span>
              )}
              {sub && <span className={`people__sub${online ? ' people__sub--online' : ''}`}>{sub}</span>}
              {mates}
            </span>
          </div>
          <div className="row people__btns">{children}</div>
          {error && <FormError text={error} />}
        </>
      )}
    </div>
  );
}

export function Incoming({ p, onChanged }: { p: Profile; onChanged: () => void }) {
  const writable = useWritable();
  const { busy, error, run } = useAction();
  const [blocking, setBlocking] = useState(false);
  return (
    <Person
      p={p}
      sub="想加你为好友"
      error={error}
      confirm={blocking ? <BlockConfirm p={p} onDone={onChanged} onCancel={() => setBlocking(false)} /> : undefined}
    >
      <button className="btn btn--small btn--primary" type="button" disabled={busy || !writable} onClick={() => void run(async () => {
          await api.acceptFriend(p.userId);
          playSuccess();
          onChanged();
        })}>
        接受
      </button>
      <button className="btn btn--small" type="button" disabled={busy || !writable} onClick={() => void run(async () => {
          await api.declineFriend(p.userId);
          onChanged();
        })}>
        拒绝
      </button>
      <button className="btn btn--small btn--quiet-danger" type="button" disabled={!writable} aria-expanded={blocking} onClick={() => setBlocking(!blocking)}>
        屏蔽
      </button>
    </Person>
  );
}

export function Friend({ p, best, onChanged }: { p: FriendLists['friends'][number]; best: boolean; onChanged: () => void }) {
  const writable = useWritable();
  const [open, setOpen] = useState<'remove' | 'block' | null>(null);
  const toggle = (what: 'remove' | 'block') => setOpen(open === what ? null : what);
  const cancel = () => setOpen(null);
  return (
    <Person
      p={p}
      stats
      online={p.online}
      sub={p.online ? whereText(p.where) : lastSeenText(p.lastSeenDaysAgo)}
      mates={
        p.together && (
          <span className="people__mates" data-testid="together">
            {best && <span className="people__best">最佳搭档</span>}
            {togetherText(p.together)}
          </span>
        )
      }
      confirm={
        open === 'remove' ? (
          <Confirm label={`确定不再和「${p.displayName}」做好友`} button="删好友" action={() => api.removeFriend(p.userId)} onDone={onChanged} onCancel={cancel} />
        ) : open === 'block' ? (
          <BlockConfirm p={p} onDone={onChanged} onCancel={cancel} />
        ) : undefined
      }
    >
      {p.online && p.where?.place === 'room' && p.where.game && p.where.room && (
        // 好友在房间里，直接进他的房间（满了或开打了就旁观，房间那头管）；游戏页不在大厅的单页里，用整页跳转
        <a className="btn btn--small btn--primary" href={`/games/${encodeURIComponent(p.where.game)}/?room=${encodeURIComponent(p.where.room)}`} data-testid="join-room">
          加入
        </a>
      )}
      <button className="btn btn--small btn--quiet-danger" type="button" disabled={!writable} aria-expanded={open === 'remove'} onClick={() => toggle('remove')}>
        删好友
      </button>
      <button className="btn btn--small btn--quiet-danger" type="button" disabled={!writable} aria-expanded={open === 'block'} onClick={() => toggle('block')}>
        屏蔽
      </button>
    </Person>
  );
}

export function Outgoing({ p, onChanged }: { p: Profile; onChanged: () => void }) {
  const writable = useWritable();
  const { busy, error, run } = useAction();
  return (
    <Person p={p} sub="已发送，等对方接受" error={error}>
      <button className="btn btn--small" type="button" disabled={busy || !writable} onClick={() => void run(async () => {
          await api.removeFriend(p.userId);
          onChanged();
        })}>
        撤回
      </button>
    </Person>
  );
}

export function Blocked({ p, onChanged }: { p: Profile; onChanged: () => void }) {
  const writable = useWritable();
  const { busy, error, run } = useAction();
  return (
    <Person p={p} sub="已屏蔽" error={error}>
      <button className="btn btn--small" type="button" disabled={busy || !writable} onClick={() => void run(async () => {
          await api.unblock(p.userId);
          onChanged();
        })}>
        解除屏蔽
      </button>
    </Person>
  );
}

function BlockConfirm({ p, onDone, onCancel }: { p: Profile; onDone: () => void; onCancel: () => void }) {
  return (
    <Confirm
      label={`确定屏蔽「${p.displayName}」：删掉好友和请求，以后看不到对方的请求`}
      button="屏蔽"
      action={() => api.block(p.userId)}
      onDone={onDone}
      onCancel={onCancel}
    />
  );
}

/** 要先勾确认才能点的危险操作。 */
function Confirm({ label, button, action, onDone, onCancel }: { label: string; button: string; action: () => Promise<void>; onDone: () => void; onCancel: () => void }) {
  const writable = useWritable();
  const [sure, setSure] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <div className="people__confirm">
      <label className="check">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        {label}
      </label>
      {error && <FormError text={error} />}
      <div className="row people__confirm-btns">
        <button className="btn btn--small" type="button" onClick={onCancel}>
          取消
        </button>
        <button className="btn btn--small btn--danger" type="button" aria-busy={busy} disabled={!sure || busy || !writable} onClick={() => void run(async () => {
            await action();
            onDone();
          })}>
          {busy ? '请稍等…' : button}
        </button>
      </div>
    </div>
  );
}
