/** 护航的入口：海图上的"护航"卡，和点开后的选图 + 选难度页（娱乐版）。选好点"出发"交给 onGo（关卡 id = `<图>-<难度>`）。 */
import { ESCORT_DIFFS, type EscortDiff, type EscortLevel } from '../core/escorttypes.ts';
import { app } from './app.ts';
import { iconA } from './art.ts';
import { ESCORT_LEVELS, escortUnlocked } from './escortapi.ts';
import { injectEscortCss } from './escortcss.ts';
import { bestText, diffName, lockText, mapTitle, starRuleText } from './escorttext.ts';
import { mapCss } from './mapcss.ts';
import { sfx } from './audio/sfx.ts';
import { injectTdCss } from './tdcss.ts';
import { button, el, img, lockIcon, toast, uiRoot } from './ui.ts';

interface MapGroup { map: string; title: string; levels: Partial<Record<EscortDiff, EscortLevel>> }

function groups(): MapGroup[] {
  const out: MapGroup[] = [];
  for (const l of ESCORT_LEVELS) {
    let g = out.find((q) => q.map === l.map);
    if (!g) out.push((g = { map: l.map, title: mapTitle(l.name), levels: {} }));
    g.levels[l.diff] = l;
  }
  return out;
}

/** 海图上的"护航"卡：点了关掉海图、打开选图页 */
export function escortCard(onOpen: () => void, parent: HTMLElement = uiRoot()): () => void {
  mapCss();
  injectEscortCss();
  const p = app.profile;
  const best = ESCORT_LEVELS.reduce((n, l) => Math.max(n, p.escort?.stars[l.id] ?? 0), 0);
  const b = el('button', 'hd-mapcard hd-esc-card', undefined, parent);
  b.type = 'button';
  b.appendChild(img(iconA('ship'), 36));
  const t = el('span', 'hd-mc-t', undefined, b);
  el('b', '', '护航', t);
  el('small', '', '商船队 · 约 3 分钟', t);
  el('small', '', best > 0 ? `最好 ${best} 星` : '把商船平安送到港', t);
  el('span', 'hd-mc-go', '出海', b);
  b.addEventListener('click', () => {
    sfx('tap');
    onOpen();
  });
  return () => b.remove();
}

/** 选图 + 难度页；返回关闭函数 */
/** onLive 有就在「出发」旁边多一个「实盘」钮（登录了、没被 501 关掉才传，选档页在 livemore.ts） */
export function openEscortSelect(onGo: (levelId: string) => void, onClose: () => void, onLive?: () => void): () => void {
  injectTdCss();
  injectEscortCss();
  const p = app.profile;
  const gs = groups();
  const star = (id: string): number => p.escort?.stars[id] ?? 0;
  const open = (l: EscortLevel | undefined): boolean => !!l && escortUnlocked(p, l.id);
  let mi = Math.max(0, gs.findIndex((g) => ESCORT_DIFFS.some((d) => open(g.levels[d]) && star(g.levels[d]!.id) === 0)));
  let diff: EscortDiff = ESCORT_DIFFS.find((d) => open(gs[mi]?.levels[d]) && star(gs[mi]!.levels[d]!.id) === 0) ?? 'easy';

  const wrap = el('div', 'hd-tdsel hd-tdpage hd-esc-sel', undefined, uiRoot());
  const head = el('div', 'hd-tdsel-head', undefined, wrap);
  el('h2', '', '护航', head);
  el('p', 'hd-esc-sub', '商船沿航线开到港口：架塔、守住隘口，别让海盗咬沉它。', wrap);
  const maps = el('div', 'hd-esc-maps', undefined, wrap);
  const diffs = el('div', 'hd-esc-diffs', undefined, wrap);
  const info = el('div', 'hd-esc-info', undefined, wrap);
  const goRow = el('div', 'hd-esc-gorow', undefined, wrap);
  const go = button('出发', 'hd-btn-gold hd-esc-go', () => {
    const l = gs[mi]?.levels[diff];
    if (!l || !open(l)) return toast('这一关还没解锁');
    stop();
    onGo(l.id);
  }, goRow);
  if (onLive) {
    button('实盘', 'hd-btn-wood hd-esc-live', () => {
      stop();
      onLive();
    }, goRow);
  }

  const render = (): void => {
    maps.textContent = '';
    diffs.textContent = '';
    gs.forEach((g, i) => {
      const first = ESCORT_DIFFS.map((d) => g.levels[d]).find(Boolean);
      const locked = !open(first);
      const total = ESCORT_DIFFS.reduce((n, d) => n + (g.levels[d] ? star(g.levels[d]!.id) : 0), 0);
      const c = el('button', `hd-esc-map${i === mi ? ' on' : ''}${locked ? ' lock' : ''}`, undefined, maps);
      c.type = 'button';
      c.dataset.map = g.map;
      if (locked) c.appendChild(lockIcon(28));
      const t = el('span', 't', undefined, c);
      el('b', '', g.title, t);
      el('small', '', locked ? lockText(i > 0 ? (gs[i - 1]?.title ?? null) : null) : `${total} 星 / ${ESCORT_DIFFS.length * 3}`, t);
      c.addEventListener('click', () => {
        sfx('tap');
        if (locked) toast(lockText(i > 0 ? (gs[i - 1]?.title ?? null) : null));
        mi = i;
        diff = ESCORT_DIFFS.find((d) => open(g.levels[d])) ?? 'easy';
        render();
      });
    });
    const g = gs[mi];
    for (const d of ESCORT_DIFFS) {
      const l = g?.levels[d];
      const can = open(l);
      const b = el('button', `hd-esc-diff${d === diff ? ' on' : ''}`, undefined, diffs);
      b.type = 'button';
      b.dataset.diff = d;
      b.disabled = !can;
      el('b', '', diffName(d), b);
      el('small', '', can ? bestText(l ? star(l.id) : 0) : '未解锁', b);
      b.addEventListener('click', () => {
        sfx('tap');
        diff = d;
        render();
      });
    }
    const l = g?.levels[diff];
    info.textContent = '';
    if (l) {
      el('div', '', starRuleText(l.escort.stars), info);
      el('div', '', `航线 ${l.escort.route.length} 格，${l.escort.gates.length} 个隘口。点「停 / 巡航 / 冲」定船速，金币够了随时修船。`, info);
    }
    go.disabled = !open(l);
    go.textContent = open(l) ? '出发' : '未解锁';
    go.dataset.level = l?.id ?? '';
  };
  render();
  const close = button('回岛', 'hd-btn-wood hd-tdsel-close', () => {
    stop();
    onClose();
  }, uiRoot());
  function stop(): void {
    wrap.remove();
    close.remove();
  }
  return stop;
}
