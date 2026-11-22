# docs：跨模块的文档

> Cross-module documentation. Most documents are in Chinese; [deployment.md](deployment.md) and [self-hosting.md](self-hosting.md) are in English.
> 各模块自己的设计和用法在模块目录里（`platform/`、`games/<id>/`、`packages/<name>/` 的 README 和 docs/）。

## 按你要做的事读

| 想做什么 | 按顺序读 |
|---|---|
| 了解这个项目 | [project.md](project.md)（做什么、给谁、底线）→ [architecture.md](architecture.md)（整体架构） |
| 改代码、提 PR | 仓库根的 [AGENTS.md](../AGENTS.md)（硬约束、测试档位、Git，正本）→ [engineering.md](engineering.md)（代码和 PR 写成什么样）→ [ui.md](ui.md)（界面类改动）；外部贡献者先看 [CONTRIBUTING.md](../CONTRIBUTING.md)（英文流程） |
| 做一个新游戏 | [new-game.md](new-game.md) → [rooms.md](rooms.md)（联机房间规范）→ [economy.md](economy.md)、[balance.md](balance.md)（筹码和配平）→ [table-fun.md](table-fun.md)、[social.md](social.md)（牌桌互动、社交） |
| 改平台或接口 | [platform-backend.md](platform-backend.md)（总体设计）→ [accounts.md](accounts.md)（账号和防刷）→ [platform-features.md](platform-features.md)、[platform-wallet.md](platform-wallet.md)（云存档、好友、钱包、战绩）→ [api.md](api.md)（`/api` 接口约定）→ [cost-guard.md](cost-guard.md)、[data.md](data.md)（额度、数据表） |
| 部署、自托管 | [self-hosting.md](self-hosting.md)（自己的服务器）→ [deployment.md](deployment.md)（部署链路和安全设计） |
| 审 PR | [review-policy.md](review-policy.md)（红线、清单、要维护者审的改动） |

## 全部文档

| 文档 | 内容 |
|---|---|
| [project.md](project.md) | 项目总体定义：目标、读者、底线、各游戏一句话、路线图 |
| [architecture.md](architecture.md) | 整体架构：模块、平台和游戏怎么接、部署形态 |
| [engineering.md](engineering.md) | 工程质量标准：目录、代码、测试细则、脚本名、文档、版本和更新日志、PR 描述和截图 |
| [ui.md](ui.md) | 界面规范：回大厅、按钮、字号、弹窗、文案、设置、电脑和手机、一屏放下 |
| [new-game.md](new-game.md) | 新游戏开发指南：从建目录到接平台、单独部署 |
| [rooms.md](rooms.md) | 联机房间规范（`arcade-kit/room`）：一个闹钟、每步最多写两行、额度、旁观、匹配 |
| [platform-backend.md](platform-backend.md) | 平台后端总体设计：结构、实测结论、仓库与发布、联机形态、合规底线、风险 |
| [platform-features.md](platform-features.md) | 平台功能：云存档、好友、平台界面、邀请制与管理员、游戏登录闸门 |
| [platform-wallet.md](platform-wallet.md) | 平台钱包：服务绑定 RPC、战绩、真人对局统计 |
| [accounts.md](accounts.md) | 平台账号：登录、同域安全边界、开房认人、防刷和限流 |
| [cost-guard.md](cost-guard.md) | 费用与额度防护：计量、分级停服、紧急开关 |
| [data.md](data.md) | 平台数据（D1）：表、写入行数、清理、备份和迁移 |
| [monitoring.md](monitoring.md) | 监控和告警：巡检项、`/api/monitor`、自己接告警的最小例子 |
| [api.md](api.md) | 平台接口约定（`/api/*`）：通用规则、限流总表、错误码，分册 [api-account.md](api-account.md)、[api-boards.md](api-boards.md)、[api-social.md](api-social.md) |
| [economy.md](economy.md) | 筹码体系：一个钱包，娱乐和实盘 |
| [balance.md](balance.md) | 难度和收益的配平目标（所有游戏共用） |
| [table-fun.md](table-fun.md) | 牌桌互动规范：表情、道具、电脑的反应 |
| [social.md](social.md) | 社交：分享、在线、邀请、旁观、好友榜 |
| [review-policy.md](review-policy.md) | PR 审阅与合并规则：角色、红线、审阅清单（唯一一份）、要维护者亲自审的改动、部署怎么防 |
| [deployment.md](deployment.md) | Deployment and its security model (English) |
| [self-hosting.md](self-hosting.md) | Self-hosting the whole site on your own server (English) |

## 节号对照

平台文档按节统一编号、分在下面这些文件里；代码注释和别的文档写的「platform-backend.md 5.9」「api.md 15.20」「6.6」都按节号在这里找文件。拆分文档时节号不变。

| 节 | 内容 | 文件 |
|---|---|---|
| 0–3 | 摘要、约束、实测结论、总体结构 | [platform-backend.md](platform-backend.md) |
| 4.1–4.7 | 实时房间规范 | [rooms.md](rooms.md) |
| 5.1–5.4 | 账号、同域安全边界、开房认人、防刷限流 | [accounts.md](accounts.md) |
| 5.5–5.8 | 云存档、好友、平台界面、邀请制与登录闸门 | [platform-features.md](platform-features.md) |
| 5.9–5.11 | 钱包、战绩、真人对局统计 | [platform-wallet.md](platform-wallet.md) |
| 6.1–6.6 | 费用与额度防护 | [cost-guard.md](cost-guard.md) |
| 7.1–7.5 | 平台数据（D1） | [data.md](data.md) |
| 8–13 | 仓库与发布、联机形态、合规底线、风险、没做的 | [platform-backend.md](platform-backend.md) |
| 15.1、15.6、15.10 | 接口通用规则、限流总表、错误码 | [api.md](api.md) |
| 15.2、15.3、15.7、15.8、15.20、15.21 | 账号、云存档、管理、登录闸门、邀请码、隐藏游戏接口 | [api-account.md](api-account.md) |
| 15.5、15.9、15.11、15.12 | 排行榜、钱包、战绩、排行榜页接口 | [api-boards.md](api-boards.md) |
| 15.4、15.13–15.19、15.22 | 好友和社交接口 | [api-social.md](api-social.md) |
| 16.1–16.3 | 监控和告警 | [monitoring.md](monitoring.md) |
