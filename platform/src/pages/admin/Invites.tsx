/**
 * 管理后台的"邀请码"分区（docs/platform-backend.md 15.20）：四个数（普通用户额度、管理员额度、有效期、每天最多生成几个）、
 * 单独给某人改额度、建长期码（码表顶上的入口，一码多人、默认 100 次、不过期）、全站最近 100 个码和撤回。改了即时生效，不用发版。
 */
import { useEffect, useState } from 'react';
import { api, errorText, type AdminInviteCode, type AdminUser, type InviteRules, type InviteRulesState, type MultiInviteCode } from '../../api.ts';
import { Empty, Field, FormError, Panel, Skeleton, SubmitButton, useSubmit, useWritable } from '../../ui.tsx';
import { Paged } from '../../features/fit/Fit.tsx';
import { Modal } from '../../features/modal/Modal.tsx';
import { dateText, num, timeText } from './common.ts';
import { AdminTabs, useAdminWide } from './AdminLayout.tsx';

const KEYS = ['userQuota', 'adminQuota', 'ttlDays', 'perDay'] as const;
const TEXT: Record<keyof InviteRules, string> = {
  userQuota: '普通用户每人几个',
  adminQuota: '管理员每人几个',
  ttlDays: '码的有效期（天）',
  perDay: '每人 24 小时内最多生成',
};

function RulesPanel() {
  const [state, setState] = useState<InviteRulesState | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState(false);
  const writable = useWritable();
  const take = (s: InviteRulesState) => {
    setState(s);
    setDraft(Object.fromEntries(KEYS.map((k) => [k, String(s.rules[k])])));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在挂载时加载一次规则；take 每次渲染都是新函数
  useEffect(() => {
    let alive = true;
    api.admin.inviteRules().then(
      (r) => alive && take(r),
      (e: unknown) => alive && setLoadError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, []);
  const changed = state ? KEYS.filter((k) => draft[k] !== String(state.rules[k])) : [];
  const bad = state
    ? changed.find((k) => {
        const v = Number(draft[k]);
        return draft[k] === '' || !Number.isSafeInteger(v) || v < state.range[k][0] || v > state.range[k][1];
      })
    : undefined;
  const { busy, error, onSubmit } = useSubmit(async () => {
    if (!state || !changed.length || bad) return;
    const body: Partial<InviteRules> = {};
    for (const k of changed) body[k] = Number(draft[k]);
    take(await api.admin.setInviteRules(body));
    setSaved(true);
  });
  return (
    <Panel icon="people" title="邀请额度" className="apanel">
      {loadError && <FormError text={loadError} />}
      {!state && !loadError && <Skeleton rows={3} />}
      {state && (
        <form className="form form--bar" onSubmit={(e) => { setSaved(false); void onSubmit(e); }} data-testid="invite-rules">
          <div className="fields fields--2">
          {KEYS.map((k) => (
            <Field
              key={k}
              label={TEXT[k]}
              hint={`默认 ${num(state.defaults[k])}，能调 ${num(state.range[k][0])}–${num(state.range[k][1])}`}
              name={k}
              type="number"
              inputMode="numeric"
              min={state.range[k][0]}
              max={state.range[k][1]}
              required
              value={draft[k] ?? ''}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            />
          ))}
          </div>
          <p className="note">额度 = 已用的码 + 还有效的码；过期、撤回的没用的码会还回来。改了马上生效。</p>
          <FormError text={bad && state ? `「${TEXT[bad]}」要是 ${num(state.range[bad][0])} 到 ${num(state.range[bad][1])} 的整数` : error} />
          {saved && !changed.length && <p className="ok">改好了，已经生效</p>}
          <SubmitButton busy={busy} disabled={!changed.length || !!bad || !writable}>
            {changed.length ? `保存（改 ${changed.length} 条）` : '没有改动'}
          </SubmitButton>
        </form>
      )}
    </Panel>
  );
}

/** 单独给某个人改额度：从账号列表里挑人，填数字或留空恢复默认 */
function UserQuotaPanel() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [userId, setUserId] = useState('');
  const [quota, setQuota] = useState('');
  const [done, setDone] = useState('');
  const writable = useWritable();
  useEffect(() => {
    let alive = true;
    void api.admin.users().then((r) => alive && setUsers(r.users), () => alive && setUsers([]));
    return () => {
      alive = false;
    };
  }, []);
  const { busy, error, onSubmit } = useSubmit(async () => {
    setDone('');
    const v = quota.trim() === '' ? null : Number(quota);
    const r = await api.admin.setInviteQuota(userId, v);
    const who = users?.find((u) => u.id === userId)?.displayName ?? '';
    setDone(r.custom ? `${who} 的额度改成 ${r.quota} 个` : `${who} 恢复按默认额度`);
  });
  return (
    <Panel icon="people" title="单独改额度" className="apanel">
      <form className="form" onSubmit={(e) => void onSubmit(e)} data-testid="invite-quota">
        <div className="fields fields--2">
        <label className="field">
          <span className="field__label">谁</span>
          <select className="field__input" required value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">选一个账号</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}（{u.username}）
              </option>
            ))}
          </select>
        </label>
        <Field label="额度" hint="0–1000；留空恢复按角色的默认" name="quota" type="number" inputMode="numeric" min={0} max={1000} value={quota} onChange={(e) => setQuota(e.target.value)} />
        </div>
        <FormError text={error} />
        {done && <p className="ok">{done}</p>}
        <SubmitButton busy={busy} disabled={!userId || !writable}>
          保存
        </SubmitButton>
      </form>
    </Panel>
  );
}

