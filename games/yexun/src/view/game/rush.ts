/**
 * 首领连战的演出（docs/design-play.md 2.5）：一关上场的横幅、打倒一只的定格 + 慢动作 + 大字 + 音效 + 震动、发狂、终局换阶段、
 * 天亮（打倒夜漏君）的晨光大演出、顶部的关底血条（第几关 · 谁 · 哪张图），HUD 小牌要的纸钱、符印、词缀，
 * 还有挨打提示：关底脚下的贴身圈（走近变亮）、重击飘字、「再挨一下就倒」的低血。换图（Ev.Rush 3）由 GameScene 重画场地。
 * 只读核心的事件和 World 的连战字段，不算规则。DOM 挂在 HUD 根节点下，样式限定在 .yx-hud .yx-rushfx（rush.css）。
 */
import type Phaser from 'phaser';
import { ENEMIES, ENEMY_BY_KIND } from '../../content/enemies.ts';
import { MAPS } from '../../content/maps.ts';
import { PLAYER } from '../../content/player.ts';
import { AFFIX_IDS, RUSH, RUSH_AFFIXES, RUSH_FOES, RUSH_RELICS, RUSH_TOTAL } from '../../content/rush.ts';
import { yelouDrip } from '../../core/foes/index.ts';
import type { World } from '../../core/index.ts';
import { rushClock } from '../../online/rush.ts';
import { music } from '../audio/music.ts';
import { sfx } from '../audio/sfx.ts';
import type { Haptics } from '../haptics.ts';
import type { Banners } from '../ui/banner.ts';
import type { HudRush } from '../ui/hud.ts';
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
  /** 画贴身圈的地面层（在怪的影子之上、怪身之下） */
  ground: Phaser.GameObjects.Graphics;
}

/** 贴身圈从离圈边这么远开始变亮（世界像素） */
const RING_NEAR = 140;

const nameOf = (code: number): string => ENEMIES[code]!.name;
/** 终局首领的名字（B 路的 enemies 条目 yelou 进来后也叫这个） */
const FINAL_NAME = ENEMY_BY_KIND[RUSH.finalKind].name;
const PHASE_NAMES = ['一更', '三更', '五更'] as const;

/** 第 k 关（0–10）上场的是谁、在哪张图 */
export function rushStageName(w: World, k: number): { foe: string; map: string } {
  const r = w.rush!;
  if (k >= RUSH.stages) return { foe: FINAL_NAME, map: MAPS[r.finalMap].name };
  return { foe: RUSH_FOES[r.foes[k]!].name, map: MAPS[w.mapId].name };
}

/** 最后一关（夜漏君）不限时，不会发狂 */
export function rushFinal(w: World): boolean {
  return w.rushStage >= RUSH.stages;
}

/** 离这一关首领发狂还有几秒（软限时；还没上场按满的算；最后一关不限时给 0） */
export function rushSoftLeft(w: World): number {
  if (rushFinal(w)) return 0;
  if (w.rushAt >= 0) return RUSH.soft / 30;
  return Math.max(0, (w.rushFrom + RUSH.soft - w.tick) / 30);
}

/** 这一关的首领还有活着的（过关后到下一关上场之间没有） */
function rushFoeUp(w: World): boolean {
  for (let i = 0; i < w.eRush.length; i++) if (w.eRush[i] && w.eAlive[i]) return true;
  return false;
}

/**
 * 连战的计时位（HUD 和暂停页共用）：label 是前面的小字，left 是秒数（-1 = 不走秒，显示 short）。
 * 五更漏壶在滴：漏尽倒数；最后一关别的时候不限时；首领发狂了写「发狂」（竖屏藏了小字，计时位自己要说清）；过关后发狂不再挂着
 */
export function rushTimer(w: World): { label: string; left: number; short: string; red: boolean } {
  if (rushFinal(w)) {
    const drip = yelouDrip(w);
    return drip >= 0 ? { label: '漏尽', left: drip / 30, short: '', red: true } : { label: '最后一关', left: -1, short: '不限时', red: false };
  }
  const up = rushFoeUp(w);
  if (w.rushRage > 0 && up) return { label: '已发狂', left: -1, short: '发狂', red: true };
  // 这一关清完、下一关还没上场（选卡、驿站），不再挂着走完的倒计时
  if (!up && w.rushAt < 0) return { label: '过关', left: -1, short: '过关', red: false };
  return { label: '离发狂', left: rushSoftLeft(w), short: '', red: false };
}

