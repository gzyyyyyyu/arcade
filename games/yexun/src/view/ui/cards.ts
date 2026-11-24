/**
 * 升级三选一（DESIGN.md 2.1，手感清单第 5 条）：卡片弹入，点、按 1/2/3、方向键加回车都能选，1 秒内能选完。
 * 卡片排在屏幕中下部、左右手拇指都够得着（手感清单第 10 条）。
 */
import { rushIcon } from '../art/sprites-selicons.ts';
import { ENEMY_BY_KIND } from '../../content/enemies.ts';
import { ELEMENT_SET, PASSIVES, TYPE_SETS, WEAPONS, MAX_WEAPON_LEVEL, upChanges, baseNums, type PassiveId, type StatChange, type WeaponId } from '../../content/weapons.ts';
import { Pick, type Choice, type World } from '../../core/state.ts';
import { SCHOOLS, type SchoolId } from '../../content/guide.ts';
import { RUSH_RELICS, RUSH_SETS, type RelicId } from '../../content/rush.ts';
import { CHEST_FULL, COIN_PICK } from '../../content/picks.ts';
import { XINFA_TEXT } from '../../content/xinfa.ts';
import { counterLine } from './counters.ts';
import { mergeHint, type MergeHint } from './mergeHint.ts';
import { statChip } from './statIcons.ts';
import './cards.css';

/** 「铜钱一袋」卡面和选中后横幅共用的一句 */
const COIN_PICK_TEXT = `铜钱 +${COIN_PICK.coins}，回 ${COIN_PICK.heal} 点血`;
/** 宝箱全满时那袋（核心 openChest 给的数） */
export const CHEST_FULL_TEXT = `都升满了：铜钱 +${CHEST_FULL.coins}，回 ${CHEST_FULL.heal} 点血`;

export interface CardView {
  icon: string;
  name: string;
  /** "新" 或 "Lv 3 → 4" */
  tag: string;
  /** 心法流派的法器："心法·特色名"（content/xinfa.ts），和 tag 一样的小标 */
  xinfa?: string;
  text: string;
  /** 法器的数：升级卡是这一级改了的（前 → 后，upChanges），新法器卡是基础数（前后相同，baseNums） */
  nums?: StatChange[];
  /** 进化提示："进化还差：朱砂" / "满级 + 朱砂 → 斩妖剑" */
  hint: string | null;
  /** 法器的五行·类型 */
  tags?: string;
  /** 克制小字（克 X · 怕 Y，从怪的 vs 表派生） */
  counter?: string;
  /** 拿了以后凑成的套装："剑 2 件：暴击 +8%" */
  set?: string;
  /** 拿了离合成 / 双修只差一步或正好凑成 */
  merge?: MergeHint;
  /** 连战符印：图标地址（rushIcon 现画，不在图集里） */
  seal?: string;
  /** 连战稀有度（卡框白 / 青 / 金） */
  tier?: 1 | 2 | 3;
}

/** 连战里效果不一样的被动（连战不升级、不掉铜钱）：卡面照实写 */
const RUSH_TEXT: Partial<Record<PassiveId, string>> = {
  lingzhi: '桃花雨的进化材料（连战里不加经验）',
  yinhun: '连战里只让怪快 5%，不加经验和铜钱',
};

/** 连战一手卡（view/game GameScene 按 World 填）：标题、还要挑几张、每张锁没锁、能不能放逐、跳过换多少纸钱 */
export interface RushHand {
  title: string;
  sub: string;
  rerolls: number;
  bans: number;
  locks: number;
  locked: boolean[];
  /** 符印不能放逐 */
  banOk: boolean[];
  skipCoins: number;
}

const TIER_TAG = ['', '', '稀有', '珍品'] as const;

export function describe(w: World, c: Choice): CardView {
  if (c.kind === 'relic') {
    const r = RUSH_RELICS[c.id as RelicId];
    return { icon: '', seal: rushIcon(c.id as RelicId), name: r.name, tag: '符印', text: r.text, hint: null, tier: 3 };
  }
  const v = describeBase(w, c);
  const merge = mergeHint(w, c);
  const out: CardView = merge ? { ...v, merge } : v;
  // 卡池抽空时核心发铜钱卡（rush-flow drawCard）：没有等级可写，不走连战小标
  if (!w.rush || !c.tier || c.kind === 'coins') return out;
  return { ...out, tier: c.tier, ...rushTag(w, c, c.tier), ...rushSet(w, c) };
}

