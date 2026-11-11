/**
 * 寻宝航线 DOM 动画的时钟：跟着 Phaser 的游戏循环走（game.events 'step'），每帧按真实经过的时间插值，曲线取 motion.ts 的 EASE。
 * 不用 CSS 过渡、不用 setTimeout 排动作：这样小船、数字滚动、宝箱演出和画布同一个时钟，
 * 冒烟录 60 帧视频时（__haidao.frameStep 手动推帧）DOM 动画也一帧一帧走，不会按墙钟跑完。
 */
import { app } from './app.ts';
import { EASE_FN, type EaseName } from './motion.ts';

interface Job {
  t0: number;
  dur: number;
  f: (k: number, ms: number) => void;
  ease: (k: number) => number;
  done: () => void;
  alive: () => boolean;
  /** 不定时长的循环（返回 false 就停） */
  loop?: (ms: number) => boolean;
}

const jobs: Job[] = [];
let now = -1;
let hooked = false;

/** 系统开了"减弱动态效果"：演出时长压到很短，直接看结果 */
export const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function hook(): void {
  if (hooked || !app.booted) return;
  hooked = true;
  app.game.events.on('step', (t: number) => {
    now = t;
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i]!;
      if (j.t0 < 0) j.t0 = t;
      const ms = t - j.t0;
      if (!j.alive()) {
        jobs.splice(i, 1);
        j.done();
        continue;
      }
      if (j.loop) {
        if (!j.loop(ms)) {
          jobs.splice(i, 1);
          j.done();
        }
        continue;
      }
      const k = j.dur <= 0 ? 1 : Math.min(1, ms / j.dur);
      j.f(j.ease(k), ms);
      if (k >= 1) {
        jobs.splice(i, 1);
        j.done();
      }
    }
  });
}

/** 补间：f(缓动后的进度 0..1, 已过毫秒)；alive 变假时提前结束（界面被关掉） */
export function tween(ms: number, f: (k: number, ms: number) => void, ease: EaseName = 'recover', alive: () => boolean = () => true): Promise<void> {
  hook();
  return new Promise((res) => {
    jobs.push({ t0: -1, dur: REDUCED ? Math.min(ms, 60) : ms, f, ease: EASE_FN[ease], done: res, alive });
  });
}

/** 等一会儿（同一个时钟） */
export const wait = (ms: number, alive: () => boolean = () => true): Promise<void> => tween(ms, () => undefined, 'recover', alive);

/** 每帧调 f(已过毫秒)，返回 false 停 */
export function every(f: (ms: number) => boolean, alive: () => boolean = () => true): void {
  hook();
  jobs.push({ t0: -1, dur: 0, f: () => undefined, ease: EASE_FN.recover, done: () => undefined, alive, loop: f });
}

/** 两点之间的二次贝塞尔（金币飞的弧线） */
export function bez(a: number, c: number, b: number, k: number): number {
  const u = 1 - k;
  return u * u * a + 2 * u * k * c + k * k * b;
}

/** 数字滚动：从 a 滚到 b，写进 el */
export function rollNum(el: HTMLElement, a: number, b: number, ms: number, fmtN: (n: number) => string, alive: () => boolean = () => el.isConnected): Promise<void> {
  return tween(ms, (k) => {
    el.textContent = fmtN(Math.round(a + (b - a) * k));
  }, 'strike', alive);
}

export const clockNow = (): number => now;
