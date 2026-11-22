/**
 * 每周夜事的界面小件（DESIGN.md 5.8）：主页的「本周夜事」入口（点开直接开局），暂停面板和图鉴共用同一份文案。
 * 样式写在 weekly.css，限定在 .yx-menu 下，类名带 yx-m 前缀，不碰别的界面。
 */
import { weekDaysLeft, weeklyFor } from '../../online/weekly.ts';
import './weekly.css';
import { esc } from './screens/shared.ts';


/** 主页上的入口：本周夜事 · XX周 / 一句说明 · 还剩 N 天；点了由 data-a="weekly" 开局 */
export function weeklyEntry(today: string): string {
  const e = weeklyFor(today);
  if (!e) return '';
  const n = weekDaysLeft(today);
  const title = '单独开一局：本周的事件、固定的图和角色，成绩只进周榜';
  // 按逗号分段、每段不拆：竖屏折行时不把「经验」拆成两行
  const clauses = e.text.split(/(?<=，)/).map((t) => `<span>${esc(t)}</span>`).join('');
  return `<button type="button" class="yx-mweekly" data-a="weekly" title="${esc(title)}"><b>本周夜事 · ${esc(e.name)}</b><small>${clauses}<span> · 还剩 ${n} 天</span></small></button>`;
}
