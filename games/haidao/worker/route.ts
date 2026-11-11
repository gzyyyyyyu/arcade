/**
 * 海岛 Worker 的路由。两种部署由 env 决定（共用包 0.10 起）：
 * - 本站：部署工具按 tools/workers.json 补上平台绑定 ARCADE（认人）和 GATE=login；
 * - 单独部署（wrangler.jsonc 原样）：没有平台，谁打开都能玩，站点根 / 转到 /games/haidao/。
 * 首页三种写法过共用包的登录闸门 loginGate；/games/haidao/health 给平台巡检用，排在最前面：不过登录闸门、不读存储、不问平台。
 */
import { loginGate, standaloneRoot, type GateEnv } from 'arcade-kit/worker';
import pkg from '../package.json' with { type: 'json' };
import { handlePvp, PVP_PREFIX, type Ports, type PvpEnv } from './pvp/api.ts';
import { handleLive, liveKindOf, type LiveEnv } from './live.ts';

const GAME = 'haidao';
const BASE = `/games/${GAME}`;
export const HEALTH_PATH = `${BASE}/health`;
export type Env = GateEnv & PvpEnv & LiveEnv;

/** 平台不可用时的 503 页：海岛自己的标题和配色 */
const DOWN_PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>海岛</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f4c6b;color:#fff4dc;font:16px/1.6 system-ui,sans-serif;text-align:center}a{color:#ffd166}</style></head>
<body><main><h1>平台暂时连不上</h1><p>稍等一会儿再刷新试试。</p><p><a href="/">回大厅</a></p></main></body></html>`;

/** ports：两个 DO（Base、Harbor）的入口，由 index.ts 按绑定给（worker/do.ts 的 portsOf）；没绑时 PvP 接口回 501 */
export async function route(request: Request, env: Env, ports: Ports | null = null): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === HEALTH_PATH && (request.method === 'GET' || request.method === 'HEAD')) {
    return Response.json({ ok: true, version: pkg.version }, { headers: { 'Cache-Control': 'no-store' } });
  }
  // 异步攻防（DESIGN.md 第 5 节）：认人、CSRF、单独部署的 501 都在 handlePvp 里
  if (path.startsWith(PVP_PREFIX)) return handlePvp(request, env, ports);
  // 悬赏出海（实盘）和筹码兑换（DESIGN.md 第 4 节）：钱包经平台服务绑定 WALLET
  if (liveKindOf(path)) return handleLive(request, env, ports);
  const root = standaloneRoot(request, env, GAME);
  if (root) return root;
  if (path === BASE) return Response.redirect(new URL(`${BASE}/`, request.url).toString(), 301);
  if (path === `${BASE}/` || path === `${BASE}/index.html`) return loginGate(request, env, { downPage: DOWN_PAGE });
  return env.ASSETS.fetch(request);
}
