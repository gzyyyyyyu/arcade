/** 金币飞入：领补给、赢筹码时从来源飞向钱包。只动 transform/opacity，不碰布局。 */

interface Pt { x: number; y: number }

const SAMPLES = 12;

/**
 * 第 i 枚（共 n 枚）的二次贝塞尔路径。
 * 不用随机数：同一组参数永远同一条线，测试和回放都稳；起点按 i 在圆周上错开，
 * 免得金币叠成一枚。控制点取中点再往上抬，飞出弧线而不是直线。
 */
export function coinPath(from: Pt, to: Pt, i: number, n: number): Pt[] {
  const total = Math.max(1, n);
  const k = total > 1 ? i / (total - 1) : 0.5; // 0..1
  const angle = i * 2.399963; // 黄金角，相邻枚方向差得开
  const spread = 10 + 10 * k;
  const sx = from.x + Math.cos(angle) * spread;
  const sy = from.y + Math.sin(angle) * spread;
  const arch = 60 + Math.abs(to.x - from.x) * 0.15 + k * 30;
  const cx = (sx + to.x) / 2 + (k - 0.5) * 40;
  const cy = Math.min(sy, to.y) - arch;
  const pts: Pt[] = [];
  for (let s = 0; s < SAMPLES; s++) {
    const t = s / (SAMPLES - 1);
    const u = 1 - t;
    pts.push({
      x: u * u * sx + 2 * u * t * cx + t * t * to.x,
      y: u * u * sy + 2 * u * t * cy + t * t * to.y,
    });
  }
  // 起点钉在 from：散开只体现在后续点上，首尾因此都是确定的
  pts[0] = { x: from.x, y: from.y };
  return pts;
}

// 测试工程（test/tsconfig）不带 dom 库，而纯函数测试要 import 本文件；
// 引 dom 库会和 worker 的类型冲突，所以 DOM 部分只用下面这点结构类型，运行时是真 DOM。
interface El {
  className: string;
  classList: { add(c: string): void; remove(c: string): void; contains(c: string): boolean };
  offsetWidth: number;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  setAttribute(k: string, v: string): void;
  appendChild(c: El): unknown;
  remove(): void;
  animate(frames: object[], opts: object): { finished: Promise<unknown> };
  addEventListener(t: string, f: () => void, o?: object): void;
}
interface Dom {
  document: { body: El; documentElement: El; createElement(tag: string): El };
  matchMedia?(q: string): { matches: boolean };
}

function reduced(g: Dom): boolean {
  return (
    g.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
    g.document.documentElement.classList.contains('no-motion')
  );
}

function center(el: El): Pt {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const COIN = 18; // 与 css 里 .coinfly__coin 的宽高一致
const STAGGER = 40;
const DURATION = 550;

/** 从 from 元素中心飞 n 枚金币到 to 元素中心；全部落地后 resolve。减少动效时直接 resolve。 */
export async function flyCoins(fromEl: object, toEl: object, n = 8): Promise<void> {
  const g = globalThis as unknown as Dom;
  const from = fromEl as El;
  const to = toEl as El;
  const doc = g.document;
  if (reduced(g) || typeof doc.body.animate !== 'function') return;
  const a = center(from);
  const b = center(to);
  const layer = doc.createElement('div');
  layer.className = 'coinfly';
  layer.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(layer);

  const anims: { finished: Promise<unknown> }[] = [];
  for (let i = 0; i < n; i++) {
    const coin = doc.createElement('span');
    coin.className = 'coinfly__coin';
    layer.appendChild(coin);
    const pts = coinPath(a, b, i, n);
    const frames = pts.map((p, s) => {
      const t = s / (pts.length - 1);
      return {
        transform: `translate(${p.x - COIN / 2}px, ${p.y - COIN / 2}px) scale(${1 - t * 0.35})`,
        opacity: t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1,
        offset: t,
      };
    });
    anims.push(coin.animate(frames, { duration: DURATION, delay: i * STAGGER, easing: 'ease-in', fill: 'both' }));
  }

  try {
    await Promise.all(anims.map((x) => x.finished));
  } catch {
    // 动画被取消（页面切走等）：当作已结束，下面照常清理
  }
  layer.remove();

  to.classList.remove('coinfly__bump');
  void to.offsetWidth; // 强制回流，让同一元素连续弹两次也能重新播
  to.classList.add('coinfly__bump');
  to.addEventListener('animationend', () => to.classList.remove('coinfly__bump'), { once: true });
}

