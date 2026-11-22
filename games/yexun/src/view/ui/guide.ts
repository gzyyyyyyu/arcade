/**
 * 玩法说明（所有者 10-20）：每个页签一页，大白话，多用图标和小例子；电脑上页内分两栏一屏放下，手机放不下的页再翻页（pager.ts）。
 * 名字、配方、数值全从内容表现取（weapons / enemies / maps / meta / waves / explore / live / guide），以后加法器、地图、流派自动跟上；
 * 只有讲道理的句子写在这里。主页和暂停面板都能打开，关掉回到打开它的地方。
 */
import { ENEMY_BY_KIND } from '../../content/enemies.ts';
import { fmtClock, TICKS_PER_SECOND } from '../../content/clock.ts';
import { PICKS } from '../../content/picks.ts';
import type { EnemyKind } from '../../content/enemies.ts';
import { GATE_WINDOWS, RAID_DAWN, RAID_LATE } from '../../content/explore.ts';
import { NIGHT_MARKET } from '../../content/market.ts';
import { RUSH, RUSH_STAGES } from '../../content/rush.ts';
import { GUIDE_EXAMPLES, ROLE_NAME, ROLE_TIP, SCHOOL_IDS, SCHOOLS, WEAPON_ROLE, type Role, type SchoolId } from '../../content/guide.ts';
import { LIVE_MAP_CLOSED, LIVE_MAX_BP, LIVE_TIER_IDS, LIVE_TIERS } from '../../content/live.ts';
import { SKILLS } from '../../core/skills.ts';
import { MAP_EVENT_AT, MAP_EVENTS } from '../../content/mapEvents.ts';
import { MAP_IDS, MAP_UNLOCK, MAPS } from '../../content/maps.ts';
import { CHARACTER_IDS, CHARACTERS, CURSE_COIN_BONUS, MAX_CURSES, PERK_IDS, PERKS, type CharacterId } from '../../content/meta.ts';
import { XINFA_TEXT } from '../../content/xinfa.ts';
import { altStart, mainSchools } from '../../content/pools.ts';
import { schoolIcon } from '../art/sprites-selicons.ts';
import { heroKey } from '../art/heroes.ts';
import { DANGER_IDS, DANGERS, DAWN_TICK, EVENTS, MID_BOSS } from '../../content/waves.ts';
import { ELEMENT_SET, MAX_PASSIVES, MAX_WEAPON_LEVEL, MAX_WEAPONS, NEXT_ELEMENT, PASSIVES, STAT_NAME, TYPE_SETS, WEAPONS, type MergeDef, type WeaponId, type WeaponType } from '../../content/weapons.ts';
import { counters } from './counters.ts';
import { closeModal, modalChrome, openModal } from './modal.ts';
import { PAGER_CTL, Pager } from './pager.ts';
import { mergeHow, schoolMerges, whoText } from './codexCombos.ts';
import { mergeReach, mergeWho, SHOWN_MERGES } from '../../content/combos.ts';
import { STAT_ORDER, statIcon } from './statIcons.ts';
import './guide.css';
import { esc } from './screens/shared.ts';



/** 页签和页一一对应：名字两三个字，一个页签讲一件事 */
export type GuideTab = 'play' | 'cards' | 'grow' | 'roles' | 'maps' | 'school' | 'set' | 'evo' | 'merge' | 'team' | 'night' | 'raid' | 'eg';
const TABS: [GuideTab, string][] = [
  ['play', '上手'],
  ['cards', '选卡'],
  ['grow', '养成'],
  ['roles', '角色'],
  ['maps', '地图'],
  ['school', '流派'],
  ['set', '套装'],
  ['evo', '进化'],
  ['merge', '合成'],
  ['team', '配合'],
  ['night', '守夜'],
  ['raid', '夜探'],
  ['eg', '例子'],
];

