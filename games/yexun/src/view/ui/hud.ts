/**
 * 战斗中的 HUD（DOM）：左上回大厅、头像、血条护盾；顶部计时和经验条；右上击杀、铜钱、暂停；右侧法器格；连斩横幅。
 * 用 DOM 而不用画布画：字在手机上清楚、好检查 44 像素的点击区域；数字一秒只改几次，开销很小。
 * 毛笔字（连斩横幅）用子集化的马善政楷书（ASSETS.md）。
 */
import './hud.css';
import { EVENT_ICON } from './eventIcons.ts';

export interface HudSlot {
  icon: string;
  level: number;
  /** 冷却进度 0–1（1 = 刚好转好） */
  cd: number;
  /** 规则 63 的初成搭配：虚线框 + 「初」角标 */
  half?: boolean;
}

export interface HudState {
  hp: number;
  hpMax: number;
  shield: number;
  shieldMax: number;
  level: number;
  xp: number;
  /** 剩余秒数（守夜：离天亮） */
  left: number;
  kills: number;
  coins: number;
  slots: HudSlot[];
  /** 被动：只显示图标和等级，不点 */
  passives: { icon: string; level: number }[];
  /** 阴阳先生头像上的阴阳标（core/skills.ts yinyangSide）；别的角色 null */
  yy: 'yang' | 'yin' | null;
  /** 夜探：顶上换成天亮倒计时（label 是"离天亮"或"天亮"，level 1 = 14:00 起醒目，2 = 最后 30 秒变红），右上多一个背包件数 */
  /** 守夜：下一次地图事件的倒计时小牌（mapEvents.ts 的 nextMapEvent；没有就不给） */
  event?: { kind: string; name: string; left: number; urgent: boolean } | null;
  /** 首领连战：顶上写"剩余"，隐藏夜市小字 */
  rush?: boolean;
  raid?: { label: string; level: 0 | 1 | 2; bag: number; value: number };
}

/** 技能按钮的状态（对局里每帧给；show 为 false 整个收起） */
export interface HudSkill {
  show: boolean;
  icon: string;
  name: string;
  /** 冷却进度 0–1（1 = 好了） */
  cd: number;
  /** 持续中（亮蓝边，环显示还剩多少） */
  active: number;
  /** 冷却还剩几秒（向上取整；0 = 好了或在持续中，不显示） */
  left: number;
  /** 键盘提示（电脑上显示在角上） */
  key: string;
}

/** 屏幕边上的撤离箭头（guide-hud.ts 的 EdgeArrow 里画面要用的几个字段） */
export interface HudArrow {
  x: number;
  y: number;
  dx: number;
  dy: number;
  label: string;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
};

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
const fmt = (n: number): string => n.toLocaleString('zh-CN');
/** 击杀上万写"1.5万"（往下取一位，不往大里报）：顶栏寸土寸金，五位数带逗号太宽 */
const fmtKills = (n: number): string => (n >= 10_000 ? `${Math.floor(n / 1000) / 10}万` : fmt(n));

