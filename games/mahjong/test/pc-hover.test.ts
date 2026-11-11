import { describe, expect, it } from 'vitest';
import { countPlayHint, HINT_KEY, HINT_LIMIT, memoPerView, showPlayHint } from '../src/view/pc-hover.ts';
import { escAction } from '../src/view/dialog.ts';

function mem(): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('悬停听牌缓存', () => {
  it('同一个视图同一张牌只算一次，换视图重算', () => {
    let n = 0;
    const f = memoPerView((_v: object, t: number | null) => { n++; return t; });
    const v1 = {};
    f(v1, 3);
    f(v1, 3);
    f(v1, null);
    f(v1, null);
    expect(n).toBe(2);
    f({}, 3);
    expect(n).toBe(3);
  });
});

describe('打牌提示次数', () => {
  it('前几次显示，之后收起，次数封顶', () => {
    const s = mem();
    for (let i = 0; i < HINT_LIMIT; i++) {
      expect(showPlayHint(s)).toBe(true);
      countPlayHint(s);
    }
    expect(showPlayHint(s)).toBe(false);
    countPlayHint(s);
    expect(s.data[HINT_KEY]).toBe(String(HINT_LIMIT));
  });
  it('存储坏了或不可用时一直显示、不报错', () => {
    expect(showPlayHint(null)).toBe(true);
    expect(() => countPlayHint(null)).not.toThrow();
    const bad = { getItem: () => 'abc', setItem: () => { throw new Error('x'); } };
    expect(showPlayHint(bad)).toBe(true);
    expect(() => countPlayHint(bad)).not.toThrow();
  });
});

describe('Esc 判断', () => {
  const base = { altKey: false, ctrlKey: false, metaKey: false, repeat: false };
  it('只有 Esc、没有修饰键、弹窗有处理函数才算', () => {
    expect(escAction({ ...base, key: 'Escape' }, () => {})).toBe(true);
    expect(escAction({ ...base, key: 'Escape' }, null)).toBe(false);
    expect(escAction({ ...base, key: 'a' }, () => {})).toBe(false);
    expect(escAction({ ...base, key: 'Escape', ctrlKey: true }, () => {})).toBe(false);
  });
});
