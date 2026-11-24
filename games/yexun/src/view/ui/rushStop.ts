/**
 * 连战驿站（docs/design-play.md 2.5 第 5 节、第 12 节第 4 条）：w.menu = 'stop' 时弹出，一个面板三种内容——
 * 商店（w.stopGoods 一格一格，买 Pick.Buy + i，离开 Pick.Leave）、事件（w.stopChoices 每项一个按钮，Pick.Event + i）、
 * 休整（回血 Pick.Rest，或某件法器 +2 级 Pick.Rest + 1 + j）。顶上纸钱和血。只读 World，买不买得起、效果都由核心判。
 */
import { EVENT_FX, RUSH, RUSH_EVENTS, RUSH_RELICS } from '../../content/rush.ts';
import { MAX_WEAPON_LEVEL, WEAPONS } from '../../content/weapons.ts';
import type { RushGood } from '../../core/rush.ts';
import { Pick, type World } from '../../core/state.ts';
import { rushIcon } from '../art/sprites-selicons.ts';
import { describe } from './cards.ts';
import './rushMenu.css';
import { esc } from './screens/shared.ts';

/** 卡的小标：稀有、珍品的 describe 已带前缀（cards.ts rushTag），普通的这里补上 */
const tierText = (tier: number, tag: string): string => (!tag || tier > 1 ? tag : `普通 · ${tag}`);

