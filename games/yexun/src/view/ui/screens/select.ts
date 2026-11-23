import { ENEMY_BY_KIND } from '../../../content/enemies.ts';
import type { SchoolId } from '../../../content/guide.ts';
import { MAP_IDS, MAP_UNLOCK, MAPS, type MapId } from '../../../content/maps.ts';
import { drawMapThumb } from '../../art/terrain.ts';
import { drawTownThumb } from '../../art/sprites-townmap.ts';
import { noSchoolIcon, schoolIcon, tierIcon } from '../../art/sprites-selicons.ts';
import { DANGER_IDS, DANGERS, NIGHTMARE_FROM, RAID_MAX_DANGER, type Danger } from '../../../content/waves.ts';
import { CHARACTERS, CHIPS_NO_CASH, CURSES } from '../../../content/meta.ts';
import { LIVE_RUSH, LIVE_TIER_IDS, LIVE_TIERS, liveCharOk, liveMapOk, type LiveTier } from '../../../content/live.ts';
import { RUSH_TOTAL } from '../../../content/rush.ts';
import { WEAPONS } from '../../../content/weapons.ts';
import { rushPresets } from '../../../core/rush.ts';
import type { RushPreset } from '../../../platform/live.ts';
import { RAID_LIVE, RAID_TEMPLATES, type RaidTemplateId } from '../../../content/explore.ts';
import { RAID_REGIONS, VIGIL_REGIONS, type Region } from '../../../content/regions.ts';
import { RAID_PICKS, type RaidPick } from '../../../platform/save.ts';
import { LOCK_SVG, esc, layer, onAction, type MenuState, LIVE_PICK, isLiveTown, HOME_BTN, bestText, loadoutNote } from './shared.ts';
import { isZoomed } from 'arcade-kit/viewport';
import { sceneUrl, TitleArt } from './titleArt.ts';
import type { Menu } from './menu.ts';
import { type LiveFact, liveFacts, liveNote, plainNote, raidLiveFacts, raidLiveNote, rushLiveFacts, rushLiveNote } from './liveNote.ts';

/** 选模式页的设计尺寸：电脑上整块按这个可视区排好（1920×911 下正好是 1.3 倍），更大的屏整体等比放大 */
const DESIGN_W = 1476;
const DESIGN_H = 700;
const K_MAX = 1.6;
/** 地图、镇子缩略图的 CSS 边长（最大的那档；canvas 按 边长 × k × dpr 画，大屏不糊） */
const THUMB_CSS = 64;

/** 连战只在实盘里有（娱乐的连战是主页「连战」那一局每日的） */
type Kind = 'vigil' | 'raid' | 'rush';

/** 夜探最高到 RAID_MAX_DANGER：选中噩梦档再切到夜探，按最高的一档算（不改选中的档，切回守夜还在） */
export const raidDanger = (d: Danger): Danger => Math.min(d, RAID_MAX_DANGER) as Danger;

/** 第二屏：最上面娱乐 | 实盘（有钱包才出现），下面守夜 / 夜探两张模式卡，再是地图（或镇子）横排卡；底下一条配置面板（难度、角色、起手心法、准备），右边大「开始」（手机横屏在右栏） */
export class Select {
  readonly root: HTMLDivElement;
  private readonly ui: HTMLDivElement;
  private readonly art: TitleArt;
  private kind: Kind = 'vigil';
  private diff: Danger = 0;
  private map: MapId = 'snow';
  private tpl: RaidPick = 'guzhen';
  private endless = false;
  /** 实盘连战的推荐配装（稳 / 猛 / 双） */
  private preset: RushPreset = 0;
  /** 刚点了起手或心法：下一次重绘在那一行下面浮出一条说明（几秒后淡出，不占版面；触屏看不到悬停提示） */
  private ldTip = false;
  /** "更多选项"展开了没有：只在本次会话里记住，不写存储 */
  private live: MenuState['live'] = { available: false, on: false, tier: 'small', chips: null };
  private s: MenuState | null = null;
  /** 从主页点进来时按存档重新取"上次的模式和地图"；在这一屏里点来点去、开角色页再回来不重置 */
  private fresh = true;

  private readonly m: Menu;

