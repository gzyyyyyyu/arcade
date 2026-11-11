/**
 * /me 的"邀请码"页签（docs/platform-backend.md 15.20）：还能邀请几个、生成码、我的码。没用的码能复制链接、系统分享、撤回；
 * 用过的显示是谁用的。朋友用码注册后两人自动成为好友。码多了按高度翻页，页面不滚。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { api, errorText, type InviteCodes } from '../../api.ts';
import { timeText } from '../../lib/format.ts';
import { Paged } from '../../features/fit/Fit.tsx';
import { playSuccess } from '../../lib/sound.ts';
import { Empty, FormError, Skeleton, useSubmit, useWritable } from '../../ui.tsx';

const SHARE_TEXT = '我在街机厅等你，用这个邀请码注册';
/** 码不超过这么多条时列表按内容高（me-list--fit），不撑满一屏；再多就撑满、按高度翻页 */
const FIT_CODES = 3;

/** 取码、生成、撤回后重取。head 是说明和"生成"按钮（宽屏放左卡），list 是翻页的码列表（宽屏放右卡） */
export function useInvites(): { head: ReactNode; list: ReactNode } {
  const writable = useWritable();
  const [data, setData] = useState<InviteCodes | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [version, setVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version 是手动重载计数，变化时重新拉取邀请码
  useEffect(() => {
    let alive = true;
    api.inviteCodes().then(
      (r) => alive && setData(r),
      (e: unknown) => alive && setError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [version]);
  const reload = () => setVersion((v) => v + 1);
  const make = useSubmit(async () => {
    await api.createInviteCode();
    playSuccess();
    reload();
  });
  if (!data) {
    const wait = error ? <p className="note">{error}</p> : <Skeleton rows={3} />;
    return { head: wait, list: null };
  }
  const create = (
    <button className="btn btn--primary" type="button" data-testid="invite-create" disabled={make.busy || !writable || data.left <= 0 || data.todayLeft <= 0} onClick={() => void make.onSubmit()}>
      {make.busy ? '请稍等…' : '生成邀请码'}
    </button>
  );
  const head = (
    <>
      <p className="note" data-testid="invite-left">
        还能邀请 <strong>{data.left}</strong> 个（共 {data.quota} 个）。码 {data.ttlDays} 天内有效，朋友用它注册后你们自动成为好友；没用的码过期或撤回后名额会还回来。
      </p>
      {data.codes.length > 0 && (
        <div className="row">
          {create}
          {data.left > 0 && data.todayLeft <= 0 && <span className="note">今天生成得够多了，明天再来</span>}
        </div>
      )}
      <FormError text={make.error} />
      {note && <p className="ok">{note}</p>}
    </>
  );
  const list =
    data.codes.length > 0 ? (
      <Paged className={`me-list${data.codes.length <= FIT_CODES ? ' me-list--fit' : ''}`} items={data.codes} keyOf={(c) => c.id} label="邀请码翻页" testId="invite-codes" render={(c) => <InviteCodeRow c={c} onChanged={reload} onNote={setNote} />} />
    ) : (
      <Empty
        testId="invite-empty"
        action={
          <div className="row">
            {create}
            {data.left > 0 && data.todayLeft <= 0 && <span className="note">今天生成得够多了，明天再来</span>}
          </div>
        }
      >
        {data.left > 0 ? '还没有邀请码，生成一个发给朋友' : '邀请名额用完了'}
      </Empty>
    );
  return { head, list };
}

function InviteCodeRow({ c, onChanged, onNote }: { c: InviteCodes['codes'][number]; onChanged: () => void; onNote: (s: string) => void }) {
  const writable = useWritable();
  const revoke = useSubmit(async () => {
    await api.revokeInviteCode(c.id);
    onChanged();
  });
  if (c.status !== 'unused' || !c.code) {
    const text =
      c.status === 'used'
        ? c.usedBy
          ? `${c.usedBy.displayName} 用了`
          : '已用（账号已注销）'
        : c.status === 'revoked'
          ? '已撤回'
          : '已过期';
    return (
      <div className={`invite-code invite-code--${c.status}`}>
        <span className="mono">{c.hint}</span>
        <span className="note">{text}</span>
      </div>
    );
  }
  const link = `${location.origin}/i/${c.code.replaceAll('-', '')}`;
  const copy = () =>
    navigator.clipboard.writeText(`${SHARE_TEXT}：${c.code}\n${link}`).then(
      () => onNote('复制好了，发给朋友吧'),
      () => onNote(`复制不了，手动发这个链接：${link}`),
    );
  // 手机上用系统分享面板；没有就复制
  const share = () =>
    typeof navigator.share === 'function'
      ? navigator.share({ title: '小游戏街机厅', text: `${SHARE_TEXT}：${c.code}`, url: link }).catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === 'AbortError')) void copy();
        })
      : copy();
  return (
    <div className="invite-code" data-testid="invite-code">
      <span className="mono code-mid">{c.code}</span>
      <span className="note">{timeText(c.expiresAt)} 前有效</span>
      <span className="row">
        <button className="btn btn--small btn--primary" type="button" onClick={() => void share()}>
          {typeof navigator.share === 'function' ? '分享' : '复制链接'}
        </button>
        <button className="btn btn--small" type="button" disabled={revoke.busy || !writable} onClick={() => void revoke.onSubmit()}>
          撤回
        </button>
      </span>
      <FormError text={revoke.error} />
    </div>
  );
}
