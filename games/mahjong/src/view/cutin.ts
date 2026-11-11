/**
 * 吃碰杠胡立直的过场条：一条斜着的色带从出手那家的一侧滑进来，带着头像和大字，亮光扫过一遍，再滑出去。
 *
 * 为什么用 WAAPI 而不是 CSS 关键帧：时长随"快速档"和牌种变，用 offset 排时间轴比拼一堆 animation-delay 好改；
 * 只动 transform / opacity，不碰 layout。条不接指针（pointer-events: none），同一时刻只留一条，新来的顶掉旧的。
 */
import './cutin.css';
import { el } from './dom.ts';
import { avatarSvg } from './avatar.ts';
import { play, type Sfx } from './sound.ts';
import {
  CUTIN_KINDS,
  cutinFrom,
  cutinHeight,
  cutinIsBig,
  cutinMs,
  cutinStreakFont,
  cutinStreakHeight,
  streakTier,
  streakWord,
  cutinTier,
  cutinTop,
  cutinWord,
  type CutinKind,
} from './cutin-spec.ts';

export { cutinKindOfBanner, type CutinKind } from './cutin-spec.ts';

const SOUND: Record<CutinKind, Sfx> = {
  pon: 'cutinJade',
  chi: 'cutinJade',
  kan: 'cutinKan',
  hu: 'cutinGold',
  zimo: 'cutinGold',
  riichi: 'cutinRiichi',
};

const DEFAULT_WORD: Record<CutinKind, string> = { pon: '碰', chi: '吃', kan: '杠', hu: '胡', zimo: '自摸', riichi: '立直' };

let fast = false;
/** 主界面切"快速档"时同步过来（过场条时长减半） */
export function setCutinFast(on: boolean): void {
  fast = on;
}

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export interface CutinOpts {
  kind: CutinKind;
  /** 要写的字；不给就用这个种类的默认字。感叹号会去掉 */
  text?: string;
  /** 出手的人相对我的座位：0 我 / 1 下家 / 2 对家 / 3 上家 */
  rel: number;
  /** 头像：传现成的节点会复制一份，不传就按名字画一个 */
  avatar?: Element | null;
  name?: string;
  bot?: boolean;
  /** 整张牌桌的根节点：自己胡了的"震一下"加在它身上 */
  shake?: HTMLElement | null;
  /** 血流成河：这一家这局第几次胡（n≥2 才加码：换字、加高、多停、闪屏）；其他情况不传 */
  streak?: number;
}

interface Running {
  nodes: HTMLElement[];
  anims: Animation[];
  timer: number;
  shake: HTMLElement | null;
}
let current: Running | null = null;

function stop(): void {
  if (!current) return;
  const c = current;
  current = null;
  window.clearTimeout(c.timer);
  for (const a of c.anims) a.cancel();
  for (const n of c.nodes) n.remove();
  c.shake?.classList.remove('cutin-shake');
}

