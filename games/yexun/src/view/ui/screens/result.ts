import type { TreasureTier } from '../../../content/treasures.ts';
import { nightItems, type NightLog } from '../eventIcons.ts';
import { esc, mmss, layer, onAction } from './shared.ts';
import type { BuildRow } from './pause.ts';

/** 结算页上的一件宝物 */
export interface RaidItemView {
  /** 图集帧名（treasureIconKey(def.icon)），页面用 icons() 换成图 */
  icon: string;
  name: string;
  tier: TreasureTier;
  value: number;
  /** 这一局第一次收藏到（藏宝阁新点亮） */
  fresh?: boolean;
}

/** 夜探的结果（ResultView.raid 有就按夜探排版） */
export interface RaidResultView {
  outcome: 'escaped' | 'dead' | 'lost';
  /** 教学镇：死了、迷失也不丢包 */
  teach: boolean;
  /** 带出来的、丢在镇里的宝物 */
  kept: RaidItemView[];
  lost: RaidItemView[];
  /** 带出的宝物总价值（铜钱） */
  value: number;
}

export interface ResultView {
  won: boolean;
  quit: boolean;
  bossKilled: boolean;
  seconds: number;
  kills: number;
  level: number;
  coins: number;
  /** 档位那一行写什么（比如"危险 2"） */
  label: string;
  /** 每日挑战、本周夜事、连战这类固定配置的局：没有难度可换，中间的按钮写"回主页"（它本来就是回主页） */
  fixed?: boolean;
  /** 实盘：结回的那一行（结回还没回来时先写"正在结回"，回来了用 setLive 换） */
  live?: string;
  record: boolean;
  build: BuildRow[];
  /** 可选：结算后铜钱总数（本局的 coins 已加进去）。有就画"飞进总数"的动画，没有就只显示本局收获 */
  coinsTotal?: number;
  /** 本局铜钱的来源明细（按顺序显示）；让玩家看懂钱是怎么挣的，没有或为空就不显示 */
  sources?: { label: string; coins: number }[];
  /** 可选：本局的目标时长（秒），默认 900；用于"离天亮还差" */
  dawnSeconds?: number;
  /** 夜探：有就按夜探排版（won 填"撤出了"；seconds 是在镇里待了多久；coins 填这一局到手的铜钱，已含宝物换的） */
  raid?: RaidResultView;
  /** 本局经历的夜事（地图事件、血月、精英发狂的次数）；全 0 或没有就不显示「今晚」一行 */
  night?: NightLog;
  /** 新手前几局倒下时的「下次试试」一句（finish.ts 定），占「本局最强」那一块；没有就照常显示本局最强 */
  advice?: string;
}

export class Result {
  readonly root: HTMLDivElement;
  private readonly icons: (k: string) => string;
  onAgain: () => void = () => undefined;
  onMenu: () => void = () => undefined;
  /** 教学镇结算的「去大镇子」：直接开一局正式镇子 */
  onBigTown: () => void = () => undefined;
  /** 分享这一局：有才显示按钮（实盘局不给）；show 之前设好 */
  onShare: (() => void) | null = null;

  constructor(parent: HTMLElement, icons: (k: string) => string) {
    this.root = layer(parent, 'yx-result');
    this.icons = icons;
    onAction(this.root, {
      again: () => this.onAgain(),
      menu: () => this.onMenu(),
      big: () => this.onBigTown(),
      share: () => this.onShare?.(),
      home: () => {
        location.href = '/';
      },
    });
  }

  /** 实盘结回的结果回来了：换掉那一行 */
  setLive(text: string): void {
    const el = this.root.querySelector('.yx-rlive');
    if (el) el.textContent = text;
  }

  /** 交分、存录像的结果：结算面板最下面一行小字（同一局只留一行，后来的替换先前的）；retry 给了就带一个「重试」按钮 */
  setNote(text: string, retry: (() => void) | null = null): void {
    const panel = this.root.querySelector('.yx-result-panel');
    if (!panel) return;
    let el = panel.querySelector<HTMLElement>('.yx-rnote');
    if (!el) {
      el = document.createElement('div');
      el.className = 'yx-rnote';
      panel.append(el);
    }
    el.textContent = text;
    if (retry) el.append(this.retryButton(retry));
    // 结算面板一屏放下：多了一行（带按钮更高）再收一档
    this.fit();
  }

  private retryButton(retry: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'yx-btn yx-rretry';
    b.textContent = '重试';
    b.addEventListener('click', () => {
      b.disabled = true;
      b.textContent = '在交…';
      retry();
    });
    return b;
  }

