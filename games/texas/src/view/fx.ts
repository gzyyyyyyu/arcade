/**
 * 关键时刻的特效（docs/art.md 第 5 节）：赢牌的金币、全下的聚光、大锅的金边。
 * 都是一次性的临时节点，放完就删；不等它们放完牌局照走（画面不许卡住牌局，docs/screens.md 8.6）。
 * 时长按动画快慢缩放、封顶 1.5 秒（大锅、全下别太长，快档更短）。只动 transform / opacity。
 * 省内存设备（根上的 .lowfx，scene.ts 判断）不放金币粒子，只留一下光。
 */
import type { Pt } from './layout.ts';
import { FX_MS, MAX_MS } from './timing.ts';


export const fxMs = (pace: number): number => Math.min(MAX_MS, Math.round(FX_MS * pace));

const lowFx = (): boolean => document.documentElement.classList.contains('lowfx');

/** 金币从赢家头像里迸出来、往上撒开再落下；big 时更多更远。down：顶上的座位往下（桌子那边）撒，不撒进顶栏 */
export function coinBurst(layer: HTMLElement, at: Pt, pace: number, big = false, down = false): void {
  const ms = fxMs(pace);
  if (ms <= 0 || lowFx()) return;
  const n = big ? 16 : 9;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'fx-coin';
    c.style.left = `${at.x}px`;
    c.style.top = `${at.y}px`;
    layer.appendChild(c);
    // 往上半圈撒开（-160° 到 -20°；down 是 20° 到 160°），远近、转几圈各不一样；画面层的随机不进规则，用 Math.random 没关系
    const a = (((down ? 20 : -160) + (140 * (i + Math.random() * 0.6)) / n) * Math.PI) / 180;
    const r = (big ? 90 : 60) + Math.random() * (big ? 70 : 40);
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 360);
    c.animate(
      [
        { transform: 'translate(-50%, -50%) translate(0, 0) rotateY(0) scale(.6)', opacity: 0 },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotateY(${spin / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(-50%, -50%) translate(${dx * 1.15}px, ${dy + 40}px) rotateY(${spin}deg) scale(.9)`, opacity: 0 },
      ],
      { duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)', delay: Math.random() * ms * 0.12 },
    ).finished.then(
      () => c.remove(),
      () => c.remove(),
    );
  }
}

/** 全下：整张桌子暗下去，聚光收在这个座位上，亮一下再散开 */
export function spotlight(layer: HTMLElement, at: Pt, pace: number): void {
  const ms = fxMs(pace);
  if (ms <= 0) return;
  const s = document.createElement('div');
  s.className = 'fx-spot';
  s.style.setProperty('--x', `${at.x}px`);
  s.style.setProperty('--y', `${at.y}px`);
  layer.appendChild(s);
  s.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: ms, easing: 'ease-in-out' }).finished.then(
    () => s.remove(),
    () => s.remove(),
  );
}

/** 大锅：舞台四边泛一圈金光 */
export function edgeGlow(layer: HTMLElement, pace: number): void {
  const ms = fxMs(pace);
  if (ms <= 0) return;
  const g = document.createElement('div');
  g.className = 'fx-glow';
  layer.appendChild(g);
  g.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' }).finished.then(
    () => g.remove(),
    () => g.remove(),
  );
}

/** 大牌庆祝的参数（view/table.ts 按 fun/climax.ts 的档次给） */
export interface CelebrateOpt {
  /** 赢家头像（光爆在这里） */
  at: Pt;
  /** 横幅落点（公共牌上方一点） */
  mid: Pt;
  /** 舞台大小（筹码雨落满整张桌子） */
  w: number;
  h: number;
  pace: number;
  tier: 1 | 2;
  text: string;
  /** 好友房：只放一下光和字，短而轻，不撒筹码雨 */
  quick: boolean;
}

const once = (a: Animation, n: HTMLElement): void => void a.finished.then(() => n.remove(), () => n.remove());

/**
 * 大牌庆祝（葫芦及以上）：赢家头像一团光爆（四条以上再加转动的光芒）、横幅字弹出来、筹码雨从上面落下来。
 * 一次性临时节点、不拦点按、不等它放完；省内存（.lowfx）、减少动态效果时只留光爆和字（只动透明度），不下筹码雨
 */
export function celebrate(layer: HTMLElement, o: CelebrateOpt): void {
  const base = o.quick ? 900 : o.tier === 2 ? 2000 : 1500;
  const ms = Math.min(2200, Math.round(base * o.pace));
  if (ms <= 0) return;
  const low = lowFx();
  const burst = document.createElement('div');
  burst.className = `fx-burst t${o.tier}`;
  burst.style.left = `${o.at.x}px`;
  burst.style.top = `${o.at.y}px`;
  layer.appendChild(burst);
  once(
    burst.animate(
      low
        ? [{ transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0 }]
        : [{ transform: 'translate(-50%, -50%) scale(.2) rotate(0deg)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.3) rotate(40deg)', opacity: 1, offset: 0.25 }, { transform: `translate(-50%, -50%) scale(${o.tier === 2 ? 2.6 : 2}) rotate(${o.tier === 2 ? 140 : 80}deg)`, opacity: 0 }],
      { duration: ms, easing: 'ease-out' },
    ),
    burst,
  );
  const t = document.createElement('div');
  t.className = `fx-big t${o.tier}`;
  t.textContent = o.text;
  t.style.left = `${o.mid.x}px`;
  t.style.top = `${o.mid.y}px`;
  layer.appendChild(t);
  once(
    t.animate(
      low
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
        : [
            { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.18 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.3 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.8 },
            { transform: 'translate(-50%, -62%) scale(1)', opacity: 0 },
          ],
      { duration: ms, easing: 'ease-out' },
    ),
    t,
  );
  if (low || o.quick) return;
  // 筹码雨：从舞台顶上往下落，横向随机，边落边翻
  const n = o.tier === 2 ? 26 : 12;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'fx-coin';
    c.style.left = `${(o.w * (i + Math.random() * 0.8)) / n}px`;
    c.style.top = '-20px';
    layer.appendChild(c);
    const drift = (Math.random() - 0.5) * 60;
    once(
      c.animate(
        [
          { transform: 'translate(-50%, 0) rotateY(0deg)', opacity: 1 },
          { transform: `translate(calc(-50% + ${drift}px), ${o.h * 0.9}px) rotateY(${(Math.random() < 0.5 ? -1 : 1) * (540 + Math.random() * 360)}deg)`, opacity: 1, offset: 0.85 },
          { transform: `translate(calc(-50% + ${drift}px), ${o.h}px) rotateY(900deg)`, opacity: 0 },
        ],
        { duration: ms * (0.55 + Math.random() * 0.4), delay: Math.random() * ms * 0.35, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'backwards' },
      ),
      c,
    );
  }
}

// ---------- 底池飞向赢家（piece B）----------

/** 只淡入淡出、不位移：省内存设备（.lowfx）和"减少动态效果"（pace 压到 0.5 以下）走这一档 */
const fadeOnly = (pace: number): boolean => lowFx() || pace < 0.5;

/**
 * 沿一条弧线取样的相对位移（从 a 到 b，中途向上拱 lift）。
 * 用关键帧逐段取样、而不是一段 translate：直线匀速看着像贴图平移，弧线加先慢后快再收住，才像筹码被推过去；
 * 取样 N 点后浏览器在合成器线程插值，60 fps 下每段不到 30 ms，肉眼看不出折线。纯函数，测试直接断言端点和单调性。
 */
export function arcPoints(a: Pt, b: Pt, lift: number, n = 18): Pt[] {
  const out: Pt[] = [];
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2 - lift;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // 缓动：起步慢、中段快、落点前收住（easeInOutSine）
    const s = -(Math.cos(Math.PI * t) - 1) / 2;
    const u = 1 - s;
    out.push({ x: u * u * a.x + 2 * u * s * cx + s * s * b.x - a.x, y: u * u * a.y + 2 * u * s * cy + s * s * b.y - a.y });
  }
  return out;
}

function arcFlight(n: HTMLElement, a: Pt, b: Pt, ms: number, o: { delay?: number; lift: number; from: number; to: number }): Animation {
  const pts = arcPoints(a, b, o.lift);
  const kf = pts.map((p, i) => {
    const t = i / (pts.length - 1);
    // 飞到一半最大（"抛起来"的感觉），落地时缩回 to
    const sc = o.from + (o.to - o.from) * t + Math.sin(Math.PI * t) * 0.18;
    return { transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px) scale(${sc})`, opacity: i === pts.length - 1 ? 0.15 : 1 };
  });
  const anim = n.animate(kf, { duration: ms, delay: o.delay ?? 0, easing: 'linear', fill: 'both' });
  once(anim, n);
  return anim;
}

