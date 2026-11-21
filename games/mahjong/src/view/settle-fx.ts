/**
 * 一局结算的"番型依次亮起 + 大牌庆祝"（DESIGN.md 第 7 节）。
 *
 * 做法：结算页（两个玩法的 summary.ts）本来就把番型、总番数/点数画成了带标记的节点，这里只在画好之后加一层时间轴——
 * 先把番型和总数藏起来（只是透明，不占位，版面不跳），再一条条放出来、配一声"嗒"，最后总数从 0 滚到终值；
 * 点一下结算框直接跳到最终状态。自己胡了大牌（判定在 game/bighand.ts）再加金色光圈、撒金粒子和更响的合成音，别人的只放轻的。
 * 只动 opacity / transform；粒子几十个 span，1.5 秒内自己清掉。动画出任何问题都只会是"没动画"，结算内容一直是最终值。
 */
import { bestOf, celebrationOf, pacingOf, type BigTier, type Celebration, type FxEnv } from '../game/bighand.ts';
import { el } from './dom.ts';
import { play } from './sound.ts';
import { num } from './text.ts';

/** 一次胡牌在结算里的几个节点 */
interface Unit {
  items: HTMLElement[];
  /** 总番数 / 点数那一整块（藏起来，最后亮） */
  total: HTMLElement | null;
  /** 要滚的数字（带 data-n、data-suffix） */
  value: HTMLElement | null;
  tier: BigTier;
  mine: boolean;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const GOLDS = ['#ffd35a', '#fff1b0', '#ffb02e', '#ffffff', '#ff8a3d'];

function fxEnv(fast: boolean): FxEnv {
  return {
    turbo: new URLSearchParams(location.search).has('turbo'),
    fast,
    lite: document.documentElement.dataset.lite === '1',
    reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

function unitsOf(summary: HTMLElement): Unit[] {
  const flag = (n: HTMLElement): { tier: BigTier; mine: boolean } => ({ tier: Number(n.dataset.tier ?? 0) as BigTier, mine: n.dataset.mine === '1' });
  const out: Unit[] = [];
  // 立直：每次和牌一块（役种表的行、合计）
  summary.querySelectorAll<HTMLElement>('.rc-win').forEach((w) => {
    out.push({
      items: [...w.querySelectorAll<HTMLElement>('.rc-yaku-row')],
      total: w.querySelector<HTMLElement>('.rc-total'),
      value: w.querySelector<HTMLElement>('.rc-value'),
      ...flag(w),
    });
  });
  // 川麻：每个胡了的人一行（番型是 .fx-it，总番数是 .fx-total）
  summary.querySelectorAll<HTMLElement>('.row[data-tier]').forEach((r) => {
    const total = r.querySelector<HTMLElement>('.fx-total');
    out.push({ items: [...r.querySelectorAll<HTMLElement>('.fx-it')], total, value: total, ...flag(r) });
  });
  return out;
}

const showValue = (v: HTMLElement | null, k: number): void => {
  if (v) v.textContent = `${num(Number(v.dataset.n) * k)}${v.dataset.suffix ?? ''}`;
};

/** 结算页画好、挂进弹窗之后调用；fast 是"快速"档。返回 false 表示什么都没做（不是大牌也没有番型可亮） */
export function settleReveal(summary: HTMLElement, fast: boolean): boolean {
  const units = unitsOf(summary).filter((u) => u.items.length || u.total);
  if (!units.length) return false;
  const env = fxEnv(fast);
  const count = units.reduce((a, u) => a + u.items.length, 0);
  const pace = pacingOf(count, env);
  // 开发看效果用（只在开发服务器上认）：网址带 ?fxtier=1 或 2，任何有人胡牌的结算都按"自己胡了大牌 / 特大牌"放（不影响结算内容）
  const force = import.meta.env.DEV ? new URLSearchParams(location.search).get('fxtier') : null;
  const best = force === '1' || force === '2' ? { tier: Number(force) as BigTier, mine: true } : bestOf(units);
  const cheer = celebrationOf(best.tier, best.mine, env);
  if (!pace.reveal && !cheer) return false;

  const mask = summary.closest<HTMLElement>('.mask');
  const timers: number[] = [];
  let cheered = false;
  let done = false;
  const later = (ms: number, fn: () => void): void => {
    timers.push(window.setTimeout(() => summary.isConnected && fn(), ms));
  };
  const celebrate = (): void => {
    if (cheered || !cheer) return;
    cheered = true;
    play(cheer.sound);
    if (mask) burst(mask, cheer);
  };
  const finish = (): void => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    summary.classList.remove('fx-run');
    summary.querySelectorAll('.fx-hide').forEach((n) => n.classList.remove('fx-hide'));
    for (const u of units) showValue(u.value, 1);
    celebrate();
  };

  if (!pace.reveal) {
    celebrate();
    return true;
  }

  // 减少动态效果：番型不做进场动画，直接摆着，只有总数滚；其余情况先藏起来
  const hide = pace.stepMs > 0;
  if (hide) {
    summary.classList.add('fx-run');
    for (const u of units) for (const n of [...u.items, ...(u.total ? [u.total] : [])]) n.classList.add('fx-hide');
  }
  let t = hide ? 280 : 120;
  for (const u of units) {
    for (const item of u.items) {
      if (hide) {
        later(t, () => {
          item.classList.remove('fx-hide');
          play('fanTick');
        });
        t += pace.stepMs;
      }
    }
    const at = t;
    showValue(u.value, 0);
    later(at, () => {
      u.total?.classList.remove('fx-hide');
      roll(u.value, pace.rollMs, () => summary.isConnected && !done);
    });
    t += Math.max(pace.rollMs, 200) + 120;
  }
  later(t, finish);
  // 点一下结算框：直接到最终状态（按钮照常能点）
  summary.closest('.dialog')?.addEventListener('pointerdown', finish, { once: true });
  return true;
}

function roll(v: HTMLElement | null, ms: number, alive: () => boolean): void {
  if (!v) return;
  const t0 = performance.now();
  const tick = (now: number): void => {
    if (!alive()) return;
    const k = Math.min(1, (now - t0) / ms);
    showValue(v, 1 - (1 - k) ** 3);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 光圈加粒子：层挂在遮罩上、不挡点击，播完（含最晚的粒子）整层移除 */
function burst(mask: HTMLElement, c: Celebration): void {
  if (!c.ring && !c.particles) return;
  const layer = el('div', 'settle-fx', mask);
  if (c.ring) {
    const rings = c.particles >= 28 ? 2 : 1;
    for (let i = 0; i < rings; i++) {
      const ring = el('i', i ? 'sfx-ring late' : 'sfx-ring', layer);
      ring.style.animationDuration = `${Math.round(Math.min(900, c.ms * 0.7))}ms`;
    }
  }
  for (let i = 0; i < c.particles; i++) {
    const p = el('i', i % 3 === 0 ? 'sfx-p star' : 'sfx-p', layer);
    const a = rnd(0, Math.PI * 2);
    const r = rnd(90, 280);
    const s = p.style;
    s.setProperty('--ex', `${Math.round(Math.cos(a) * r)}px`);
    // 先冲出去再受重力落下一截
    s.setProperty('--ey', `${Math.round(Math.sin(a) * r * 0.8 + rnd(30, 90))}px`);
    s.setProperty('--rot', `${Math.round(rnd(-360, 360))}deg`);
    s.setProperty('--c', GOLDS[Math.floor(Math.random() * GOLDS.length)]!);
    s.setProperty('--w', `${Math.round(rnd(6, 12))}px`);
    // 动画时长 + 延迟不超过 ms 的 85%，留出余量
    const d = c.ms * 0.55;
    s.setProperty('--d', `${(d / 1000).toFixed(2)}s`);
    s.setProperty('--dl', `${((Math.random() * c.ms * 0.3) / 1000).toFixed(2)}s`);
  }
  window.setTimeout(() => layer.remove(), c.ms + 100);
}
