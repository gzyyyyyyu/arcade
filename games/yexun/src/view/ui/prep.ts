/**
 * 开局准备（DESIGN.md 3.7、3.8、13.2）：选角色、挂咒印、买永久加成。只管画和点，规则和存档在 save.ts，状态由 main.ts 每次重新给。
 */
import { CHARACTER_POOLS } from '../../content/pools.ts';
import { reachableMerges } from '../../content/combos.ts';
import { SCHOOLS } from '../../content/guide.ts';
import { skillInfo } from './skillInfo.ts';
import { CHARACTERS, CHARACTER_IDS, CURSE_COIN_BONUS, CURSE_IDS, CURSES, MAX_CURSES, PERK_IDS, PERKS, type CharacterId, type CurseId, type PerkId } from '../../content/meta.ts';
import { WEAPONS } from '../../content/weapons.ts';
import { heroKey } from '../art/heroes.ts';
import { isZoomed } from 'arcade-kit/viewport';
import { exchangeHtml, kitsHtml, looksHtml, type ShopState } from './prepShop.ts';
import type { KitId, LookId } from '../../content/meta.ts';
import './prep.css';
import { esc, LOCK_SVG } from './screens/shared.ts';

/** 电脑大屏上弹窗的设计尺寸（逻辑像素）和占屏上限：宽 70%、高 85%（和选关页的 --k 同一思路，按可视区算放大倍数） */
const PANEL_W = 1200;
const PANEL_H = 700;
const FILL_W = 0.7;
const FILL_H = 0.85;
const K_MAX = 1.6;


export type PrepTab = 'char' | 'curse' | 'perk' | 'kit' | 'look' | 'xc';

export interface PrepState {
  coins: number;
  character: CharacterId;
  /** 每个角色：开了没有、买得到的价格 */
  chars: Record<CharacterId, { open: boolean; price?: number; progress: string }>;
  curses: CurseId[];
  cursesOpen: boolean;
  perks: Partial<Record<PerkId, number>>;
  /** 锦囊、外观、换筹码三页（prepShop.ts） */
  shop: ShopState;
}


export class Prep {
  readonly root: HTMLDivElement;
  private tab: PrepTab = 'char';
  private state: PrepState | null = null;
  /** 宽卡上看的是谁：默认出战的角色；点没解锁的小条只是看看（触屏没有悬停，解锁条件放在宽卡里），不换出战 */
  private view: CharacterId | null = null;
  onPickChar: (id: CharacterId) => void = () => undefined;
  onBuyChar: (id: CharacterId) => void = () => undefined;
  onToggleCurse: (id: CurseId) => void = () => undefined;
  onBuyPerk: (id: PerkId) => void = () => undefined;
  onRefund: () => void = () => undefined;
  onToggleKit: (id: KitId) => void = () => undefined;
  onBuyLook: (id: LookId) => void = () => undefined;
  onWearLook: (id: LookId) => void = () => undefined;
  /** 换多少筹码；切到换筹码页时 onOpenExchange 先查今天的额度 */
  onExchange: (amount: number) => void = () => undefined;
  onOpenExchange: () => void = () => undefined;
  onClose: () => void = () => undefined;

  private readonly icons: (k: string, px?: number) => string;