/** 拍数 → "14:00" */
const clock = (ticks: number): string => fmtClock(Math.round(ticks / TICKS_PER_SECOND));
/** 电脑宽屏（和 guide.css 里两栏的条件一致） */
const WIDE = window.matchMedia('(min-width: 900px) and (min-height: 560px)');
const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export class Guide {
  readonly root: HTMLDivElement;
  private tab: GuideTab = 'play';
  private pager: Pager | null = null;
  private readonly icons: (k: string, px?: number) => string;
  /** 按谁看「合成·双修」：当前出战的角色凑不出的搭配压暗（content/combos.ts） */
  private char: CharacterId = 'xiaodao';
  onClose: () => void = () => undefined;

  constructor(parent: HTMLElement, icons: (k: string, px?: number) => string) {
    this.icons = icons;
    this.root = document.createElement('div');
    this.root.className = 'yx-screen yx-guide';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    WIDE.addEventListener('change', () => this.open && this.render());
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!el || !this.root.contains(el)) return;
      if (el.dataset.a === 'close') this.onClose();
      else if (el.dataset.a === 'tab') {
        this.tab = el.dataset.t as GuideTab;
        this.render();
      }
    });
  }

  get open(): boolean {
    return this.root.style.display !== 'none';
  }

  /** character：当前出战的角色（主页上是选着的，局里是这一局的） */
  show(tab?: GuideTab, character?: string): void {
    if (tab) this.tab = tab;
    if (character) this.char = (CHARACTER_IDS as readonly string[]).includes(character) ? (character as CharacterId) : 'xiaodao';
    this.render();
    this.root.style.display = '';
    openModal(this.root, () => this.onClose(), () => this.hide());
  }

  /** 按 ? 打开：直接翻到「选卡」里的快捷键表 */
  showKeys(): void {
    this.show('cards');
    const keys = this.root.querySelector('.yx-gkeys');
    if (keys) this.pager?.goTo(keys);
  }

  hide(): void {
    this.root.style.display = 'none';
    closeModal(this.root);
  }

  private render(): void {
    const tabs = TABS.map(([t, n]) => `<button type="button" class="yx-tab${t === this.tab ? ' on' : ''}" data-a="tab" data-t="${t}">${n}</button>`).join('');
    const body = { play: this.play, cards: this.cards, grow: this.grow, roles: this.roles, maps: this.maps, school: this.schools, set: this.sets, evo: this.evolve, merge: this.merges, team: this.team, night: this.night, raid: this.raid, eg: this.examples }[this.tab].call(this);
    this.pager?.destroy();
    this.root.innerHTML =
      '<div class="yx-panel yx-guide-panel">' +
      '<div class="yx-panel-head"><b class="yx-brush">玩法</b></div>' +
      `<div class="yx-tabs yx-gtabs">${tabs}</div>` +
      `<div class="yx-gbody">${body}</div>` +
      `<div class="yx-row3 yx-pgfoot">${PAGER_CTL}<button type="button" class="yx-big ghost" data-a="close">返回</button></div>` +
      '</div>';
    // 电脑（宽屏）：页内分两栏，每页一整块、一屏放下，不翻页（流派页按卡、合成页按行翻：放不下，原来合成页整块算一页，底下几行被裁掉）；手机单栏：标题、段落、列表项、配方行、快捷键表的一行各算一块，放不下的页再翻，标题跟着后面走
    this.pager = new Pager({
      body: this.root.querySelector<HTMLElement>('.yx-gbody')!,
      ctl: this.root.querySelector<HTMLElement>('.yx-pager')!,
      leaves: WIDE.matches
        ? '.yx-gcols, .yx-gbody > .yx-gsec, .yx-gflow > .yx-gtop, .yx-gschool, .yx-gmhead, .yx-gmrow'
        : '.yx-gsec > h3, .yx-gsec > p, .yx-glist > li, .yx-gcards, .yx-grecipes > .yx-grecipe, .yx-gsec > .yx-grecipe, .yx-grole, .yx-gkeys tr, .yx-gschool, .yx-gmrow, .yx-gtop, .yx-gmhead',
      keep: 'h3',
    });
    modalChrome(this.root);
  }

  // ── 小零件 ──
  private img(k: string, cls = '', px?: number): string {
    return `<img class="yx-gi${cls ? ` ${cls}` : ''}" alt="" src="${this.icons(k, px)}">`;
  }
  private w(id: WeaponId): string {
    return `<span class="yx-gw">${this.img(WEAPONS[id].icon)}<b>${esc(WEAPONS[id].name)}</b></span>`;
  }
  private evo(id: WeaponId): string {
    const e = WEAPONS[id].evolve;
    return e ? `<span class="yx-gw evo">${this.img(e.icon)}<b>${esc(e.name)}</b></span>` : '';
  }
  private p(id: keyof typeof PASSIVES): string {
    return `<span class="yx-gw">${this.img(PASSIVES[id].icon)}<b>${esc(PASSIVES[id].name)}</b></span>`;
  }
  private mob(k: EnemyKind): string {
    return `<span class="yx-gw">${this.img(k)}<b>${esc(ENEMY_BY_KIND[k].name)}</b></span>`;
  }
  private recipe(id: WeaponId): string {
    const e = WEAPONS[id].evolve;
    if (!e) return '';
    return `<div class="yx-grecipe">${this.w(id)}<i>满级 +</i>${this.p(e.with)}<span class="yx-gto"><i>→</i>${this.evo(id)}</span></div>`;
  }
  private sec(title: string, inner: string): string {
    return `<section class="yx-gsec"><h3>${title}</h3>${inner}</section>`;
  }

  /** 两栏（电脑）；手机上自动叠成一栏 */
  private cols(left: string, right: string): string {
    return `<div class="yx-gcols"><div class="yx-gcol">${left}</div><div class="yx-gcol">${right}</div></div>`;
  }

  // ── 上手 ──
  private play(): string {
    const boss = EVENTS.find((e) => e.kind === 'boss' && e.enemy === 'boss');
    const mid = EVENTS.find((e) => e.kind === 'boss' && e.enemy !== 'boss');
    return this.cols(
      this.sec(
        '只管走',
        '<ul class="yx-glist">' +
          '<li><b>走位</b>电脑用 WASD 或方向键，手机按住屏幕左半边拖出摇杆，轻轻一拖慢走（摇杆头变小）、拖远全速。</li>' +
          `<li>${this.img(WEAPONS.sword.icon)}法器自己出手，不用点。最多带 ${MAX_WEAPONS} 件法器、${MAX_PASSIVES} 件被动。</li>` +
          `<li>${this.img(SKILLS.xiaodao.icon)}<b>技能</b>每个角色一个主动技能：电脑按空格或 Q，手机点右下角的技能钮，冷却环走满就发亮。按住或悬停技能钮看它做什么，暂停页也写着。设置里的「自动技能」打开后，技能好了而且身边有怪就自动放，不用你按（默认关）。</li>` +
          `<li>${this.img('soul')}怪倒下掉魂火，走近自动吸，吸满就升级。</li>` +
          '</ul>',
      ),
      this.sec(
        `撑到天亮（${clock(DAWN_TICK)}）`,
        '<ul class="yx-glist">' +
          (mid ? `<li>${this.img(mid.enemy)}离天亮还剩 ${clock(DAWN_TICK - mid.at)}，${esc(ENEMY_BY_KIND[mid.enemy].name)}来闹一场。</li>` : '') +
          (mid ? `<li>${this.img('zhumu')}每张特色图这时来的首领不一样：${(Object.keys(MID_BOSS) as (keyof typeof MID_BOSS)[]).map((m) => `${MAPS[m].name}是${esc(ENEMY_BY_KIND[MID_BOSS[m]!].name)}`).join('、')}（画皮混在怪群里，头顶一缕红丝，打疼了才现形）。</li>` : '') +
          (boss ? `<li>${this.img('boss')}还剩 ${clock(DAWN_TICK - boss.at)}，${esc(ENEMY_BY_KIND.boss.name)}现身；打倒它天亮得更早，奖励也多。</li>` : '') +
          `<li>${this.img('chest')}精英倒下掉宝箱：法器升级，凑齐了就进化。</li>` +
          '</ul>',
      ) +
        this.sec(
          '三条保命心得',
          '<ol class="yx-glist num"><li>别站着不动，绕着圈走。</li><li>别往墙角、栅栏边钻，被围住最容易倒。</li><li>地上出圈（绿、蓝、灰）就是要砸下来了，走出圈。</li></ol>',
        ),
    );
  }

  // ── 选卡：升级三选一 + 快捷键 ──
  private cards(): string {
    return this.cols(
      this.sec(
        '升级三选一',
        '<div class="yx-gcards"><span>新法器</span><span>法器升一级</span><span>被动</span></div>' +
          `<ul class="yx-glist"><li><b>刷新</b>三张都不想要，整批换掉。起步 ${PICKS.rerolls} 次，进化一件、打倒精英或首领各补 1 次（心法流派的法器进化补 2 次），最多攒 ${PICKS.rerollMax} 次。</li><li><b>封禁</b>先点它再点一张卡，这张整局不再出现。起步 ${PICKS.bans} 次。</li><li><b>跳过</b>不拿，随机拿个小奖：铜钱、回血、下次多一张卡、刷新 +1。</li>` +
          `<li><b>卡上的数</b><span class="yx-gstats">${STAT_ORDER.map((k) => `<span>${statIcon(k)}${STAT_NAME[k]}</span>`).join('')}</span><small>每件法器的叫法不一样（「几道雷」「回一层要多久」），电脑上悬停数字能看到。</small></li></ul>` +
          '<p class="yx-gnote">卡上写着拿了以后能凑成什么，留意「凑成」「再拿 X」。手上有某个搭配的一件料，另一件更常出；带了心法，每次至少一张那个流派的卡（这两条实盘不算）。</p>',
      ),
      this.keys(),
    );
  }

  /** 快捷键表（电脑上用）：只写 cards.ts、input.ts、main.ts 里真有的键 */
  private keys(): string {
    const rows: [string, string][] = [
      ['W A S D / 方向键', '走位；选卡时左右切换高亮的卡'],
      ['1 2 3', '选第几张卡'],
      ['R', '刷新这三张卡'],
      ['X 或 B', '封禁：再点一张卡，这张整局不再出现'],
      ['Z', '跳过，不拿卡'],
      ['Enter', '选高亮的那张卡'],
      ['Esc', '对局中暂停；开着面板时先关最上面一层，不会直接离开游戏'],
      ['P', '暂停 / 继续'],
      ['?', '打开这张表'],
    ];
    return this.sec(
      '快捷键',
      `<table class="yx-gkeys"><tbody>${rows.map(([k, d]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(d)}</td></tr>`).join('')}</tbody></table>`,
    );
  }

  // ── 养成：铜钱、加成、危险档 ──
  private grow(): string {
    const perks = PERK_IDS.map((id) => `<li><b>${esc(PERKS[id].name)}</b>${esc(PERKS[id].text)}<small>最多 ${PERKS[id].cost.length} 级</small></li>`).join('');
    return this.cols(
      this.sec('铜钱和加成', `<p>局里捡的铜钱打完存进账户（实盘也一样），每局结束还按撑了多久、打了多少、有没有天亮另给，回主页买永久加成（实盘不生效）：</p><ul class="yx-glist yx-ginline">${perks}</ul>`),
      this.sec('危险档', `<p>通关一档开下一档，越往上怪越硬、铜钱越多。还能挂最多 ${MAX_CURSES} 条咒印，每条铜钱 +${Math.round(CURSE_COIN_BONUS * 100)}%。</p><ul class="yx-glist yx-ginline">${DANGER_IDS.map((d) => `<li><b>${DANGERS[d].name}</b>${esc(DANGERS[d].blurb)}</li>`).join('')}</ul>`),
    );
  }

  // ── 角色：每个角色的技能、被动和解锁 ──
  private roles(): string {
    const chars = CHARACTER_IDS.map((id) => {
      const c = CHARACTERS[id];
      const k = SKILLS[id];
      return `<li>${this.img(heroKey(id), 'yx-gface', 64)}<b>${esc(c.name)}</b>技能「${esc(k.name)}」${Math.round(k.cd / 30)} 秒 · 被动「${esc(c.perkName)}」<small>${esc(c.unlock)}${c.privilege ? `；小特权：${esc(c.privilege)}` : ''}</small></li>`;
    }).join('');
    return this.sec('角色（选角页）', `<p>每个角色的血量、移速、伤害等初始数值不同，选角页有对比条。选好角色还有两行小选择：「起手」可以在原来的起手法器和第二件之间二选一；「心法」选一个本角色的主修流派：这个流派多一条特色（剑修「剑意」近身更疼、镇守「不动如山」站定更硬……，流派页有全表；升级卡名字旁标着特色名），每次升级至少出一张这个流派的卡，它的法器进化多补一次刷新。每个角色各记一份，实盘也能用；每日挑战、每周夜事、首领连战不带。</p><ul class="yx-glist yx-gtwo">${chars}</ul>`);
  }

  // ── 地图：地图、各图的事件 ──
  private maps(): string {
    const maps = MAP_IDS.map((id) => `<li><b>${esc(MAPS[id].name)}</b>${esc(MAPS[id].blurb)}<small>${MAP_UNLOCK[id] ? esc(MAP_UNLOCK[id]!.text) : '一开始就有'}</small></li>`).join('');
    const evMin = MAP_EVENT_AT.map((t) => Math.round(t / 1800)).join('、');
    const events = MAP_IDS.map((id) => `<li><b>${esc(MAPS[id].name)} · ${esc(MAP_EVENTS[id].name)}</b>${esc(MAP_EVENTS[id].blurb)}</li>`).join('');
    return this.cols(
      this.sec('地图', `<ul class="yx-glist">${maps}</ul>`),
      this.sec('各图的事件', `<p>守夜每张图有一种自己的天象或怪潮，第 ${evMin} 分钟各来一次，提前几秒横幅预告。实盘守夜也有，夜探没有。</p><ul class="yx-glist">${events}</ul>`),
    );
  }

  // ── 流派：十个流派一张卡 ──
  private schools(): string {
    return (
      `<div class="yx-gflow"><p class="yx-gnote yx-gtop">每张卡右上先是核心法器，再是被动。选角页的「心法」就是挑一个流派，它多一条特色（见下表），每次升级保底一张它的卡；「起手」可换成另一个主修流派的法器。</p>` +
      `<div class="yx-gschools">${SCHOOL_IDS.map((id) => this.schoolCard(id)).join('')}</div></div>`
    );
  }

  private schoolCard(id: SchoolId): string {
    const s = SCHOOLS[id];
    // 主修这个流派的、选角页能选的角色（和角色页的「主修」同一份：content/pools.ts）
    const chars = CHARACTER_IDS.filter((c) => mainSchools(c).includes(id));
    // 起手：这些角色的两件起手里属于本流派的那几件
    const starts: WeaponId[] = [];
    for (const c of chars) for (const w of [CHARACTERS[c].start, altStart(c)]) if (s.weapons.includes(w) && !starts.includes(w)) starts.push(w);
    const ic = (src: string, name: string): string => `<img class="yx-gi" alt="${esc(name)}" title="${esc(name)}" src="${src}">`;
    return (
      `<div class="yx-gschool"><div class="yx-gsh"><img class="yx-gi yx-gbadge" alt="" src="${schoolIcon(id)}"><b>${esc(s.name)}</b><span>${esc(s.brief)}</span>` +
      `<span class="yx-gsi">${s.weapons.slice(0, 4).map((w) => ic(this.icons(WEAPONS[w].icon), WEAPONS[w].name)).join('')}<u></u>${s.passives.slice(0, 3).map((p) => ic(this.icons(PASSIVES[p].icon), PASSIVES[p].name)).join('')}</span></div>` +
      `<div class="yx-gsr"><i>主修</i><b>${chars.map((c) => esc(CHARACTERS[c].name)).join('　') || '暂无'}</b><i>起手</i>${starts.map((w) => this.w(w)).join('') || '<em>无</em>'}</div>` +
      `<div class="yx-gsr"><i>心法</i><b>${esc(XINFA_TEXT[id].name)}</b><small>${esc(XINFA_TEXT[id].text)}</small></div></div>`
    );
  }

  // ── 套装：类型、五行、克怕 ──
  private sets(): string {
    const types = (Object.keys(TYPE_SETS) as WeaponType[]).map((t) => {
      const ws = WEAPON_IDS.filter((id) => WEAPONS[id].type === t);
      return `<li><b>${t}</b>${ws.map((id) => this.img(WEAPONS[id].icon)).join('')}<small>2 件：${esc(TYPE_SETS[t][0])}；3 件：${esc(TYPE_SETS[t][1])}</small></li>`;
    }).join('');
    const cycle = (Object.keys(NEXT_ELEMENT) as (keyof typeof NEXT_ELEMENT)[]).map((e) => `${e}→${NEXT_ELEMENT[e]}`).join('　');
    const ex = WEAPONS.sword;
    const exC = counters(ex.type, ex.el);
    return this.cols(
      this.sec(
        '同一类、同一行凑套装',
        '<p>每件法器卡上有两个字：类型（剑、符、镇、灵）和五行（金木水火土）。凑够 2 件、3 件有套装：</p>' +
          `<ul class="yx-glist">${types}</ul>` +
          `<p class="yx-gnote">同一行（五行）2 件：${esc(ELEMENT_SET[0])}；3 件：${esc(ELEMENT_SET[1])}。相生：${cycle}。</p>`,
      ),
      this.sec(
        '卡上的「克 · 怕」',
        `<p>每种怪对法器的类型和五行有强有弱。比如 ${this.w('sword')}：</p>` +
          `<div class="yx-grecipe">${exC.strong.length ? `<i>克</i>${exC.strong.map((k) => this.mob(k)).join('')}` : ''}${exC.weak.length ? `<i>怕</i>${exC.weak.map((k) => this.mob(k)).join('')}` : ''}</div>` +
          '<p class="yx-gnote">「怕」的怪多了，就该补一件别的类型。危险 5 起「克」不再多打（怪不怕克制了），「怕」照旧。</p>',
      ),
    );
  }

  // ── 进化：满级 + 被动 ──
  private evolve(): string {
    return this.sec(
      `满级（${MAX_WEAPON_LEVEL} 级）+ 配对的被动，下一个宝箱就进化`,
      `<div class="yx-grecipes yx-gevo">${WEAPON_IDS.map((id) => this.recipe(id)).join('')}</div>`,
    );
  }

  // ── 合成·双修：能选的角色凑得出的全部配方（content/combos.ts SHOWN_MERGES），当前角色凑不出的压暗 ──
  private merges(): string {
    const list = SHOWN_MERGES;
    const mine = list.filter((m) => mergeReach(m, this.char) === 'ok').length;
    return (
      '<div class="yx-gmpage"><div class="yx-gmhead"><b>合成·双修</b>' +
      `<span><em class="yx-gtag mix">合成</em>${esc(mergeHow({}))}</span>` +
      `<span><em class="yx-gtag dual">双修</em>${esc(mergeHow({ dual: true }))}</span>` +
      `<span class="yx-gnote">条件齐了，下一个宝箱就合上，大成才空出一格；共 ${list.length} 个，${esc(CHARACTERS[this.char].name)}凑得出 ${mine} 个（压暗的凑不出）</span></div>` +
      `<div class="yx-gmlist">${list.map((m) => this.mergeRow(m)).join('')}</div></div>`
    );
  }

  /** 一行配方：专属的标谁的；不是人人能合的标几个人能合（名字在悬停提示里）；当前角色凑不出的压暗 */
  private mergeRow(m: MergeDef): string {
    const n = mergeWho(m).length;
    const who = m.only
      ? `<em class="yx-gtag only">${m.only.split(',').map((c) => esc(CHARACTERS[c as CharacterId].name)).join('、')}专属</em>`
      : n < CHARACTER_IDS.length ? `<em class="yx-gtag only">${n} 人能合</em>` : '';
    const no = mergeReach(m, this.char) !== 'ok';
    return (
      `<div class="yx-gmrow${no ? ' no' : ''}" style="--mc:${m.color}" title="${esc(m.desc)}｜${esc(mergeHow(m))}｜${esc(whoText(m))}">` +
      `${this.evo(m.a) || this.w(m.a)}<i>+</i>${m.dual ? this.w(m.b) : this.evo(m.b) || this.w(m.b)}<span class="yx-gto"><i>→</i><span class="yx-gw evo">${this.img(m.icon)}<b>${esc(m.name)}</b></span></span>` +
      `<em class="yx-gtag ${m.dual ? 'dual' : 'mix'}">${m.dual ? '双修' : '合成'}</em>${who}</div>`
    );
  }

  // ── 配合 ──
  private team(): string {
    const roles = (['crowd', 'single', 'guard'] as Role[]).map((r) => {
      const ws = WEAPON_IDS.filter((id) => WEAPON_ROLE[id] === r);
      return `<div class="yx-grole"><h4>${ROLE_NAME[r]}</h4><p>${ROLE_TIP[r]}</p><div class="yx-grecipe">${ws.map((id) => this.w(id)).join('')}</div></div>`;
    }).join('');
    return this.cols(
      this.sec('一套好搭配 = 三样活都有人干', `<div class="yx-groles">${roles}</div><p class="yx-gnote">前期先拿清群的；精英多起来前补一件单体；手上最好一直有一件保命的。</p>`),
      this.sec(
        '什么时候拿被动',
        '<ol class="yx-glist num">' +
          '<li>手上法器的进化被动，见到就拿（卡上会标）。</li>' +
          `<li>保命：${this.p('xiantao')}${this.p('daopao')}，血少时先拿。</li>` +
          `<li>输出：${this.p('zhusha')}${this.p('xianglu')}${this.p('nianzhu')}，前期都划算；${this.p('lingpai')}只有 ${PASSIVES.lingpai.max} 级，但法器数量 +1 很值。</li>` +
          `<li>${this.p('yinhun')}是赌：${esc(PASSIVES.yinhun.text)}，稳了再拿。</li>` +
          '</ol>' +
          `<p class="yx-gnote">格子有限：${MAX_WEAPONS} 件法器、${MAX_PASSIVES} 件被动。别全占满却一件都没升满。</p>`,
      ),
    );
  }

  // ── 模式 ──
  private night(): string {
    const m = this.modeSecs();
    return this.cols(m[0]! + m[1]!, m[3]!);
  }

  private raid(): string {
    const m = this.modeSecs();
    return this.cols(m[2]!, m[4]!).replace('yx-gcols', 'yx-gcols yx-gbig');
  }

  /** 五段：守夜、本周夜事、夜探、首领连战、实盘 */
  private modeSecs(): string[] {
    const left = (t: number): string => clock(RAID_DAWN - t);
    // 屏幕上是"离天亮"倒计时，所以按倒计时写：倒计时从 A 走到 B 这段时间里开门
    const gates = GATE_WINDOWS.map((g) => `倒计时 ${left(g.from)} 到 ${left(g.to)}${g.all ? ' 四门全开' : ' 开一座门'}`).join('；');
    const tiers = LIVE_TIER_IDS.map((t) => `${LIVE_TIERS[t].name}档 ${LIVE_TIERS[t].stake.toLocaleString('zh-CN')}`).join('、');
    const closed = LIVE_MAP_CLOSED.map((m) => MAPS[m].name).join('、');
    const s = [
      this.sec('守夜', `<p>选地图和危险档，撑到天亮（${clock(DAWN_TICK)}）。打倒尸王提前天亮。也可以选「天亮不收工」一直打到倒下。</p>` +
        `<p><b>夜市</b>开打后第 ${NIGHT_MARKET.at.map((t) => Math.round(t / 1800)).join('、')} 分钟，货郎在你附近摆 ${NIGHT_MARKET.stalls} 个摊，开 ${NIGHT_MARKET.open / 30} 秒，屏幕边的箭头指路；站在摊前一会儿就用局里的铜钱买下：回血、刷新、封禁、临时增益、法器升一级（升离满级最近的那件）、求签（下次升级必出离凑成最近的搭配缺的料）。第二次贵一些，怪照样来。</p>`),
      this.sec(
        '本周夜事',
        '<p>主页的「本周夜事」按钮单独开一局：每周换一个事件（铜钱周、灯会周、精英周、月蚀周、宝箱周轮着来），地图每周也换，危险固定 2、固定小道士，不带加成和咒印。</p>' +
          '<p>一周可以打很多次，成绩只进排行里的「本周夜事」周榜，不进守夜总榜；周一零点换周，当天还能交上周的成绩。</p>',
      ),
      this.sec(
        '夜探：搜宝、打怪、找门撤离',
        '<ul class="yx-glist">' +
          `<li>${this.img('chest')}进镇子开宝箱（站在箱子边读条），宝物放进背包。</li>` +
          `<li><b>撤离门</b>${gates}。站进门圈 3 秒撤出，背包带回家。</li>` +
          `<li><b>鬼市</b>倒计时 ${left(RAID_LATE.market.from)} 到 ${left(RAID_LATE.market.to)} 镇中心摆摊，用局里的铜钱买宝物。</li>` +
          `<li><b>宝库</b>倒计时 ${left(RAID_LATE.vault.at)} 开封，要钥匙；钥匙是倒计时 ${left(RAID_LATE.vault.keyFrom)} 以后第一只倒下的精英或守卫掉的，里面 ${RAID_LATE.vault.items} 件好东西。</li>` +
          '<li>天亮还在镇里，背包全丢。屏幕边的箭头指着最近开着的门。</li>' +
          '</ul>',
      ),
      this.sec(
        '首领连战：每天一局',
        '<ul class="yx-glist">' +
          `<li>${this.img('boss')}主页点「连战」。开局直接给一套成型的法器，${RUSH_STAGES.reduce((a, s) => a + s.length, 0)} 只精英和首领一关一关上，尸王压轴。</li>` +
          `<li>两关之间喘 ${RUSH.rest / 30} 秒、掉肉包；一局最多 ${clock(RUSH.limit)}，打完或到点收工。</li>` +
          '<li>同一天所有人同一套构筑、同一串首领，明天换一套。上「每日连战」榜：全清的比谁快，没全清的比打倒几只。</li>' +
          '<li>不记守夜的纪录、不发铜钱，就是比走位。</li>' +
          '</ul>',
      ),
      this.sec(
        '实盘：带一份筹码',
        '<ul class="yx-glist">' +
          `<li>档位：${tiers}。撑得越久结回越多，最多 ${LIVE_MAX_BP / 10_000} 份；太早倒下就亏。</li>` +
          `<li>不带永久加成和咒印；角色和地图可以选已经解锁的，起手和心法也照选的带。` + (closed ? `${esc(closed)}暂不开放。` : '') + '</li>' +
          `<li>守夜、夜探实盘都能放技能，纸匠、货郎、阴阳先生也都能带；升级、宝箱能抽到的法器、遇到的怪和首领都和娱乐一样。</li>` +
          '<li>筹码不能买、不能换、不能转。</li>' +
          '</ul>',
      ),
    ];
    return s;
  }

  // ── 例子：三个流派的路线，一流派一栏 ──
  private examples(): string {
    return `<div class="yx-gcols yx-g3">${GUIDE_EXAMPLES.map((id) => `<div class="yx-gcol">${this.school(id)}</div>`).join('')}</div>`;
  }

  private school(id: SchoolId): string {
    const s = SCHOOLS[id];
    const core = s.weapons.slice(0, 3);
    const char = CHARACTER_IDS.find((c) => CHARACTERS[c].start === s.weapons[0]);
    const merges = schoolMerges(id);
    return this.sec(
      `${esc(s.name)}怎么玩`,
      '<ol class="yx-glist yx-gsteps">' +
        `<li><b>起手</b>${char ? `选${esc(CHARACTERS[char].name)}，` : ''}带${this.w(s.weapons[0]!)}。</li>` +
        `<li><b>前期</b>拿齐${core.map((w) => this.w(w)).join('')}，被动先拿${s.passives.slice(0, 3).map((p) => this.p(p)).join('')}。</li>` +
        `<li><b>中期</b>升满、配齐进化被动，变成${core.map((w) => this.evo(w)).join('')}</li>` +
        `<li><b>后期</b>空格补${s.weapons.slice(3).map((w) => this.w(w)).join('')}，凑合成或双修：</li>` +
        '</ol>' +
        merges.map((m) => this.mergeRow(m)).join('') +
        `<p class="yx-gnote">${esc(s.tip)}</p>`,
    );
  }
}