/** 连战卡的等级小标：稀有度 = 一次升几级（新法器直接到这一级） */
function rushTag(w: World, c: Choice, t: 1 | 2 | 3): { tag: string } {
  const pre = TIER_TAG[t] ? `${TIER_TAG[t]} · ` : '';
  if (c.kind === 'weapon') {
    const o = w.weapons.find((x) => x.id === c.id);
    if (!o) return { tag: t > 1 ? `${pre}新 · ${t} 级` : '新' };
    return { tag: `${pre}${o.level}→${Math.min(MAX_WEAPON_LEVEL, o.level + t)} 级` };
  }
  const lv = w.passives[c.id as PassiveId] ?? 0;
  const max = PASSIVES[c.id as PassiveId].max;
  return { tag: lv === 0 && t === 1 ? '新' : `${pre}${lv}→${Math.min(max, lv + t)} 级` };
}

/** 连战流派套：这张在哪个流派单子上，拿了以后凑到几件（写「剑修 2/3」） */
function rushSet(w: World, c: Choice): { set?: string } {
  for (const sid of Object.keys(SCHOOLS) as SchoolId[]) {
    const sc = SCHOOLS[sid];
    const list: readonly string[] = [...sc.weapons, ...sc.passives];
    if (!list.includes(c.id)) continue;
    const have = list.filter((id) => w.weapons.some((o) => o.id === id) || (w.passives[id as PassiveId] ?? 0) > 0);
    const n = have.length + (have.includes(c.id) ? 0 : 1);
    const need = RUSH_SETS.need.find((k) => k >= n) ?? RUSH_SETS.need[RUSH_SETS.need.length - 1]!;
    return { set: `${sc.name} ${Math.min(n, need)}/${need}${n >= need ? ` · 伤害 +${Math.round(RUSH_SETS.bonus[RUSH_SETS.need.indexOf(need)]! * 100)}%` : ''}` };
  }
  return {};
}

function describeBase(w: World, c: Choice): CardView {
  if (c.kind === 'weapon') {
    const def = WEAPONS[c.id as WeaponId];
    const o = w.weapons.find((x) => x.id === def.id);
    const evo = def.evolve;
    const hint = evo ? `满级 + ${PASSIVES[evo.with].name} → ${evo.name}${(w.passives[evo.with] ?? 0) > 0 ? '（已有）' : ''}` : null;
    const tags = `${def.el}·${def.type}`;
    // 心法流派的法器（特色只加它们，core/xinfa.ts）：名字旁边标特色名，让心法在局里看得见（手机上五行·类型那行是藏着的）
    const xf = w.xinfa;
    const xinfa = xf && SCHOOLS[xf].weapons.includes(def.id) ? `心法·${XINFA_TEXT[xf].name}` : undefined;
    const counter = counterLine(def.type, def.el, (k) => ENEMY_BY_KIND[k].name) ?? undefined;
    if (!o) {
      // 新法器：拿了以后能凑成哪个套装
      const sameType = w.weapons.filter((x) => WEAPONS[x.id].type === def.type).length + 1;
      const sameEl = w.weapons.filter((x) => WEAPONS[x.id].el === def.el).length + 1;
      let set: string | undefined;
      if (sameType === 2 || sameType === 3) set = `${def.type} ${sameType} 件：${TYPE_SETS[def.type][sameType - 2]}`;
      else if (sameEl === 2 || sameEl === 3) set = `${def.el} ${sameEl} 件：${ELEMENT_SET[sameEl - 2]}`;
      return { icon: def.icon, name: def.name, tag: '新', xinfa, text: def.desc, nums: baseNums(def.id), hint, tags, set, counter };
    }
    return { icon: def.icon, name: def.name, xinfa, tag: o.level + 1 >= MAX_WEAPON_LEVEL ? `${o.level} 级→满` : `${o.level}→${o.level + 1} 级`, text: def.ups[o.level - 1]?.text ?? '', nums: upChanges(def.id, o.level), hint, tags, counter };
  }
  if (c.kind === 'passive') {
    const def = PASSIVES[c.id as PassiveId];
    const lv = w.passives[def.id] ?? 0;
    const pairs = Object.values(WEAPONS).filter((x) => x.evolve?.with === def.id && w.weapons.some((o) => o.id === x.id));
    return {
      icon: def.icon,
      name: def.name,
      tag: lv === 0 ? '新' : `${lv}→${lv + 1} 级`,
      // 连战等级固定、不吃魂、没有小怪掉钱：只涨经验、铜钱的照实说它在连战里干什么
      text: w.rush ? (RUSH_TEXT[def.id] ?? def.text) : def.text,
      hint: pairs.length ? `${pairs.map((p) => p.name).join('、')}进化要它` : null,
    };
  }
  return { icon: 'coin', name: '铜钱一袋', tag: '', text: COIN_PICK_TEXT, hint: null };
}

