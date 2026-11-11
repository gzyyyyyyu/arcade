import { describe, expect, it } from 'vitest';
import { ModalStack, type ModalEntry } from '../src/view/modalstack.ts';

/** 假弹窗：close 把 alive 置 false，记录 esc 被调了几次 */
function mk(opts: { closable?: boolean; stack?: boolean } = {}): ModalEntry & { alive_: boolean; escs: number } {
  const m = {
    alive_: true,
    escs: 0,
    closable: opts.closable ?? true,
    stack: opts.stack,
    esc() { m.escs++; if (m.closable) m.close(); },
    close() { m.alive_ = false; },
    alive: () => m.alive_,
  };
  return m;
}

describe('ModalStack', () => {
  it('Esc 关最上面一层，没有弹窗时不接', () => {
    const s = new ModalStack();
    expect(s.escape()).toBe(false);
    const a = mk();
    s.open(a);
    expect(s.escape()).toBe(true);
    expect(a.alive_).toBe(false);
    expect(s.isOpen).toBe(false);
    expect(s.escape()).toBe(false);
  });

  it('结算类：Esc 走主按钮（esc 回调），自己不关；点遮罩不理', () => {
    const s = new ModalStack();
    const r = mk({ closable: false });
    r.esc = () => { r.escs++; };
    s.open(r);
    expect(s.maskClick(r)).toBe(false);
    expect(r.escs).toBe(0);
    expect(s.escape()).toBe(true);
    expect(r.escs).toBe(1);
    expect(r.alive_).toBe(true);
  });

  it('可关的弹窗点遮罩会关', () => {
    const s = new ModalStack();
    const a = mk();
    s.open(a);
    expect(s.maskClick(a)).toBe(true);
    expect(a.alive_).toBe(false);
  });

  it('同时只开一个：新弹窗打开时旧的先关', () => {
    const s = new ModalStack();
    const a = mk();
    const b = mk();
    s.open(a);
    s.open(b);
    expect(a.alive_).toBe(false);
    expect(b.alive_).toBe(true);
    expect(s.size).toBe(1);
  });

  it('确认框可以叠在面板上，最多两层；Esc 先关上面那层', () => {
    const s = new ModalStack();
    const a = mk();
    const c1 = mk({ stack: true });
    const c2 = mk({ stack: true });
    s.open(a);
    s.open(c1);
    expect(s.size).toBe(2);
    expect(s.maskClick(a)).toBe(false); // 被盖住的那层不响应
    s.open(c2);
    expect(a.alive_).toBe(false);
    expect(s.size).toBe(2);
    s.escape();
    expect(c2.alive_).toBe(false);
    expect(c1.alive_).toBe(true);
  });

  it('直接从界面上拿掉的弹窗（mask.remove）自动出栈', () => {
    const s = new ModalStack();
    const a = mk();
    s.open(a);
    a.close();
    expect(s.isOpen).toBe(false);
    const b = mk();
    s.open(b);
    expect(s.size).toBe(1);
  });
});