  constructor(parent: HTMLElement, m: Menu) {
    this.m = m;
    this.root = layer(parent, 'yx-menu yx-selscreen');
    this.ui = document.createElement('div');
    this.ui.className = 'yx-menu-ui';
    this.art = new TitleArt(this.root);
    this.root.append(this.art.canvas, this.ui);
    onAction(this.root, {
      back: () => this.m.show(this.s!, 'home'),
      home: () => {
        location.href = '/';
      },
      lv: (el) => {
        this.live = { ...this.live, on: el.dataset.m === 'live' };
        this.m.onLiveMode(this.live.on, this.live.tier);
        this.render();
      },
      kind: (el) => {
        this.kind = el.dataset.k as Kind;
        this.render();
      },
      preset: (el) => {
        this.preset = Number(el.dataset.v) as RushPreset;
        this.render();
      },
      tier: (el) => {
        if (el.getAttribute('aria-disabled') === 'true') return;
        this.live = { ...this.live, tier: el.dataset.t as LiveTier };
        this.m.onLiveMode(this.live.on, this.live.tier);
        this.render();
      },
      map: (el) => {
        if (el.getAttribute('aria-disabled') === 'true') return;
        this.map = el.dataset.m as MapId;
        this.render();
      },
      tpl: (el) => {
        this.tpl = el.dataset.t as RaidPick;
        this.render();
      },
      diff: (el) => {
        if (el.getAttribute('aria-disabled') === 'true') return;
        this.diff = Number(el.dataset.d) as Danger;
        this.render();
      },
      endless: () => {
        this.endless = !this.endless;
        this.render();
      },
      prep: (el) => this.m.onPrep(el.dataset.t as 'char' | 'curse' | 'perk'),
      // 起手二选一、心法三选一：点已选的心法不会取消，要不带点「不带」
      alt: (el) => {
        this.ldTip = true;
        this.m.onLoadout({ alt: el.dataset.v === '1' });
      },
      xinfa: (el) => {
        this.ldTip = true;
        this.m.onLoadout({ xinfa: el.dataset.v ? (el.dataset.v as SchoolId) : null });
      },
      vault: () => this.m.onVault(),
      go: () => this.go(),
    });
    // 电脑上整块的放大倍数 --k（screens.css「选模式 · 电脑按可视区放大」）：转屏、收放地址栏都重算；双指放大着不改
    window.addEventListener('resize', () => this.fitScale());
    window.visualViewport?.addEventListener('resize', () => this.fitScale());
    this.fitScale();
  }

  /** 当前的放大倍数（缩略图按它和 dpr 定画布大小） */
  private k = 1;

  /**
   * --k = min(可视宽/DESIGN_W, 可视高/DESIGN_H)，限 1~1.6，取到 0.01：整块按设计尺寸排好再整体 zoom，卡片不拉伸，多出的空间留在四周。
   * 1920×911 算出 1.30（和改版前写死的 1.3 一样），1280×720 是 1，2560×1440 到顶 1.6。尺寸取 visualViewport（iOS 看得见的区域，和 --app-h 同一来源），不用 100vh
   */
  private fitScale(): void {
    if (isZoomed(window.visualViewport?.scale)) return;
    const vv = window.visualViewport;
    const raw = Math.min((vv?.width ?? window.innerWidth) / DESIGN_W, (vv?.height ?? window.innerHeight) / DESIGN_H);
    const k = Math.max(1, Math.min(K_MAX, Math.floor(raw * 100 + 1e-6) / 100));
    this.root.style.setProperty('--k', String(k));
    if (k !== this.k) {
      this.k = k;
      if (this.s && this.shown) this.drawThumbs();
    }
  }

