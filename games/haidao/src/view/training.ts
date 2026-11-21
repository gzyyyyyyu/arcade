/**
 * 训练营的选关面板（DESIGN 16）：主寨顶栏第二行的「训练营」打开；每关一块，写开放等级 / 奖励 / 过了没有，点了直接开打。
 */
import { BUILDINGS, TROOPS } from '../content/index.ts';
import { TRAIN_LESSONS, type TrainLesson } from '../content/training.ts';
import { nextLesson, trainDone, trainOpen } from '../core/training.ts';
import { app, fmt } from './app.ts';
import { bArt, iconA, tArt } from './art.ts';
import { tutAdv } from './tutorial.ts';
import { button, el, img, lockIcon, openModal, paginate, toast } from './ui.ts';

/** 每关的小图：兵种关是那个兵，排兵关是主角兵或那座塔 */
function lessonArt(l: TrainLesson, px: number): HTMLImageElement {
  if (l.troop) return img(tArt(l.troop, 'idle'), px);
  if (l.kind === 'front') return img(tArt('brute', 'idle'), px);
  return img(bArt(l.kind === 'counter' ? 'mortar' : 'cannon', 1), px);
}

const KIND_TAG: Record<TrainLesson['kind'], string> = { troop: '兵种', front: '排兵', counter: '排兵', td: '守岛' };

export function openTraining(): void {
  tutAdv(7);
  const p = app.profile;
  const mask = openModal({ cls: 'hd-train-mask', closable: true });
  const dlg = el('div', 'hd-dialog hd-train', undefined, mask);
  button('×', 'hd-x', () => mask.remove(), dlg).title = '关掉（Esc）';
  el('h2', '', '训练营', dlg);
  const done = TRAIN_LESSONS.filter((l) => trainDone(p, l.id)).length;
  el('p', 'hd-sub', `每关一两分钟，一步一提示；第一次过关有奖励 · 已过 ${done}/${TRAIN_LESSONS.length}`, dlg);
  const grid = el('div', 'hd-train-grid', undefined, dlg);
  const nx = nextLesson(p);
  for (const l of TRAIN_LESSONS) {
    const open = trainOpen(p, l);
    const ok = trainDone(p, l.id);
    const c = el('button', `hd-train-card${ok ? ' done' : ''}${open ? '' : ' na'}${nx?.id === l.id ? ' next' : ''}${l.kind === 'troop' ? '' : ' f'}`, undefined, grid);
    c.type = 'button';
    c.appendChild(lessonArt(l, 44));
    el('small', 'hd-train-tag', KIND_TAG[l.kind], c);
    el('b', '', l.kind === 'troop' ? TROOPS[l.troop!].name : l.name, c);
    const st = el('span', 'hd-train-st', undefined, c);
    if (!open) {
      st.appendChild(lockIcon(14));
      st.append(` 主寨 ${l.hq} 级`);
    } else if (ok) st.textContent = '✓ 过了';
    else {
      st.appendChild(img(iconA('gold'), 16));
      st.append(`+${fmt(l.reward.gold)}`);
    }
    c.title = l.kind === 'counter' ? `${BUILDINGS.mortar.name}和${BUILDINGS.cannon.name}：派对的兵打对的塔` : l.name;
    c.addEventListener('click', () => {
      if (!open) return toast(`主寨 ${l.hq} 级开放`);
      mask.remove();
      app.startTrain(l.id);
    });
  }
  paginate(grid, [...grid.children] as HTMLElement[], grid, nx ? (grid.children[TRAIN_LESSONS.indexOf(nx)] as HTMLElement) : null);
}

/** 还有开放了没过的关（顶栏「训练营」的红点） */
export function trainDot(): boolean {
  return nextLesson(app.profile) !== null;
}
