import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJson, readText, removeKey, writeJson, writeText } from '../src/storage.ts';

/** 假的 localStorage：可以让读、写各自抛错 */
function fake(opts: { getThrows?: boolean; setThrows?: boolean } = {}) {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => {
      if (opts.getThrows) throw new Error('denied');
      return k in data ? data[k]! : null;
    },
    setItem: (k: string, v: string) => {
      if (opts.setThrows) throw new DOMException('full', 'QuotaExceededError');
      data[k] = v;
    },
    removeItem: (k: string) => {
      if (opts.setThrows) throw new Error('denied');
      delete data[k];
    },
  };
}

describe('storage 正常读写', () => {
  it('文本和 JSON 往返，没有的键回 null / fallback', () => {
    const s = fake();
    expect(readText('mahjong.a', s)).toBeNull();
    expect(readJson('mahjong.a', { x: 1 }, s)).toEqual({ x: 1 });
    expect(writeText('mahjong.a', 'hi', s)).toBe(true);
    expect(readText('mahjong.a', s)).toBe('hi');
    expect(writeJson('mahjong.b', { n: [1, 2] }, s)).toBe(true);
    expect(s.data['mahjong.b']).toBe('{"n":[1,2]}');
    expect(readJson('mahjong.b', null, s)).toEqual({ n: [1, 2] });
    expect(removeKey('mahjong.a', s)).toBe(true);
    expect(readText('mahjong.a', s)).toBeNull();
  });
});

describe('storage 失败不抛', () => {
  it('getItem 抛错：读回 null / fallback', () => {
    const s = fake({ getThrows: true });
    expect(readText('mahjong.a', s)).toBeNull();
    expect(readJson('mahjong.a', 7, s)).toBe(7);
  });
  it('setItem 抛配额错：写回 false，删也不抛', () => {
    const s = fake({ setThrows: true });
    expect(writeText('mahjong.a', 'x', s)).toBe(false);
    expect(writeJson('mahjong.a', { a: 1 }, s)).toBe(false);
    expect(removeKey('mahjong.a', s)).toBe(false);
  });
  it('坏 JSON 回 fallback，文本照读', () => {
    const s = fake();
    s.data['mahjong.a'] = '{坏了';
    expect(readJson('mahjong.a', 'fb', s)).toBe('fb');
    expect(readText('mahjong.a', s)).toBe('{坏了');
  });
  it('JSON 序列化失败（循环引用）回 false', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(writeJson('mahjong.a', a, fake())).toBe(false);
  });
  it('store 传 null 是没有存储', () => {
    expect(readText('mahjong.a', null)).toBeNull();
    expect(writeText('mahjong.a', 'x', null)).toBe(false);
    expect(removeKey('mahjong.a', null)).toBe(false);
  });
  it('不传 store 时访问 localStorage 本身抛错（隐私模式）也不抛', () => {
    // node 环境没有 localStorage：读写都走兜底
    expect(readText('mahjong.a')).toBeNull();
    expect(writeText('mahjong.a', 'x')).toBe(false);
  });
});

describe('存储读写都收在 storage.ts', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
    });
  it('src 里除 storage.ts 外没人直接 getItem / setItem / removeItem，core 和 ai 不碰存储', () => {
    const bad: string[] = [];
    for (const f of walk('src')) {
      if (f.endsWith('storage.ts')) continue;
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/\.(getItem|setItem|removeItem)\(/.test(code) && !f.endsWith(join('net', 'cloud.ts'))) bad.push(f);
      if (/localStorage|sessionStorage/.test(code) && /src[\\/](core|ai)[\\/]/.test(f)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});
