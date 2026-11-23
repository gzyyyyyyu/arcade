/**
 * 首领连战的连战页 = 入口 + 配装（docs/design-play.md 2.5）：每日 / 自由切换、选角色、三套一键推荐、自己配（起手、第二件、心法、被动）、
 * 配装点、咒、危险档（自由才有）、今天的 10 只首领 + 终局、本机最好、开始。
 * 合法性和点数全按核心（core/rush.ts loadoutOk / loadoutCost）；这里只画和改选择，点「开始」把选好的交给调用方开局。
 * 竖屏一屏放不下咒的六个开关：点「咒」在同一块换成咒页（换页，不是折叠）。
 */
import { SCHOOLS, type SchoolId } from '../../content/guide.ts';
import { CHARACTERS, type CharacterId } from '../../content/meta.ts';
import { mainSchools, POOL_START } from '../../content/pools.ts';
import { MAX_RUSH_HEXES, RUSH, RUSH_FOES, RUSH_HEX_IDS, RUSH_HEXES, RUSH_TOTAL, RUSH_WEAPON_COST, type RushHexId } from '../../content/rush.ts';
import { DANGERS, type Danger } from '../../content/waves.ts';
import { PASSIVES, WEAPONS, type PassiveId, type WeaponId } from '../../content/weapons.ts';
import { LOADOUT, loadoutCost, loadoutOk, loadoutPassives, loadoutWeapons, rushPresets, type RushLoadout, type RushRoute } from '../../core/rush.ts';
import { faceKey } from '../art/heroes.ts';
import { closeModal, modalChrome, openModal } from './modal.ts';
import './rushIntro.css';
import { esc, LOCK_SVG } from './screens/shared.ts';

export interface RushIntroView {
  date: string;
  /** 今天每日连战的路线（看今天的 10 只首领） */
  daily: RushRoute;
  /** 本机每日今天最好、自由各危险档最好（写好的一句，没打过 null） */
  bestDaily: string | null;
  bestFree: (danger: Danger) => string | null;
  /** 解锁了的角色（没解锁的画锁、点不了） */
  open: (c: CharacterId) => boolean;
  /** 上次的选择（本次打开页面内记着，不进存储） */
  last: RushStart | null;
  /** 自由连战能选到的最高危险档（解锁到哪档；连战最多 4） */
  maxDanger: Danger;
}

export interface RushStart {
  free: boolean;
  loadout: RushLoadout;
  hexes: readonly RushHexId[];
  /** 每日固定 2，自由可选 */
  danger: Danger;
}

export interface RushIntroOptions {
  onStart(s: RushStart): void;
  onClose(): void;
}

const DAILY_DANGER = 2 as Danger;
const FREE_MAX = 4;
const PRESET_NAMES = ['稳', '猛', '双'] as const;
const PRESET_TEXT = ['起手件 + 防身被动', '主修头号件 + 攻击被动', '两件法器 + 被动'] as const;
const CHARS_ALL = Object.keys(CHARACTERS) as CharacterId[];

export class RushIntro {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly inner: HTMLDivElement;
  private readonly icon: (k: string, px?: number) => string;
  private readonly opts: RushIntroOptions;
  private v: RushIntroView | null = null;
  private s: RushStart = { free: false, loadout: rushPresets('xiaodao')[0], hexes: [], danger: DAILY_DANGER };
  /** 竖屏 / 矮屏横屏的咒页 */
  private hexPage = false;
  /** 配装区底部说明（点法器 / 被动 / 心法时显示名称和效果） */
  private tip: string | null = null;

