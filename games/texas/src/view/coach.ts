/**
 * 新手指引的画面（src/guide.ts 管内容和状态）：一个盖在整个页面上的固定层，里面是高亮圈和说明框。
 * 不放进 .stage：舞台是整体缩放的，手机上字会缩到看不清；这一层按屏幕像素排，字号固定，安全区也直接适用。
 * 说明框按目标在屏幕上的位置摆（placeCoach），不压目标；转屏、改窗口大小、目标挪了都重新量。
 * 同一时间只有一个：开新的先关旧的。
 */
import { placeBest, type Box, type Step, type Target } from '../guide.ts';
import { el } from './dom.ts';
import { must } from '../must.ts';

/** 目标在屏幕上的矩形；量不到（还没发牌、操作区收着）返回 null，说明框就居中讲 */
type RectOf = (t: Target) => DOMRect | null;

let cur: (() => void) | null = null;

export function closeCoach(): void {
  cur?.();
}

const box = (r: DOMRect | null): Box | null => (r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);

/**
 * 桌上不许压的东西：每个座位的名牌（名字和筹码）、我的底牌、头像和牌型名牌、操作区（弃牌、跟注、加注，亮着时）。
 * 现量 DOM，不靠调用方一个个传；量不到（没发牌、座位空着没摆出来）就自然少几块。
 * 目标自己如果是其中一块，placeCoach 贴着目标摆（留 gap），不受这里影响
 */
function tableAvoid(): Box[] {
  const out: Box[] = [];
  for (const e of document.querySelectorAll('.table .seat:not(.empty) .plate, .table .seat.me .card:not(.hidden), .table .seat.me .avatar, .table .seat.me .hand, .actions.on')) {
    const b = box(e.getBoundingClientRect());
    if (!b) continue;
    // 实在放不下时（手机横屏）宁可压别人的名牌，也别压我的牌和操作区：这几块重复记，摆放按压到的面积算代价
    out.push(b, ...(e.matches('.plate') ? [] : [b, b, b]));
  }
  return out;
}

/** 手机竖屏窄：说明框先试窄的几档（原来 300 起步，在 390 宽的屏上占了大半个桌面） */
const widthsFor = (area: Box): readonly number[] => (area.w <= 520 ? [220, 200, 180, 160] : [300, 240, 200]);

/** 层的可用区：层本身减去四边内边距（CSS 里按 safe-area 和最小边距写） */
function usable(layer: HTMLElement): Box {
  const r = layer.getBoundingClientRect();
  const c = getComputedStyle(layer);
  const [t, rt, b, l] = [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].map((x) => parseFloat(x) || 0);
  return { x: r.left + must(l, 'l'), y: r.top + must(t, 't'), w: r.width - must(l, 'l') - must(rt, 'rt'), h: r.height - must(t, 't') - must(b, 'b') };
}

interface Live {
  layer: HTMLDivElement;
  ring: HTMLDivElement;
  card: HTMLDivElement;
}

function mount(blocking: boolean): Live & { off: () => void; fit: (target: Box | null, avoid?: Box[]) => void } {
  closeCoach();
  const layer = el('div', `coach-layer${blocking ? ' block' : ''}`, document.body);
  const ring = el('div', `coach-ring${blocking ? '' : ' soft'}`, layer);
  const card = el('div', 'coach-box', layer);
  card.setAttribute('role', 'dialog');
  const fit = (target: Box | null, avoid: Box[] = []): void => {
    const pad = 4;
    ring.classList.toggle('hidden', !target);
    if (target) Object.assign(ring.style, { left: `${target.x - pad}px`, top: `${target.y - pad}px`, width: `${target.w + 2 * pad}px`, height: `${target.h + 2 * pad}px` });
    layer.classList.toggle('plain', !target);
    // 宽放不下（手机横屏矮）就换窄一档重量：样式里的宽度被内联值盖住，量完留着最后一次的
    const wide = card.classList.contains('wide');
    const area = usable(layer);
    const p = placeBest(
      target,
      (mw) => {
        card.style.width = `${Math.min(mw + (wide ? 120 : 0), area.w)}px`;
        return { w: card.offsetWidth, h: card.offsetHeight };
      },
      area,
      [...avoid, ...tableAvoid()],
      widthsFor(area),
    );
    card.style.width = `${p.w}px`;
    card.style.left = `${p.x}px`;
    card.style.top = `${p.y}px`;
  };
  const off = (): void => layer.remove();
  return { layer, ring, card, off, fit };
}

