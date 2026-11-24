# Documentation · 文档

Cross-module documentation for Arcade. The design docs are in Chinese; [deployment.md](deployment.md) and [self-hosting.md](self-hosting.md) are in English.
Each module's own design and usage live in its directory (`platform/`, `games/<id>/`, `packages/<name>/`: README and `docs/`).

跨模块的文档。设计文档是中文，[deployment.md](deployment.md) 和 [self-hosting.md](self-hosting.md) 是英文。各模块自己的设计和用法在模块目录里（README 和 `docs/`）。

## Where to start · 按你要做的事读

| Goal · 想做什么 | Read, in order · 按顺序读 |
|---|---|
| Understand the project · 了解这个项目 | [project.md](project.md) → [architecture.md](architecture.md) |
| Change code, open a PR · 改代码、提 PR | [CONTRIBUTING.md](../CONTRIBUTING.md)（[中文](../CONTRIBUTING.zh-CN.md)）→ [AGENTS.md](../AGENTS.md) → [engineering.md](engineering.md) → [ui.md](ui.md) |
| Build a new game · 做一个新游戏 | [new-game.md](new-game.md) → [rooms.md](rooms.md) → [economy.md](economy.md)、[balance.md](balance.md) → [table-fun.md](table-fun.md)、[social.md](social.md) |
| Work on the platform or `/api` · 改平台或接口 | [platform-backend.md](platform-backend.md) → [accounts.md](accounts.md) → [platform-features.md](platform-features.md)、[platform-wallet.md](platform-wallet.md) → [api.md](api.md) → [data.md](data.md)、[monitoring.md](monitoring.md) |
| Deploy or self-host · 部署、自托管 | [self-hosting.md](self-hosting.md) → [deployment.md](deployment.md) |
| Review a PR · 审 PR | [review-policy.md](review-policy.md) |

## All documents · 全部文档

**Project · 项目**

- [project.md](project.md) — Project definition · 项目总体定义 — goals, audience, principles, game line-up, roadmap · 目标、读者、底线、阵容、路线图
- [architecture.md](architecture.md) — Architecture · 整体架构 — modules, how games plug into the platform, deployment shapes · 模块、平台和游戏怎么接、部署形态

**Building · 开发**

- [engineering.md](engineering.md) — Engineering standard · 工程质量标准 — layout, code, tests, scripts, docs, versions, PRs · 目录、代码、测试、脚本、文档、版本、PR
- [ui.md](ui.md) — UI rules · 界面规范 — buttons, type sizes, dialogs, wording, desktop and phone, one screen · 按钮、字号、弹窗、文案、电脑和手机、一屏放下
- [new-game.md](new-game.md) — Adding a game · 新游戏开发指南 — from a new directory to the platform and a standalone deploy · 从建目录到接平台、单独部署
- [rooms.md](rooms.md) — Online rooms · 联机房间规范 — the `arcade-kit/room` rules: one alarm, write budget, hidden info, limits, quotas · 一个闹钟、写入预算、隐藏信息、硬限制、额度
- [table-fun.md](table-fun.md) — Table fun · 牌桌互动规范 — emotes, props and computer reactions · 表情、道具、电脑的反应
- [social.md](social.md) — Social · 社交 — sharing, presence, invites, spectating, friends' boards · 分享、在线、邀请、旁观、好友榜
- [economy.md](economy.md) — Chip economy · 筹码体系 — one wallet, fun and stake modes, tiers, daily caps · 一个钱包、娱乐和实盘、档位、每日上限
- [balance.md](balance.md) — Balance targets · 配平目标 — difficulty and payout targets shared by all games · 所有游戏共用的难度和收益目标

**Platform · 平台**

- [platform-backend.md](platform-backend.md) — Platform backend · 平台后端 — overall design, measurements, cost and quota guard, release, compliance, risks · 总体设计、实测、费用与额度防护、发布、合规、风险
- [accounts.md](accounts.md) — Accounts · 账号 — login, same-origin security, room identity, rate limits · 登录、同域安全边界、开房认人、防刷限流
- [platform-features.md](platform-features.md) — Saves, friends, invites · 云存档、好友、邀请制 — cloud saves, friends, platform UI, invite-only and the login gate · 云存档、好友、平台界面、邀请制与登录闸门
- [platform-wallet.md](platform-wallet.md) — Wallet and records · 钱包和战绩 — wallet RPC, career stats, human-game stats · 钱包 RPC、战绩、真人对局统计
- [data.md](data.md) — Platform data · 平台数据 — D1 tables, rows written per call, cleanup, backup, migrations · D1 表、写入行数、清理、备份和迁移
- [monitoring.md](monitoring.md) — Monitoring · 监控和告警 — checks, `/api/monitor`, a minimal alert script · 巡检项、`/api/monitor`、自己接告警
- [api.md](api.md) — `/api` reference · 接口约定 — common rules, rate-limit table, error codes; parts: [api-account.md](api-account.md) (accounts, saves, admin · 账号、云存档、管理), [api-boards.md](api-boards.md) (boards, wallet, records · 排行榜、钱包、战绩), [api-social.md](api-social.md) (friends and social · 好友和社交)

**Operations · 部署与审阅**

- [deployment.md](deployment.md) — Deployment and its security model *(English)* · 部署链路和安全设计
- [self-hosting.md](self-hosting.md) — Self-hosting on your own server *(English)* · 自托管
- [review-policy.md](review-policy.md) — PR review and merge rules · PR 审阅与合并 — roles, red lines, the checklist, what needs a maintainer · 角色、红线、审阅清单、要维护者审的改动

## Section numbers · 节号对照

Platform documents share one section numbering. Code comments and other documents cite sections like "platform-backend.md 5.9" or "api.md 15.20"; find the file here.
平台文档全站统一编号，代码注释和别的文档写的「platform-backend.md 5.9」「api.md 15.20」都按节号在这里找文件。拆分、合并文档时节号不变。

| 节 | 内容 | 文件 |
|---|---|---|
| 0–3、6、8–13 | 摘要、约束、实测结论、总体结构；费用与额度防护；仓库与发布、联机形态、合规底线、风险、没做的 | [platform-backend.md](platform-backend.md) |
| 4.1–4.7 | 实时房间规范 | [rooms.md](rooms.md) |
| 5.1–5.4 | 账号、同域安全边界、开房认人、防刷限流 | [accounts.md](accounts.md) |
| 5.5–5.8 | 云存档、好友、平台界面、邀请制与登录闸门 | [platform-features.md](platform-features.md) |
| 5.9–5.11 | 钱包、战绩、真人对局统计 | [platform-wallet.md](platform-wallet.md) |
| 7.1–7.5 | 平台数据（D1） | [data.md](data.md) |
| 15.1、15.6、15.10 | 接口通用规则、限流总表、错误码 | [api.md](api.md) |
| 15.2、15.3、15.7、15.8、15.20、15.21 | 账号、云存档、管理、登录闸门、邀请码、隐藏游戏接口 | [api-account.md](api-account.md) |
| 15.5、15.9、15.11、15.12 | 排行榜、钱包、战绩、排行榜页接口 | [api-boards.md](api-boards.md) |
| 15.4、15.13–15.19、15.22 | 好友和社交接口 | [api-social.md](api-social.md) |
| 16.1–16.3 | 监控和告警 | [monitoring.md](monitoring.md) |