/** 小标行放不下时缩到 12 像素（字号下限，AGENTS.md「画面」），不折行；要在显示之后量 */
function fitBadges(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>('.yx-pick-badges')) if (el.scrollWidth > el.clientWidth) el.style.fontSize = '12px';
}

export class Cards {
  private readonly root: HTMLDivElement;
  private onPick: ((i: number) => void) | null = null;
  private focus = 0;
  private items: HTMLButtonElement[] = [];
  private openedAt = 0;
  private readonly icons: (key: string) => string;
  /** 弹出时通知（引导记一笔：带说明的卡片看过了） */
  onShow: (firstTime: boolean) => void = () => undefined;
  /** 封禁模式：下一张点的卡被封掉 */
  private banning = false;
  private counts = { rerolls: 0, bans: 0, left: 1 };
  /** 正在一口气连选（打倒首领、开宝箱后连升好几级）：倒数到最后一次也写一句，选完才清 */
  private batch = false;
  private bar: HTMLDivElement | null = null;

  constructor(parent: HTMLElement, icons: (key: string) => string) {
    this.icons = icons;
    this.root = document.createElement('div');
    this.root.className = 'yx-picks';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.onPick || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = this.items.length;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (e.repeat) {
        // 按住不放不连续触发选卡，只拦掉默认行为
        e.preventDefault();
        return;
      }
      if (k >= '1' && k <= String(n)) this.pick(Number(k) - 1);
      else if (k === 'r') this.action(Pick.Reroll);
      else if (k === 'x' || k === 'b') this.toggleBan();
      // 不用空格：空格是放技能键，边跑边按会撞上弹出的选卡把这一级丢掉
      else if (k === 'z') this.action(Pick.Skip);
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'a' || k === 'w') this.setFocus((this.focus + n - 1) % n);
      else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'd' || k === 's') this.setFocus((this.focus + 1) % n);
      else if (k === 'Enter') this.pick(this.focus);
      else return;
      e.preventDefault();
    });
  }

  get open(): boolean {
    return this.onPick !== null;
  }

  /** 局结束（认输、倒下）时收起，不留在结算页底下 */
  close(): void {
    this.onPick = null;
    this.root.classList.remove('open');
    this.root.style.display = 'none';
  }

  /** onPick 收到的是 step 的 choice：0–2 选第几张，或 Pick.Reroll / Pick.Ban + i / Pick.Skip */
  /**
   * simple：这台设备的第一局。卡上只留名字、说明和数，不写克制、套件、合成（新手实录：第一次选卡三张卡十几行小字）；
   * 3 级以前也不摆刷新、封禁、跳过（快捷键照样能用）
   */
  /** level：升到几级；'chest' 宝箱；{ stage } 连战过关（第几关 / 共几只，写进大字） */
  show(level: number | 'chest' | { stage: string }, cards: CardView[], firstTime: boolean, simple: boolean, counts: { rerolls: number; bans: number; left: number }, onPick: (i: number) => void): void {
    this.onPick = onPick;
    this.counts = counts;
    this.banning = false;
    this.openedAt = performance.now();
    this.root.innerHTML = '';
    this.root.classList.remove('rush', 'many', 'crowd');
    const head = document.createElement('div');
    head.className = 'yx-picks-head';
    head.innerHTML =
      `<span class="yx-picks-lv${typeof level === 'number' ? '' : ' chest'}">${level === 'chest' ? '宝箱 · 挑一件' : typeof level === 'object' ? `过关 ${level.stage} · 挑一件` : `升到 ${level} 级`}</span><span class="yx-picks-tip yx-picks-left" hidden></span>` +
      (firstTime ? '<span class="yx-picks-tip">挑一个：新法器、法器升级，或者被动</span>' : '');
    this.root.appendChild(head);
    const row = document.createElement('div');
    row.className = 'yx-picks-row';
    this.items = cards.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `yx-pick${c.tier ? ` t${c.tier}` : ''}`;
      b.style.animationDelay = `${i * 60}ms`;
      // 固定的几段：图标 → 名字（一行）→ 标签行（新 / Lv / 心法）→ 五行·类型 → 效果 → 底部提示；没内容的段也占位，三张卡同一套格子对齐
      const badges = (c.tag ? `<em${c.tag === '新' ? ' class="new"' : ''}>${c.tag}</em>` : '') + (c.xinfa ? `<em>${c.xinfa}</em>` : '');
      // 数写成「图标 + 数」（叫法在悬停提示里）；第一局的简版卡图标后面还写叫法，先认图标
      // 新法器卡第一次见这些数，图标后写上叫法（试玩 11-22：「24 · 2.33 秒 · 1」看不出 24 是伤害）；升级卡只写变化
      const nums = c.nums?.length ? `<span class="yx-pick-nums${c.tag === '新' ? ' base' : ''}">${c.nums.map((n) => statChip(n, simple || c.tag === '新')).join('')}</span>` : '';
      const foot = simple
        ? ''
        : (c.counter ? `<span class="yx-pick-counter">${c.counter}</span>` : '') +
        (c.set ? `<span class="yx-pick-set">${c.set}</span>` : '') +
        (c.merge ? `<span class="yx-pick-merge${c.merge.ready ? ' ready' : ''}" style="--mc:${c.merge.color}"><b>${c.merge.dual ? '双' : '合'}</b>${c.merge.text}</span>` : '') +
          (c.hint ? `<span class="yx-pick-hint">${c.hint}</span>` : '');
      b.innerHTML =
        `<span class="yx-pick-key">${i + 1}</span>` +
        (c.seal ? `<img class="yx-pick-seal" alt="" src="${c.seal}">` : `<img alt="" src="${this.icons(c.icon)}">`) +
        `<span class="yx-pick-name">${c.name}</span>` +
        `<span class="yx-pick-badges">${badges}</span>` +
        `<span class="yx-pick-tags">${c.tags ?? ''}</span>` +
        `<span class="yx-pick-body"><span class="yx-pick-text">${c.text}</span>${nums}</span>` +
        `<span class="yx-pick-foot">${foot}</span>`;
      b.addEventListener('click', () => this.pick(i));
      row.appendChild(b);
      return b;
    });
    this.root.appendChild(row);
    // 卡片三件套：刷新、封禁（点了以后再点一张卡）、跳过（随机小奖）
    const bar = document.createElement('div');
    bar.className = 'yx-picks-bar';
    bar.innerHTML =
      `<button type="button" data-a="reroll"${counts.rerolls > 0 ? '' : ' disabled'}><kbd>R</kbd><span>刷新 <b>${counts.rerolls}</b></span><small>整批换掉</small></button>` +
      `<button type="button" data-a="ban"${counts.bans > 0 ? '' : ' disabled'}><kbd>X</kbd><span>封禁 <b>${counts.bans}</b></span><small>这张整局不再出现</small></button>` +
      '<button type="button" data-a="skip"><kbd>Z</kbd><span>跳过 · 随机小奖</span><small>随机拿个小奖</small></button>';
    bar.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'reroll') this.action(Pick.Reroll);
      else if (a === 'ban') this.toggleBan();
      else if (a === 'skip') this.action(Pick.Skip);
    });
    if (simple && typeof level === 'number' && level < 3) bar.style.display = 'none';
    this.bar = bar;
    this.root.appendChild(bar);
    this.root.classList.remove('banning');
    // 刚弹出的 150 毫秒不收点击：卡片画成「禁用」样子，别让人以为点了没反应
    this.root.classList.add('open', 'locked');
    window.setTimeout(() => this.root.classList.remove('locked'), 150);
    this.root.style.display = '';
    fitBadges(this.root);
    this.setLeft(counts.left);
    this.setFocus(0);
    this.onShow(firstTime);
  }

  /**
   * 连战一手卡：5 张（聚宝盆、古井更多），挑 N 张；每张右上角锁、放逐两个小钮（≥44），底栏重抽、跳过（剩下的换纸钱）。
   * 每点一下都交给核心（锁、放逐、挑一张都是一个选择码），核心改完这手卡再弹一次
   */
  showRush(h: RushHand, cards: CardView[], onPick: (code: number) => void): void {
    this.show({ stage: '' }, cards, false, false, { rerolls: h.rerolls, bans: h.bans, left: 1 }, onPick);
    // 手牌多（许愿、血契、聚宝盆）：手机竖屏收成「名字 + 一行说明」，再多就只留名字（cards.css 连战段）
    this.root.classList.add('rush');
    this.root.classList.toggle('many', cards.length >= 6);
    this.root.classList.toggle('crowd', cards.length >= 7);
    const lv = this.root.querySelector<HTMLElement>('.yx-picks-lv');
    if (lv) lv.textContent = h.title;
    const tip = this.root.querySelector<HTMLElement>('.yx-picks-left');
    if (tip) {
      tip.textContent = h.sub;
      tip.hidden = false;
    }
    this.items.forEach((b, i) => {
      const cell = document.createElement('div');
      cell.className = `yx-pickcell${h.locked[i] ? ' locked' : ''}`;
      b.replaceWith(cell);
      cell.append(b);
      const tools = document.createElement('div');
      tools.className = 'yx-picktools';
      const lockOff = !h.locked[i] && h.locks <= 0;
      tools.innerHTML =
        `<button type="button" class="yx-picktool lock${h.locked[i] ? ' on' : ''}" title="${h.locked[i] ? '解锁' : '锁住，留到下一关'}"${lockOff ? ' disabled' : ''}>${h.locked[i] ? '已锁' : '锁'}</button>` +
        `<button type="button" class="yx-picktool ban" title="放逐：这一件整局不再出现"${h.bans > 0 && h.banOk[i] ? '' : ' disabled'}>放逐</button>`;
      tools.querySelector('.lock')!.addEventListener('click', () => this.action(Pick.Lock + i));
      tools.querySelector('.ban')!.addEventListener('click', () => this.action(Pick.Ban + i));
      cell.append(tools);
    });
    const bar = this.bar;
    if (bar) {
      bar.style.display = '';
      bar.querySelector('[data-a="ban"]')?.remove();
      const rr = bar.querySelector('[data-a="reroll"]');
      if (rr) rr.innerHTML = `<kbd>R</kbd><span>重抽 <b>${h.rerolls}</b></span><small>没挑没锁的全换</small>`;
      const sk = bar.querySelector('[data-a="skip"]');
      if (sk) sk.innerHTML = `<kbd>Z</kbd><span>不挑了 · 换 ${h.skipCoins} 纸钱</span><small>剩下没锁的每张换纸钱</small>`;
    }
  }

  /**
   * 连升好几级时写还要选几次（含这一次），倒数到最后一张写「最后一次」；平常升一级不写。
   * 新手实录：打倒纸扎老爷后连弹 8 次，一张接一张，看不出什么时候完。选的那一拍又吸到魂火会再加，GameScene 每帧调
   */
  setLeft(left: number): void {
    this.counts.left = left;
    if (left >= 2) this.batch = true;
    const text = left >= 2 ? `还要选 ${left} 次` : this.batch ? '最后一次' : '';
    const el = this.root.querySelector<HTMLElement>('.yx-picks-left');
    if (!el || el.textContent === text) return;
    el.textContent = text;
    el.hidden = !text;
  }

  private setFocus(i: number): void {
    this.focus = i;
    this.items.forEach((b, k) => b.classList.toggle('focus', k === i));
  }

  private pick(i: number): void {
    this.action(this.banning ? Pick.Ban + i : i);
  }

  private toggleBan(): void {
    if (!this.onPick || this.counts.bans <= 0) return;
    this.banning = !this.banning;
    this.root.classList.toggle('banning', this.banning);
    this.bar?.querySelector('[data-a="ban"]')?.classList.toggle('on', this.banning);
    // 封禁模式说一句接下来干什么（手机上按钮底下的小字是藏着的）
    const head = this.root.querySelector('.yx-picks-head');
    head?.querySelector('.yx-picks-bantip')?.remove();
    if (this.banning) head?.insertAdjacentHTML('beforeend', '<span class="yx-picks-tip yx-picks-bantip">点一张卡封掉，这局不再出现</span>');
  }

  private action(code: number): void {
    // 卡片刚弹出的 150 ms 里不收，免得正在连点屏幕走路的手误选
    if (!this.onPick || performance.now() - this.openedAt < 150) return;
    if (code === Pick.Reroll && this.counts.rerolls <= 0) return;
    // 选掉了最后一张（刷新、封禁之后还会再弹，不算）
    if (this.counts.left <= 1 && (code < Pick.Reroll || code === Pick.Skip)) this.batch = false;
    const cb = this.onPick;
    this.onPick = null;
    this.root.classList.remove('open');
    this.root.style.display = 'none';
    cb(code);
  }
}