export class RushStopPanel {
  private readonly root: HTMLDivElement;
  private readonly icon: (k: string, px?: number) => string;
  private onPick: ((code: number) => void) | null = null;
  /** 数字键按角标选（商店的货、休整的两边、事件选项前都写着 1、2…）；商店回车 = 离开，开打（空格是技能键，不占） */
  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.onPick || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const leave = e.key === 'Enter';
    const n = Number(e.key);
    const el = leave
      ? this.root.querySelector<HTMLElement>(`[data-c="${Pick.Leave}"]`)
      : Number.isInteger(n) && n >= 1 && n <= 9
        ? this.root.querySelector<HTMLElement>(`[data-k="${n}"]`)
        : null;
    if (!el || el.hasAttribute('disabled')) return;
    e.preventDefault();
    this.pick(Number(el.dataset.c));
  };

  constructor(parent: HTMLElement, icon: (k: string, px?: number) => string) {
    this.icon = icon;
    this.root = document.createElement('div');
    this.root.className = 'yx-rushmenu yx-rushstop';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (el && !el.hasAttribute('disabled')) this.pick(Number(el.dataset.c));
    });
    window.addEventListener('keydown', this.onKey);
  }

  get open(): boolean {
    return this.onPick !== null;
  }

  /** 局结束（认输、倒下）时收起，不留在结算页底下 */
  close(): void {
    this.onPick = null;
    this.root.style.display = 'none';
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  private good(w: World, g: RushGood, i: number): string {
    const full = w.hp >= w.stats.hpMax;
    let icon = 'coin';
    let pic = '';
    let name = '';
    let text = '';
    let cls = '';
    let fx = '';
    if (g.kind === 'card' && g.card) {
      const v = describe(w, g.card);
      icon = v.icon;
      name = v.name;
      // 买了以后等级已经变了，不再按新等级预览下一级
      text = g.sold ? '已收下' : tierText(g.card.tier ?? 1, v.tag);
      // 法器、被动也写一句干什么用（试玩 11-23：只写「道袍 · 普通 · 新」看不出买了有什么用）
      if (!g.sold) fx = `<small class="fx">${esc(v.text)}</small>`;
      cls = `t${g.card.tier ?? 1}`;
    } else if (g.kind === 'relic' && g.relic) {
      name = RUSH_RELICS[g.relic].name;
      text = RUSH_RELICS[g.relic].text;
      cls = 'relic';
    } else if (g.kind === 'heal') {
      icon = 'bun';
      name = '回血';
      text = full ? '血满了' : `回 ${Math.round(RUSH.shopHeal * 100)}% 血`;
    } else if (g.kind === 'reroll') {
      pic = rushIcon('reroll');
      name = '重抽 +1';
      text = `现在 ${w.rerolls} 次`;
    } else {
      pic = rushIcon('ban');
      name = '放逐 +1';
      text = `现在 ${w.bans} 次`;
    }
    const poor = w.rushCoins < g.price;
    if (g.kind === 'relic' && g.relic) pic = rushIcon(g.relic);
    const img = pic ? `<img class="seal" alt="" src="${pic}">` : `<img alt="" src="${this.icon(icon, 64)}">`;
    // 满血的回血核心不卖（rush-flow buy），这里灰掉
    const off = g.sold || poor || (g.kind === 'heal' && full);
    return `<button type="button" class="yx-rs-good ${cls}${g.sold ? ' sold' : ''}" data-c="${Pick.Buy + i}" data-k="${i + 1}"${off ? ' disabled' : ''}><i class="yx-rs-key">${i + 1}</i>${img}<b>${esc(name)}</b><small>${esc(text)}</small>${fx}<span class="price">${g.sold ? '买了' : `纸钱 ${g.price}`}</span></button>`;
  }

  show(w: World, onPick: (code: number) => void): void {
    this.onPick = onPick;
    let title = '';
    let sub = '';
    let body = '';
    if (w.stop === 'shop') {
      title = '商店';
      sub = '每样买一次，买完点离开';
      body = `<div class="yx-rs-goods">${w.stopGoods.map((g, i) => this.good(w, g, i)).join('')}</div><div class="yx-rs-row"><button type="button" class="yx-big" data-c="${Pick.Leave}"><i class="yx-rs-key">回车</i>离开，开打</button></div>`;
    } else if (w.stop === 'rest') {
      title = '休整';
      sub = '二选一';
      const ws = w.weapons
        .map((o, j) => {
          const off = o.evolved || o.level >= MAX_WEAPON_LEVEL;
          return `<button type="button" class="yx-rs-w" data-c="${Pick.Rest + 1 + j}" data-k="${j + 2}"${off ? ' disabled' : ''}><i class="yx-rs-key">${j + 2}</i><img alt="" src="${this.icon(WEAPONS[o.id].icon, 64)}"><b>${esc(WEAPONS[o.id].name)}</b><small>${off ? '升满了' : `${o.level} → ${Math.min(MAX_WEAPON_LEVEL, o.level + RUSH.restLevels)} 级`}</small></button>`;
        })
        .join('');
      // 满血还睡就白丢了练法器（试玩 11-23）；法器全升满时留着能点，不然没得选
      const full = w.hp >= w.stats.hpMax && w.weapons.some((o) => !o.evolved && o.level < MAX_WEAPON_LEVEL);
      body =
        `<div class="yx-rs-rest"><button type="button" class="yx-rs-heal" data-c="${Pick.Rest}" data-k="1"${full ? ' disabled' : ''}><i class="yx-rs-key">1</i><img alt="" src="${this.icon('bun', 64)}"><b>睡一觉</b><small>${full ? '血是满的，练法器吧' : `回 ${Math.round(RUSH.restHeal * 100)}% 血`}</small></button>` +
        `<div class="yx-rs-train"><h4>或者练一件法器 +${RUSH.restLevels} 级</h4><div class="yx-rs-ws">${ws}</div></div></div>`;
    } else if (w.stop === 'event' && w.stopEvent) {
      const ev = RUSH_EVENTS[w.stopEvent];
      title = ev.name;
      sub = ev.text;
      const opts = w.stopChoices
        .map((c, i) => {
          const text = c.trade ? `把${WEAPONS[c.trade.from].name}换成${WEAPONS[c.trade.to].name}（同级）` : (RUSH_EVENTS[c.event].options[c.option] ?? '离开');
          // 押不起就灰掉（核心不收），免得点了只当离开
          const off = c.event === 'gamble' && c.option === 0 && w.rushCoins < EVENT_FX.gambleBet;
          return `<button type="button" class="yx-rs-opt" data-c="${Pick.Event + i}" data-k="${i + 1}"${off ? ' disabled' : ''}><i>${i + 1}</i>${esc(text)}${off ? '（纸钱不够）' : ''}</button>`;
        })
        .join('');
      body = `<div class="yx-rs-opts">${opts}</div>`;
    }
    this.root.innerHTML =
      '<div class="yx-rushmenu-panel">' +
      `<div class="yx-rushmenu-head"><b class="yx-brush">${esc(title)}</b><span>${esc(sub)}</span><em>纸钱 ${w.rushCoins} · 血 ${Math.ceil(Math.max(0, w.hp))}/${Math.round(w.stats.hpMax)}</em></div>` +
      body +
      '</div>';
    this.root.style.display = '';
  }

  private pick(code: number): void {
    if (!this.onPick) return;
    const cb = this.onPick;
    this.onPick = null;
    this.root.style.display = 'none';
    cb(code);
  }
}
