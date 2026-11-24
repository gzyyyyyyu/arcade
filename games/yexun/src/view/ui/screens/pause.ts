import { fmtClock } from '../../../content/clock.ts';
import { CHARACTERS, type CharacterId } from '../../../content/meta.ts';
import type { TonightRules } from '../codexNights.ts';
import { skillInfo } from '../skillInfo.ts';
import { TOUCH } from '../../viewport.ts';
import { esc, layer, onAction, type Toggle, togglesHtml, bindToggles } from './shared.ts';

export interface BuildRow {
  icon: string;
  name: string;
  level: number;
  /** 法器：伤害；被动：-1 */
  dmg: number;
  kills: number;
  /** 进化还差什么（暂停页显示；进化好了或没有进化的为空）；初成的搭配写升大成还差什么 */
  hint?: string;
  /** 规则 63 的初成搭配（格子虚线框、右上角「初」） */
  half?: boolean;
  /** 一句说明（悬停/点一下在面板下方显示）；没有就只显示名字和成绩 */
  desc?: string;
}

export class Pause {
  readonly root: HTMLDivElement;
  private readonly toggles: Toggle[];
  private readonly icons: (k: string) => string;
  onResume: () => void = () => undefined;
  onHome: () => void = () => undefined;
  onQuit: () => void = () => undefined;
  onGuide: () => void = () => undefined;