  /** 夜探的右半边：带出的宝物（按档上色的格子），丢在镇里的灰着排在后面 */
  private raidItems(rr: RaidResultView): string {
    const cell = (it: RaidItemView, lost: boolean): string =>
      `<div class="yx-item t-${it.tier}${lost ? ' lost' : ''}${it.fresh ? ' fresh' : ''}" title="${esc(it.name)} · ${it.value}"><img alt="" src="${this.icons(it.icon)}"><span>${esc(it.name)}</span><em>${it.value}</em>${it.fresh ? '<i>新</i>' : ''}</div>`;
    const kept = rr.kept.map((it) => cell(it, false)).join('');
    const lost = rr.lost.map((it) => cell(it, true)).join('');
    const headKept = rr.outcome === 'escaped' || rr.teach ? `带出 ${rr.kept.length} 件 · 值 ${rr.value} 铜钱` : '';
    return (
      '<div class="yx-rbuild yx-ritemsbox">' +
      (kept ? `<label>${headKept}</label><div class="yx-ritems">${kept}</div>` : `<label>${rr.outcome === 'escaped' ? '背包是空的' : '什么也没带出来'}</label>`) +
      (lost ? `<label>丢在镇里 ${rr.lost.length} 件</label><div class="yx-ritems">${lost}</div>` : '') +
      '</div>'
    );
  }

  /**
   * 一屏放下不滚动（docs/ui.md 第 11 节）：面板比屏幕高就一级级收（.fit1 … .fit4，样式在 screens.css）——
   * 法器伤害只留前 3 行 → 收起被动和「今晚」→ 铜钱明细分两栏 → 收起铜钱明细（总数那行还在）。手机竖屏一局玩久了 6 件法器 + 6 条明细放不下
   */
  private fit(): void {
    const panel = this.root.querySelector<HTMLElement>('.yx-result-panel');
    if (!panel) return;
    for (let k = 1; k <= 4 && panel.scrollHeight > panel.clientHeight + 1; k++) panel.classList.add(`fit${k}`);
  }