export class Hud {
  readonly root: HTMLDivElement;
  readonly homeBtn: HTMLButtonElement;
  readonly pauseBtn: HTMLButtonElement;
  private hpFill: HTMLDivElement;
  private hpText: HTMLSpanElement;
  private shFill: HTMLDivElement;
  private shBar: HTMLDivElement;
  private lv: HTMLSpanElement;
  /** 阴阳先生的阴阳标 */
  private yy: HTMLSpanElement;
  private xpFill: HTMLDivElement;
  private time: HTMLSpanElement;
  private tlabel: HTMLSpanElement;
  private timer: HTMLDivElement;
  /** 夜探的背包按钮（可点，点开背包面板，见 raidhud.ts） */
  readonly bagBox: HTMLButtonElement;
  private bag: HTMLSpanElement;
  private arrow: HTMLDivElement;
  private arrowIcon: HTMLElement;
  private arrowText: HTMLSpanElement;
  /** 宝妖的箭头（橙色，和撤离箭头同一套摆法） */
  private gbArrow: HTMLDivElement;
  private gbIcon: HTMLElement;
  private gbText: HTMLSpanElement;
  /** 夜市的箭头（青绿色） */
  private mkArrow: HTMLDivElement;
  private mkIcon: HTMLElement;
  private mkText: HTMLSpanElement;
  /** 夜市买的临时增益小标签（顶栏计时下面） */
  private buffTag: HTMLDivElement;
  private evTag: HTMLDivElement;
  private evKey = '';
  private raidOn = false;
  private rushOn = false;
  private kills: HTMLSpanElement;
  private coins: HTMLSpanElement;
  private slotEls: { box: HTMLDivElement; cd: HTMLDivElement; lv: HTMLSpanElement }[] = [];
  private slotsCol: HTMLDivElement;
  private passCol: HTMLDivElement;
  /** 法器格、被动格的组成（图标 + 顺序）变了才重建 DOM，平时只改冷却和等级 */
  private slotSig = '';
  private passSig = '';
  readonly icons: (key: string) => string;
  private combo: HTMLDivElement;
  private comboNum: HTMLSpanElement;
  private comboTimer: ReturnType<typeof setTimeout> | null = null;

  private faceImg: HTMLImageElement | null = null;

  /** 技能按钮：点一下放（Space、Q 同效）；对局场景接上 */
  readonly skillBtn: HTMLButtonElement;
  private skillImg: HTMLImageElement;
  private skillKey: HTMLElement;
  private skillName: HTMLElement;
  /** 冷却中压在图标上的剩余秒数：只看环估不准还要等多久，手机上又没有名字可看 */
  private skillSec: HTMLElement;
  /** 悬停 / 长按技能钮弹出的完整说明（内容由 setSkillInfo 给） */
  private skillTip: HTMLElement;
  private tipTimer = 0;
  /** 技能还锁着时按了键，在技能位闪一下的小牌 */
  private lockTag: HTMLElement;
  private skillSig = '';
  /** 点按钮的回调（main.ts 接到 Input.pressSkill） */
  onSkill: () => void = () => undefined;

  /** 换头像（开局按出战的角色换） */
  setFace(src: string): void {
    if (this.faceImg) this.faceImg.src = src;
  }

  private avatar!: HTMLElement;

  /** 外观「头像框」（content/meta.ts LOOKS）：换头像的边框颜色；null 是原样 */
  setFrame(look: { color: string; edge: string } | null): void {
    this.avatar.classList.toggle('yx-look', !!look);
    if (look) {
      this.avatar.style.setProperty('--lf', look.color);
      this.avatar.style.setProperty('--lfe', look.edge);
    }
  }