/**
 * 走一遍：每步一个说明框指着真的东西；"下一步"往后，"跳过"（或 Esc）结束。返回走完（done）、跳过（skip），或被外面关了（closed：离桌，不算看过）。
 * 层盖住整个页面（点不到桌上的按钮），所以不会在讲的时候误操作
 */
export function walk(steps: readonly Step[], rectOf: RectOf): Promise<'done' | 'skip' | 'closed'> {
  return new Promise((resolve) => {
    const m = mount(true);
    let i = 0;
    let current: Step = must(steps[0], 'steps[0]');
    const place = (): void => m.fit(box(current.target ? rectOf(current.target) : null));
    const finish = (v: 'done' | 'skip' | 'closed'): void => {
      if (cur === closer) cur = null;
      window.removeEventListener('resize', later);
      window.removeEventListener('orientationchange', later);
      window.visualViewport?.removeEventListener('resize', later);
      window.removeEventListener('keydown', key, true);
      window.clearTimeout(timer);
      m.off();
      resolve(v);
    };
    const draw = (): void => {
      current = must(steps[i], 'steps[i]');
      const last = i === steps.length - 1;
      m.card.replaceChildren();
      m.card.classList.toggle('wide', !!current.wide);
      const head = el('div', 'c-head', m.card);
      el('b', 'c-title', head, current.title);
      el('span', 'c-n', head, `${i + 1}/${steps.length}`);
      for (const l of current.lines) el('p', 'c-line', m.card, l);
      if (current.items) {
        const ul = el('ul', `c-items${current.wide ? ' grid' : ''}${current.id === 'rank' ? ' g3' : ''}`, m.card);
        for (const [tag, text, kind] of current.items) {
          const li = el('li', '', ul);
          el('i', `c-tag ${kind}`, li, tag);
          el('span', '', li, text);
        }
      }
      const row = el('div', 'c-btns', m.card);
      const skip = el('button', 'c-btn', row, '跳过');
      skip.type = 'button';
      skip.addEventListener('click', () => finish('skip'));
      const next = el('button', 'c-btn primary', row, last ? '开打' : '下一步');
      next.type = 'button';
      next.addEventListener('click', () => {
        if (last) finish('done');
        else {
          i++;
          draw();
        }
      });
      place();
      next.focus({ preventScroll: true });
      // 卡的内容变了高度、手机上字体晚一点才就位：下一帧再量一次
      requestAnimationFrame(place);
    };
    let timer = 0;
    const closer = (): void => finish('closed');
    cur = closer;
    // 转屏后舞台缩放要稍等才稳（viewport.ts 也是 350 ms 补算一次）：先量一次，稍后再补
    const later = (): void => {
      place();
      window.clearTimeout(timer);
      timer = window.setTimeout(place, 400);
    };
    // 捕获阶段先接：Esc 跳过；F / C / R 这些桌上的快捷键别漏过去（操作区的监听在 window 上，停在这里它收不到）。Tab、回车照常
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') return;
      if (e.key === 'Escape') finish('skip');
      e.stopPropagation();
    };
    window.addEventListener('resize', later);
    window.addEventListener('orientationchange', later);
    window.visualViewport?.addEventListener('resize', later);
    window.addEventListener('keydown', key, true);
    draw();
  });
}

/**
 * 情境提示：一小条，指着一块东西，点"知道了"收起。不拦桌上的操作（层不收点击），所以不耽误牌局。
 * avoid：不许压的别的块（"下一手"按钮、操作区），每次摆放时现量
 */
export function hint(text: string, target: () => DOMRect | null, avoid: () => (DOMRect | null)[] = () => []): void {
  const m = mount(false);
  el('p', 'c-line', m.card, text);
  const row = el('div', 'c-btns', m.card);
  const ok = el('button', 'c-btn primary', row, '知道了');
  ok.type = 'button';
  let timer = 0;
  const place = (): void =>
    m.fit(
      box(target()),
      avoid().flatMap((r) => box(r) ?? []),
    );
  const later = (): void => {
    place();
    window.clearTimeout(timer);
    timer = window.setTimeout(place, 400);
  };
  const close = (): void => {
    if (cur === close) cur = null;
    window.removeEventListener('resize', later);
    window.removeEventListener('orientationchange', later);
    window.visualViewport?.removeEventListener('resize', later);
    window.clearTimeout(timer);
    m.off();
  };
  cur = close;
  ok.addEventListener('click', close);
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  window.visualViewport?.addEventListener('resize', later);
  place();
  requestAnimationFrame(place);
  timer = window.setTimeout(place, 400);
}