/**
 * 底池飞向赢家：领头的一摞（lead，带"主池"小字）走弧线，后面跟一串小筹码错开出发、一个接一个落进名牌；总时长就是 ms，不额外占时间。
 * 返回领头那一摞落地的 Promise（带兜底，不会永远等下去）。lowFx / 减少动态效果：只在赢家那儿淡入淡出一下。
 * 都是一次性临时节点；followers 的数量跟池子大小走（quick：好友房，少放几个）
 */
export function potFlight(layer: HTMLElement, lead: HTMLElement, a: Pt, b: Pt, ms: number, o: { pace: number; tier: number; quick: boolean }): Promise<void> {
  lead.style.left = `${a.x}px`;
  lead.style.top = `${a.y}px`;
  layer.appendChild(lead);
  if (ms <= 0) {
    lead.remove();
    return Promise.resolve();
  }
  if (fadeOnly(o.pace)) {
    lead.style.left = `${b.x}px`;
    lead.style.top = `${b.y}px`;
    const an = lead.animate([{ transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1, offset: 0.35 }, { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'both' });
    once(an, lead);
    return Promise.race([an.finished.then(() => undefined, () => undefined), new Promise<void>((ok) => window.setTimeout(ok, ms + 500))]);
  }
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const lift = Math.min(90, 24 + dist * 0.18);
  const lastAnim = arcFlight(lead, a, b, ms, { lift, from: 1.25, to: 0.95 });
  // 后面跟着的小筹码：出发和落点各散开一点，分三波错开，总在 ms 之内收齐
  const n = o.quick ? 3 : Math.min(9, 4 + o.tier * 2);
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'pfx-chip';
    const jx = (Math.random() - 0.5) * 30;
    const jy = (Math.random() - 0.5) * 18;
    c.style.left = `${a.x + jx}px`;
    c.style.top = `${a.y + jy}px`;
    layer.appendChild(c);
    arcFlight(c, { x: a.x + jx, y: a.y + jy }, { x: b.x + jx * 0.4, y: b.y + jy * 0.4 }, ms * 0.68, { delay: (ms * 0.3 * (i + 1)) / (n + 1), lift: lift * (0.7 + Math.random() * 0.6), from: 0.9, to: 0.6 });
  }
  return Promise.race([lastAnim.finished.then(() => undefined, () => undefined), new Promise<void>((ok) => window.setTimeout(ok, ms + 500))]);
}

