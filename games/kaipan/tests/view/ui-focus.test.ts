import { describe, expect, it } from 'vitest';
import { claimArrows, focusOrder, handleKey, registerFocusable, setFocusHome, step, stepDir, unregisterFocusable, type Focusable } from '../../src/view/ui/focus.ts';

/** 0.9.0 键盘焦点：只在最上面那层里按阅读顺序走；框亮着时回车按下去，框下被弹窗盖住的不按。 */

interface Fake extends Focusable {
  name: string;
  on: boolean;
  presses: number;
  ok: boolean;
  depth: number;
}

function fake(name: string, x: number, y: number, depth = 0): Fake {
  const b: Fake = {
    name,
    on: false,
    presses: 0,
    ok: true,
    depth,
    focusable: () => b.ok,
    layer: () => b.depth,
    rect: () => ({ x, y, w: 80, h: 40 }),
    setFocused: (v) => {
      b.on = v;
    },
    press: () => {
      b.presses += 1;
      return true;
    },
  };
  return b;
}

const key = (k: string, shift = false) => ({ key: k, shiftKey: shift, altKey: false, ctrlKey: false, metaKey: false });

describe('焦点顺序', () => {
  it('先上后下，同一行（上沿差不到 12）从左到右；不能点的跳过', () => {
    const a = fake('a', 300, 100);
    const b = fake('b', 100, 105);
    const c = fake('c', 100, 200);
    const d = fake('d', 50, 50);
    d.ok = false;
    expect(focusOrder([a, b, c, d]).map((x) => (x as Fake).name)).toEqual(['b', 'a', 'c']);
  });

  it('有弹窗时只在最上面那层里走', () => {
    const under = fake('under', 0, 0, 0);
    const ok = fake('ok', 500, 400, 300);
    const cancel = fake('cancel', 300, 400, 300);
    expect(focusOrder([under, ok, cancel]).map((x) => (x as Fake).name)).toEqual(['cancel', 'ok']);
  });

  it('往前往后走，到头绕回来；当前的不在里面时从头或从尾开始', () => {
    const [a, b, c] = [fake('a', 0, 0), fake('b', 100, 0), fake('c', 200, 0)];
    const order = [a, b, c];
    expect(step(order, null, 1)).toBe(a);
    expect(step(order, null, -1)).toBe(c);
    expect(step(order, c, 1)).toBe(a);
    expect(step(order, a, -1)).toBe(c);
    expect(step([], a, 1)).toBeNull();
  });
});

describe('按键', () => {
  it('Tab 亮框、回车按下去；框下的按钮被弹窗盖住后回车不按，交给别人处理', () => {
    const a = fake('a', 0, 0);
    const b = fake('b', 100, 0);
    registerFocusable(a);
    registerFocusable(b);
    try {
      expect(handleKey(key('Enter'))).toBe(false); // 框没亮：回车照旧是场景的快捷键
      expect(handleKey(key('Tab'))).toBe(true);
      expect(a.on).toBe(true);
      expect(handleKey(key('Tab'))).toBe(true);
      expect([a.on, b.on]).toEqual([false, true]);
      expect(handleKey(key('Tab', true))).toBe(true);
      expect(a.on).toBe(true);
      expect(handleKey(key(' '))).toBe(true);
      expect(a.presses).toBe(1);

      const dlg = fake('dlg', 400, 300, 300);
      registerFocusable(dlg);
      expect(handleKey(key('Enter'))).toBe(false);
      expect(a.presses).toBe(1);
      expect(a.on).toBe(false);
      // 再按 Tab 就走进弹窗里
      expect(handleKey(key('Tab'))).toBe(true);
      expect(dlg.on).toBe(true);
      unregisterFocusable(dlg);
      // 带修饰键的不管（Ctrl+Tab 是浏览器切标签页）
      expect(handleKey({ ...key('Tab'), ctrlKey: true })).toBe(false);
    } finally {
      unregisterFocusable(a);
      unregisterFocusable(b);
    }
  });

  it('没有能点的按钮时 Tab 不拦，交给浏览器', () => {
    expect(handleKey(key('Tab'))).toBe(false);
  });
});

describe('方向键', () => {
  // 3 张推荐卡竖排（右栏）、2 张持仓卡并排（中间）、开盘键（下面）
  const rec = [fake('rec0', 1000, 100), fake('rec1', 1000, 250), fake('rec2', 1000, 400)];
  const hold = [fake('hold0', 300, 200), fake('hold1', 500, 200)];
  const open = fake('open', 500, 600);
  const order = [hold[0]!, hold[1]!, ...rec, open];

  it('往右走到同一行最近的，往下走到同一列最近的；这个方向没有就留在原地', () => {
    expect(stepDir(order, hold[0]!, 'right')).toBe(hold[1]);
    expect(stepDir(order, hold[1]!, 'left')).toBe(hold[0]);
    expect(stepDir(order, hold[1]!, 'right')).toBe(rec[1]); // 越过持仓卡：右栏里（沿方向的距离 + 两倍侧偏）最近的推荐卡
    expect(stepDir(order, rec[0]!, 'down')).toBe(rec[1]);
    expect(stepDir(order, rec[1]!, 'up')).toBe(rec[0]);
    expect(stepDir(order, hold[1]!, 'down')).toBe(open);
    expect(stepDir(order, hold[0]!, 'left')).toBe(hold[0]);
    expect(stepDir(order, open, 'down')).toBe(open);
  });

  it('侧偏越大越靠后：往下时同一列的优先于斜着的', () => {
    const near = fake('near', 305, 400);
    const far = fake('far', 700, 330);
    expect(stepDir([hold[0]!, far, near], hold[0]!, 'down')).toBe(near);
  });

  it('当前不在这一层里：落在 home（在这层的话），没有 home 就是第一个；空的返回 null', () => {
    const gone = fake('gone', 0, 0);
    expect(stepDir(order, gone, 'down', open)).toBe(open);
    expect(stepDir(order, null, 'down')).toBe(order[0]);
    expect(stepDir(order, gone, 'down', fake('elsewhere', 9, 9))).toBe(order[0]);
    expect(stepDir([], null, 'left')).toBeNull();
  });

  it('按键：第一下把框亮在 home 上，再按才走；Esc 收框；有界面自己用方向键时不抢', () => {
    const a = fake('a', 0, 0);
    const b = fake('b', 200, 0);
    registerFocusable(a);
    registerFocusable(b);
    setFocusHome(b);
    try {
      expect(handleKey(key('ArrowLeft'))).toBe(true);
      expect([a.on, b.on]).toEqual([false, true]);
      expect(handleKey(key('ArrowLeft'))).toBe(true);
      expect([a.on, b.on]).toEqual([true, false]);
      expect(handleKey(key('ArrowRight'))).toBe(true);
      expect(b.on).toBe(true);
      expect(handleKey(key('Enter'))).toBe(true);
      expect(b.presses).toBe(1);
      handleKey(key('Escape'));
      expect(b.on).toBe(false);
      // 框收起后方向键先把框亮回记住的那个
      handleKey(key('ArrowUp'));
      expect(b.on).toBe(true);
      const free = claimArrows();
      expect(handleKey(key('ArrowLeft'))).toBe(false);
      free();
      free();
      expect(handleKey(key('ArrowLeft'))).toBe(true);
    } finally {
      setFocusHome(null);
      unregisterFocusable(a);
      unregisterFocusable(b);
    }
  });

  it('没有能点的按钮时方向键不拦', () => {
    expect(handleKey(key('ArrowDown'))).toBe(false);
  });
});