/**
 * 建长期码：码表顶上点"新建长期邀请码"展开，次数（默认 100）和有效天数（空 = 不过期）；建好收起表单、顶上显示新码和"复制链接 / 复制码"。
 * 放在码表面板里而不是另起一个面板：两个面板叠在一栏里，码表翻页量高度会和面板互相撑来撑去
 */
function MultiCodeForm({ onCreated, onCancel }: { onCreated: (c: MultiInviteCode) => void; onCancel: () => void }) {
  const [uses, setUses] = useState('100');
  const [days, setDays] = useState('');
  const writable = useWritable();
  const { busy, error, onSubmit } = useSubmit(async () => {
    onCreated(await api.admin.createMultiCode(Number(uses), days.trim() === '' ? null : Number(days)));
  });
  return (
    <form className="form multi-code" onSubmit={(e) => void onSubmit(e)} data-testid="multi-code">
      <div className="fields fields--2">
        <Field label="能用几次" hint={`2–${USES_MAX}`} name="maxUses" type="number" inputMode="numeric" min={2} max={USES_MAX} required value={uses} onChange={(e) => setUses(e.target.value)} />
        <Field label="有效天数" hint="留空不过期" name="days" type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
      </div>
      <p className="note">一码多人，不占额度，不自动加好友；注册的每 IP、每天上限照算。</p>
      <FormError text={error} />
      <div className="multi-code__acts">
        <SubmitButton busy={busy} disabled={!writable}>
          建好
        </SubmitButton>
        <button className="btn" type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

/** 刚建好的长期码：码、能用几次，一键复制完整链接或码 */
function CreatedCode({ code, onClose }: { code: MultiInviteCode; onClose: () => void }) {
  const link = new URL(code.link, window.location.origin).href;
  return (
    <div className="multi-created" data-testid="multi-created" role="status">
      <p>
        建好了：<b className="mono">{code.code}</b>
        <span className="muted"> · 能用 {num(code.maxUses)} 次 · {code.expiresAt === null ? '不过期' : `${dateText(code.expiresAt)} 到期`}</span>
      </p>
      <div className="multi-created__acts">
        <CopyButton text={link} label="复制链接" primary />
        <CopyButton text={code.code} label="复制码" />
        <button className="btn btn--small" type="button" onClick={onClose}>
          收起
        </button>
      </div>
    </div>
  );
}

/** 长期码最多能用几次：和接口的 MULTI_CODE.usesMax（worker/api/account/invite-codes.ts）一致，超了接口回 400 */
const USES_MAX = 10_000;
const STATUS_TEXT: Record<AdminInviteCode['status'], string> = { unused: '没用', used: '已用', expired: '过期', revoked: '撤回' };
const MULTI_STATUS_TEXT: Record<AdminInviteCode['status'], string> = { unused: '能用', used: '用完', expired: '过期', revoked: '撤回' };
type CodeFilter = 'all' | 'unused' | 'used' | 'multi';
const FILTER_TEXT: Record<CodeFilter, string> = { all: '全部', unused: '没用的', used: '已用的', multi: '长期码' };
const EMPTY_TEXT: Record<CodeFilter, string> = {
  all: '还没有人生成过邀请码。',
  unused: '没有没用的码。',
  used: '还没有被用掉的码。',
  multi: '还没建过长期码。',
};

/** 长期码用它注册的人：列前 3 个，多的写"等 N 人" */
function Joiners({ users }: { users: NonNullable<AdminInviteCode['users']> }) {
  if (!users.length) return <span className="muted">还没人用</span>;
  const shown = users.slice(0, 3);
  return (
    <>
      {shown.map((u, i) => (
        <span key={u.username}>
          {i > 0 && '、'}
          <Who who={u} />
        </span>
      ))}
      {users.length > shown.length && ` 等 ${users.length} 人`}
    </>
  );
}

type Person = { username: string; displayName: string } | null | undefined;

/** 昵称，后面跟灰色的用户名；账号注销了灰着写"已注销" */
function Who({ who }: { who: Person }) {
  return who ? (
    <>
      {who.displayName} <small className="muted">{who.username}</small>
    </>
  ) : (
    <span className="muted">已注销</span>
  );
}

function CopyButton({ text, label = '复制', primary = false }: { text: string; label?: string; primary?: boolean }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => setState('done'),
      // 剪贴板不让用（权限、老浏览器）：码就在旁边，手动选中复制
      () => setState('failed'),
    );
  return (
    <button className={`btn btn--small${primary ? ' btn--primary' : ''}`} type="button" onClick={() => void copy()}>
      {/* 并排两个复制按钮时说清是哪个复制好了（"链接已复制"），不都写"已复制" */}
      {state === 'done' ? `${label.replace('复制', '')}已复制` : state === 'failed' ? '手动复制' : label}
    </button>
  );
}

function CodesPanel() {
  const [status, setStatus] = useState<CodeFilter>('all');
  const [codes, setCodes] = useState<AdminInviteCode[] | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<MultiInviteCode | null>(null);
  const writable = useWritable();
  // biome-ignore lint/correctness/useExhaustiveDependencies: version 是手动重载计数，变化时重新拉取邀请码
  useEffect(() => {
    let alive = true;
    setCodes(null);
    api.admin.inviteCodes(status).then(
      (r) => alive && setCodes(r.codes),
      (e: unknown) => alive && setError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [status, version]);
  const filter = (
    // biome-ignore lint/a11y/useSemanticElements: 保持现有布局，语义靠 role 给读屏器（fieldset 自带边框和内边距）
    <div className="seg" role="group" aria-label="看哪些">
      {(['all', 'unused', 'used', 'multi'] as const).map((s) => (
        <button key={s} type="button" className={status === s ? 'seg__on' : ''} aria-pressed={status === s} onClick={() => setStatus(s)}>
          {FILTER_TEXT[s]}
        </button>
      ))}
    </div>
  );
  return (
    <Panel icon="people" title="邀请码" className="apanel" action={filter}>
      {creating ? (
        <MultiCodeForm
          onCancel={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            setCreated(c);
            setStatus('multi');
            setVersion((v) => v + 1);
          }}
        />
      ) : created ? (
        <CreatedCode code={created} onClose={() => setCreated(null)} />
      ) : (
        <div className="multi-entry">
          <button className="btn btn--primary btn--small" type="button" disabled={!writable} onClick={() => setCreating(true)} data-testid="multi-new">
            ＋ 新建长期邀请码
          </button>
          <span className="muted">一码多人，默认 100 次、不过期</span>
        </div>
      )}
      {error && <FormError text={error} />}
      {!codes && !error && <Skeleton rows={3} />}
      {codes && codes.length === 0 && (
        <Empty
          action={
            status === 'all' ? undefined : (
              <button className="btn btn--small" type="button" onClick={() => setStatus('all')}>
                看全部
              </button>
            )
          }
        >
          {EMPTY_TEXT[status]}
        </Empty>
      )}
      {codes && codes.length > 0 && (
        // 一个码占两行：码、状态、时间；发的人、用的人（名字长的折三行）。按剩下的高度、每条的实际高度翻页
        <Paged
          className="invite-codes"
          testId="invite-code-table"
          label="邀请码翻页"
          uneven
          items={codes}
          keyOf={(c) => c.id}
          render={(c) => (
            <div className={`invite-code${c.status === 'unused' ? '' : ' invite-code--spent'}${c.maxUses > 1 ? ' invite-code--multi' : ''}`}>
              <div className="invite-code__main">
                <span className="mono invite-code__code">{c.code ?? c.hint}</span>
                {/* 长期码的 已用/上限 放进状态块里，一行放得下 */}
                <span className={`code-status code-status--${c.status} tnum`} title={c.maxUses > 1 ? (c.expiresAt === null ? '不过期' : `${dateText(c.expiresAt)} 到期`) : undefined}>
                  {c.maxUses > 1 ? `${MULTI_STATUS_TEXT[c.status]} ${c.uses}/${c.maxUses}` : STATUS_TEXT[c.status]}
                </span>
                <span className="tnum muted invite-code__when">{timeText(c.createdAt)}</span>
              </div>
              <div className="invite-code__who muted">
                发：<Who who={c.owner} />
                {c.users && (
                  <>
                    {' · '}用：<Joiners users={c.users} />
                  </>
                )}
                {c.maxUses === 1 && c.status === 'used' && (
                  <>
                    {' · '}用：<Who who={c.usedBy} />
                  </>
                )}
                <span className="tnum invite-code__when invite-code__when--low"> · {timeText(c.createdAt)}</span>
              </div>
              <div className="invite-code__acts">
                {c.code && <CopyButton text={c.code} />}
                {c.maxUses > 1 && c.status !== 'revoked' && <UsesButton code={c} onDone={() => setVersion((v) => v + 1)} />}
                {c.status === 'unused' && <RevokeButton id={c.id} onDone={() => setVersion((v) => v + 1)} />}
              </div>
            </div>
          )}
        />
      )}
    </Panel>
  );
}

/** 长期码改能用几次（2–USES_MAX，不少于已经用掉的）：弹框填数字；用完了的改大又能用 */
function UsesButton({ code, onDone }: { code: AdminInviteCode; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [uses, setUses] = useState(String(code.maxUses));
  const writable = useWritable();
  const min = Math.max(2, code.uses);
  const { busy, error, setError, onSubmit } = useSubmit(async () => {
    await api.admin.setMultiCodeUses(code.id, Number(uses));
    setOpen(false);
    onDone();
  });
  const show = () => {
    setUses(String(code.maxUses));
    setError('');
    setOpen(true);
  };
  return (
    <>
      <button className="btn btn--small" type="button" disabled={!writable} onClick={show} data-testid="code-uses">
        改次数
      </button>
      <Modal open={open} title="改能用几次" onClose={() => setOpen(false)} className="modal__box--narrow" testId="code-uses-form">
        <form className="form" onSubmit={(e) => void onSubmit(e)}>
          <p className="note">
            <span className="mono">{code.code ?? code.hint}</span> 已经用了 <b className="tnum">{num(code.uses)}</b> 次，现在能用 <b className="tnum">{num(code.maxUses)}</b> 次。
          </p>
          <Field label="能用几次" hint={`${min}–${USES_MAX}`} name="maxUses" type="number" inputMode="numeric" min={min} max={USES_MAX} required value={uses} onChange={(e) => setUses(e.target.value)} />
          <FormError text={error} />
          <SubmitButton busy={busy} disabled={!writable}>
            保存
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}

function RevokeButton({ id, onDone }: { id: string; onDone: () => void }) {
  const writable = useWritable();
  const { busy, error, onSubmit } = useSubmit(async () => {
    await api.admin.revokeInviteCode(id);
    onDone();
  });
  return (
    <>
      <button className="btn btn--small" type="button" disabled={busy || !writable} onClick={() => void onSubmit()}>
        撤回
      </button>
      <FormError text={error} />
    </>
  );
}

/** 宽屏：左边两个表单上下排，右边码表（顶上是"新建长期邀请码"）；窄屏三个页签 */
export function InvitesSection() {
  const wide = useAdminWide();
  const tabs = wide
    ? [
        {
          id: 'quota',
          name: '额度',
          body: (
            <>
              <RulesPanel />
              <UserQuotaPanel />
            </>
          ),
        },
        { id: 'codes', name: '全部邀请码', body: <CodesPanel /> },
      ]
    : [
        { id: 'rules', name: '额度', body: <RulesPanel /> },
        { id: 'quota', name: '单独改额度', body: <UserQuotaPanel /> },
        { id: 'codes', name: '全部邀请码', body: <CodesPanel /> },
      ];
  return <AdminTabs tabs={tabs} label="邀请码分页" />;
}
