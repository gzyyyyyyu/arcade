/**
 * 首领连战的演出（DESIGN.md 2.5）：一关上场的横幅、打倒一只的定格 + 慢动作 + 大字 + 音效 + 震动、全清的结算大演出、顶部的关底血条。
 * 只读核心的 Ev.Rush 事件和 World 的连战字段，不算规则。DOM 挂在 HUD 根节点下，样式限定在 .yx-hud .yx-rushfx（rush.css）。
 */
import { ENEMIES, ENEMY_BY_KIND } from '../../content/enemies.ts';
import { RUSH, RUSH_NAMES } from '../../content/rush.ts';
import type { World } from '../../core/index.ts';
import { rushClock } from '../../online/rush.ts';
import { music } from '../audio/music.ts';
import { sfx } from '../audio/sfx.ts';
import type { Haptics } from '../haptics.ts';
import type { Banners } from '../ui/banner.ts';
import './rush.css';

export interface RushShowDeps {
  hudRoot: HTMLElement;
  banners: Banners;
  haptics: Haptics;
  shake: (ms: number, k: number) => void;
  /** 定格（不推拍）几毫秒 */
  freeze: (ms: number) => void;
  /** 慢动作几毫秒（画面里的时间按慢的走） */
  slow: (ms: number) => void;
  /** 在 (x, y) 炸一团碎屑（复用对局的 burst） */
  burst: (x: number, y: number, tint: number, size: number) => void;
}

const nameOf = (code: number): string => RUSH_NAMES[ENEMIES[code]!.kind] ?? '首领';

export class RushShow {
  private readonly d: RushShowDeps;
  private readonly el: HTMLDivElement;
  private readonly chip: HTMLDivElement;
  private barOn = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(d: RushShowDeps, w: World) {
    this.d = d;
    this.el = document.createElement('div');
    this.el.className = 'yx-rushfx';
    this.chip = document.createElement('div');
    this.chip.className = 'yx-rushchip';
    d.hudRoot.append(this.el, this.chip);
    this.setChip(w);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.el.remove();
    this.chip.remove();
    this.d.banners.setBoss(null);
  }

  private setChip(w: World): void {
    this.chip.innerHTML = `<b>连战</b><span>${w.rushDown}/${w.rush?.total ?? 0}</span>`;
  }

  /** 屏幕中间一块大字，ms 后自己收起 */
  private stamp(cls: string, big: string, small: string, ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.el.className = `yx-rushfx ${cls}`;
    this.el.innerHTML = `<b class="yx-brush">${big}</b><span>${small}</span>`;
    // 重新触发入场动画
    void this.el.offsetWidth;
    this.el.classList.add('on');
    this.timer = setTimeout(() => this.el.classList.remove('on'), ms);
  }

  /** Ev.Rush：a = 0 一关上场 / 1 打倒一只 / 2 全清 */
  onEvent(w: World, x: number, y: number, a: number, b: number, c: number): void {
    const plan = w.rush;
    if (!plan) return;
    if (a === 0) {
      const names = plan.stages[b]!.map((k) => RUSH_NAMES[k] ?? k).join(' + ');
      const last = b === plan.stages.length - 1;
      this.d.banners.say(`${last ? '最后一关' : `第 ${b + 1} 关`} · ${names}`, 'warn', 2000, c > 1 ? `一次来 ${c} 只` : last ? '打倒它就全清' : `还剩 ${plan.stages.length - b} 关`);
      sfx.play(last || plan.stages[b]!.some((k) => ENEMY_BY_KIND[k].boss) ? 'boss' : 'elite');
      this.d.shake(260, 0.004);
      if (b === 0) music.start('boss');
      this.setChip(w);
      return;
    }
    if (a === 1) {
      // 打倒一只：先定格一下，再放慢一会儿，屏幕中间盖"伏诛"大字
      const boss = !!ENEMIES[c]!.boss;
      this.d.freeze(boss ? 260 : 160);
      this.d.slow(boss ? 1100 : 700);
      this.d.shake(boss ? 420 : 240, boss ? 0.009 : 0.006);
      this.d.burst(x, y - 20, 0xffd36a, boss ? 3 : 2);
      this.d.banners.whiteFlash();
      this.d.haptics.big();
      sfx.play('chestGold');
      this.stamp('down', `${nameOf(c)} 伏诛`, `连战 ${b}/${plan.total}`, 1300);
      this.setChip(w);
      return;
    }
    // 全清：大字 + 用时，白闪、长震、天亮的音
    this.d.freeze(300);
    this.d.slow(1600);
    this.d.shake(600, 0.01);
    this.d.banners.whiteFlash();
    this.d.haptics.down();
    sfx.play('dawn');
    sfx.play('chestRainbow');
    this.stamp('clear', '全 清', `${plan.total} 只首领 · 用时 ${rushClock(b)}`, 2600);
    this.setChip(w);
  }

  /** 顶部血条：这一关剩下的关底的血加在一起；喘息的时候收起 */
  bar(w: World): void {
    const plan = w.rush;
    if (!plan) return;
    let hp = 0;
    let max = 0;
    for (let i = 0; i < w.eRush.length; i++) {
      if (!w.eRush[i] || !w.eAlive[i]) continue;
      hp += Math.max(0, w.eHp[i]!);
      max += w.eHpMax[i]!;
    }
    const on = max > 0 && w.phase !== 'over';
    if (on) {
      const st = Math.min(w.rushStage, plan.stages.length - 1);
      this.d.banners.setBoss(`${plan.stages[st]!.map((k) => RUSH_NAMES[k] ?? k).join(' + ')} · 连斩 ${w.rushDown}/${plan.total}`, hp / max);
    } else if (this.barOn) this.d.banners.setBoss(null);
    // 血条和小牌在同一个位置：打的时候看血条（上面写着连斩几只），喘息的时候看小牌
    if (on !== this.barOn) this.chip.style.display = on ? 'none' : '';
    this.barOn = on;
  }

  /** HUD 上的倒计时：离 5 分钟到点还有几秒 */
  static left(w: World): number {
    return (RUSH.limit - w.tick) / 30;
  }
}
