/**
 * 首领连战开局前的「今日连战」卡（DESIGN.md 2.5）：今天的图、流派和给好的构筑、9 只关底按上场顺序、怎么玩三句、本机今天最好。
 * 点「开始」才开局（以前点主页「连战」直接开打，不知道今天打什么）。构筑和关卡由调用方按当天种子算好传进来，这里只画。
 */
import { ENEMY_BY_KIND } from '../../content/enemies.ts';
import { SCHOOLS } from '../../content/guide.ts';
import { MAPS, type MapId } from '../../content/maps.ts';
import { RUSH } from '../../content/rush.ts';
import { PASSIVES, WEAPONS } from '../../content/weapons.ts';
import type { RushPlan } from '../../core/rush.ts';
import { closeModal, openModal } from './modal.ts';
import './rushIntro.css';
import { esc } from './screens/shared.ts';

export interface RushIntroView {
  date: string;
  map: MapId;
  plan: RushPlan;
  /** 本机今天最好（写好的一句，没打过是 null） */
  best: string | null;
}

export interface RushIntroOptions {
  onStart(): void;
  onClose(): void;
}

export class RushIntro {
  private readonly root: HTMLDivElement;
  private readonly icon: (k: string) => string;
  private readonly opts: RushIntroOptions;

  constructor(parent: HTMLElement, icon: (k: string) => string, opts: RushIntroOptions) {
    this.icon = icon;
    this.opts = opts;
    this.root = document.createElement('div');
    this.root.className = 'yx-screen yx-rushintro-layer';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  show(v: RushIntroView): void {
    const { plan } = v;
    const school = SCHOOLS[plan.school];
    const gear = [
      ...plan.weapons.map((o) => {
        const def = WEAPONS[o.id];
        const evo = o.evolved && def.evolve;
        return `<li><img alt="" src="${this.icon(evo ? def.evolve!.icon : def.icon)}"><b>${esc(evo ? def.evolve!.name : def.name)}</b><small>${evo ? '已进化' : `Lv ${o.level}`}</small></li>`;
      }),
      ...plan.passives.map((p) => `<li class="p"><img alt="" src="${this.icon(PASSIVES[p.id].icon)}"><b>${esc(PASSIVES[p.id].name)}</b><small>Lv ${p.level}</small></li>`),
    ].join('');
    const stages = plan.stages
      .map((st, i) => `<li${i === plan.stages.length - 1 ? ' class="last"' : ''}><i>${i + 1}</i>${st.map((k) => esc(ENEMY_BY_KIND[k].name)).join(' + ')}</li>`)
      .join('');
    this.root.innerHTML =
      '<div class="yx-panel yx-rushintro">' +
      `<div class="yx-panel-head"><b class="yx-brush">今日连战</b><em>${esc(v.date)} · ${esc(MAPS[v.map].name)} · 人人同一套</em></div>` +
      `<div class="yx-ri-body"><section class="yx-ri-build"><h3>${esc(school.name)} · ${esc(school.brief)}</h3><ul class="yx-ri-gear">${gear}</ul></section>` +
      `<section class="yx-ri-stages"><h3>${plan.total} 只关底，按顺序上</h3><ol>${stages}</ol></section></div>` +
      `<p class="yx-ri-how">限时 ${Math.round(RUSH.limit / 30 / 60)} 分钟；每清一关挑一张卡，凑齐了当场进化、合成；全清比用时，没全清比打倒几只。</p>` +
      `<p class="yx-ri-best">${v.best ? `本机今天最好：${esc(v.best)}` : '今天还没打过'}</p>` +
      '<div class="yx-row2"><button type="button" class="yx-big ghost" data-a="close">返回</button><button type="button" class="yx-big" data-a="go">开始</button></div>' +
      '</div>';
    this.root.querySelector<HTMLElement>('[data-a="close"]')!.onclick = () => this.close();
    this.root.querySelector<HTMLElement>('[data-a="go"]')!.onclick = () => {
      this.hide();
      this.opts.onStart();
    };
    this.root.style.display = '';
    openModal(this.root, () => this.close(), () => this.hide());
  }

  hide(): void {
    this.root.style.display = 'none';
    closeModal(this.root);
  }

  private close(): void {
    this.hide();
    this.opts.onClose();
  }
}
