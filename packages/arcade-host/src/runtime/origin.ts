/** 站点对外地址（router.ts 用；单独一个文件，不依赖 Workers 类型，普通 Node 测试能直接引） */

/** 把请求的协议和主机名换成站点对外地址；没设、设得不合法或本来就一样时原样返回 */
export function publicRequest(request: Request, url: URL, site: string | undefined): Request {
  if (!site) return request;
  let origin: string;
  try {
    origin = new URL(site).origin;
  } catch {
    return request;
  }
  if (url.origin === origin) return request;
  return new Request(new URL(url.pathname + url.search, origin), request);
}