  show(r: ResultView): void {
    const rr = r.raid;
    const title = rr
      ? rr.outcome === 'escaped'
        ? '撤出了'
        : rr.outcome === 'lost'
          ? '迷失了'
          : r.quit
            ? '收工'
            : '倒下了'
      : r.won
        ? r.bossKilled
          ? '尸王伏诛'
          : '天亮了'
        : r.quit
          ? '收工'
          : '倒下了';
    const dawn = r.dawnSeconds ?? 900;
    const sub = rr
      ? rr.outcome === 'escaped'
        ? '平平安安走出了镇子'
        : rr.teach
          ? '教学镇不丢包，东西照样带出来'
          : rr.outcome === 'lost'
            ? '天亮时还在镇里，背包丢了'
            : '背包丢在了镇里'
      : r.won
        ? r.bossKilled
          ? '打倒尸王，天提前亮了'
          : '撑过了一整夜'
        : r.seconds >= dawn
          ? `天亮后又撑了 ${mmss(r.seconds - dawn)}`
          : `离天亮还差 ${mmss(dawn - r.seconds)}`;
    const fmt = (n: number): string => Math.round(n).toLocaleString('zh-CN');
    const weapons = r.build.filter((b) => b.dmg >= 0).sort((a, b) => b.dmg - a.dmg);
    const top = Math.max(1, ...weapons.map((b) => b.dmg));
    const best = weapons[0] && weapons[0].dmg > 0 ? weapons[0] : null;
    const rows = weapons
      .map(
        (b, i) =>
          `<div class="yx-rrow${i === 0 && best ? ' top' : ''}"><span class="yx-ricon"><img alt="" src="${this.icons(b.icon)}">${i === 0 && best ? `<img class="m" alt="本局最强" title="本局最强" src="${this.icons('ui_medal')}">` : ''}</span><b>${esc(b.name)}</b><div class="yx-rbar"><i style="width:${b.dmg > 0 ? Math.max(3, Math.round((100 * b.dmg) / top)) : 0}%;animation-delay:${0.25 + i * 0.08}s"></i></div><span>${fmt(b.dmg)}</span></div>`,
      )
      .join('');
    const passives = r.build
      .filter((b) => b.dmg < 0)
      .map((b) => `<span class="yx-rpass" title="${esc(b.name)}"><img alt="${esc(b.name)}" src="${this.icons(b.icon)}"><em>${b.level}</em></span>`)
      .join('');
    const total = r.coinsTotal;
    const coinImg = this.icons('coin');
    // 实盘：结回一行，局内铜钱照样存进账户（所有者 10-20），底下照常一行铜钱
    const coinRow = (r.live !== undefined ? `<div class="yx-rlive">${esc(r.live)}</div>` : '') +
      (total !== undefined
        ? `<div class="yx-rcoins"><span class="yx-gain${r.coins > 0 ? '' : ' zero'}"><img alt="" src="${coinImg}">+${fmt(r.coins)}</span><span class="yx-arrow">→</span><span class="yx-tot"><img alt="" src="${coinImg}"><b data-from="${Math.max(0, total - r.coins)}" data-to="${total}">${fmt(Math.max(0, total - r.coins))}</b><small>铜钱</small></span>${Array.from({ length: 6 }, (_, i) => `<img class="yx-fly" alt="" src="${coinImg}" style="--i:${i}">`).join('')}</div>`
        : '');
    const src = r.live === undefined && !rr && total !== undefined ? (r.sources ?? []).filter((x) => x.coins > 0) : [];
    const srcHtml = src.length
      ? `<div class="yx-rsrc${src.length > 6 ? ' two' : ''}">${src
          .map((x, i) => `<div style="animation-delay:${0.3 + i * 0.06}s"><img alt="" src="${coinImg}"><span>${esc(x.label)}</span><b>+${fmt(x.coins)}</b></div>`)
          .join('')}</div>`
      : '';
    const nightItems_ = rr ? [] : nightItems(r.night);
    const nightHtml = nightItems_.length
      ? `<div class="yx-rnight"><small>今晚</small>${nightItems_.map((it) => `<span class="ev-${it.kind === 'rage' ? 'rage' : it.kind}"><i>${it.icon}</i>×${it.n}</span>`).join('')}</div>`
      : '';
    this.root.innerHTML =
      `<div class="yx-panel yx-result-panel${r.won ? ' won' : ''}${rr ? ' raid' : ''}">` +
      `<div class="yx-rhead"><b class="yx-brush">${title}</b><div class="yx-rtags"><em>${esc(r.label)}</em>${r.record ? '<strong class="yx-record">新纪录</strong>' : ''}${this.onShare ? '<button type="button" class="yx-btn yx-rshare" data-a="share">分享</button>' : ''}</div></div>` +
      '<div class="yx-rmain">' +
      '<div class="yx-rleft">' +
      `<div class="yx-rtime"><span>${rr ? '在镇里' : '撑了'}</span><b>${mmss(r.seconds)}</b><small>${sub}</small></div>` +
      '<div class="yx-rstats">' +
      `<div><b>${r.kills.toLocaleString('zh-CN')}</b><span>斩</span></div>` +
      `<div><b>${r.level}</b><span>级</span></div>` +
      (total === undefined ? `<div><b>${r.coins.toLocaleString('zh-CN')}</b><span>铜钱</span></div>` : '') +
      '</div>' +
      // 本局最强不单列一块（和伤害榜第一行重复）：第一行图标挂奖牌；前三局倒下在这里给「下次试试」
      (r.advice && !rr ? `<div class="yx-rbest yx-radvice"><div><small>下次试试</small><span>${esc(r.advice)}</span></div></div>` : '') +
      '</div>' +
      (rr ? this.raidItems(rr) : `<div class="yx-rbuild"><label>法器伤害</label>${rows}${passives ? `<div class="yx-rpasses"><small class="yx-rptitle">被动</small>${passives}</div>` : ''}</div>`) +
      '</div>' +
      nightHtml +
      coinRow +
      (rr?.teach ? '<div class="yx-livenote">下一局起是正式镇子：铜箱、金箱、巡夜将、镇门石兽守的宝库</div>' : '') +
      srcHtml +
      '<div class="yx-row3">' +
      '<button type="button" class="yx-big ghost" data-a="home">大厅</button>' +
      `<button type="button" class="yx-big ghost" data-a="menu">${rr ? '回菜单' : r.fixed ? '回主页' : '换难度'}</button>` +
      (rr?.teach
        ? '<button type="button" class="yx-big yx-again" data-a="big">去大镇子</button>'
        : '<button type="button" class="yx-big yx-again" data-a="again">再来一局</button>') +
      '</div></div>';
    this.root.style.display = '';
    this.fit();
    // 铜钱总数从"加之前"数到"加之后"，和飞币动画同步
    const num = this.root.querySelector<HTMLElement>('.yx-tot b');
    if (num) {
      const from = Number(num.dataset.from);
      const to = Number(num.dataset.to);
      const t0 = performance.now() + 700;
      const tick = (now: number): void => {
        if (!num.isConnected) return;
        const k = Math.max(0, Math.min(1, (now - t0) / 800));
        num.textContent = fmt(from + (to - from) * k);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}

// ───────────────────────── 引导小提示 ─────────────────────────