  constructor(parent: HTMLElement, toggles: Toggle[], icons: (k: string) => string) {
    this.root = layer(parent, 'yx-pausescr');
    this.toggles = toggles;
    this.icons = icons;
    onAction(this.root, {
      ...bindToggles(this.root, toggles),
      resume: () => this.onResume(),
      home: () => this.onHome(),
      quit: () => this.onQuit(),
      guide: () => this.onGuide(),
    });
    const pick = (e: Event): void => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.yx-cell');
      if (el) this.detail(Number(el.dataset.i));
    };
    this.root.addEventListener('mouseover', pick);
    this.root.addEventListener('click', pick);
    this.root.addEventListener('focusin', pick);
  }

  get open(): boolean {
    return this.root.style.display !== 'none';
  }

  /** sets：凑成的套装说明（"剑 2 件 · 暴击 +8%"） */
  /** clock：顶上倒计时叫什么（连战没有天亮，写「剩余」，和 HUD 一样） */
  show(build: BuildRow[], left: number, sets: string[] = [], rules: TonightRules | null = null, hero: CharacterId | null = null, xinfa?: string, clock = '离天亮'): void {
    this.rows = build;
    this.hero = hero ? this.heroDetail(hero, xinfa) : '';
    const cell = (r: BuildRow, i: number): string =>
      `<button type="button" class="yx-cell${r.level > 8 ? ' evo' : r.level === 8 ? ' max' : ''}${r.half ? ' half' : ''}" data-i="${i}" aria-label="${esc(r.name)}"><img alt="" src="${this.icons(r.icon)}">${r.half ? '<i>初</i>' : ''}<em>${r.level > 8 ? '进' : r.level === 8 ? '满' : r.level}</em></button>`;
    const weapons = build.map((r, i) => (r.dmg >= 0 ? cell(r, i) : '')).join('');
    const passives = build.map((r, i) => (r.dmg < 0 ? cell(r, i) : '')).join('');
    this.root.innerHTML =
      '<div class="yx-panel yx-pause-panel">' +
      `<div class="yx-panel-head"><b class="yx-brush">暂停</b>` +
      (hero ? `<button type="button" class="yx-cell yx-phcell sel" data-i="-1" aria-label="${esc(CHARACTERS[hero].name)}的技能和被动"><img alt="" src="${this.icons(skillInfo(hero).icon)}"></button>` : '') +
      `<em>${left < 0 ? clock : `${clock} ${fmtClock(left)}`}</em></div>` +
      '<div class="yx-pause-body">' +
      '<div class="yx-build">' +
      `<div class="yx-bline"><label>法器</label><div class="yx-grid">${weapons || '<span class="yx-none">还没有</span>'}</div></div>` +
      `<div class="yx-bline"><label>被动</label><div class="yx-grid">${passives || '<span class="yx-none">还没有</span>'}</div></div>` +
      (sets.length ? `<div class="yx-sets">${sets.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '') +
      (rules ? this.rulesHtml(rules) : '') +
      `<div class="yx-bdetail">${this.hero || '悬停或点一下图标，看说明'}</div>` +
      '</div>' +
      `<div class="yx-pause-side"><div class="yx-toggles">${togglesHtml(this.toggles)}</div>` +
      '<button type="button" class="yx-big yx-resume" data-a="resume">继续</button>' +
      '<button type="button" class="yx-big ghost yx-pguide" data-a="guide">玩法说明</button>' +
      '<div class="yx-row2"><button type="button" class="yx-big ghost yx-danger" data-a="quit">认输</button><button type="button" class="yx-big ghost yx-danger" data-a="home">回大厅</button></div>' +
      '</div></div></div>';
    this.root.style.display = '';
  }

  private rows: BuildRow[] = [];
  private hero = '';

  /** 「角色」说明：技能（效果数值、冷却、怎么放）、被动、适合的流派，和角色页详情写的一样（skillInfo.ts）。
   *  默认就显示在下面的说明行里；点过法器再点标题旁的技能图标换回来。不另占一块：手机上暂停页本来就快放不下了 */
  private heroDetail(id: CharacterId, xinfa?: string): string {
    const k = skillInfo(id);
    const how = `${k.cd} 秒一次 · ${TOUCH ? '右下角技能钮' : '空格 / Q'}`;
    return (
      `<b>${esc(CHARACTERS[id].name)} · ${esc(k.name)}</b> ${how}${xinfa ? ` <em class="yx-xftag">心法·${esc(xinfa)}</em>` : ''}<br><span>${esc(k.detail)}</span>` +
      `<span class="yx-phx"><br><i>被动「${esc(k.perkName)}」${esc(k.perk)}</i><br><span class="yx-phfit">适合 ${esc(k.fit)}</span></span>`
    );
  }

  /** 「今晚的规矩」：咒印、本档噩梦机制、本图地图事件；手机横屏里这块限高可滚动 */
  private rulesHtml(r: TonightRules): string {
    const lines = [
      ...(r.trial ? [`<p><b>试炼</b>${esc(r.trial)}</p>`] : []),
      ...r.curses.map((c) => `<p><b class="yx-brush">${esc(c.name)}</b>${esc(c.text)}</p>`),
      ...r.nightmare.map((t) => `<p><b>噩梦</b>${esc(t)}</p>`),
      ...(r.weekly ? [`<p><b>本周</b>${esc(r.weekly)}</p>`] : []),
      ...(r.event ? [`<p><b class="yx-evi">${esc(r.event.icon)}</b>${esc(r.event.name)} · ${esc(r.event.when)}</p>`] : []),
    ];
    return `<div class="yx-rules"><label>今晚的规矩</label>${lines.join('')}</div>`;
  }

  /** 图标下面那一行详情 */
  private detail(i: number): void {
    const r = this.rows[i];
    const el = this.root.querySelector<HTMLElement>('.yx-bdetail');
    if (el && i === -1 && this.hero) {
      el.innerHTML = this.hero;
      for (const c of this.root.querySelectorAll<HTMLElement>('.yx-cell')) c.classList.toggle('sel', c.dataset.i === '-1');
      return;
    }
    if (!r || !el) return;
    const lv = r.level > 8 ? '已进化' : r.level === 8 ? '满级' : `${r.level} 级`;
    const score = r.dmg >= 0 ? ` · ${Math.round(r.dmg).toLocaleString('zh-CN')} 伤 · ${r.kills} 斩` : '';
    el.innerHTML = `<b>${esc(r.name)}</b> ${lv}${score}${r.desc ? `<br><span>${esc(r.desc)}</span>` : ''}${r.hint ? `<br><i>${esc(r.hint)}</i>` : ''}`;
    for (const c of this.root.querySelectorAll<HTMLElement>('.yx-cell')) c.classList.toggle('sel', c.dataset.i === String(i));
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}

// ───────────────────────── 确认框 ─────────────────────────
