/// <reference types="vite/client" />
/**
 * 每个错误码都要有给玩家看的文案：http.ts 对没写文案的码会退回"服务器出错"，新加一个码忘了写，玩家看到的就是假话。
 * 码从后端源码里扫（只扫 worker/，不碰 node_modules）：写死在 new ApiError(…, '码') 里的、校验函数 return 出去再被抛的、
 * 钱包结果里按 r.error === '码' 转抛的。
 */
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../worker/api/lib/http';

const WORKER = Object.entries(import.meta.glob('../worker/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>);

function codes(): Map<string, string> {
  const found = new Map<string, string>();
  const add = (code: string, file: string) => found.has(code) || found.set(code, file);
  for (const [file, src] of WORKER) {
    for (const m of src.matchAll(/new ApiError\(\s*\d+\s*,\s*'([a-z_]+)'/g)) add(m[1]!, file);
    // 钱包结果的码只算原样转抛的那几行（r.error 进了 new ApiError），转成别的错误的不算
    for (const line of src.split('\n').filter((l) => /new ApiError\([^)]*\br\.error/.test(l))) {
      for (const m of line.matchAll(/\br\.error === '([a-z_]+)'/g)) add(m[1]!, file);
    }
    // validate.ts 的校验函数返回 'ok' 或者错误码，由 body.ts 原样抛成 422
    if (file.endsWith('/validate.ts')) for (const m of src.matchAll(/return '([a-z_]+)'/g)) if (m[1] !== 'ok') add(m[1]!, file);
  }
  return found;
}

describe('错误码的文案', () => {
  it('扫到了码（正则写坏时别静默通过）', () => {
    expect(codes().size).toBeGreaterThan(20);
  });

  it('每个抛出去的码都有文案', () => {
    const missing = [...codes()].filter(([code]) => !(code in MESSAGES)).map(([code, file]) => `${code}（${file}）`);
    expect(missing).toEqual([]);
  });
});