export class RushShow {
  private readonly d: RushShowDeps;
  private readonly el: HTMLDivElement;
  private readonly chip: HTMLDivElement;
  private barOn = false;
  private chipOff = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** 这一关挨过的最重一下（核心算好的实扣血，Ev.Hurt 的 a）；上场新一关清零 */
  private heavy = 0;
  /** 天亮的晨光层 */
  private readonly dawn: HTMLDivElement;

  constructor(d: RushShowDeps, w: World) {
    this.d = d;
    this.el = document.createElement('div');
    this.el.className = 'yx-rushfx';
    this.chip = document.createElement('div');
    this.chip.className = 'yx-rushchip';
    this.dawn = document.createElement('div');
    this.dawn.className = 'yx-rushdawn';
    d.hudRoot.append(this.dawn, this.el, this.chip);
    this.setChip(w);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.el.remove();
    this.chip.remove();
    this.dawn.remove();
    this.d.ground.destroy();
    this.d.banners.setBoss(null);
  }

  private setChip(w: World): void {
    this.chip.innerHTML = `<b>连战</b><span>${w.rushDown}/${RUSH_TOTAL}</span>`;
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

  /** Ev.Rush：a = 0 一关上场 / 1 打倒一只 / 2 全清（天亮）/ 3 换图（GameScene 管）/ 4 发狂 / 5 终局换阶段（b = 第几段） */
  onEvent(w: World, x: number, y: number, a: number, b: number, c: number): void {
    if (!w.rush) return;
    if (a === 0) {
      this.heavy = 0;
      const final = b >= RUSH.stages;
      const n = rushStageName(w, b);
      this.d.banners.say(final ? `最后一关 · ${n.foe}` : `第 ${b + 1}/${RUSH_TOTAL} 关 · ${n.foe}`, 'warn', 2200, b === 0 ? '脚下红圈是贴身挨打的范围' : final ? '打倒它，天就亮了' : c > 1 ? `一次来 ${c} 只 · ${n.map}` : n.map);
      sfx.play(final ? 'boss' : 'elite');
      this.d.shake(260, 0.004);
      if (b === 0 || final) music.start('boss');
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
      this.stamp('down', `${nameOf(c)} 伏诛`, `已打倒 ${b}/${RUSH_TOTAL} 只`, 1300);
      this.setChip(w);
      return;
    }
    if (a === 4) {
      this.d.banners.say('发狂了！', 'warn', 2200, '越拖打得越狠、走得越快');
      this.d.shake(300, 0.005);
      sfx.play('elite');
      return;
    }
    if (a === 5) {
      const name = PHASE_NAMES[Math.min(b, PHASE_NAMES.length - 1)]!;
      this.d.freeze(220);
      this.d.shake(500, 0.008);
      this.d.banners.whiteFlash();
      this.d.haptics.big();
      sfx.play('boss');
      this.stamp('phase', name, b >= 2 ? '漏壶快滴干了，快打' : '夜色压下来了，抢灯笼', 1600);
      return;
    }
    if (a !== 2) return;
    // 天亮：定格慢放比打倒一只长，大字 + 用时，画面盖一层由暗转亮的晨光
    this.d.freeze(400);
    this.d.slow(2200);
    this.d.shake(600, 0.01);
    this.d.banners.whiteFlash();
    this.d.haptics.down();
    sfx.play('dawn');
    sfx.play('chestRainbow');
    this.dawn.classList.add('on');
    this.stamp('clear', '天亮了', `${RUSH_TOTAL} 只首领 · 用时 ${rushClock(b)}`, 3000);
    this.setChip(w);
  }

  /** 顶部血条：这一关剩下的关底的血加在一起；喘息的时候收起 */
  bar(w: World): void {
    if (!w.rush) return;
    let hp = 0;
    let max = 0;
    for (let i = 0; i < w.eRush.length; i++) {
      if (!w.eRush[i] || !w.eAlive[i]) continue;
      hp += Math.max(0, w.eHp[i]!);
      max += w.eHpMax[i]!;
    }
    const on = max > 0 && w.phase !== 'over';
    if (on) {
      const k = Math.min(w.rushStage, RUSH.stages);
      const n = rushStageName(w, k);
      this.d.banners.setBoss(k >= RUSH.stages ? `终局 · ${n.foe}` : `第 ${k + 1}/${RUSH_TOTAL} 关 · ${n.foe} · ${n.map}`, hp / max);
    } else if (this.barOn) this.d.banners.setBoss(null);
    // 血条和小牌在同一个位置：打的时候看血条（上面写着第几只），喘息的时候看小牌
    // 选卡、路线图、驿站时也收起：菜单大字已写着进度，小牌压在大字下面看不清（试玩 11-22）
    const chipOff = on || w.phase === 'choose';
    if (chipOff !== this.chipOff) this.chip.style.display = chipOff ? 'none' : '';
    this.chipOff = chipOff;
    this.barOn = on;
  }

  /** 挨了一下（d = 实扣的血）：记下这一关最重的一下；重的（过最大血 8%）在头上飘红字，让人知道这一下有多疼 */
  onHurt(w: World, x: number, y: number, d: number, float: (x: number, y: number, text: string, color: string) => void): void {
    if (d > this.heavy) this.heavy = d;
    if (d > w.stats.hpMax * 0.08) float(x, y - 74, `-${d}`, '#ff5a4a');
  }

  /** 再挨这一关最重的那一下就倒：低血红框提早亮（固定 30% 挡不住一下掉一半的尸王） */
  oneHitLeft(w: World): boolean {
    return w.hp > 0 && this.heavy > 0 && w.hp <= this.heavy;
  }

  /**
   * 关底脚下的贴身圈：半径 = 碰到主角的距离（怪的半径 + 主角半径，同核心 touchPlayer），平时淡，主角走近就变亮、贴上了跳动。
   * inter 是拍间插值，hx、hy 是主角画面位置
   */
  rings(w: World, inter: (p: number, c: number) => number, hx: number, hy: number, now: number): void {
    const g = this.d.ground;
    g.clear();
    if (w.phase === 'over') return;
    for (let i = 0; i < w.eRush.length; i++) {
      if (!w.eRush[i] || !w.eAlive[i]) continue;
      const x = inter(w.ePX[i]!, w.eX[i]!);
      const y = inter(w.ePY[i]!, w.eY[i]!);
      const r = w.eR[i]! + PLAYER.r;
      const gap = Math.hypot(hx - x, hy - y) - r;
      const near = Math.max(0, Math.min(1, 1 - gap / RING_NEAR));
      const beat = near >= 1 ? 0.5 + 0.5 * Math.sin(now * 0.02) : 0;
      g.fillStyle(0xd23a2a, 0.06 + near * 0.14 + beat * 0.08);
      g.fillCircle(x, y, r);
      g.lineStyle(6, 0x17131c, 0.25 + near * 0.35);
      g.strokeCircle(x, y, r);
      g.lineStyle(3, 0xff4a3a, 0.35 + near * 0.6);
      g.strokeCircle(x, y, r);
    }
  }

  /** HUD 小牌：发狂没有、纸钱、符印、正在打的首领身上的词缀（B 路写的 eAffix 位掩码） */
  static hud(w: World): HudRush {
    let mask = 0;
    for (let i = 0; i < w.eRush.length; i++) if (w.eRush[i] && w.eAlive[i]) mask |= w.eAffix[i]!;
    const affixes = AFFIX_IDS.filter((_, k) => mask & (1 << k)).map((id) => ({ char: RUSH_AFFIXES[id].char, tip: `${RUSH_AFFIXES[id].name}：${RUSH_AFFIXES[id].text}` }));
    const relics = w.rushRelics.map((id) => ({ char: RUSH_RELICS[id].name[0]!, tip: `${RUSH_RELICS[id].name}：${RUSH_RELICS[id].text}` }));
    return { timer: rushTimer(w), coins: w.rushCoins, relics, affixes };
  }
}