  constructor(parent: HTMLElement, icon: (k: string, px?: number) => string, opts: RushIntroOptions) {
    this.icon = icon;
    this.opts = opts;
    this.root = document.createElement('div');
    this.root.className = 'yx-screen yx-rushintro-layer';
    this.root.style.display = 'none';
    this.panel = document.createElement('div');
    this.panel.className = 'yx-panel yx-rushintro';
    this.inner = document.createElement('div');
    this.inner.className = 'yx-ri-inner';
    this.panel.appendChild(this.inner);
    this.root.appendChild(this.panel);
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  private clampDanger(d: Danger): Danger {
    return this.v ? (Math.min(d, this.v.maxDanger) as Danger) : d;
  }

  show(v: RushIntroView): void {
    this.v = v;
    const last = v.last;
    const base = last && v.open(last.loadout.character) && loadoutOk(last.loadout) ? { ...last } : { free: false, loadout: rushPresets('xiaodao')[0], hexes: [], danger: DAILY_DANGER };
    this.s = { ...base, danger: Math.min(base.danger, v.maxDanger) as Danger };
    this.hexPage = false;
    this.tip = null;
    this.render();
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

  private set(l: RushLoadout): void {
    if (!loadoutOk(l)) return;
    this.s = { ...this.s, loadout: l };
    this.render();
  }

  private onClick(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el || el.hasAttribute('disabled')) return;
    const a = el.dataset.a!;
    const val = el.dataset.v ?? '';
    const l = this.s.loadout;
    if (a === 'close') return this.close();
    if (a === 'go') {
      if (!loadoutOk(l)) return;
      this.hide();
      this.opts.onStart({ ...this.s, danger: this.s.free ? this.clampDanger(this.s.danger) : DAILY_DANGER });
      return;
    }
    if (a === 'mode') {
      const free = val === 'free';
      this.s = { ...this.s, free, danger: free ? this.clampDanger(this.s.danger) : this.s.danger };
      return this.render();
    }
    if (a === 'danger') {
      const d = Number(val) as Danger;
      if (this.v && d > this.v.maxDanger) return;
      this.s = { ...this.s, danger: d };
      return this.render();
    }
    if (a === 'hexpage') {
      this.hexPage = !this.hexPage;
      return this.render();
    }
    if (a === 'hex') {
      const id = val as RushHexId;
      const on = this.s.hexes.includes(id);
      if (!on && this.s.hexes.length >= MAX_RUSH_HEXES) return;
      this.s = { ...this.s, hexes: on ? this.s.hexes.filter((h) => h !== id) : RUSH_HEX_IDS.filter((h) => h === id || this.s.hexes.includes(h)) };
      return this.render();
    }
    if (a === 'char') {
      const c = val as CharacterId;
      if (!this.v?.open(c)) return;
      this.tip = null;
      return this.set(rushPresets(c)[0]);
    }
    if (a === 'preset') {
      this.tip = null;
      return this.set(rushPresets(l.character)[Number(val)]!);
    }
    if (a === 'xinfa') {
      const x = val as SchoolId;
      const ws = loadoutWeapons(l.character, x);
      const start = ws.includes(l.start) ? l.start : POOL_START[l.character];
      const second = l.second && ws.includes(l.second) && l.second !== start ? l.second : undefined;
      const next: RushLoadout = { character: l.character, start, xinfa: x, passives: l.passives };
      if (second) next.second = second;
      this.tip = `${SCHOOLS[x].name}：${SCHOOLS[x].brief}`;
      return this.set(next);
    }
    if (a === 'start') {
      const id = val as WeaponId;
      const next: RushLoadout = { ...l, start: id };
      if (next.second === id) delete next.second;
      this.tip = `${WEAPONS[id].name}：${WEAPONS[id].desc}`;
      return this.set(next);
    }
    if (a === 'second') {
      const id = val as WeaponId;
      const next: RushLoadout = { ...l };
      if (l.second === id) delete next.second;
      else next.second = id;
      this.tip = `${WEAPONS[id].name}：${WEAPONS[id].desc}`;
      return this.set(next);
    }
    if (a === 'passive') {
      // 点一下升一级，到顶（或点数不够）再点回 0
      const id = val as PassiveId;
      const cur = l.passives.find((p) => p.id === id)?.level ?? 0;
      const rest = l.passives.filter((p) => p.id !== id);
      const up = cur + 1;
      let next: RushLoadout = { ...l, passives: up <= LOADOUT.passiveMax ? [...rest, { id, level: up as 1 | 2 }] : rest };
      if (!loadoutOk(next)) next = { ...l, passives: rest };
      const lv = next.passives.find((p) => p.id === id)?.level ?? 0;
      this.tip = `${PASSIVES[id].name}${lv ? `（Lv${lv}）` : ''}：${PASSIVES[id].text}`;
      return this.set(next);
    }
  }

  private render(): void {
    const v = this.v;
    if (!v) return;
    const { free, loadout: l, hexes } = this.s;
    const cost = loadoutCost(l);
    const spare = Math.max(0, RUSH.budget - cost);
    const chars = CHARS_ALL.map((c) => {
      const open = v.open(c);
      return `<button type="button" class="yx-ri-char${c === l.character ? ' on' : ''}" data-a="char" data-v="${c}"${open ? '' : ' disabled'} title="${esc(CHARACTERS[c].name)}"><img alt="" src="${this.icon(faceKey(c), 64)}"><span>${esc(CHARACTERS[c].name)}</span>${open ? '' : LOCK_SVG}</button>`;
    }).join('');
    const presets = rushPresets(l.character)
      .map((p, i) => {
        const on = JSON.stringify(p) === JSON.stringify(l);
        return `<button type="button" class="yx-ri-preset${on ? ' on' : ''}" data-a="preset" data-v="${i}"><b class="yx-brush">${PRESET_NAMES[i]}</b><img alt="" src="${this.icon(WEAPONS[p.start].icon, 48)}"><small>${PRESET_TEXT[i]}</small></button>`;
      })
      .join('');
    const ws = loadoutWeapons(l.character, l.xinfa);
    const wcost = (id: WeaponId): number => loadoutCost({ character: l.character, start: id, xinfa: l.xinfa, passives: [] });
    const startRow = ws
      .map((id) => {
        const next: RushLoadout = { ...l, start: id };
        if (next.second === id) delete next.second;
        const ok = loadoutOk(next);
        return `<button type="button" class="yx-ri-w${id === l.start ? ' on' : ''}" data-a="start" data-v="${id}"${ok || id === l.start ? '' : ' disabled'} title="${esc(WEAPONS[id].name)}"><img alt="" src="${this.icon(WEAPONS[id].icon, 48)}"><span>${esc(WEAPONS[id].name)}</span><i>${wcost(id)}</i></button>`;
      })
      .join('');
    const secondRow = ws
      .filter((id) => id !== l.start)
      .map((id) => {
        const on = l.second === id;
        const ok = on || loadoutOk({ ...l, second: id });
        return `<button type="button" class="yx-ri-w${on ? ' on' : ''}" data-a="second" data-v="${id}"${ok ? '' : ' disabled'} title="${esc(WEAPONS[id].name)}"><img alt="" src="${this.icon(WEAPONS[id].icon, 48)}"><span>${esc(WEAPONS[id].name)}</span><i>${RUSH_WEAPON_COST.second}</i></button>`;
      })
      .join('');
    const xinfa = mainSchools(l.character)
      .map((x) => `<button type="button" class="yx-ri-x${x === l.xinfa ? ' on' : ''}" data-a="xinfa" data-v="${x}" title="${esc(SCHOOLS[x].brief)}">${esc(SCHOOLS[x].name)}</button>`)
      .join('');
    const passives = loadoutPassives(l.character)
      .map((id) => {
        const lv = l.passives.find((p) => p.id === id)?.level ?? 0;
        const can = lv > 0 || loadoutOk({ ...l, passives: [...l.passives, { id, level: 1 }] });
        return `<button type="button" class="yx-ri-p${lv ? ' on' : ''}" data-a="passive" data-v="${id}"${can ? '' : ' disabled'} title="${esc(PASSIVES[id].name)}：${esc(PASSIVES[id].text)}"><img alt="" src="${this.icon(PASSIVES[id].icon, 48)}"><i>${lv ? `Lv${lv}` : '+'}</i></button>`;
      })
      .join('');
    const pips = Array.from({ length: RUSH.budget }, (_, i) => `<i${i < cost ? ' class="on"' : ''}></i>`).join('');
    const hexBtns = RUSH_HEX_IDS.map((h) => {
      const on = hexes.includes(h);
      const off = !on && hexes.length >= MAX_RUSH_HEXES;
      return `<button type="button" class="yx-ri-hex${on ? ' on' : ''}" data-a="hex" data-v="${h}"${off ? ' disabled' : ''}><b class="yx-brush">${RUSH_HEXES[h].name}</b><small><span class="yx-ri-hex-fx">${esc(RUSH_HEXES[h].text)}</span><span class="yx-ri-hex-coin">铜钱 +${Math.round(RUSH_HEXES[h].coins * 100)}%</span></small></button>`;
    }).join('');
    const curDanger = this.clampDanger(this.s.danger);
    const dangers = free
      ? `<div class="yx-ri-danger">${Array.from({ length: FREE_MAX + 1 }, (_, d) => {
          const off = d > v.maxDanger;
          return `<button type="button" class="${!off && d === curDanger ? 'on' : ''}" data-a="danger" data-v="${d}"${off ? ' disabled' : ''}>${d}</button>`;
        }).join('')}<span>${esc(DANGERS[curDanger].name)}</span></div>`
      : '';
    const foes = free
      ? `<p class="yx-ri-foes free">首领、路线开局随机，一共 ${RUSH_TOTAL} 只</p>`
      : `<ol class="yx-ri-foes">${v.daily.foes.map((f, i) => `<li title="${esc(RUSH_FOES[f].name)}"><img alt="${esc(RUSH_FOES[f].name)}" src="${this.icon(RUSH_FOES[f].kinds[0]!, 48)}"><i>${i + 1}</i></li>`).join('')}<li class="last" title="终局"><b>?</b></li></ol>`;
    const best = free ? v.bestFree(curDanger) : v.bestDaily;
    const hexLabel = hexes.length ? hexes.map((h) => RUSH_HEXES[h].name).join(' ') : '不带';
    const tipText = this.tip ?? '点法器或被动看名称和效果';
    this.panel.classList.toggle('hexpage', this.hexPage);
    this.inner.innerHTML =
      `<div class="yx-ri-top"><b class="yx-brush">连战</b><div class="yx-ri-mode"><button type="button" data-a="mode" data-v="daily" class="${free ? '' : 'on'}">每日 · ${esc(v.date.slice(5))}</button><button type="button" data-a="mode" data-v="free" class="${free ? 'on' : ''}">自由</button></div>` +
      `<em>${free ? '随机种子，危险自己选' : '今天人人同一张路线图 · 危险 2'}</em></div>` +
      '<div class="yx-ri-body">' +
      `<section class="yx-ri-chars">${chars}</section>` +
      '<section class="yx-ri-build">' +
      `<div class="yx-ri-presets">${presets}</div>` +
      `<div class="yx-ri-line"><h4>心法</h4><div class="yx-ri-xs">${xinfa}</div></div>` +
      `<div class="yx-ri-line"><h4>起手 · ${LOADOUT.startLevel} 级</h4><div class="yx-ri-ws">${startRow}</div></div>` +
      `<div class="yx-ri-line"><h4>第二件 · ${LOADOUT.secondLevel} 级</h4><div class="yx-ri-ws">${secondRow}</div></div>` +
      `<div class="yx-ri-line"><h4>被动 · 最多 ${LOADOUT.passives} 件</h4><div class="yx-ri-ps">${passives}</div></div>` +
      `<p class="yx-ri-tip${this.tip ? ' on' : ''}">${esc(tipText)}</p>` +
      '</section>' +
      '<section class="yx-ri-side">' +
      `<div class="yx-ri-cost"><span>配装点 <b>${cost} / ${RUSH.budget}</b></span><span class="yx-ri-pips">${pips}</span><small>${spare ? `剩 ${spare} 点 = 多 ${spare} 次重抽` : '点数用完了'}</small></div>` +
      `<button type="button" class="yx-ri-hexbtn" data-a="hexpage">咒：${esc(hexLabel)}</button>` +
      `<div class="yx-ri-hexes"><h4>咒 · 最多 ${MAX_RUSH_HEXES} 条，更难、多给铜钱</h4>${hexBtns}<button type="button" class="yx-ri-hexback" data-a="hexpage">好了</button></div>` +
      dangers +
      foes +
      `<p class="yx-ri-best">${best ? `本机最好：${esc(best)}` : free ? '这一档还没打过' : '今天还没打过'}</p>` +
      `<div class="yx-ri-go"><button type="button" class="yx-big ghost" data-a="close">返回</button><button type="button" class="yx-big" data-a="go"${loadoutOk(l) ? '' : ' disabled'}>开始</button></div>` +
      '</section></div>';
    modalChrome(this.root);
  }
}