/** 摊牌赢的牌型名，在公共牌上方放大停一下（结果条照旧）；不占牌局时间。lowFx / 减少动态效果：只淡入淡出 */
export function handBanner(layer: HTMLElement, at: Pt, text: string, pace: number, quick: boolean): void {
  const ms = Math.min(2200, Math.round((quick ? 1100 : 1800) * pace));
  if (ms <= 0 || !text) return;
  const t = document.createElement('div');
  t.className = 'pfx-hand';
  t.textContent = text;
  t.style.left = `${at.x}px`;
  t.style.top = `${at.y}px`;
  layer.appendChild(t);
  const base = 'translate(-50%, -50%)';
  once(
    t.animate(
      fadeOnly(pace)
        ? [{ transform: base, opacity: 0 }, { transform: base, opacity: 1, offset: 0.2 }, { transform: base, opacity: 1, offset: 0.8 }, { transform: base, opacity: 0 }]
        : [
            { transform: `${base} scale(.5)`, opacity: 0 },
            { transform: `${base} scale(1.18)`, opacity: 1, offset: 0.2 },
            { transform: `${base} scale(1)`, opacity: 1, offset: 0.32 },
            { transform: `${base} scale(1)`, opacity: 1, offset: 0.82 },
            { transform: `${base} translateY(-8px) scale(1)`, opacity: 0 },
          ],
      { duration: ms, easing: 'ease-out' },
    ),
    t,
  );
}

/**
 * 把气泡挪回舞台里：返回要再移动的位移（舞台像素，已按 scale 折算前的屏幕像素差）。
 * 1920×1080 时右上座位的"跟注 20"伸出屏幕右边（0.28.x 实测），只靠 CSS 固定偏移照顾不到每个座位和每种宽度；
 * 量实际位置、超出就推回来，最后留 margin 的边。纯函数；上下左右各自夹，框比范围还大时贴左上。
 */
export function clampShift(box: { left: number; top: number; right: number; bottom: number }, bound: { left: number; top: number; right: number; bottom: number }, margin = 6): { dx: number; dy: number } {
  const axis = (lo: number, hi: number, blo: number, bhi: number): number => {
    const min = blo + margin;
    const max = bhi - margin;
    if (hi - lo > max - min || lo < min) return min - lo;
    return hi > max ? max - hi : 0;
  };
  return { dx: axis(box.left, box.right, bound.left, bound.right), dy: axis(box.top, box.bottom, bound.top, bound.bottom) };
}

/** 被逆转：输家头像旁冒一个小签，头像晃两下。省内存、减少动态效果时只冒签不晃 */
export function badBeatTag(layer: HTMLElement, avatar: HTMLElement | null, at: Pt, pace: number, down: boolean): void {
  const ms = Math.min(2000, Math.round(1800 * pace));
  if (ms <= 0) return;
  const t = document.createElement('div');
  t.className = 'fx-beat';
  t.textContent = '被逆转';
  t.style.left = `${at.x}px`;
  // 顶上一排的往下放（上沿会被屏幕裁掉）
  t.style.top = `${at.y + (down ? 62 : -52)}px`;
  layer.appendChild(t);
  once(t.animate([{ transform: 'translate(-50%, 0) scale(.5)', opacity: 0 }, { transform: 'translate(-50%, 0) scale(1.15)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%, 0) scale(1)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%, 0) scale(1)', opacity: 0 }], { duration: ms, easing: 'ease-out' }), t);
  if (!avatar || lowFx()) return;
  // 用独立的 translate 属性晃，不碰头像自己的 transform
  avatar.animate([{ translate: '0 0' }, { translate: '-5px 0' }, { translate: '5px 0' }, { translate: '-4px 0' }, { translate: '3px 0' }, { translate: '0 0' }], { duration: Math.min(600, 600 * pace) });
}
