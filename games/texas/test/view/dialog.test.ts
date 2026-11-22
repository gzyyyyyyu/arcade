/**
 * 弹窗的键盘和焦点（docs/ui.md 第 5 节）：Esc、Tab 循环、焦点归还、不漏到牌桌快捷键、危险按钮的类名。
 * 项目里没有 DOM 测试库（不新增依赖），这里手写一个够 dialog.ts 用的最小 DOM；事件按"window 捕获 → 目标冒泡到 window"的顺序派发。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDialog, dialog, type Choice } from '../../src/view/dialog.ts';

type Fn = (e: FakeEvent) => void;
interface FakeEvent {
  key: string;
  shiftKey: boolean;
  target: FakeNode | null;
  defaultPrevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

let active: FakeNode | null = null;
const win = { capture: [] as Fn[], bubble: [] as Fn[] };

class FakeNode {
  className = '';
  textContent = '';
  tabIndex = -1;
  type = '';
  disabled = false;
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  attrs: Record<string, string> = {};
  handlers: Record<string, Fn[]> = {};
  private cls = new Set<string>();
  tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  get isConnected(): boolean {
    let n: FakeNode | null = this;
    while (n?.parent) n = n.parent;
    return n === root;
  }
  get classList() {
    const set = this.cls;
    return {
      add: (c: string) => void set.add(c),
      contains: (c: string) => set.has(c),
      toggle: (c: string, on?: boolean) => void ((on ?? !set.has(c)) ? set.add(c) : set.delete(c)),
    };
  }
  appendChild(c: FakeNode): FakeNode {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove(): void {
    if (this.contains(active)) active = null; // 真浏览器里被摘掉的元素失焦
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  addEventListener(t: string, f: Fn): void {
    (this.handlers[t] ??= []).push(f);
  }
  contains(n: FakeNode | null): boolean {
    for (let x = n; x; x = x.parent) if (x === this) return true;
    return false;
  }
  all(): FakeNode[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  querySelectorAll(): FakeNode[] {
    return this.all().filter((n) => (n.tag === 'button' || n.tag === 'input') && !n.disabled);
  }
  querySelector(sel: string): FakeNode | null {
    return this.all().find((n) => sel.slice(1).split('.').every((c) => n.className.split(' ').includes(c))) ?? null;
  }
  focus(): void {
    active = this;
  }
  click(): void {
    for (const f of this.handlers.click ?? []) f({ target: this } as unknown as FakeEvent);
  }
}

const root = new FakeNode('div');
const body = new FakeNode('body');

/** 按一个键：先 window 捕获，没被截就从目标冒泡（经过 mask 上的监听）再到 window 冒泡（牌桌快捷键在这里） */
function press(key: string, o: { shift?: boolean; on?: FakeNode | null } = {}): FakeEvent {
  const target = o.on === undefined ? active : o.on;
  const e: FakeEvent = {
    key,
    shiftKey: !!o.shift,
    target,
    defaultPrevented: false,
    stopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
  for (const f of [...win.capture]) if (!e.stopped) f(e);
  for (let n = target; n && !e.stopped; n = n.parent) for (const f of n.handlers.keydown ?? []) f(e);
  if (!e.stopped) for (const f of [...win.bubble]) f(e);
  return e;
}

const stage = root as unknown as HTMLElement;
let shortcut: string[] = [];

beforeEach(() => {
  root.children = [];
  body.children = [];
  active = null;
  win.capture = [];
  win.bubble = [(e) => void shortcut.push(e.key)];
  shortcut = [];
  const g = globalThis as Record<string, unknown>;
  g.document = {
    createElement: (t: string) => new FakeNode(t),
    get activeElement() {
      return active;
    },
    body,
  };
  g.window = {
    addEventListener: (_t: string, f: Fn, cap?: boolean) => void (cap ? win.capture : win.bubble).push(f),
    removeEventListener: (_t: string, f: Fn, cap?: boolean) => {
      const l = cap ? win.capture : win.bubble;
      l.splice(l.indexOf(f), 1);
    },
  };
});

afterEach(() => {
  closeDialog();
});

const confirm: Choice[] = [
  { label: '接着打', value: 'no', cancel: true },
  { label: '离桌', value: 'yes', danger: true },
];
const btns = (): FakeNode[] => root.querySelector('.d-buttons')!.children;

describe('弹窗：键盘与焦点', () => {
  it('危险按钮是 d-btn danger，主按钮是 d-btn primary，两者不叠', () => {
    void dialog(stage, '离桌', 'x', [...confirm, { label: '好', value: 'ok', primary: true, danger: true }]);
    const [a, b, c] = btns();
    expect(a!.className).toBe('d-btn');
    expect(b!.className).toBe('d-btn danger');
    expect(c!.className).toBe('d-btn danger');
  });

  it('默认焦点：离桌确认落在"接着打"而不是危险的"离桌"；有主按钮落主按钮；focus 优先', () => {
    void dialog(stage, '离桌', 'x', confirm);
    expect(active).toBe(btns()[0]);
    void dialog(stage, 'y', 'x', [{ label: '算了', value: 'no' }, { label: '补上', value: 'yes', primary: true }]);
    expect(active).toBe(btns()[1]);
    void dialog(stage, 'z', 'x', [{ label: 'a', value: 'a' }, { label: 'b', value: 'b', primary: true }, { label: 'c', value: 'c', focus: true }]);
    expect(active).toBe(btns()[2]);
  });

  it('Esc：有 cancel 的按钮就等于点它；没有的关掉，结果是 null', async () => {
    const p1 = dialog(stage, '离桌', 'x', confirm);
    press('Escape');
    expect(await p1).toBe('no');
    expect(root.children).toHaveLength(0);
    const p2 = dialog(stage, '提示', 'x', [{ label: '好', value: 'ok', primary: true }]);
    const e = press('Escape');
    expect(await p2).toBeNull();
    expect(e.defaultPrevented).toBe(true);
  });

  it('Esc：sticky 的不关；sticky 但带 cancel 按钮的等于点它', async () => {
    let settled = false;
    const p1 = dialog(stage, '输光了', 'x', [{ label: '离桌', value: 'no', danger: true }, { label: '补上', value: 'yes', primary: true }], true).then((v) => {
      settled = true;
      return v;
    });
    press('Escape');
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(root.children).toHaveLength(1);
    closeDialog();
    expect(await p1).toBeNull();
    const p2 = dialog(stage, '止盈', 'x', [{ label: '取消', value: 'cancel', cancel: true }], true);
    press('Escape');
    expect(await p2).toBe('cancel');
  });

  it('Tab / Shift+Tab 在弹窗里循环，走不出去', () => {
    void dialog(stage, 'x', 'y', [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }, { label: 'c', value: 'c', primary: true }]);
    const [a, b, c] = btns();
    // 右上角 ✕ 排在按钮后面，是 Tab 顺序里的最后一个
    const x = root.querySelector('.d-x')!;
    expect(active).toBe(c);
    x.focus();
    expect(press('Tab').defaultPrevented).toBe(true); // 最后一个往后：回到第一个
    expect(active).toBe(a);
    expect(press('Tab', { shift: true }).defaultPrevented).toBe(true); // 第一个往前：到最后一个
    expect(active).toBe(x);
    b!.focus();
    expect(press('Tab').defaultPrevented).toBe(false); // 中间的交给浏览器按顺序走
    // 十次 Tab（浏览器顺序走用 next 模拟）焦点始终在弹窗里
    const order = [...btns(), x];
    for (let i = 0; i < 10; i++) {
      const e = press('Tab');
      if (!e.defaultPrevented) order[order.indexOf(active!) + 1]!.focus();
      expect(root.contains(active)).toBe(true);
    }
    // 焦点跑到弹窗外：Tab 把它拉回来
    active = body;
    press('Tab', { on: body });
    expect(root.contains(active)).toBe(true);
  });

  it('关掉以后焦点还给打开前的那个元素；元素没了就不报错', async () => {
    const opener = new FakeNode('button');
    root.appendChild(opener);
    opener.focus();
    const p = dialog(stage, '离桌', 'x', confirm);
    expect(active).not.toBe(opener);
    btns()[0]!.click();
    await p;
    expect(active).toBe(opener);
    const gone = new FakeNode('button');
    root.appendChild(gone);
    gone.focus();
    const p2 = dialog(stage, '离桌', 'x', confirm);
    gone.remove();
    press('Escape');
    expect(await p2).toBe('no');
  });

  it('同时只开一个：新的打开时旧的关掉（结果 null），焦点最后还给最初的元素', async () => {
    const opener = new FakeNode('button');
    root.appendChild(opener);
    opener.focus();
    const p1 = dialog(stage, 'a', 'x', confirm);
    const p2 = dialog(stage, 'b', 'x', confirm);
    expect(await p1).toBeNull();
    expect(root.children.filter((c) => c.className === 'mask')).toHaveLength(1);
    press('Escape');
    expect(await p2).toBe('no');
    expect(active).toBe(opener);
  });

  it('弹窗开着时按键不漏到牌桌快捷键；关掉后恢复', async () => {
    const p = dialog(stage, '离桌', 'x', confirm);
    press('f');
    press('c');
    press('Enter');
    press('r', { on: body }); // 焦点在弹窗外也截
    expect(shortcut).toEqual([]);
    press('Escape');
    await p;
    press('f');
    expect(shortcut).toEqual(['f']);
  });
});
