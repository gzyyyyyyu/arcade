/**
 * 本地试 Worker 时代替平台的假 arcade（冒烟 scripts/smoke-room.ts），不部署：
 * cookie __Host-sid=<id> 就认作这个人，没有就是没登录；钱包用 kit 的假钱包 arcade-kit/testing（RPC 和浏览器的 /api/wallet*）；
 * 好友：报位置、问邀请收下就回（没有邀请）；好友列表 16 个、在线离线混着（叫朋友面板要翻页），叫谁来都回一个邀请号。
 * 云存档（docs/platform-backend.md 5.5）：读回空列表、写了就回下一个版本号，不真存（src/net/cloud.ts 不再拿到 404、控制台不报错）。
 * 快速匹配的排队经 RPC 问屏蔽名单（平台 0.25.0 的 blockedAmong），所以是 WorkerEntrypoint；这里谁也没屏蔽谁。
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { walletHttp, type FakeEnv } from 'arcade-kit/testing';

export { FakeBank, WalletService } from 'arcade-kit/testing';

const NAMES = ['老王', '小李', '阿芳', '大刘', '二丫', '胖虎', '老周', '小敏', '阿杰', '老陈', '静静', '小马', '阿强', '老孙', '豆豆', '小吴'];
const FRIENDS = NAMES.map((displayName, i) => ({ userId: i === 0 ? 'friend-wang' : `friend-${i}`, displayName, online: i % 3 !== 2 }));

export default class Arcade extends WorkerEntrypoint<FakeEnv> {
  private rev = 0;

  blockedAmong(): [string, string][] {
    return [];
  }

  async fetch(request: Request): Promise<Response> {
    const env = this.env;
    const wallet = await walletHttp(request, env);
    if (wallet) return wallet;
    // 好友（docs/social.md 1.2、1.3，kit 的 social 部件每 2 分钟报位置、每 30 秒问邀请）：报了就收下，没有邀请
    const path = new URL(request.url).pathname;
    if (path === '/api/presence' || path === '/api/feed') return new Response(null, { status: 204 });
    if (path === '/api/invites') return request.method === 'POST' ? Response.json({ id: 'inv-smoke-1' }) : Response.json({ invites: [] });
    // 好友十几个、在线离线混着：叫朋友面板放不下要翻页（kit 0.24.2 按可用高度分页），冒烟和五尺寸量测都走得到；老王排第一，smoke-room 点的就是他
    if (path === '/api/friends') return Response.json({ friends: FRIENDS });
    if (path.startsWith('/api/saves/')) return request.method === 'GET' ? Response.json({ saves: [] }) : Response.json({ rev: ++this.rev });
    const sid = /__Host-sid=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
    return Response.json({ user: sid ? { id: sid, displayName: `本地${sid}` } : null });
  }
}