  constructor(parent: HTMLElement, icons: (k: string, px?: number) => string) {
    this.icons = icons;
    this.root = document.createElement('div');
    this.root.className = 'yx-screen yx-prep-layer';
    this.root.style.display = 'none';
    parent.append(this.root);
    window.addEventListener('resize', () => this.fit());
    window.visualViewport?.addEventListener('resize', () => this.fit());
    this.fit();
    this.root.addEventListener('click', (e) => {
      // 点遮罩（面板外那层）关掉，和图鉴、排行这些面板一样（试玩 11-23）
      if (e.target === this.root) return this.onClose();
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!el || el.getAttribute('aria-disabled') === 'true') return;
      const id = el.dataset.id ?? '';
      switch (el.dataset.a) {
        case 'tab':
          this.tab = el.dataset.t as PrepTab;
          this.render();
          if (this.tab === 'xc') this.onOpenExchange();
          break;
        case 'kit':
          this.onToggleKit(id as KitId);
          break;
        case 'look':
          this.onBuyLook(id as LookId);
          break;
        case 'wear':
          this.onWearLook(id as LookId);
          break;
        case 'xc':
          this.onExchange(Number(id));
          break;
        case 'char':
          this.view = null;
          this.onPickChar(id as CharacterId);
          break;
        case 'peek':
          this.view = id as CharacterId;
          this.render();
          break;
        case 'buychar':
          this.onBuyChar(id as CharacterId);
          break;
        case 'curse':
          this.onToggleCurse(id as CurseId);
          break;
        case 'perk':
          this.onBuyPerk(id as PerkId);
          break;
        case 'refund':
          this.onRefund();
          break;
        case 'close':
          this.onClose();
          break;
      }
    });
  }

  /**
   * 电脑大屏（≥1600×900）的放大倍数 --pk 和面板逻辑尺寸 --pw / --ph：k = min(宽×0.7/1200, 高×0.85/700)，限 1~1.6，取到 0.01，
   * 面板按 k 放大后宽不超 70%、高不超 85%；小屏不写，沿用 CSS 里原来的排法。双指放大着不改
   */
  private fit(): void {
    const vv = window.visualViewport;
    if (isZoomed(vv?.scale)) return;
    const w = vv?.width ?? window.innerWidth;
    const h = vv?.height ?? window.innerHeight;
    const st = this.root.style;
    if (w < 1600 || h < 900) {
      for (const k of ['--pk', '--pw', '--ph']) st.removeProperty(k);
      return;
    }
    const k = Math.max(1, Math.min(K_MAX, Math.floor(Math.min((w * FILL_W) / PANEL_W, (h * FILL_H) / PANEL_H) * 100 + 1e-6) / 100));
    st.setProperty('--pk', String(k));
    st.setProperty('--pw', `${Math.min(PANEL_W, (w * FILL_W) / k)}px`);
    st.setProperty('--ph', `${(h * FILL_H) / k}px`);
  }

  get open(): boolean {
    return this.root.style.display !== 'none';
  }

  show(tab: PrepTab, s: PrepState): void {
    this.tab = tab === 'curse' && !s.cursesOpen ? 'char' : tab;
    this.state = s;
    this.view = null;
    this.render();
    this.root.style.display = '';
    if (this.tab === 'xc') this.onOpenExchange();
  }

  /** 状态变了（买了、选了）：留在当前标签页重画 */
  update(s: PrepState): void {
    this.state = s;
    if (this.open) this.render();
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private render(): void {
    const s = this.state!;
    const tabs = (
      [
        ['char', '角色'],
        ...(s.cursesOpen ? [['curse', '咒印']] : []),
        ['perk', '加成'],
        ['kit', '锦囊'],
        ['look', '外观'],
        ['xc', '换筹码'],
      ] as [PrepTab, string][]
    )
      .map(([t, n]) => `<button type="button" class="yx-ptab${t === this.tab ? ' on' : ''}" data-a="tab" data-t="${t}">${n}</button>`)
      .join('');
    const body = this.tab === 'char' ? this.chars(s) : this.tab === 'curse' ? this.cursesHtml(s) : this.tab === 'perk' ? this.perksHtml(s) : this.tab === 'kit' ? kitsHtml(s.shop) : this.tab === 'look' ? looksHtml(s.shop) : exchangeHtml(s.shop);
    this.root.innerHTML =
      '<div class="yx-panel yx-prep">' +
      `<div class="yx-prep-head"><div class="yx-ptabs">${tabs}</div><span class="yx-pcoins"><span class="yx-coin"></span>${s.coins.toLocaleString('zh-CN')}</span>` +
      '<button type="button" class="yx-btn yx-pclose" data-a="close" aria-label="关上">✕</button></div>' +
      `<div class="yx-prep-body">${body}</div></div>`;
  }

  /** 初始数值对比条：以小道士（全 1）为基准画在 50% 处；高于基准绿、低于红，右边写百分比差。冷却取倒数（出手快慢），拾取和运气合成一根 */
  private statBars(id: CharacterId): string {
    const b = CHARACTERS[id].base;
    const rows: [string, number][] = [
      ['血量', b.hp],
      ['移速', b.speed],
      ['伤害', b.might],
      ['出手', 1 / b.cd],
      ['范围', b.area],
      ['拾取运气', b.magnet + b.luck],
    ];
    return (
      '<span class="yx-pbars">' +
      rows
        .map(([name, v]) => {
          const pct = Math.round((v - 1) * 100);
          const txt = pct === 0 ? '持平' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
          // 条满长对应 2 倍；基准在 50%，差的那一段按方向上色
          const lo = Math.max(0, Math.min(100, Math.min(v, 1) * 50));
          const hi = Math.max(0, Math.min(100, Math.max(v, 1) * 50));
          const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
          return (
            `<span class="yx-pbar ${cls}"><i class="yx-pbn">${name}</i>` +
            `<span class="yx-pbt"><span class="yx-pbf" style="width:${lo}%"></span><span class="yx-pbd" style="left:${lo}%;width:${hi - lo}%"></span></span>` +
            `<i class="yx-pbv">${txt}</i></span>`
          );
        })
        .join('') +
      '</span>'
    );
  }

  /** 角色页：左边十张固定顺序的小卡（两列五行；竖屏在上面五列两行，点哪个都不重排，只换高亮），右边（竖屏在下面）一块固定位置的详情区，写选中那位的全部信息 */
  private chars(s: PrepState): string {
    const sel = this.view && !s.chars[this.view]?.open ? this.view : s.character;
    /** 每位角色的动作：按钮上的字（选他 / 请他 / 没解锁）和点击属性，小卡和详情区共用 */
    const act = (id: CharacterId): { foot: string; attrs: string } => {
      const st = s.chars[id];
      const canBuy = !st.open && st.price !== undefined;
      const afford = canBuy && s.coins >= st.price!;
      if (st.open) return { foot: id === s.character ? '出战中' : '选他', attrs: `data-a="char" data-id="${id}"` };
      if (canBuy) {
        const foot = afford ? `<span class="yx-coin"></span>${st.price} 请他` : `<span class="yx-coin"></span>${st.price}<span class="yx-pgap">（还差 ${st.price! - s.coins} 铜钱）</span>`;
        return { foot, attrs: `data-a="buychar" data-id="${id}"${afford ? '' : ' aria-disabled="true"'}` };
      }
      return { foot: `${LOCK_SVG}<span class="yx-plt">没解锁</span>`, attrs: `data-a="peek" data-id="${id}"` };
    };
    const cards = CHARACTER_IDS.map((id) => {
      const st = s.chars[id];
      const sk = skillInfo(id);
      const a = act(id);
      const mark = st.open ? (id === s.character ? '<em class="yx-pnow">出战</em>' : '') : `<em>${a.foot}</em>`;
      return (
        // 没请的点卡先看详情（试玩 11-22：铜钱不够时点了没反应），请他在详情区的按钮上
        `<button type="button" class="yx-pchar${id === sel ? ' on' : ''}${st.open ? '' : ' locked'}${mark ? ' st' : ''}" ${st.open ? a.attrs : `data-a="peek" data-id="${id}"`}${id === sel ? ' aria-pressed="true"' : ''}>` +
        `<span class="yx-pface"><img alt="" src="${this.icons(heroKey(id), 128)}"></span>` +
        `<b>${esc(CHARACTERS[id].name)}</b><span class="yx-pcsk">${esc(sk.name)}</span>${mark}</button>`
      );
    }).join('');
    return `<div class="yx-pchars"><div class="yx-pcards">${cards}</div>${this.detail(s, sel, act(sel))}</div>`;
  }

  /** 详情区：名字、起手法器、技能（图标、完整效果、冷却）、被动、主修和法器池、数值条、小特权、台词或解锁条件、选他 / 请他的按钮 */
  private detail(s: PrepState, id: CharacterId, { foot, attrs }: { foot: string; attrs: string }): string {
    const c = CHARACTERS[id];
    const st = s.chars[id];
    const sk = skillInfo(id);
    const w = WEAPONS[c.start];
    return (
      `<section class="yx-pdet${st.open ? '' : ' locked'}" data-id="${id}">` +
      `<div class="yx-pd-id"><span class="yx-pface"><img alt="" src="${this.icons(heroKey(id), 128)}"></span>` +
      `<div><b class="yx-pd-name">${esc(c.name)}</b><span class="yx-pstart"><img alt="" src="${this.icons(w.icon)}">起手 ${esc(sk.start)}</span><span class="yx-plook">${esc(c.look)}</span></div></div>` +
      `<div class="yx-pskill"><img alt="" src="${this.icons(sk.icon, 64)}"><b>技能：${esc(sk.name)}<span class="yx-pcd">（冷却 ${sk.cd} 秒）</span></b><small>${esc(sk.detail)}</small></div>` +
      `<p class="yx-pd-perk"><b>被动：${esc(sk.perkName)}</b> ${esc(sk.perk)}</p>` +
      this.poolHtml(id) +
      this.statBars(id) +
      (c.privilege ? `<span class="yx-ppriv">小特权：${esc(c.privilege)}</span>` : '') +
      (st.open ? `<q class="yx-pline">${esc(c.line)}</q>` : `<span class="yx-pneed">${LOCK_SVG} ${esc(st.progress || c.unlock)}</span>`) +
      `<button type="button" class="yx-pd-act" ${attrs}>${foot}</button></section>`
    );
  }

  /** 主修流派、凑得出几个搭配（content/combos.ts）+ 法器池的一排小图标（只有选中的宽卡显示；池的内容见 content/pools.ts） */
  private poolHtml(id: (typeof CHARACTER_IDS)[number]): string {
    const p = CHARACTER_POOLS[id];
    const icons = p.weapons.map((w) => `<img alt="${esc(WEAPONS[w].name)}" title="${esc(WEAPONS[w].name)}" src="${this.icons(WEAPONS[w].icon)}">`).join('');
    return `<span class="yx-ppool"><b>主修 ${esc(p.schools.map((k) => SCHOOLS[k].name).join('·'))} · 能合 ${reachableMerges(id).length} 个搭配</b><span class="yx-pwl">${icons}</span></span>`;
  }

  private cursesHtml(s: PrepState): string {
    const n = s.curses.length;
    return (
      `<div class="yx-pnote">最多挂 ${MAX_CURSES} 条；每条这局的铜钱多 ${Math.round(CURSE_COIN_BONUS * 100)}%（现在 +${Math.round(n * CURSE_COIN_BONUS * 100)}%）</div>` +
      '<div class="yx-pgrid">' +
      CURSE_IDS.map((id) => {
        const on = s.curses.includes(id);
        const full = !on && n >= MAX_CURSES;
        return `<button type="button" class="yx-pcard yx-pcurse${on ? ' on' : ''}" data-a="curse" data-id="${id}"${full ? ' aria-disabled="true"' : ''}><b class="yx-brush">${esc(CURSES[id].name)}</b><p>${esc(CURSES[id].text)}</p><em>${on ? '挂上了' : full ? '已满' : '挂上'}</em></button>`;
      }).join('') +
      '</div>'
    );
  }

  private perksHtml(s: PrepState): string {
    const any = PERK_IDS.some((id) => (s.perks[id] ?? 0) > 0);
    return (
      '<div class="yx-pnote">只在娱乐里生效；随时能全退，花掉的铜钱全数还回来</div>' +
      '<div class="yx-pgrid yx-pperks">' +
      PERK_IDS.map((id) => {
        const p = PERKS[id];
        const lv = s.perks[id] ?? 0;
        const max = p.cost.length;
        const price = p.cost[lv];
        const pips = Array.from({ length: max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
        const dis = price === undefined || s.coins < price;
        return `<button type="button" class="yx-pcard yx-pperk" data-a="perk" data-id="${id}"${dis ? ' aria-disabled="true"' : ''}><b>${esc(p.name)}</b><p>${esc(p.text)}</p><span class="yx-pips">${pips}</span><em>${price === undefined ? '满了' : `<span class="yx-coin"></span>${price}`}</em></button>`;
      }).join('') +
      '</div>' +
      (any ? '<button type="button" class="yx-big ghost yx-prefund" data-a="refund">全退重配</button>' : '')
    );
  }
}
