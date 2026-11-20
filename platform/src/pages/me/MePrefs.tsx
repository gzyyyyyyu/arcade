/**
 * 我的账号 → 偏好：逐个游戏选在大厅显示还是隐藏（docs/platform-backend.md 15.21）。
 * 隐藏了的不出现在大厅、继续玩、排行页签、动态里，直接打开游戏地址照常能玩。点了马上存，先按点的显示，存不上退回。
 */
import { useState } from 'react';
import { api, errorText } from '../../api.ts';
import { GAMES } from '../../../shared/games.ts';
import { useSession } from '../../session.tsx';
import { FormError } from '../../ui.tsx';

export function PrefsCard() {
  const { hidden, hiddenDefault, setUser, setHiddenDefault } = useSession();
  const [pending, setPending] = useState<ReadonlySet<string> | null>(null);
  const [error, setError] = useState('');
  const shown = pending ?? hidden;
  const flip = async (id: string, show: boolean) => {
    const next = new Set(shown);
    if (show) next.delete(id);
    else next.add(id);
    setPending(next);
    setError('');
    try {
      const r = await api.setHiddenGames([...next]);
      setUser(r.user);
      setHiddenDefault(r.hiddenDefault);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(null);
    }
  };
  const def = new Set(hiddenDefault);
  return (
    <div className="me-card" data-testid="me-prefs">
      <p className="note">勾上的游戏在大厅、排行、动态里显示；不勾的藏起来（打开游戏链接照样能玩）。</p>
      <div className="game-prefs">
        {GAMES.map((g) => (
          <label key={g.id} className="check">
            <input type="checkbox" checked={!shown.has(g.id)} disabled={pending !== null} onChange={(e) => void flip(g.id, e.target.checked)} data-testid={`pref-${g.id}`} />
            {g.name}
            {def.has(g.id) && <small className="muted">默认隐藏</small>}
          </label>
        ))}
      </div>
      <FormError text={error} />
    </div>
  );
}
