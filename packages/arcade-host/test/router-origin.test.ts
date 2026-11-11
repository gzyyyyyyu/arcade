import { describe, expect, it } from 'vitest';
import { publicRequest } from '../src/runtime/origin';

// 反代用 http 连 workerd 时，模块看到的 url 要和浏览器的 Origin 对得上（游戏的 CSRF 拿 url.origin 比 Origin 头）
describe('router 对外地址', () => {
  const req = (u: string) => new Request(u, { method: 'POST', headers: { origin: 'https://game.example.com', 'x-arcade': '1' }, body: '{"a":1}' });

  it('http 进来换成 SITE_ORIGIN，路径、查询、方法、头、body 原样', async () => {
    const r = req('http://game.example.com/games/x/api/live/buyin?q=1');
    const out = publicRequest(r, new URL(r.url), 'https://game.example.com');
    expect(out.url).toBe('https://game.example.com/games/x/api/live/buyin?q=1');
    expect(new URL(out.url).origin).toBe(out.headers.get('origin'));
    expect(out.method).toBe('POST');
    expect(out.headers.get('x-arcade')).toBe('1');
    expect(await out.text()).toBe('{"a":1}');
  });

  it('没设、不合法、已经一样时原样返回', () => {
    const r = req('http://127.0.0.1:8080/');
    expect(publicRequest(r, new URL(r.url), undefined)).toBe(r);
    expect(publicRequest(r, new URL(r.url), '')).toBe(r);
    expect(publicRequest(r, new URL(r.url), 'not a url')).toBe(r);
    const same = req('https://game.example.com/');
    expect(publicRequest(same, new URL(same.url), 'https://game.example.com/')).toBe(same);
  });
});