  /** 地图、镇子缩略图：canvas 按 CSS 边长 × k × dpr 画 */
  private drawThumbs(): void {
    const px = Math.ceil(THUMB_CSS * this.k * Math.min(3, window.devicePixelRatio || 1));
    for (const cv of this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-thumb]')) {
      cv.width = cv.height = px;
      drawMapThumb(cv, MAPS[cv.dataset.thumb as MapId]);
    }
    for (const cv of this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-town]')) {
      cv.width = cv.height = px;
      drawTownThumb(cv, cv.dataset.town as RaidTemplateId);
    }
  }

  get shown(): boolean {
    return this.root.style.display !== 'none';
  }

  /** 从主页点进来：下次 show 按存档重取 */
  enter(): void {
    this.fresh = true;
  }

  private go(): void {
    const s = this.s!;
    const live = this.live.available && this.live.on;
    if (this.kind === 'rush' && live) return this.m.onRushLive(this.rushTier(), this.preset);
    if (this.kind === 'vigil') return live ? this.m.onLive(this.live.tier, this.map) : this.m.onStart(this.diff, this.map, this.endless);
    if (s.raidFirst) return this.m.onRaid('teach', 0);
    if (live) return this.m.onRaidLive(this.live.tier, isLiveTown(this.tpl) ? this.tpl : 'guzhen');
    this.m.onRaid(this.tpl, raidDanger(this.diff));
  }

  /** 连战只开 LIVE_RUSH 里的档：选着大、豪华档切到连战，按小档开（不改选中的档，切回守夜还在） */
  private rushTier(): LiveTier {
    return LIVE_RUSH[this.live.tier] ? this.live.tier : 'small';
  }

  show(s: MenuState): void {
    this.s = s;
    this.live = s.live;
    if (this.fresh) {
      this.fresh = false;
      this.kind = s.lastMode === 'raid' && !s.raidFirst ? 'raid' : 'vigil';
      this.tpl = s.raidTpl;
      this.endless = false;
      this.diff = Math.min(s.danger, s.dangerOpen) as Danger;
      this.map = s.maps[s.map] ? s.map : 'snow';
    }
    this.diff = Math.min(this.diff, s.dangerOpen) as Danger;
    if (!s.maps[this.map]) this.map = 'snow';
    this.fitScale();
    this.render();
    this.root.style.display = '';
    this.art.setCharacter(s.character);
    this.art.start();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.art.stop();
  }

  /**
   * 开局配置的紧凑控件：起手二选一（两件法器的图标）、心法三选一（不带 / 两个主修流派的小图标）；点了以后下面浮出一条说明（loadoutNote），名字也在悬停提示里。
   * 娱乐和实盘共用，记在存档里每个角色各一份；点已选的心法不会取消，要不带点「不带」
   */
  private loadoutCtl(s: MenuState): string {
    const l = s.loadout;
    if (!l) return '';
    const btn = (on: boolean, a: string, v: string, icon: string, tip: string): string =>
      `<button type="button" class="yx-ldbtn${on ? ' on' : ''}" data-a="${a}" data-v="${v}" title="${esc(tip)}" aria-label="${esc(tip)}" aria-pressed="${on}"><img alt="" src="${icon}"></button>`;
    const starts = l.starts.map((w, i) => btn(l.alt === (i === 1), 'alt', String(i), w.icon, `起手：${w.name}${i === 1 ? '（第二件）' : ''}`)).join('');
    const schools =
      btn(l.xinfa === null, 'xinfa', '', noSchoolIcon(), '心法：不带') +
      l.schools.map((x) => btn(l.xinfa === x.id, 'xinfa', x.id, schoolIcon(x.id), `心法：${x.name}`)).join('');
    return `<div class="yx-ldctl"><span class="yx-ldseg" role="group" aria-label="起手"><i>起手</i>${starts}</span><span class="yx-ldseg" role="group" aria-label="心法"><i>心法</i>${schools}</span></div>`;
  }

  private render(): void {
    const s = this.s!;
    const live = this.live.available && this.live.on;
    if (this.kind === 'rush' && !live) this.kind = 'vigil';
    const raid = this.kind === 'raid';
    const rush = this.kind === 'rush';
    const keep = this.root.scrollTop;
    const heads = (r: Region | undefined, names: boolean): string => {
      if (!r) return '<span class="yx-mobs"><em>只有常规怪</em></span>';
      const list = r.mobs.map((x) => ({ k: x.kind, n: ENEMY_BY_KIND[x.kind].name }));
      return `<span class="yx-mobs">${list.map((x) => `<img class="yx-mob" alt="${esc(x.n)}" title="${esc(x.n)}" src="${s.mobIcon(x.k, 48)}">`).join('')}${names ? `<em>${list.map((x) => x.n).join('、')}</em>` : ''}</span>`;
    };
    const top = HOME_BTN + '<div class="yx-more"><button type="button" class="yx-btn" data-a="back" aria-label="返回主页">‹ 返回</button></div>';
    const lvSw = this.live.available
      ? `<div class="yx-chips yx-modesw yx-selfx"><button type="button" class="yx-chip${live ? '' : ' on'}" data-a="lv" data-m="fun"><b>娱乐</b><small>不花筹码</small></button><button type="button" class="yx-chip${live ? ' on' : ''}" data-a="lv" data-m="live"><b>实盘</b><small>带一份筹码</small></button></div>`
      : '';
    const kinds =
      `<div class="yx-kinds${live ? ' yx-k3' : ''}">` +
      `<button type="button" class="yx-kind${this.kind === 'vigil' ? ' on' : ''}" data-a="kind" data-k="vigil"><img class="yx-scene" alt="" src="${sceneUrl('watch', 320, 100)}"><span class="yx-kindtxt"><span class="yx-moon"></span><b>守夜</b><em>15 分钟 · 撑到天亮</em></span></button>` +
      `<button type="button" class="yx-kind${raid ? ' on' : ''}" data-a="kind" data-k="raid"><img class="yx-scene" alt="" src="${sceneUrl('raid', 320, 100)}"><span class="yx-kindtxt"><span class="yx-lamp"></span><b>夜探</b><em>搜宝、打怪、找门撤出</em></span></button>` +
      (live ? `<button type="button" class="yx-kind${rush ? ' on' : ''}" data-a="kind" data-k="rush"><img class="yx-scene" alt="" src="${sceneUrl('watch', 320, 100)}"><span class="yx-kindtxt"><span class="yx-moon"></span><b>连战</b><em>约 15 分钟 · 连打 ${RUSH_TOTAL} 只首领</em></span></button>` : '') +
      '</div>';

    // 地图 / 镇子大卡
    // 实盘里还没配系数的新图灰着（选中的是它就退回雪原）
    if (live && !liveMapOk(this.map)) this.map = 'snow';
    const mapCards = MAP_IDS.map((id) => {
      const liveOff = live && !liveMapOk(id);
      const locked = !s.maps[id] || liveOff;
      const u = MAP_UNLOCK[id];
      const why = liveOff ? '实盘暂不开放' : u ? `${u.text}解锁` : '';
      // 手机竖屏三列小卡放不下整句，换短的（整句在 title 里）
      const short = liveOff ? '暂不开放' : u ? `撑过 ${u.seconds / 60} 分钟` : '';
      return (
        `<button type="button" class="yx-mcard yx-mapcard${id === this.map ? ' on' : ''}${locked ? ' locked' : ''}" data-a="map" data-m="${id}"${locked ? ` aria-disabled="true" title="${why}"` : ''}>` +
        `<canvas class="yx-thumb" data-thumb="${id}" aria-hidden="true"></canvas>` +
        `<span class="yx-cardtxt"><b>${MAPS[id].name}</b>${MAPS[id].hard ? '<i class="yx-hard">难</i>' : ''}` +
        (locked && why ? `<em class="yx-unlock">${LOCK_SVG}<span class="yx-ulong">${why}</span><span class="yx-ushort">${short}</span></em>` : `<small>${MAPS[id].blurb}</small>${heads(VIGIL_REGIONS[id], true)}`) +
        '</span></button>'
      );
    }).join('');
    const townCards = (live ? LIVE_PICK : RAID_PICKS).map(
      (t) =>
        `<button type="button" class="yx-mcard yx-towncard${t === this.tpl ? ' on' : ''}" data-a="tpl" data-t="${t}"><canvas class="yx-thumb" data-town="${t}" aria-hidden="true"></canvas><span class="yx-cardtxt"><b>${RAID_TEMPLATES[t].name}</b><small>${RAID_TEMPLATES[t].blurb}</small>${heads(RAID_REGIONS[t], true)}</span></button>`,
    ).join('');
    const townGrid = `<div class="yx-pickgrid yx-towns">${townCards}</div>`;
    const mapGrid = `<div class="yx-pickgrid yx-maps" aria-label="地图">${mapCards}</div>`;
    // 档位：铜钱堆小图（堆越高档越大）+ 名字和筹码数
    const shownTier = rush ? this.rushTier() : this.live.tier;
    const tierOff = (t: LiveTier): boolean => rush && !LIVE_RUSH[t];
    const tiers = `<div class="yx-chips yx-tiers">${LIVE_TIER_IDS.map((t) => `<button type="button" class="yx-chip yx-tierchip${t === shownTier ? ' on' : ''}${tierOff(t) ? ' locked' : ''}" data-a="tier" data-t="${t}"${tierOff(t) ? ' aria-disabled="true" title="连战只开小、中档"' : ''}><img alt="" src="${tierIcon(t)}"><b>${LIVE_TIERS[t].name}</b><small>${LIVE_TIERS[t].stake.toLocaleString('zh-CN')}</small></button>`).join('')}</div>`;

    let pick: string;
    let opts = '';
    let note = '';
    const startLabel = raid ? '开始夜探' : rush ? '开始连战' : '开始';
    let facts = '';
    // 实盘写手上多少筹码（读到钱包的话；试玩 11-22：选档页看不到手上有多少，点了才说不够）
    const have = this.live.chips === null ? '' : `手上 ${this.live.chips.toLocaleString('zh-CN')} · `;
    // 实盘数字小牌：一行等宽排完（守夜 4 格，夜探 5 格），大字写数、小字写它是什么，整段细则在悬停里
    const factCards = (list: LiveFact[], tip: string): string =>
      `<div class="yx-livefacts" data-n="${list.length}" style="--fc:${list.length}" title="${esc(tip)}">${list.map((x) => `<span class="yx-fact"><b>${esc(x.big)}</b><small>${esc(x.small)}</small></span>`).join('')}</div>`;
    if (raid && s.raidFirst) {
      pick = `<div class="yx-raidnote"><b>${RAID_TEMPLATES.teach.name}</b>${RAID_TEMPLATES.teach.blurb}</div>`;
    } else if (live && rush) {
      const t = this.rushTier();
      const presets = rushPresets('xiaodao')
        .map((p, i) => `<button type="button" class="yx-chip${i === this.preset ? ' on' : ''}" data-a="preset" data-v="${i}"><b>${['稳', '猛', '双'][i]}</b><small>${esc([p.start, p.second].filter((x) => x !== undefined).map((x) => WEAPONS[x!].name).join(' + '))}</small></button>`)
        .join('');
      pick = `<div class="yx-raidnote"><b>实盘连战</b>小道士选一套推荐配装开局，打 ${RUSH_TOTAL - 1} 只首领和终局夜漏君；每关挑卡、走路线、过驿站。按打倒几只带回，打倒夜漏君另外多给；一只没打倒这一份就没了。不带咒，不交连战榜。</div><div class="yx-chips yx-rushpresets">${presets}</div>`;
      note = `${have}危险 ${LIVE_TIERS[t].danger} · 固定小道士、推荐配装、不带咒`;
      facts = factCards(rushLiveFacts(t), plainNote(rushLiveNote(t)));
    } else if (live) {
      if (raid) {
        const t = this.live.tier;
        const ok = liveCharOk(s.character);
        const swap = ok ? '' : ` · <b class="yx-livewarn">${CHARACTERS[s.character].name}带不进来，按小道士出战</b>`;
        const town = isLiveTown(this.tpl) ? this.tpl : 'guzhen';
        const who = ok ? s.character : 'xiaodao';
        pick = townGrid;
        note = `${have}危险 ${RAID_LIVE.danger[t]} · 不能用加成${swap}`;
        facts = factCards(raidLiveFacts(t, town, who), plainNote(raidLiveNote(t, town, who)));
      } else {
        pick = mapGrid;
        const ok = liveCharOk(s.character);
        const swap = ok ? '' : ` · <b class="yx-livewarn">${CHARACTERS[s.character].name}带不进来，按小道士出战</b>`;
        note = `${have}危险 ${LIVE_TIERS[this.live.tier].danger} · 不能用加成${swap}`;
        facts = factCards(liveFacts(this.live.tier, s.character, this.map), plainNote(liveNote(this.live.tier, s.character, this.map)));
      }
    } else {
      pick = raid ? townGrid : mapGrid;
    }
    const charChip = `<button type="button" class="yx-chip yx-prep yx-prepchar" data-a="prep" data-t="char">${s.charFace ? `<img alt="" src="${s.charFace}">` : ''}<b>${CHARACTERS[s.character].name}</b><small>角色</small></button>`;
    // 角色：娱乐和实盘同一个按钮（点开角色页选人）+ 起手心法；夜探教学局不让换
    const charLine = (raid && s.raidFirst) || rush ? '' : `<div class="yx-chips yx-livechar">${charChip}${this.loadoutCtl(s)}${s.loadout && this.ldTip ? `<p class="yx-ldnote" role="status">${esc(loadoutNote(s.loadout))}</p>` : ''}</div>`;
    if (!live) {
      const shown = raid ? raidDanger(this.diff) : this.diff;
      const dangerBtn = (d: Danger): string => {
        const locked = d > s.dangerOpen;
        const nm = d >= NIGHTMARE_FROM;
        // 噩梦档：深红描边 + 小月亮，按钮上写「噩梦1」（试玩 11-22：「噩1」看不懂）；普通档写数字和星
        const label = nm ? `噩梦${d - NIGHTMARE_FROM + 1}` : `${d}`;
        const sub = locked ? LOCK_SVG : nm ? '<i class="yx-nmoon"></i>' : '★'.repeat(DANGERS[d].stars);
        return `<button type="button" class="yx-chip yx-danger${nm ? ' yx-nm' : ''}${d === shown ? ' on' : ''}${locked ? ' locked' : ''}" data-a="diff" data-d="${d}"${locked ? ' aria-disabled="true" title="撑到天亮解锁下一档"' : ` title="${DANGERS[d].name}"`}><b>${label}</b><small>${sub}</small></button>`;
      };
      const ids = raid ? DANGER_IDS.filter((d) => d <= RAID_MAX_DANGER) : DANGER_IDS;
      // 和实盘同一个排法（所有者 11-09：以实盘为准）：第一行 危险 0–5 | 角色按钮 + 起手心法；第二行噩梦档、咒印、加成、无尽；第三行最好成绩
      const dangers = `<div class="yx-chips yx-dangers" aria-label="危险档"><i class="yx-rowlabel">危险</i>${ids.filter((d) => d < NIGHTMARE_FROM).map(dangerBtn).join('')}</div>`;
      const nmList = raid && s.raidFirst ? '' : ids.filter((d) => d >= NIGHTMARE_FROM).map(dangerBtn).join('');
      const nmChips = nmList;
      const curse = s.curses.length ? s.curses.map((c) => CURSES[c].name).join('') : '无';
      const prep =
        (s.cursesOpen && !raid ? `<button type="button" class="yx-chip yx-prep${s.curses.length ? ' hot' : ''}" data-a="prep" data-t="curse"><b>${curse}</b><small>咒印</small></button>` : '') +
        `<button type="button" class="yx-chip yx-prep" data-a="prep" data-t="perk"><b>加成</b><small>铜钱 ${s.coins.toLocaleString('zh-CN')}</small></button>`;
      const endless = s.cursesOpen && !raid ? `<button type="button" class="yx-chip yx-map${this.endless ? ' on' : ''}" data-a="endless"><b>无尽</b><small>不收工</small></button>` : '';
      const dg = raid && s.raidFirst ? '' : dangers;
      const bt = bestText(s.best[this.diff]);
      const best = raid ? '' : `<div class="yx-best">${s.best[this.diff] ? `最好：${bt.big} · ${bt.small}` : `${DANGERS[this.diff].blurb} · 还没玩过`}</div>`;
      opts = `${dg}${charLine}<div class="yx-chips yx-preps">${nmChips}${prep}${endless}</div>${best}`;
    } else {
      // 第一行 档位 | 角色 + 起手心法；第二行危险档一句；第三行数字小牌
      // 实盘能换已解锁的角色和地图（各自有实盘系数，DESIGN 4.2a），加成、咒印不带
      opts = `${tiers}${charLine}<div class="yx-livenote">${note}<span class="yx-nocash">${CHIPS_NO_CASH}</span></div>${facts}`;
    }
    const vault = raid && s.vault && !live ? `<button type="button" class="yx-chip yx-vaultbtn" data-a="vault"><b>藏宝阁</b><small>${s.vault.got} / ${s.vault.total}</small></button>` : '';
    const aside = `<div class="yx-aside"><div class="yx-opts">${opts}</div><div class="yx-startbar"><button type="button" class="yx-big" data-a="go">${startLabel}</button>${vault}</div></div>`;

    this.ldTip = false;
    this.ui.innerHTML = `${top}<div class="yx-sel">${lvSw}${kinds}<div class="yx-pickarea">${pick}</div>${aside}</div>`;
    this.drawThumbs();
    this.root.scrollTop = keep;
  }
}
