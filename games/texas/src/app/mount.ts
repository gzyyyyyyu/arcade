/**
 * 把页面装到根节点上：建状态和骨架，把各块的函数接成 ctx.fn，接上按钮和页面事件，然后启动。
 * 各块（src/app/*）import 进来什么都不做，只在这里按顺序建。
 */
import { setSound, setVolume } from '../view/sound.ts';
import { createDaily } from './daily.ts';
import { createFun } from './fun.ts';
import { createGuide } from './guide.ts';
import { bindPage, createLobby } from './lobby.ts';
import { createOnline } from './online.ts';
import { createPuzzle } from './puzzle.ts';
import { bindShell, buildShell, createTop } from './shell.ts';
import { createState, soundOn, type App, type Fns } from './state.ts';
import { createTable, soloDeps } from './table.ts';
import { createTakeProfit } from './takeprofit.ts';
import { createTour } from './tour.ts';

export function mount(root: HTMLElement): void {
  const s = createState();
  setSound(soundOn(s));
  setVolume(s.settings.volume);
  // 各块的函数等 ctx 建好再并进来；在那之前只有按钮的回调引用它，点的那一下才取
  const fn = {} as Fns;
  const ui = buildShell(root, s, fn);
  const c: App = Object.assign(s, { ui, fn, ...soloDeps(s, fn) });
  Object.assign(
    fn,
    createTop(c),
    createLobby(c),
    createTable(c),
    createDaily(c),
    createTour(c),
    createFun(c),
    createGuide(c),
    createOnline(c),
    createTakeProfit(c),
    createPuzzle(c),
  );
  bindShell(c);
  bindPage(c);
  void fn.boot();
}