  constructor(parent: HTMLElement, icons: (key: string) => string, face: string) {
    this.icons = icons;
    const root = el('div', 'yx-hud', parent);
    this.root = root;
    // 左上：回大厅 + 头像 + 血条护盾
    // 顶栏三块（左上、计时、右上）放进一个容器：电脑上它不生成盒子（display: contents，三块各自贴边或居中），
    // 手机竖屏和大屏上它是一行 flex / 网格，三块自然排开、不会叠
    const top = el('div', 'yx-top', root);
    const tl = el('div', 'yx-tl', top);
    const home = el('button', 'yx-btn yx-home', tl);
    this.homeBtn = home;
    home.type = 'button';
    home.setAttribute('aria-label', '回大厅');
    home.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10.5V20h12v-9.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg><span>大厅</span>';
    const card = el('div', 'yx-card', tl);
    const av = el('div', 'yx-avatar', card);
    // 脸放在圆形裁切的内层里；等级、阴阳标挂在外层，不被圆切掉
    const img = el('img', '', el('span', 'yx-face', av));
    this.faceImg = img;
    this.avatar = av;
    img.src = face;
    img.alt = '';
    this.lv = el('span', 'yx-lv', av, '1');
    this.yy = el('span', 'yx-yy', av);
    const bars = el('div', 'yx-bars', card);
    const hp = el('div', 'yx-bar yx-hp', bars);
    this.hpFill = el('div', 'yx-fill', hp);
    this.hpText = el('span', 'yx-bar-text', hp);
    const sh = el('div', 'yx-bar yx-sh', bars);
    this.shFill = el('div', 'yx-fill', sh);
    this.shBar = sh;
    // 顶部：经验条 + 计时
    const xp = el('div', 'yx-xp', root);
    this.xpFill = el('div', 'yx-fill', xp);
    const timer = el('div', 'yx-timer', top);
    this.timer = timer;
    el('span', 'yx-moon', timer);
    const tcol = el('div', 'yx-tcol', timer);
    this.tlabel = el('span', 'yx-tlabel', tcol, '离天亮');
    this.time = el('span', 'yx-time', tcol, '15:00');
    // 右上：击杀、铜钱、暂停
    const tr = el('div', 'yx-tr', top);
    // 击杀和铜钱合成一个胶囊，两个数字并排
    const caps = el('div', 'yx-stat yx-caps', tr);
    const k = el('span', 'yx-cap', caps);
    el('span', 'yx-ico yx-ico-kill', k);
    this.kills = el('span', '', k, '0');
    const c = el('span', 'yx-cap', caps);
    el('span', 'yx-ico yx-ico-coin', c);
    this.coins = el('span', '', c, '0');
    // 夜探的背包件数（守夜不显示）
    this.bagBox = el('button', 'yx-stat yx-bag', tr);
    this.bagBox.type = 'button';
    this.bagBox.setAttribute('aria-label', '背包');
    el('span', 'yx-ico yx-ico-bag', this.bagBox);
    this.bag = el('span', '', this.bagBox, '0');
    this.bagBox.style.display = 'none';
    const pause = el('button', 'yx-btn yx-pause', tr);
    this.pauseBtn = pause;
    pause.type = 'button';
    pause.setAttribute('aria-label', '暂停');
    pause.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
    // 右侧：法器格（一列，底下垫半透明的板子，雪地上也看得清），被动在它左边一列小格
    const side = el('div', 'yx-side', root);
    this.passCol = el('div', 'yx-passives', side);
    this.slotsCol = el('div', 'yx-slots', side);
    this.passCol.style.display = 'none';
    this.slotsCol.style.display = 'none';
    // 撤离指引：门在屏幕外时，贴着屏幕边的一个箭头 + "东门 · 12 秒"
    this.arrow = el('div', 'yx-xa', root);
    this.arrowIcon = el('i', 'yx-xa-ico', this.arrow);
    this.arrowIcon.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 20h24M20 8l12 12-12 12" fill="none" stroke="#17131c" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h24M20 8l12 12-12 12" fill="none" stroke="#ffd23a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.arrowText = el('span', 'yx-xa-text', this.arrow);
    this.arrow.style.display = 'none';
    this.gbArrow = el('div', 'yx-xa gb', root);
    this.gbIcon = el('i', 'yx-xa-ico', this.gbArrow);
    this.gbIcon.innerHTML = this.arrowIcon.innerHTML.replace(/#ffd23a/g, '#ff8a2a');
    this.gbText = el('span', 'yx-xa-text', this.gbArrow);
    this.gbArrow.style.display = 'none';
    this.mkArrow = el('div', 'yx-xa mk', root);
    this.mkIcon = el('i', 'yx-xa-ico', this.mkArrow);
    this.mkIcon.innerHTML = this.arrowIcon.innerHTML.replace(/#ffd23a/g, '#5fe0b0');
    this.mkText = el('span', 'yx-xa-text', this.mkArrow);
    this.mkArrow.style.display = 'none';
    // 技能按钮：右下角，圆的，一圈冷却环；好了发亮
    this.skillBtn = el('button', 'yx-skill', root);
    this.skillBtn.type = 'button';
    this.skillBtn.style.display = 'none';
    this.skillImg = el('img', '', this.skillBtn);
    this.skillImg.alt = '';
    el('i', 'yx-skill-ring', this.skillBtn);
    this.skillKey = el('b', 'yx-skill-key', this.skillBtn);
    this.skillName = el('span', 'yx-skill-name', this.skillBtn);
    this.skillSec = el('em', 'yx-skill-sec', this.skillBtn);
    this.lockTag = el('div', 'yx-skill-lock', root, '2 级解锁技能');
    this.skillTip = el('div', 'yx-skill-tip', root);
    this.skillTip.style.display = 'none';
    // 按下就放（不等松手），也不抢焦点：不然之后按 Space 会再点一次这个按钮。
    // 手指按住不放 0.45 秒弹出完整说明（冷却中按也不浪费，正好看说明），松手收起；鼠标悬停 0.25 秒弹出
    this.skillBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onSkill();
      if (e.pointerType !== 'mouse') this.tipLater(450);
    });
    const hide = (): void => this.tipShow(false);
    this.skillBtn.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && hide());
    this.skillBtn.addEventListener('pointercancel', hide);
    this.skillBtn.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && this.tipLater(250));
    this.skillBtn.addEventListener('pointerleave', hide);
    this.skillBtn.addEventListener('keydown', (e) => e.preventDefault());
    this.buffTag = el('div', 'yx-buffs', root);
    this.buffTag.style.display = 'none';
    this.evTag = el('div', 'yx-evtag', root);
    this.evTag.style.display = 'none';
    // 连斩横幅
    this.combo = el('div', 'yx-combo', root);
    el('span', 'yx-ink yx-ink-a', this.combo);
    el('span', 'yx-ink yx-ink-b', this.combo);
    this.comboNum = el('span', 'yx-combo-num', this.combo, '0');
    el('span', 'yx-combo-word', this.combo, '连斩!');
  }

  update(s: HudState): void {
    this.setEvent(s.event ?? null);
    this.hpFill.style.width = `${(100 * s.hp) / s.hpMax}%`;
    // 血上限按百分比放大会带浮点尾巴（100 × 1.15 = 114.99999999999999），显示时取整；当前血不超过显示的上限
    const max = Math.round(s.hpMax);
    this.hpText.textContent = `${Math.min(Math.ceil(s.hp), max)}/${max}`;
    // 没有护盾的时候整条不显示（空着的深色条像是坏了）
    this.shBar.style.visibility = s.shieldMax > 0 ? '' : 'hidden';
    if (s.shieldMax > 0) this.shFill.style.width = `${(100 * s.shield) / s.shieldMax}%`;
    this.lv.textContent = String(s.level);
    const yy = s.yy === 'yang' ? '阳' : s.yy === 'yin' ? '阴' : '';
    if (this.yy.textContent !== yy) {
      this.yy.textContent = yy;
      // 换字时保留正在闪的 flip（阴阳互换那一拍字和闪同时发生）
      this.yy.className = `yx-yy${s.yy ? ` ${s.yy}` : ''}${this.yy.classList.contains('flip') ? ' flip' : ''}`;
      this.yy.title = s.yy === 'yang' ? '阳：血过半，伤害高一点' : s.yy === 'yin' ? '阴：血不足一半，技能冷却短一点，捆住的怪定得更久' : '';
    }
    this.xpFill.style.width = `${Math.round(s.xp * 100)}%`;
    const left = Math.max(0, Math.ceil(s.left));
    this.time.textContent = `${pad2(Math.floor(left / 60))}:${pad2(left % 60)}`;
    // 连战：5 分钟倒计时，没有夜市，不写"离天亮"和铜钱去向
    if (!!s.rush !== this.rushOn) {
      this.rushOn = !!s.rush;
      this.tlabel.textContent = this.rushOn ? '剩余' : '离天亮';
    }
    if (s.raid) {
      this.tlabel.textContent = s.raid.label;
      this.timer.classList.toggle('warn', s.raid.level === 1);
      this.timer.classList.toggle('red', s.raid.level === 2);
      this.bag.textContent = `${s.raid.bag} 件 · ${s.raid.value}`;
    }
    if (!!s.raid !== this.raidOn) {
      this.raidOn = !!s.raid;
      this.bagBox.style.display = this.raidOn ? '' : 'none';
      if (!this.raidOn) {
        this.tlabel.textContent = '离天亮';
        this.timer.classList.remove('warn', 'red');
        this.setArrow(null);
        this.setGoblinArrow(null);
      }
    }
    this.kills.textContent = fmtKills(s.kills);
    this.coins.textContent = fmt(s.coins);
    const sig = s.slots.map((x) => `${x.icon}${x.half ? '~' : ''}`).join();
    if (sig !== this.slotSig) {
      this.slotSig = sig;
      this.slotsCol.innerHTML = '';
      this.slotEls = s.slots.map((x) => {
        const box = el('div', `yx-slot${x.half ? ' half' : ''}`, this.slotsCol);
        const i = el('img', '', box);
        i.src = this.icons(x.icon);
        i.alt = '';
        if (x.half) {
          box.title = '初成：效果减半，练满升大成';
          el('span', 'yx-slot-stage', box, '初');
        }
        return { box, cd: el('div', 'yx-cd', box), lv: el('span', 'yx-slot-lv', box) };
      });
      this.slotsCol.style.display = s.slots.length ? '' : 'none';
    }
    const psig = s.passives.map((x) => `${x.icon}${x.level}`).join();
    if (psig !== this.passSig) {
      this.passSig = psig;
      this.passCol.innerHTML = '';
      for (const x of s.passives) {
        const box = el('div', 'yx-pass', this.passCol);
        const i = el('img', '', box);
        i.src = this.icons(x.icon);
        i.alt = '';
        el('span', 'yx-slot-lv', box, String(x.level));
      }
      this.passCol.style.display = s.passives.length ? '' : 'none';
    }
    s.slots.forEach((slot, i) => {
      const e = this.slotEls[i];
      if (!e) return;
      e.cd.style.setProperty('--cd', `${Math.round((1 - slot.cd) * 360)}deg`);
      e.lv.textContent = slot.level > 8 ? '进' : slot.level === 8 ? '满' : String(slot.level);
      e.box.classList.toggle('ready', slot.cd >= 1);
    });
  }

  /** 技能钮悬停 / 长按时弹出的完整说明（开局给一次，HTML 由调用方转义好） */
  setSkillInfo(html: string): void {
    this.skillTip.innerHTML = html;
  }

  private tipLater(ms: number): void {
    window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => this.tipShow(true), ms);
  }

  private tipShow(on: boolean): void {
    window.clearTimeout(this.tipTimer);
    if (!on || !this.skillTip.innerHTML) {
      this.skillTip.style.display = 'none';
      return;
    }
    // 贴在按钮上方、右边对齐；放不下（手机竖屏窄）就靠左收进屏幕
    const b = this.skillBtn.getBoundingClientRect();
    const p = (this.skillTip.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
    this.skillTip.style.display = '';
    this.skillTip.style.right = `${Math.max(8, p.left + p.width - b.right)}px`;
    this.skillTip.style.bottom = `${p.top + p.height - b.top + 34}px`;
  }

  /** 每帧调：冷却环、好了发亮；图标和名字没变不碰 DOM */
  setSkill(s: HudSkill): void {
    const b = this.skillBtn;
    if (!s.show) {
      if (b.style.display !== 'none') {
        b.style.display = 'none';
        this.tipShow(false);
      }
      return;
    }
    if (b.style.display === 'none') b.style.display = '';
    const sig = `${s.icon}|${s.name}|${s.key}`;
    if (sig !== this.skillSig) {
      this.skillSig = sig;
      this.skillImg.src = this.icons(s.icon);
      b.setAttribute('aria-label', `${s.name}（${s.key}）`);
      this.skillKey.textContent = s.key;
      this.skillName.textContent = s.name;
    }
    const ready = s.cd >= 1 && s.active <= 0;
    const on = s.active > 0;
    b.style.setProperty('--cd', `${Math.round((on ? s.active : s.cd) * 360)}deg`);
    b.classList.toggle('ready', ready);
    b.classList.toggle('on', on);
    const sec = !ready && !on && s.left > 0 ? String(s.left) : '';
    if (this.skillSec.textContent !== sec) this.skillSec.textContent = sec;
  }

  /** 撤离箭头：null 收起；x、y 是屏幕边上的位置（CSS 像素），dx、dy 是朝向的单位向量 */
  setArrow(a: HudArrow | null): void {
    this.place(this.arrow, this.arrowIcon, this.arrowText, a);
  }

  /** 宝妖的箭头：同 setArrow，橙色 */
  setGoblinArrow(a: HudArrow | null): void {
    this.place(this.gbArrow, this.gbIcon, this.gbText, a);
  }

  /** 夜市的箭头：同 setArrow，青绿色 */
  setMarketArrow(a: HudArrow | null): void {
    this.place(this.mkArrow, this.mkIcon, this.mkText, a);
  }

  /** 临时增益小标签：null 收起；文字没变不碰 DOM */
  /** 下一场地图事件的倒计时小牌：图标和颜色同横幅（banner.css 的 ev-*），≤ 10 秒变红脉动 */
  private setEvent(e: HudState['event']): void {
    if (!e) {
      if (this.evKey) {
        this.evKey = '';
        this.evTag.style.display = 'none';
      }
      return;
    }
    const sec = Math.ceil(e.left / 30);
    const key = `${e.kind}|${sec}|${e.urgent ? 1 : 0}`;
    if (key === this.evKey) return;
    this.evKey = key;
    this.evTag.style.display = '';
    this.evTag.className = `yx-evtag ev-${e.kind}${e.urgent ? ' urgent' : ''}`;
    this.evTag.innerHTML = `<i>${EVENT_ICON[e.kind] ?? ''}</i><span>${e.name}</span><b>${Math.floor(sec / 60)}:${pad2(sec % 60)}</b>`;
  }

  setBuffs(text: string | null): void {
    if (!text) {
      if (this.buffTag.style.display !== 'none') this.buffTag.style.display = 'none';
      return;
    }
    this.buffTag.style.display = '';
    if (this.buffTag.textContent !== text) this.buffTag.textContent = text;
  }

  private place(box: HTMLDivElement, icon: HTMLElement, text: HTMLSpanElement, a: HudArrow | null): void {
    if (!a) {
      box.style.display = 'none';
      return;
    }
    box.style.display = '';
    box.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px)`;
    icon.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(a.dy, a.dx)}rad)`;
    if (text.textContent !== a.label) text.textContent = a.label;
    // 文字放在箭头靠屏幕中心的那一侧，不被边缘切掉
    text.style.transform = `translate(${a.dx > 0.3 ? '-100%' : a.dx < -0.3 ? '0%' : '-50%'}, ${a.dy > 0.3 ? '-170%' : a.dy < -0.3 ? '70%' : '-50%'})`;
  }

  /** 技能没解锁时按了 Q / 空格：技能位闪一下提示（重复按就重新闪） */
  /** 阴阳先生阴阳互换炸了一圈（规则 66）：头像上的阴阳字闪一下，看得出是他触发的 */
  flashYinyang(): void {
    this.yy.classList.remove('flip');
    void this.yy.offsetWidth;
    this.yy.classList.add('flip');
  }

  flashSkillLocked(): void {
    this.lockTag.classList.remove('on');
    void this.lockTag.offsetWidth;
    this.lockTag.classList.add('on');
  }

  /** 连斩：数字一变就弹一下；2 秒没杀到就收起 */
  setCombo(n: number): void {
    this.comboNum.textContent = String(n);
    this.combo.classList.add('on');
    this.combo.classList.remove('pop');
    void this.combo.offsetWidth;
    this.combo.classList.add('pop');
    if (this.comboTimer) clearTimeout(this.comboTimer);
    this.comboTimer = setTimeout(() => this.combo.classList.remove('on'), 2000);
  }
}
