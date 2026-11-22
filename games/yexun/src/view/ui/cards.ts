/**
 * 升级三选一（DESIGN.md 2.1，手感清单第 5 条）：卡片弹入，点、按 1/2/3、方向键加回车都能选，1 秒内能选完。
 * 卡片排在屏幕中下部、左右手拇指都够得着（手感清单第 10 条）。
 */
import { ELEMENT_SET, PASSIVES, TYPE_SETS, WEAPONS, MAX_WEAPON_LEVEL, upChanges, baseNums, type PassiveId, type StatChange, type WeaponId } from '../../content/weapons.ts';
import { Pick, type Choice, type World } from '../../core/state.ts';
import { SCHOOLS } from '../../content/guide.ts';
import { XINFA_TEXT } from '../../content/xinfa.ts';
import { MONSTER_INFO } from './codex.ts';
import { counterLine } from './counters.ts';
import { mergeHint, type MergeHint } from './mergeHint.ts';
import './cards.css';

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
}

export function describe(w: World, c: Choice): CardView {
  const v = describeBase(w, c);
  const merge = mergeHint(w, c);
  return merge ? { ...v, merge } : v;
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
    const counter = counterLine(def.type, def.el, (k) => MONSTER_INFO[k].name) ?? undefined;
    if (!o) {
      // 新法器：拿了以后能凑成哪个套装
      const sameType = w.weapons.filter((x) => WEAPONS[x.id].type === def.type).length + 1;
      const sameEl = w.weapons.filter((x) => WEAPONS[x.id].el === def.el).length + 1;
      let set: string | undefined;
      if (sameType === 2 || sameType === 3) set = `${def.type} ${sameType} 件：${TYPE_SETS[def.type][sameType - 2]}`;
      else if (sameEl === 2 || sameEl === 3) set = `${def.el} ${sameEl} 件：${ELEMENT_SET[sameEl - 2]}`;
      return { icon: def.icon, name: def.name, tag: '新', xinfa, text: def.desc, nums: baseNums(def.id), hint, tags, set, counter };
    }
    return { icon: def.icon, name: def.name, xinfa, tag: o.level + 1 >= MAX_WEAPON_LEVEL ? `Lv ${o.level}→满` : `Lv ${o.level}→${o.level + 1}`, text: def.ups[o.level - 1]?.text ?? '', nums: upChanges(def.id, o.level), hint, tags, counter };
  }
  if (c.kind === 'passive') {
    const def = PASSIVES[c.id as PassiveId];
    const lv = w.passives[def.id] ?? 0;
    const pairs = Object.values(WEAPONS).filter((x) => x.evolve?.with === def.id && w.weapons.some((o) => o.id === x.id));
    return {
      icon: def.icon,
      name: def.name,
      tag: lv === 0 ? '新' : `Lv ${lv}→${lv + 1}`,
      text: def.text,
      hint: pairs.length ? `${pairs.map((p) => p.name).join('、')}进化要它` : null,
    };
  }
  return { icon: 'coin', name: '铜钱一袋', tag: '', text: '铜钱 +25，回 20 点血', hint: null };
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
  private counts = { rerolls: 0, bans: 0 };
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

  /** onPick 收到的是 step 的 choice：0–2 选第几张，或 Pick.Reroll / Pick.Ban + i / Pick.Skip */
  /**
   * simple：这台设备的第一局。卡上只留名字、说明和数，不写克制、套件、合成（新手实录：第一次选卡三张卡十几行小字）；
   * 3 级以前也不摆刷新、封禁、跳过（快捷键照样能用）
   */
  show(level: number, cards: CardView[], firstTime: boolean, simple: boolean, counts: { rerolls: number; bans: number }, onPick: (i: number) => void): void {
    this.onPick = onPick;
    this.counts = counts;
    this.banning = false;
    this.openedAt = performance.now();
    this.root.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'yx-picks-head';
    head.innerHTML = `<span class="yx-picks-lv">升到 ${level} 级</span>${firstTime ? '<span class="yx-picks-tip">挑一个：新法器、法器升级，或者被动</span>' : ''}`;
    this.root.appendChild(head);
    const row = document.createElement('div');
    row.className = 'yx-picks-row';
    this.items = cards.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'yx-pick';
      b.style.animationDelay = `${i * 60}ms`;
      // 固定的几段：图标 → 名字（一行）→ 标签行（新 / Lv / 心法）→ 五行·类型 → 效果 → 底部提示；没内容的段也占位，三张卡同一套格子对齐
      const badges = (c.tag ? `<em${c.tag === '新' ? ' class="new"' : ''}>${c.tag}</em>` : '') + (c.xinfa ? `<em>${c.xinfa}</em>` : '');
      const nums = c.nums?.length ? `<span class="yx-pick-nums${c.tag === '新' ? ' base' : ''}">${c.nums.map((n) => `<span>${n.name} <b>${n.from === n.to ? n.from : `${n.from}→${n.to}`}</b>${n.unit}</span>`).join('')}</span>` : '';
      const foot = simple
        ? ''
        : (c.counter ? `<span class="yx-pick-counter">${c.counter}</span>` : '') +
        (c.set ? `<span class="yx-pick-set">${c.set}</span>` : '') +
        (c.merge ? `<span class="yx-pick-merge${c.merge.ready ? ' ready' : ''}" style="--mc:${c.merge.color}"><b>${c.merge.dual ? '双' : '合'}</b>${c.merge.text}</span>` : '') +
          (c.hint ? `<span class="yx-pick-hint">${c.hint}</span>` : '');
      b.innerHTML =
        `<span class="yx-pick-key">${i + 1}</span>` +
        `<img alt="" src="${this.icons(c.icon)}">` +
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
    if (simple && level < 3) bar.style.display = 'none';
    this.bar = bar;
    this.root.appendChild(bar);
    this.root.classList.remove('banning');
    // 刚弹出的 150 毫秒不收点击：卡片画成「禁用」样子，别让人以为点了没反应
    this.root.classList.add('open', 'locked');
    window.setTimeout(() => this.root.classList.remove('locked'), 150);
    this.root.style.display = '';
    fitBadges(this.root);
    this.setFocus(0);
    this.onShow(firstTime);
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
    const cb = this.onPick;
    this.onPick = null;
    this.root.classList.remove('open');
    this.root.style.display = 'none';
    cb(code);
  }
}