/** 在 layer（牌桌的画面层）里放一条过场条；返回总时长（毫秒）。同时响一声短促的合成音，跟静音开关和音量 */
export function showCutin(layer: HTMLElement, o: CutinOpts): number {
  stop();
  const lowMotion = reduced();
  const streak = o.kind === 'hu' || o.kind === 'zimo' ? o.streak ?? 0 : 0;
  const tier = streakTier(streak);
  const ms = cutinMs(o.kind, fast, lowMotion, streak);
  const word = (tier ? streakWord(streak) : null) ?? (cutinWord(o.text ?? '') || DEFAULT_WORD[o.kind]);
  const from = cutinFrom(o.rel);
  const dir = from === 'left' ? 1 : -1;
  const h = tier ? cutinStreakHeight(layer.clientHeight || 600, streak) : cutinHeight(layer.clientHeight || 600);
  const nodes: HTMLElement[] = [];
  const anims: Animation[] = [];
  const run = (n: HTMLElement, frames: Keyframe[], easing = 'linear'): void => {
    anims.push(n.animate(frames, { duration: ms, fill: 'both', easing }));
  };

  const band = el('div', `cutin ${tier >= 3 ? 'redgold' : cutinTier(o.kind)} from-${from}${tier ? ` streak s${tier}` : ''}${lowMotion ? ' calm' : ''}`, layer);
  nodes.push(band);
  // 连胡加码的带子更高：底边（连斜出去的那截）不过画面 64%，免得压住底部操作条（11-02 逐帧审）
  const hPct = (h / (layer.clientHeight || 600)) * 100;
  band.style.top = `${Math.max(2, Math.min(cutinTop(o.rel), 64 - hPct))}%`;
  band.style.height = `${h}px`;
  band.style.setProperty('--h', `${h}px`);
  const tilt = from === 'left' ? -4 : 4;

  const bg = el('div', 'cutin-bg', band);
  const sweep = el('i', 'cutin-sweep', bg);
  const inner = el('div', 'cutin-in', band);

  const art = o.avatar ? (o.avatar.cloneNode(true) as Element) : null;
  const av = el('div', 'cutin-av', inner);
  if (art) av.appendChild(art);
  else av.innerHTML = avatarSvg(o.name ?? '', o.bot ?? true);

  const w = el('div', `cutin-word k-${o.kind}`, inner, word);
  w.style.fontSize = `${tier ? cutinStreakFont(h, word.length, streak, layer.clientWidth || 800) : Math.round(h * (word.length > 2 ? 0.5 : 0.66))}px`;
  let stick: HTMLElement | null = null;
  if (o.kind === 'riichi') {
    stick = el('div', 'cutin-stick', inner);
    el('i', '', stick);
  }

  if (lowMotion) {
    // 减少动态效果：不滑不扫，只让字淡入淡出
    run(band, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]);
  } else {
    // 带子：从一侧滑进（0–18%），停住，再往另一侧滑走（82–100%）
    const at = (x: number): string => `translate3d(${x}%, 0, 0) rotate(${tilt}deg)`;
    run(
      band,
      [
        { transform: at(-110 * dir), opacity: 0, offset: 0, easing: 'cubic-bezier(.2,.9,.25,1)' },
        { transform: at(0), opacity: 1, offset: 0.18 },
        { transform: at(2 * dir), opacity: 1, offset: 0.82, easing: 'cubic-bezier(.6,0,.9,.4)' },
        { transform: at(110 * dir), opacity: 0, offset: 1 },
      ],
    );
    // 字：从大变小砸下来，稍停再散
    run(
      w,
      [
        { transform: 'scale(1.7)', opacity: 0, offset: 0.1 },
        { transform: 'scale(0.94)', opacity: 1, offset: 0.3, easing: 'ease-out' },
        { transform: 'scale(1)', opacity: 1, offset: 0.4 },
        { transform: 'scale(1.06)', opacity: 1, offset: 0.84 },
        { transform: 'scale(1.1)', opacity: 0, offset: 1 },
      ],
    );
    run(
      av,
      [
        { transform: 'scale(.5)', opacity: 0, offset: 0.06 },
        { transform: 'scale(1.12)', opacity: 1, offset: 0.26 },
        { transform: 'scale(1)', opacity: 1, offset: 0.34 },
        { transform: 'scale(1)', opacity: 1, offset: 0.84 },
        { transform: 'scale(.9)', opacity: 0, offset: 1 },
      ],
    );
    // 亮光：斜着的一道白光扫过整条
    run(
      sweep,
      [
        { transform: 'translate3d(-130%,0,0)', opacity: 0, offset: 0.18 },
        { transform: 'translate3d(-60%,0,0)', opacity: 1, offset: 0.3 },
        { transform: 'translate3d(130%,0,0)', opacity: 0, offset: 0.62 },
        { transform: 'translate3d(130%,0,0)', opacity: 0 },
      ],
      'ease-in-out',
    );
    if (stick) {
      const glint = stick.firstElementChild as HTMLElement;
      run(
        glint,
        [
          { transform: 'translate3d(-120%,0,0)', opacity: 0, offset: 0.35 },
          { transform: 'translate3d(0,0,0)', opacity: 1, offset: 0.5 },
          { transform: 'translate3d(260%,0,0)', opacity: 0, offset: 0.72 },
          { transform: 'translate3d(260%,0,0)', opacity: 0 },
        ],
        'ease-in-out',
      );
    }
  }

  let shake: HTMLElement | null = null;
  if (tier >= 2 && !lowMotion && o.rel !== 0) {
    // 三连胡以上别人胡的也闪一下（自己胡的下面已经闪过），让全桌都知道出大事了
    const flash = el('div', 'cutin-flash', layer);
    nodes.push(flash);
    anims.push(flash.animate([{ opacity: 0 }, { opacity: 0.35, offset: 0.25 }, { opacity: 0 }], { duration: 300, fill: 'both', easing: 'ease-out' }));
  }
  if (cutinIsBig(o.kind) && o.rel === 0) {
    if (!lowMotion) {
      // 闪一下白金色，桌面轻震 120 毫秒（用单独的 translate 属性，不和舞台缩放的 transform 打架）
      const flash = el('div', 'cutin-flash', layer);
      nodes.push(flash);
      anims.push(flash.animate([{ opacity: 0 }, { opacity: tier ? 0.7 : 0.5, offset: 0.25 }, { opacity: 0 }], { duration: tier ? 380 : 260, fill: 'both', easing: 'ease-out' }));
      shake = o.shake ?? null;
      shake?.classList.add('cutin-shake');
    }
    if (touch()) navigator.vibrate?.(30);
  }

  play(SOUND[o.kind]);
  const me: Running = {
    nodes,
    anims,
    shake,
    timer: window.setTimeout(() => {
      if (current === me) stop();
    }, ms + 120),
  };
  current = me;
  return ms;
}

/**
 * 只在开发服务器上认：网址带 ?cutin=pon|chi|kan|hu|zimo|riichi（可再加 &from=0..3 指定谁出手，默认 2），
 * 进桌后 1.5 秒起每 2.5 秒放一次，截图、录屏用。正式构建里整个函数被摇掉。
 */
export function devCutin(layer: HTMLElement, root: HTMLElement): void {
  if (!import.meta.env.DEV) return;
  const q = new URLSearchParams(location.search);
  const kind = q.get('cutin') as CutinKind | null;
  if (!kind || !CUTIN_KINDS.includes(kind)) return;
  const rel = Math.min(3, Math.max(0, Number(q.get('from') ?? 2) || 0));
  // &streak=2|3|4 看血流成河的连胡加码（只对 hu、zimo 有效）
  const streak = Math.min(9, Math.max(0, Number(q.get('streak') ?? 0) || 0));
  const go = (): void => {
    if (!layer.isConnected) return;
    // 头像用那个座位名牌上的（截图看着和真打一样），没有才画"测试"
    const avatar = root.querySelector(`.badge.r${rel} .avatar`)?.firstElementChild ?? null;
    showCutin(layer, { kind, rel, avatar, name: '测试', bot: false, shake: root, streak });
    window.setTimeout(go, 2_500);
  };
  window.setTimeout(go, 1_500);
}
