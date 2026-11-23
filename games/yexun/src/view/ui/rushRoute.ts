/**
 * 连战路线图（docs/design-play.md 2.5、第 12 节第 2 条）：w.menu = 'route' 时弹出。
 * 顶上一条 11 格首领进度（打过的亮、当前框起、终局问号，打过的格子下写走过的图；首领名太长放不下，只进悬停提示），下面是这一列的 2–3 条路卡：
 * 地图缩略、图名、普通 / 精英、词缀印章、路过的驿站、奖励。点路卡（或按 1/2/3）把 Pick.Route + i 交给对局。只读 World，不算规则。
 */
import { MAPS } from '../../content/maps.ts';
import { RUSH, RUSH_AFFIXES, RUSH_EVENTS, RUSH_FOES } from '../../content/rush.ts';
import type { RushOption } from '../../core/rush.ts';
import { Pick, type World } from '../../core/state.ts';
import { rushIcon } from '../art/sprites-selicons.ts';
import { drawMapThumb } from '../art/terrain.ts';
import './rushMenu.css';
import { esc } from './screens/shared.ts';

const STOP_TEXT = { shop: '商店', rest: '休整', event: '事件' } as const;

/** 路卡上的奖励：挑几张、纸钱多少；精英多补一次重抽 */
function reward(o: RushOption, last: boolean): string {
  const take = o.elite || last ? RUSH.take.elite : RUSH.take.normal;
  return `挑 ${take} 张 · 纸钱 +${o.elite ? RUSH.coins.elite : RUSH.coins.normal}${o.elite ? ' · 重抽 +1' : ''}`;
}

export class RushRoutePanel {
  private readonly root: HTMLDivElement;
  private readonly icon: (k: string, px?: number) => string;
  private onPick: ((code: number) => void) | null = null;
  private n = 0;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.onPick || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key >= '1' && e.key <= String(this.n)) {
      e.preventDefault();
      this.pick(Number(e.key) - 1);
    }
  };

  constructor(parent: HTMLElement, icon: (k: string, px?: number) => string) {
    this.icon = icon;
    this.root = document.createElement('div');
    this.root.className = 'yx-rushmenu yx-rushroute';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
      if (el) this.pick(Number(el.dataset.p));
    });
    window.addEventListener('keydown', this.onKey);
  }

  get open(): boolean {
    return this.onPick !== null;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  show(w: World, onPick: (code: number) => void): void {
    const r = w.rush!;
    const k = Math.min(w.rushStage, RUSH.stages - 1);
    const col = r.layers[k]!;
    const last = k === RUSH.stages - 1;
    this.onPick = onPick;
    this.n = col.length;
    const cells = r.foes
      .map((f, i) => {
        const done = i < w.rushStage;
        const took = done ? r.layers[i]![w.rushPath[i]!] : undefined;
        const cls = done ? 'done' : i === k ? 'now' : '';
        return `<li class="${cls}" title="${esc(RUSH_FOES[f].name)}"><img alt="" src="${this.icon(RUSH_FOES[f].kinds[0]!, 48)}"><i>${i + 1}</i>${took ? `<small>${esc(MAPS[took.map].name)}</small>` : ''}</li>`;
      })
      .join('');
    const opts = col
      .map((o, i) => {
        const affix = o.affixes.map((a) => `<i class="affix" title="${esc(RUSH_AFFIXES[a].name)}：${esc(RUSH_AFFIXES[a].text)}">${RUSH_AFFIXES[a].char}</i>`).join('');
        const stop = o.stop ? `<span class="stop ${o.stop}"><img alt="" src="${rushIcon(o.stop)}">${o.stop === 'event' && o.event ? `事件 · ${esc(RUSH_EVENTS[o.event].name)}` : STOP_TEXT[o.stop]}</span>` : '<span class="stop none">直接开打</span>';
        return (
          `<button type="button" class="yx-rr-opt${o.elite ? ' elite' : ''}" data-p="${i}">` +
          `<span class="yx-rr-key">${i + 1}</span><canvas width="96" height="96" data-thumb="${o.map}"></canvas>` +
          `<span class="yx-rr-info"><b>${esc(MAPS[o.map].name)}</b><span class="yx-rr-tags"><em class="${o.elite ? 'elite' : ''}">${o.elite ? '精英' : '普通'}</em>${affix || '<small>没有词缀</small>'}</span>${stop}<small class="yx-rr-reward">${reward(o, last)}</small></span>` +
          '</button>'
        );
      })
      .join('');
    this.root.innerHTML =
      '<div class="yx-rushmenu-panel">' +
      `<div class="yx-rushmenu-head"><b class="yx-brush">第 ${k + 1} 关</b><span>${esc(RUSH_FOES[r.foes[k]!].name)} · 挑一条路</span><em>纸钱 ${w.rushCoins} · 血 ${Math.ceil(Math.max(0, w.hp))}/${Math.round(w.stats.hpMax)}</em></div>` +
      `<ol class="yx-rr-track">${cells}<li class="final" title="终局"><b>?</b><small>终局</small></li></ol>` +
      `<div class="yx-rr-opts" data-n="${col.length}">${opts}</div>` +
      '</div>';
    for (const cv of this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-thumb]')) drawMapThumb(cv, MAPS[cv.dataset.thumb as keyof typeof MAPS]);
    this.root.style.display = '';
  }

  private pick(i: number): void {
    if (!this.onPick || i < 0 || i >= this.n) return;
    const cb = this.onPick;
    this.onPick = null;
    this.root.style.display = 'none';
    cb(Pick.Route + i);
  }
}
