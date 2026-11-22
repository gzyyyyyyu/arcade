/**
 * 屏幕上的横幅和提示层（DOM）：精英 / 尸王出场的预警条、里程碑（100 / 500 / 1000 杀）、宝箱和进化的演出、低血红框、天亮。
 * 宝箱和进化演出 ≤ 2 秒、点一下就跳过（手感清单第 6 条）。
 */
import { EVENT_ICON } from './eventIcons.ts';
import './banner.css';
import { BRUSH_CHARS } from './brushChars.ts';

const BRUSH = new Set(BRUSH_CHARS);
/** 这句全在毛笔字子集里（空格不算） */
export const brushOk = (text: string): boolean => [...text].every((c) => c === ' ' || BRUSH.has(c));


/** 宝箱展示的一组：evo 进化、merge 双修 / 合成、up 升级；tint 是合成自己的颜色 */
export interface ChestGroup {
  kind: 'evo' | 'merge' | 'up';
  label: string;
  items: { icon: string; name: string; tint?: string }[];
}

export class Banners {
  private readonly root: HTMLDivElement;
  private readonly low: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly hurtEl: HTMLDivElement;
  private readonly bossBar: HTMLDivElement;
  private readonly bossFill: HTMLElement;
  /** 夜色遮罩 / 血月 / 白毛风 / 涨潮四层：插在 HUD 下面（HUD 和横幅盖在它们上面），都不挡点击 */
  private readonly night: HTMLDivElement;
  private readonly blood: HTMLDivElement;
  private readonly wind: HTMLDivElement;
  private readonly tide: HTMLDivElement;
  private nightKey = '';
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private skip: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    const layer = (cls: string): HTMLDivElement => {
      const el = document.createElement('div');
      el.className = `yx-weather ${cls}`;
      parent.insertBefore(el, parent.querySelector('.yx-hud'));
      return el;
    };
    this.night = layer('yx-night');
    this.blood = layer('yx-blood');
    this.wind = layer('yx-wind');
    this.tide = layer('yx-tide');
    this.root = document.createElement('div');
    this.root.className = 'yx-banners';
    parent.appendChild(this.root);
    this.low = document.createElement('div');
    this.low.className = 'yx-lowhp';
    parent.appendChild(this.low);
    // 受伤红晕：屏幕边缘一圈红，淡出很快；被围着连续挨打时也不晃镜头
    this.hurtEl = document.createElement('div');
    this.hurtEl.className = 'yx-hurt';
    parent.appendChild(this.hurtEl);
    this.flash = document.createElement('div');
    this.flash.className = 'yx-flash';
    parent.appendChild(this.flash);
    this.bossBar = document.createElement('div');
    this.bossBar.className = 'yx-bossbar';
    this.bossBar.innerHTML = '<span>尸王</span><div><b></b></div>';
    this.bossFill = this.bossBar.querySelector('b')!;
    this.bossBar.style.display = 'none';
    parent.appendChild(this.bossBar);
  }

  /** 受伤红晕（画面层不晃镜头，用边缘一圈红表示挨打） */
  hurt(): void {
    this.hurtEl.classList.remove('on');
    void this.hurtEl.offsetWidth;
    this.hurtEl.classList.add('on');
  }

  /** 收起所有横幅、血条和红框（结算、重开时） */
  clear(): void {
    this.root.innerHTML = '';
    this.setLow(false);
    this.setBoss(null);
    this.setNight(0, 0);
    this.setBlood(false);
    this.setWind(0);
    this.setTide(false);
  }

  /** 噩梦 2 起的夜色：以主角为中心、半径 radius 屏幕像素之外压暗；0 关掉。cy 是主角离屏幕中心偏下多少像素 */
  setNight(radius: number, cy: number): void {
    const key = radius <= 0 ? '' : `${Math.round(radius)},${Math.round(cy)}`;
    if (key === this.nightKey) return;
    this.nightKey = key;
    if (!key) {
      this.night.classList.remove('on');
      return;
    }
    this.night.style.setProperty('--r', `${Math.round(radius)}px`);
    this.night.style.setProperty('--cy', `${Math.round(cy)}px`);
    this.night.classList.add('on');
  }

  /** 血月：淡红色调 */
  setBlood(on: boolean): void {
    this.blood.classList.toggle('on', on);
  }

  /** 白毛风：dir 1 往右吹、-1 往左吹、0 停 */
  setWind(dir: -1 | 0 | 1): void {
    this.wind.classList.toggle('on', dir !== 0);
    this.wind.classList.toggle('left', dir < 0);
  }

  /** 涨潮：整体偏深蓝一点点 */
  setTide(on: boolean): void {
    this.tide.classList.toggle('on', on);
  }

  /** 一行横幅，几秒后自己收起；kind 决定配色；ev 是地图事件 / 血月的标记：加一个小图标和对应的颜色 */
  say(text: string, kind: 'warn' | 'gold' | 'ink' = 'ink', ms = 1800, sub?: string, ev?: string): void {
    const el = document.createElement('div');
    const icon = ev ? EVENT_ICON[ev] : undefined;
    // 标题里有毛笔字子集外的字（宝物名、怪名这类拼进来的），整条换粗体：一句里两种字体最难看
    el.className = `yx-banner ${kind}${icon ? ` ev-${ev}` : ''}${brushOk(text) ? '' : ' plain'}`;
    el.innerHTML = `${icon ? `<span class="ic">${icon}</span>` : ''}<span class="t">${text}</span>${sub ? `<span class="s">${sub}</span>` : ''}`;
    this.root.appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  /** 屏幕中间盖一块毛笔大字（画皮现形）：入场一下盖章，ms 后淡出；和连战的 stamp 同一个样子，但那个只在连战局里有，这里给普通守夜用 */
  stamp(big: string, small: string, ms = 1500): void {
    const el = document.createElement('div');
    el.className = 'yx-stamp';
    el.innerHTML = `<b>${big}</b><span>${small}</span>`;
    this.root.appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  /** 宝箱 / 进化演出：图标 + 名字，全屏闪一下（进化），≤ 2 秒或点一下结束，结束时回调 */
  reveal(icon: string, title: string, sub: string, evolve: boolean, done: () => void, tint?: string): void {
    this.endReveal();
    const el = document.createElement('div');
    el.className = `yx-reveal${evolve ? ' evolve' : ''}${tint ? ' tinted' : ''}`;
    // 合成有自己的颜色（双修各一种）：标题、光芒、底光都跟着换
    if (tint) el.style.setProperty('--tint', tint);
    el.innerHTML = `<div class="rays"></div><img alt="" src="${icon}"><span class="t">${title}</span><span class="s">${sub}</span><span class="k">点一下继续</span>`;
    this.root.appendChild(el);
    if (evolve) this.whiteFlash();
    const finish = (): void => {
      if (this.skip !== finish) return;
      this.skip = null;
      if (this.showTimer) clearTimeout(this.showTimer);
      el.classList.add('out');
      setTimeout(() => el.remove(), 200);
      done();
    };
    this.skip = finish;
    el.addEventListener('pointerdown', finish);
    this.showTimer = setTimeout(finish, evolve ? 1900 : 1300);
  }

  /**
   * 一个宝箱结出多件（含规则 57 的进化、合成、双修）：同一个展示里按组列全——进化、双修 / 合成、升级各一组，组标签写清件数；
   * 进化金色，双修 / 合成用各自的颜色，升级素色。图标一个个弹出来，整体 1.5–2 秒自己收起。
   * 和 reveal 不同：不拦点击、不要求继续（核心不暂停，玩家可以接着走位），所以只放在屏幕上方；返回总时长（毫秒）。
   */
  chestRow(groups: ChestGroup[], title: string, tier: 3 | 5): number {
    const step = tier === 5 ? 190 : 230;
    const count = groups.reduce((n, g) => n + g.items.length, 0);
    const total = count * step + (tier === 5 ? 1000 : 800);
    const el = document.createElement('div');
    el.className = `yx-chestrow t${tier}`;
    let k = 0;
    const body = groups
      .filter((g) => g.items.length > 0)
      .map((g) => {
        const cards = g.items
          .map((it) => `<div class="c ${g.kind}" style="animation-delay:${k++ * step}ms${it.tint ? `;--tint:${it.tint}` : ''}"><img alt="" src="${it.icon}"><span>${it.name}</span></div>`)
          .join('');
        const tint = g.items.find((it) => it.tint)?.tint;
        return `<div class="g ${g.kind}"${tint ? ` style="--tint:${tint}"` : ''}><span class="l">${g.label}</span><div class="row">${cards}</div></div>`;
      })
      .join('');
    el.innerHTML = `<span class="h">${title}</span>${body}`;
    this.root.appendChild(el);
    setTimeout(() => el.classList.add('out'), total);
    setTimeout(() => el.remove(), total + 300);
    return total;
  }

  /** 演出中按任意键也跳过 */
  skipReveal(): boolean {
    if (!this.skip) return false;
    this.skip();
    return true;
  }

  private endReveal(): void {
    this.skip?.();
  }

  whiteFlash(): void {
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
  }

  setLow(on: boolean): void {
    this.low.classList.toggle('on', on);
  }

  setBoss(name: string | null, frac = 1): void {
    if (name === null) {
      this.bossBar.style.display = 'none';
      return;
    }
    this.bossBar.style.display = '';
    this.bossBar.querySelector('span')!.textContent = name;
    this.bossFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }
}
