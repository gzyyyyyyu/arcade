/**
 * 新手指引的页面这一头：src/guide.ts 管内容和走到哪了，view/coach.ts 管画面（docs/features.md 13.8）。
 */
import { CATEGORY_NAMES, categoryOf } from '../core/eval.ts';
import type { View } from '../core/view.ts';
import { endHint, finishWalk, HINT_TEXT, parseGuide, see, seeEnd, skipAll, stepsFor, type GuideState, type Target } from '../guide.ts';
import { ME } from '../solo.ts';
import { KEYS, readJson, writeJson } from '../store.ts';
import { hint, walk } from '../view/coach.ts';
import type { App } from './state.ts';
import { must } from '../must.ts';

export function createGuide(c: App) {
  const f = c.fn;
  const { stage, tableView, bar, betweenBar } = c.ui;
  let guideSt: GuideState | null = null;
  let walking = false;

  /** 状态懒读：云存档那一份要等 cloud 建好；旧版三页提示看过的老玩家算走完 */
  const guideNow = (): GuideState => (guideSt ??= parseGuide(readJson(KEYS.guide), c.cloud.stats().tips));

  function setGuide(g: GuideState): void {
    guideSt = g;
    writeJson(KEYS.guide, g);
    // 换设备也算看过（云存档的 tips 标记原本就是这个意思）
    if (g.done && !c.cloud.stats().tips) c.cloud.update((s) => ({ ...s, tips: true }));
  }

  /** 指引指的东西在屏幕上的位置；量不到就是 null（说明框居中讲） */
  function guideRect(t: Target): DOMRect | null {
    if (t === 'actions') {
      const r = bar.root.getBoundingClientRect();
      return bar.root.classList.contains('on') && r.width > 0 ? r : null;
    }
    return t ? tableView.guideRect(t) : null;
  }

  /** 走一遍：第一次轮到我出手时自动出（first），或点牌桌上的"?"、大厅的"怎么玩" */
  async function walkthrough(first = false): Promise<void> {
    if (walking || !stage.classList.contains('at-table')) return;
    walking = true;
    const r = await walk(stepsFor(matchMedia('(hover: none), (pointer: coarse)').matches, first), guideRect);
    walking = false;
    if (r === 'done') setGuide(finishWalk(guideNow()));
    else if (r === 'skip') setGuide(skipAll());
    // 单机轮到我的时候走完了：回到正常的出手
    f.refresh();
  }

  /** 单机轮到我了，指引还没走过：先走一遍 */
  function guideTurn(v: View): void {
    if (walking || c.asking || c.animating > 0 || v.toAct !== ME || !v.legal) return;
    if (guideNow().done) return potHint(v);
    void walkthrough(true);
  }

  /** 走完之后第一次翻出公共牌轮到我：指一下底池 */
  function potHint(v: View): void {
    const g = guideNow();
    if (!g.done || g.seen.includes('pot') || walking || c.asking || c.animating > 0 || v.toAct !== ME || !v.legal || !v.board.length) return;
    setGuide(see(g, 'pot'));
    hint(HINT_TEXT.pot, () => tableView.guideRect('pot'), () => [bar.root.getBoundingClientRect()]);
  }

  /** 一手打完停着：第一次讲结果条在哪，第一次摊牌讲为什么他赢 */
  function guideEnd(v: View): void {
    const r = v.lastHand;
    if (!r || walking || c.animating > 0 || c.asking) return;
    const id = endHint(guideNow(), !r.byFold);
    if (!id) return;
    let text = HINT_TEXT.result;
    let kind = id;
    if (id === 'showdown') {
      const w = r.pots[0]?.winners[0]?.seat;
      const sh = r.shown.find((x) => x.seat === w);
      if (w === undefined || !sh) kind = 'result';
      else text = HINT_TEXT.showdown.replace('{who}', f.nameAt(v, w, ME)).replace('{kind}', must(CATEGORY_NAMES[categoryOf(sh.value)], '牌型名表覆盖每个牌型'));
    }
    setGuide(seeEnd(guideNow(), kind));
    hint(text, () => tableView.guideRect('result'), () => [betweenBar.getBoundingClientRect(), bar.root.getBoundingClientRect()]);
  }

  /** 第一次点"加注"展开滑杆 */
  function raiseHint(): void {
    if (walking || guideNow().seen.includes('raise')) return;
    setGuide(see(guideNow(), 'raise'));
    // 竖屏上提示放在操作区上面正好压着自己的底牌，加注时最要看清的就是它
    hint(HINT_TEXT.raise, () => bar.root.getBoundingClientRect(), () => [tableView.guideRect('hole')]);
  }

  return { setGuide, walkthrough, guideTurn, guideEnd, raiseHint };
}
