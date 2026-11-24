# 平台部署

平台是一个 Worker（名字 `arcade`）加一个 D1 库，要先于游戏部署：游戏经服务绑定 `arcade` 调它。

- **本仓库的正式站**：只由 `main` 上的 GitHub Actions 部署（见下面"本仓库的正式部署"），不手动部署。
- **fork 以后自己部署整站**（平台加游戏）：照仓库根 README 的部署一节做。
- **Deploy to Cloudflare 按钮**：只部署平台本身（下面"一键部署"），游戏要另外部署。
- **自托管**：用仓库的自托管运行时（一个 workerd 进程里跑平台和所有游戏，数据库二选一 SQLite 或 PostgreSQL），本模块的代码不用改。步骤见仓库根的 `docs/self-hosting.md` 和 `tools/selfhost/README.md`。

## 绑定、变量和 Secret

| 名字 | 种类 | 说明 |
|---|---|---|
| `DB` | D1 | 账号、存档、好友、钱包等数据；表结构在 `migrations/`（只增不删） |
| `ASSETS` | 静态资源 | `dist/`，单页回退；`/api/*`、`/games/*` 先进 Worker |
| `SITE_ORIGIN` | 变量，可选 | 站点地址，如 `https://game.example.com`。设了 `/api` 只认这个主机名、写请求的 Origin 必须等于它；不设按请求自己的地址 |
| `REGISTRATION` | 变量 | 注册的紧急总闸，默认 `"switch"` |
| `LIMITS` | 变量 | 覆盖 `worker/api/lib/config.ts` 里的上限和阈值，只写要改的项 |
| `PEPPER_PW`、`PEPPER_RC`、`PEPPER_SID`、`PEPPER_IP` | Secret，必填 | 各种哈希的 pepper，值写成 `<kid>:<随机串>`（随机串至少 16 个字符）。缺了 `/api` 返回 503 |
| `ADMIN_TOKEN` | Secret | 管理令牌，格式同上，给命令行工具 `npm run admin` 用；不设就只能在 `/admin` 页面里管理 |
| `API_MODE` | Secret，可选 | 紧急开关 `normal` / `readonly` / `off`（仓库根 `docs/platform-backend.md` 6.6） |
| `PEPPER_*_PREV` | Secret，可选 | 换 pepper 时还要认的旧值（`PEPPER_IP` 没有，5.1） |

必填的几项也写在 `.dev.vars.example` 和 `package.json` 的 `cloudflare.bindings` 里。Secret 一律自己生成随机值（`openssl rand -hex 24`），
不要用 `.dev.vars.example` 里的本地假值。另有两个 Cron 写在 `wrangler.jsonc` 里：每天 UTC 19:17 跑统计和清理，每 5 分钟巡检一次（第 16 节）。

## 一键部署（Deploy to Cloudflare）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/platform)

按钮只部署平台本身，不带游戏。

1. 点按钮：Cloudflare 把本目录复制成你自己的仓库，自动建 D1 库，按提示填 Secret；`npm run deploy` 会先建表（D1 迁移）再部署。
2. **绑自定义域名**：`wrangler.jsonc` 关掉了 workers.dev 地址（它绕过网关限速），所以部署完要绑一个域名才能访问：
   在 Cloudflare 控制台的 Workers & Pages → `arcade` → Settings → Domains & Routes → Add → Custom domain，填你的主机名（域名要在这个账号下）。
   也可以在自己的仓库里给 `npx wrangler deploy` 加 `--domain <主机名>`。
3. （建议）把变量 `SITE_ORIGIN` 设成 `https://<你的主机名>`，`/api` 就只认这个地址。
4. **建第一个管理员**：新站点没有任何账号、注册默认关着。在自己的仓库目录里：

   ```bash
   npm ci
   export ARCADE_BASE_URL=https://game.example.com     # 换成你的地址
   read -rs ARCADE_ADMIN_TOKEN && export ARCADE_ADMIN_TOKEN   # 粘贴部署时填的 ADMIN_TOKEN，不回显、不进 shell 历史
   npm run admin -- create <用户名> <昵称> --admin
   ```

   打印出的密码和恢复码记好，用它登录后在 `/admin` 里建号、开放注册。

游戏要挂在同一个域名下：每个游戏的 Worker 用路径路由 `<主机名>/games/<id>/*`（路由优先于平台的自定义域名），见各游戏的 README。

## 本仓库的正式部署

正式部署只走 `main` 上的 GitHub Actions（仓库根的 `.github/workflows/platform.yml`）：改动经 PR 合并进 `main` 后，先测试、构建、打包，
再由仓库级的部署程序 `tools/deployer` 部署；部署作业进 `production` 环境，要维护者批准。
部署程序从审过的 `wrangler.jsonc` 生成最终配置，填上 `production` 环境 secret 里的正式库 id（`D1_DATABASE_ID`）和站点域名（`SITE_HOST`），
先跑 D1 迁移再部署；仓库里不写这两个值。做法和理由见仓库根的 `tools/deployer/README.md`。

正式站不用 `npm run deploy` 手动部署（它不带上面的注入和检查）；Secret 用 `wrangler secret put` 单独设，不随部署变。

## 命令行工具

`tools/admin.ts`（`npm run admin`）调 `/api/admin/*`，令牌只从环境变量 `ARCADE_ADMIN_TOKEN` 读、不打印；站点地址必须用 `--base=<地址>` 或环境变量 `ARCADE_BASE_URL` 给，
只许 https（本机的 http://localhost 除外）。生成的密码和恢复码打印在终端。

```bash
npm run admin -- list
npm run admin -- create <用户名> <昵称> [--admin] [--password=<密码>]
npm run admin -- reset <用户名> [--new-recovery-code] [--password=<密码>]
npm run admin -- registration open|close|status
```

不给 `--password` 时由服务器生成一个好记的密码（推荐：命令行里的密码会留在 shell 历史里）。
