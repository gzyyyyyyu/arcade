/** /me 的"资料"和"好友能看到什么"两块：账号概况、改昵称、退出登录，以及三个隐私开关。 */
import { useState } from 'react';
import { api, errorText, type User } from '../../api.ts';
import { fullDateText } from '../../lib/format.ts';
import { confirmLeave, Link, navigate } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { Field, FormError, SubmitButton, useSubmit } from '../../ui.tsx';

export function ProfileCard() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <div className="me-card" data-testid="me-profile">
      <dl className="facts">
        <dt>昵称</dt>
        <dd>{user.displayName}</dd>
        <dt>用户名</dt>
        <dd>{user.username}</dd>
        <dt>好友码</dt>
        <dd>
          <span className="mono">{user.friendCode}</span>{' '}
          <Link className="inline-link" href="/friends">
            去好友页
          </Link>
        </dd>
        <dt>注册于</dt>
        <dd>{fullDateText(user.createdAt)}</dd>
      </dl>
      <Rename />
      <div className="row me-actions">
        <Link className="btn btn--small" href="/me/stats">
          看我的战绩和称号
        </Link>
        {user.isAdmin && (
          // 窄屏顶栏放不下"管理"，从这里进
          <Link className="btn btn--small" href="/admin" data-testid="me-admin">
            去管理后台
          </Link>
        )}
        <LogoutButton />
      </div>
    </div>
  );
}

function Rename() {
  const { user, setUser } = useSession();
  const [name, setName] = useState(user!.displayName);
  const [done, setDone] = useState(false);
  const { busy, error, onSubmit } = useSubmit(async () => {
    setDone(false);
    const r = await api.rename(name);
    setUser(r.user);
    setDone(true);
  });
  return (
    <form className="me-rename" onSubmit={onSubmit} data-testid="me-rename" aria-label="改昵称">
      <Field label="改昵称" hint="2–12 个字，一天能改 10 次" name="displayName" required value={name} onChange={(e) => setName(e.target.value)} />
      {/* 没改（或只差首尾空格）时灰着：亮着的橙按钮让人以为还有没保存的 */}
      <SubmitButton busy={busy} disabled={name.trim() === user!.displayName}>
        保存
      </SubmitButton>
      <FormError text={error} />
      {done && <p className="ok">改好了</p>}
    </form>
  );
}

function LogoutButton() {
  const { setUser } = useSession();
  const { busy, error, onSubmit } = useSubmit(async () => {
    // 刚换的恢复码还没存好时先问：退出以后卡片就没了
    if (!confirmLeave()) return;
    await api.logout();
    setUser(null);
    navigate('/', false, true);
  });
  return (
    <>
      <button className="btn btn--small" type="button" disabled={busy} onClick={() => void onSubmit()}>
        退出登录
      </button>
      <FormError text={error} />
    </>
  );
}

export function PrivacyCard() {
  return (
    <div className="me-card" data-testid="me-privacy">
      <PrivacySwitch
        field="showWhere"
        label="让好友看到我在线、在玩哪个游戏、在哪个房间"
        onNote="好友在好友页能看到你在不在线、在哪，能一键加入你的房间。"
        offNote="好友只看到你几天前来过，看不到你在不在线、在哪。"
        save={api.setShowWhere}
        testId="show-where"
      />
      <PrivacySwitch
        field="showFeed"
        label="让好友看到我的动态（实盘赢了、新称号、游戏里的名场面）"
        onNote="好友在好友页能看到你最近 7 天的动态，能点赞、扔道具。"
        offNote="不再生成你的动态，已有的好友也看不到。"
        save={api.setShowFeed}
        testId="show-feed"
      />
      <PrivacySwitch
        field="showMates"
        label="让好友看到我们一起打了几场、谁赢得多"
        onNote="好友房打完，好友页上写着你和每个好友一起打了几场、各赢几场、谁是最佳搭档。"
        offNote="你和好友一起打的场数两边都看不到（照样记着，再打开就能看到）。"
        save={api.setShowMates}
        testId="show-mates"
      />
    </div>
  );
}

/**
 * "好友能看到什么"里的开关：点了马上存（和改昵称共用每天 10 次）。
 * - 在哪（docs/social.md 1.2）：关了好友那边只看到"几天前来过"；
 * - 好友动态（第 2 节）：关了不再生成，已有的好友也看不到；
 * - 搭子战绩（第 2 节）：关了两边都看不到，照样记。
 */
function PrivacySwitch({ field, label, onNote, offNote, save, testId }: {
  field: 'showWhere' | 'showFeed' | 'showMates';
  label: string;
  onNote: string;
  offNote: string;
  save: (on: boolean) => Promise<{ user: User }>;
  testId: string;
}) {
  const { user, setUser } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // 先按点的显示，存不上再退回：等回话再变，勾选框看着像没点上
  const [shown, setShown] = useState<boolean | null>(null);
  const on = shown ?? user![field] !== false;
  const flip = async (next: boolean) => {
    setShown(next);
    setBusy(true);
    setError('');
    try {
      setUser((await save(next)).user);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setShown(null);
      setBusy(false);
    }
  };
  return (
    <div className="me-switch">
      <label className="check">
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => void flip(e.target.checked)} data-testid={testId} />
        {label}
      </label>
      <p className="note">{on ? onNote : offNote}</p>
      <FormError text={error} />
    </div>
  );
}
