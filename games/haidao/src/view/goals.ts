/** 每日三件小事的画面（规则在 src/core/goals.ts）：海图上一张「今日」卡，点开是三件事的进度和领奖钮 */
import { GOALS, GOAL_BOX, claimGoal, goalPicks, goalReward, goalState, goalsClaimable } from '../core/goals.ts';
import type { GoalKind } from '../core/types.ts';
import { pvpReady } from '../net/pvp.ts';
import { app, fmt } from './app.ts';
import { iconA } from './art.ts';
import { sfx } from './audio/sfx.ts';
import { dayIndex } from './meta.ts';
import { button, costRow, el, img, openModal, toast } from './ui.ts';

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  const st = el('style');
  st.textContent = `
.hd-ui .hd-goals-card { position:relative; }
.hd-ui .hd-goals-card .hd-dot { position:absolute; top:-4px; right:-4px; width:14px; height:14px; border-radius:50%; background:#e0362c; border:2px solid #fff4dc; }
.hd-ui .hd-goals h2 { margin:0 0 8px; font-size:20px; }
.hd-ui .hd-goals .hd-goal { display:flex; align-items:center; gap:8px; min-height:44px; padding:4px 0; border-bottom:1px dashed rgba(60,40,20,.25); font-size:14px; }
.hd-ui .hd-goals .hd-goal > span { flex:1 1 auto; min-width:0; }
.hd-ui .hd-goals .hd-goal small { display:block; font-size:12px; opacity:.75; }
.hd-ui .hd-goals .hd-goal .hd-btn { min-width:72px; min-height:44px; flex:0 0 auto; }
.hd-ui .hd-goals .hd-goal.done > span { opacity:.6; }
.hd-ui .hd-goals .hd-goals-foot { margin:8px 0 0; font-size:12px; opacity:.8; }
.hd-ui .hd-goals > .hd-btn-wide { width:100%; min-height:44px; margin-top:8px; }
`;
  document.head.appendChild(st);
}

const online = (): boolean => pvpReady();

/** 海图上的「今日」卡：几件做完了、有能领的挂红点；点开看三件事和领奖钮。回一个移除函数 */
export function goalsCard(parent: HTMLElement): () => void {
  style();
  const b = el('button', 'hd-mapcard hd-goals-card', undefined, parent);
  b.type = 'button';
  const fill = (): void => {
    b.textContent = '';
    const day = dayIndex();
    const s = goalState(app.profile, day);
    const picks = goalPicks(day, online());
    const done = picks.filter((k) => s.got.includes(k) || (s.prog[k] ?? 0) >= GOALS[k].need).length;
    b.appendChild(img(iconA('treasure'), 36));
    const t = el('span', 'hd-mc-t', undefined, b);
    el('b', '', `今日 ${done}/3`, t);
    el('small', '', s.got.includes(GOAL_BOX) ? '都做完了，明天再来' : '三件小事，做完开宝箱', t);
    if (goalsClaimable(app.profile, day, online()) > 0) el('span', 'hd-dot', undefined, b);
  };
  fill();
  b.addEventListener('click', () => {
    sfx('tap');
    openGoals(fill);
  });
  return () => b.remove();
}

const ERR: Record<string, string> = { full: '仓库放不下，先花掉一些再领（今天之内都能领）', got: '已经领过了', not_done: '还没做完', not_today: '今天没有这件' };

function openGoals(onChange: () => void): void {
  style();
  const mask = openModal({ closable: true });
  const box = el('div', 'hd-dialog hd-goals', undefined, mask);
  const draw = (): void => {
    box.textContent = '';
    const day = dayIndex();
    const p = app.profile;
    const s = goalState(p, day);
    const picks = goalPicks(day, online());
    el('h2', '', '今日三件小事', box);
    const take = (id: GoalKind | typeof GOAL_BOX): void => {
      const r = claimGoal(app.profile, dayIndex(), online(), id);
      if (!r.ok) {
        sfx('error');
        toast(ERR[r.error] ?? '现在领不了');
        return;
      }
      app.commit(r.value.profile);
      sfx('coin');
      const got = r.value.reward;
      const parts = [got.gold > 0 ? `${fmt(got.gold)} 金币` : '', got.wood > 0 ? `${fmt(got.wood)} 木材` : '', r.value.cosmetic ? '一件稀有收藏' : ''].filter(Boolean);
      toast(`领到 ${parts.join('、')}`);
      draw();
      onChange();
    };
    const each = goalReward(p);
    for (const k of picks) {
      const have = Math.min(GOALS[k].need, s.prog[k] ?? 0);
      const got = s.got.includes(k);
      const row = el('div', `hd-goal${got ? ' done' : ''}`, undefined, box);
      const t = el('span', '', GOALS[k].text, row);
      el('small', '', got ? '已领' : `${have}/${GOALS[k].need}`, t);
      if (!got) {
        const btn = button('领 ', 'hd-btn-gold', () => take(k), row);
        btn.appendChild(costRow(each));
        btn.disabled = have < GOALS[k].need;
      }
    }
    const all = picks.every((k) => s.got.includes(k));
    const row = el('div', `hd-goal${s.got.includes(GOAL_BOX) ? ' done' : ''}`, undefined, box);
    const t = el('span', '', '三件都领了：开宝箱', row);
    el('small', '', s.got.includes(GOAL_BOX) ? '已开' : '金币或木材，偶尔有稀有收藏', t);
    if (!s.got.includes(GOAL_BOX)) {
      const btn = button('开', 'hd-btn-gold', () => take(GOAL_BOX), row);
      btn.disabled = !all;
    }
    el('p', 'hd-goals-foot', '每天（北京时间）换三件；只给金币木材和收藏。', box);
    button('关闭', 'hd-btn-plain hd-btn-wide', () => mask.remove(), box);
  };
  draw();
}
