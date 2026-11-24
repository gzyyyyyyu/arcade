# 平台 · Arcade Platform

小游戏街机厅的大厅、账号和 `/api`：一个 Cloudflare Worker 加一个 D1 库，所有游戏都调它。

[English](README.md) · **简体中文**

![大厅，八个游戏](docs/media/lobby.webp)

## 功能

- **大厅**：游戏卡片（最近玩的排第一）、一条提醒条、进出游戏的过渡、快捷键和新人三步引导；匿名访客一个 `/api` 请求都不发。
- **邀请制账号**：用户名 + 密码 + 恢复码；注册默认关着，凭邀请码（`/i/<码>`）注册或由管理员开放。
- **好友和动态**：好友码、请求、屏蔽、在线状态、一键加入好友的房间、约局，好友动态能点赞。
- **筹码钱包**：一个余额通用所有游戏。带入、带回、兑换只能由游戏服务端经 `WalletService` RPC 调；浏览器只能看和领补给。筹码不能买、换、转让。
- **战绩和排行榜**：徽章墙、各游戏概览、本周净赢总榜加各游戏的周榜和每日榜、异步挑战链接、晒战绩出图。
- **云存档**：`/api/saves/<游戏>/<槽>`，白名单就是 `shared/games.ts` 里的游戏目录。
- **管理**：`/admin` 管理页和命令行工具（`npm run admin`）。
- **防刷和监控**：持久限流、按类别的写入预算和只读/关闭档位、健康检查和每 5 分钟巡检。

## 快速开始

需要 Node 22（`.nvmrc`）。

```bash
npm ci
npm run build && cp .dev.vars.example .dev.vars
npm run dev:api   # 接口 0.0.0.0:5181（本地 D1）
npm run dev       # 界面 0.0.0.0:5180，/api 转给 5181
npm test          # 类型检查 + vitest（跑在 workerd 里）
npm run build     # 类型检查 + 正式构建到 dist/
```

本地注册也默认关着，先建一个管理员：

```bash
ARCADE_ADMIN_TOKEN=dev:local-dev-admin-token-000000 npm run admin -- create me 我自己 --admin --base=http://localhost:5181
```

## 目录结构

```
platform/
├─ src/          界面（React + Vite）：features/、lib/、pages/
├─ shared/       界面和 Worker 都要的数据和纯函数（游戏目录）
├─ worker/       Worker 入口和 /api（account、social、scores、wallet、ops）
├─ migrations/   D1 迁移，只增不删
├─ public/       静态资源、CSP 头、游戏封面
├─ test/         接口测试（vitest 跑在 workerd 里）
├─ tools/        界面冒烟、管理命令行、封面生成
└─ docs/         本模块文档和旧版本更新日志
```

## 部署

平台要先于游戏部署：游戏经服务绑定 `arcade` 调它。本仓库的正式站只由 `main` 上的 GitHub Actions 部署；fork 以后可以用 Deploy to Cloudflare 按钮（只部署平台）或自托管。见 [docs/deploy.md](docs/deploy.md)。

## 文档

- [docs/development.md](docs/development.md)：本地开发、浏览器存储的 key、加一个新游戏、完整的代码地图。
- [docs/deploy.md](docs/deploy.md)：绑定和 Secret、一键部署、正式部署链路、管理命令行。
- [docs/pages.md](docs/pages.md)：各页面怎么排、怎么用。
- [docs/style.md](docs/style.md)：配色变量、动效和声音。
- [docs/smoke.md](docs/smoke.md)：界面冒烟分段，改什么跑哪段。
- [ASSETS.md](ASSETS.md)：图片和字体的来源。
- [CHANGELOG.md](CHANGELOG.md)：更新日志。
- 接口约定在 Arcade 仓库根：`docs/platform-backend.md` 和 `docs/api.md`。

## 属于 Arcade

这是 Arcade 仓库的 `platform/` 模块，自带 package、测试和 Worker 配置，也能拆出去单独部署。

## 许可证

MIT，见 [LICENSE](LICENSE)。`worker/api/account/weak-passwords.ts` 取自 SecLists（MIT 许可，Copyright (c) 2018 Daniel Miessler）。
