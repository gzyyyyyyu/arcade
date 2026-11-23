/**
 * 海图天赋页（选关页「海图天赋」钮打开）：3 列 × 4 格固定格子一屏放下，点一格点上 / 再点取消（连同这列下面的格）；
 * 炮台第 4 格「偏爱」点了以后再点轮换塔种，轮完一圈取消。随时免费重置。点数、合法性都由规则核心判（setTdTalent）。
 */
import { TD_TALENTS, TD_TALENT_COLS, TD_TALENT_COL_NAME, talentCell, talentSpent } from '../content/tdtalent.ts';
import { BUILDINGS } from '../content/index.ts';
import { setTdTalent, tdTalentPicks, tdTalentPoints, tdUnlockedTowers } from '../core/tdrun.ts';
import type { TdTowerKind } from '../core/td2types.ts';
import { app } from './app.ts';
import { button, el, openModal, toast } from './ui.ts';

export function openTalentPage(onClose: () => void): void {
  const mask = openModal({ closable: true, onEsc: () => done() });
  const box = el('div', 'hd-dialog hd-tdtalent', undefined, mask);
  const done = (): void => {
    mask.remove();
    onClose();
  };
  const render = (): void => {
    box.textContent = '';
    const p = app.profile;
    const picks = tdTalentPicks(p);
    const points = tdTalentPoints(p);
    const left = points - talentSpent(picks);
    el('h2', '', '海图天赋', box);
    el('p', 'hd-sub', `还剩 ${left} / ${points} 点：守岛每 6 星、每 3 枚老兵徽各 1 点；只管战役和海盗来袭，重置免费`, box);
    const grid = el('div', 'hd-tdtalent-grid', undefined, box);
    const save = (ids: string[]): void => {
      const r = setTdTalent(app.profile, ids);
      if (!r.ok) {
        toast(r.error === 'no_points' ? '点数不够' : '要先点同一列上面那格');
        return;
      }
      app.commit(r.value);
      render();
    };
    for (const col of TD_TALENT_COLS) {
      const c = el('div', 'hd-tdtalent-col', undefined, grid);
      el('b', 'hd-tdtalent-head', TD_TALENT_COL_NAME[col], c);
      for (const d of TD_TALENTS.filter((t) => t.col === col)) {
        const have = picks.find((id) => talentCell(id)?.def.id === d.id);
        const prevOk = d.row === 1 || picks.some((id) => talentCell(id)?.def.id === `${col}${d.row - 1}`);
        const cell = el('button', `hd-tdtalent-cell${have ? ' on' : ''}${!have && (!prevOk || left < d.row) ? ' na' : ''}`, undefined, c);
        cell.type = 'button';
        const focus = have ? talentCell(have)?.focus : undefined;
        el('b', '', focus ? `${d.name}：${BUILDINGS[focus].name}` : d.name, cell);
        el('span', '', d.desc, cell);
        el('small', 'hd-n', `${d.row} 点`, cell);
        cell.addEventListener('click', () => {
          const rest = picks.filter((id) => talentCell(id)?.def.col !== col || (talentCell(id)?.def.row ?? 0) < d.row);
          if (d.id === 'tower4') {
            // 偏爱：轮换能造的塔，轮完一圈取消
            const kinds: TdTowerKind[] = tdUnlockedTowers(app.profile);
            const i = focus ? kinds.indexOf(focus) + 1 : 0;
            save(i < kinds.length ? [...rest, `tower4:${kinds[i]}`] : rest);
            return;
          }
          save(have ? rest : [...picks, d.id]);
        });
      }
    }
    const btns = el('div', 'hd-td-btns', undefined, box);
    button('全部重置', 'hd-btn-wood', () => save([]), btns).disabled = picks.length === 0;
    button('好了', 'hd-btn-gold', done, btns);
  };
  render();
}
