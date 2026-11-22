/**
 * /me 的"安全"页签：改密码、换恢复码、退出其他设备、注销账号。动账号安全的操作都要再输一次当前密码（docs/platform-backend.md 5.2）。
 * 一次只摆一个操作（窄屏上面一排小按钮选，宽屏左边一列选、右边是表单），不折叠、不滚；注销仍要勾"我知道删了就找不回来"。
 */
import { useState } from 'react';
import { api } from '../../api.ts';
import { navigate } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { Field, FormError, RecoveryCodeCard, SubmitButton, useSubmit } from '../../ui.tsx';

/** 再验证（输当前密码）时 bad_credentials 只可能是密码错，别说"用户名或密码不对"。 */
const REAUTH = { bad_credentials: '密码不对' };

/** key 给冒烟用（data-testid=safe-<key>）；short 是选择按钮上的短名，title 是表单的名字（也是它的可访问名） */
const SAFE_ACTIONS = [
  { key: 'password', short: '改密码', title: '改密码' },
  { key: 'recovery', short: '换恢复码', title: '换一个恢复码' },
  { key: 'others', short: '其他设备', title: '退出其他设备' },
  { key: 'delete', short: '注销', title: '注销账号' },
] as const;
type SafeKey = (typeof SAFE_ACTIONS)[number]['key'];

export function SafeTab() {
  const [on, setOn] = useState<SafeKey>('password');
  return (
    <div className="me-safe">
      <div className="me-safe__menu" role="tablist" aria-label="账号安全">
        {SAFE_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            aria-selected={a.key === on}
            className={`${a.key === on ? 'tabs__on' : ''}${a.key === 'delete' ? ' me-safe__danger' : ''}`}
            onClick={() => setOn(a.key)}
            data-testid={`safe-${a.key}`}
            title={a.title}
          >
            {a.short}
          </button>
        ))}
      </div>
      <div className="me-safe__pane me-card" role="tabpanel" aria-label={SAFE_ACTIONS.find((a) => a.key === on)!.title} data-testid="safe-pane">
        {on === 'password' && <ChangePassword />}
        {on === 'recovery' && <NewRecoveryCode />}
        {on === 'others' && <LogoutOthers />}
        {on === 'delete' && <DeleteAccount />}
      </div>
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, onSubmit } = useSubmit(async () => {
    setDone(false);
    await api.changePassword(current, next);
    setCurrent('');
    setNext('');
    setDone(true);
  }, REAUTH);
  return (
    <form className="form" onSubmit={onSubmit}>
      <Field label="现在的密码" name="currentPassword" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Field label="新密码" hint="至少 8 位，别用常见密码" name="newPassword" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
      <FormError text={error} />
      {done && <p className="ok">改好了，别的设备都已退出</p>}
      <SubmitButton busy={busy}>改密码</SubmitButton>
    </form>
  );
}

function NewRecoveryCode() {
  const { user } = useSession();
  const [current, setCurrent] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, onSubmit } = useSubmit(async () => {
    const r = await api.newRecoveryCode(current);
    setCurrent('');
    setCode(r.recoveryCode);
  }, REAUTH);
  if (code) return <RecoveryCodeCard code={code} username={user!.username} doneText="好了" onDone={() => setCode('')} />;
  return (
    <form className="form" onSubmit={onSubmit}>
      <p className="note">旧恢复码丢了或者给别人看到了，就换一个。换了以后旧的立刻作废。</p>
      <Field label="现在的密码" name="currentPassword" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <FormError text={error} />
      <SubmitButton busy={busy}>换恢复码</SubmitButton>
    </form>
  );
}

function LogoutOthers() {
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, onSubmit } = useSubmit(async () => {
    setDone(false);
    await api.logoutOthers(current);
    setCurrent('');
    setDone(true);
  }, REAUTH);
  return (
    <form className="form" onSubmit={onSubmit}>
      <p className="note">在别人的电脑上登录过、忘了退出，就用这个。这台设备不受影响。</p>
      <Field label="现在的密码" name="currentPassword" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <FormError text={error} />
      {done && <p className="ok">别的设备都已退出</p>}
      <SubmitButton busy={busy}>退出其他设备</SubmitButton>
    </form>
  );
}

function DeleteAccount() {
  const { setUser } = useSession();
  const [useCode, setUseCode] = useState(false);
  const [secret, setSecret] = useState('');
  const [sure, setSure] = useState(false);
  const { busy, error, setError, onSubmit } = useSubmit(async () => {
    await api.deleteAccount(useCode ? { recoveryCode: secret } : { currentPassword: secret });
    setUser(null);
    // 账号已经删了，刚换的恢复码也跟着作废，不用再提醒
    navigate('/?deleted=1', false, true);
  }, useCode ? { bad_credentials: '恢复码不对' } : REAUTH);
  return (
    <form className="form" onSubmit={onSubmit}>
      <p className="note">账号、昵称、好友和所有云存档会马上删掉，找不回来。各游戏存在这台设备上的进度不受影响。</p>
      {useCode ? (
        <Field label="恢复码" name="recoveryCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} required value={secret} onChange={(e) => setSecret(e.target.value)} />
      ) : (
        <Field label="现在的密码" name="currentPassword" type="password" autoComplete="current-password" required value={secret} onChange={(e) => setSecret(e.target.value)} />
      )}
      <button
        className="linkish"
        type="button"
        onClick={() => {
          setUseCode(!useCode);
          setSecret('');
          setError('');
        }}
      >
        {useCode ? '改用密码' : '忘了密码？用恢复码'}
      </button>
      <label className="check">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        我知道删了就找不回来
      </label>
      <FormError text={error} />
      <SubmitButton busy={busy} danger disabled={!sure}>
        注销账号
      </SubmitButton>
    </form>
  );
}
