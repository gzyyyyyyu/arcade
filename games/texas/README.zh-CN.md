# 德州 · Texas Hold'em

浏览器里的无限注德州扑克，一桌 2–9 人：单机对电脑、Sit & Go 锦标赛、匹配真人和好友房。

[English](README.md) · **简体中文**

![六人桌摊牌](docs/img/table.webp)

## 功能

- **单机**：对 1–8 个电脑，10 种性格。高档电脑会按位置、筹码深浅和对手的公开打法调整。娱乐分新手、普通、高手三档，实盘四档。
- **Sit & Go 锦标赛**：单机有经典 6 人、极速赛和 9 人赛，好友房是经典 6 人。另有今日锦标赛，当天人人同一副牌、同样的座位。
- **好友房和匹配真人**：六位房间码或邀请链接进房。空位电脑补，服务端不下发别人的底牌。
- **快节奏玩法**：全下或弃牌（另有每天同一副牌的今日全下），以及每天 5 道按 EV 给分的牌局题，都上平台每日榜。
- **新手帮助**：第一手一步步指着桌面讲，前几手有情境提示，单机桌要跟注时有赔率条。
- **互动**：道具、表情、嘲讽和聊天，电脑会回应。另有 30 个成就。
- **大场面**：全下后亮牌并标实时胜率，河牌慢翻，大牌有庆祝。牌桌是纯 DOM + CSS，图和声音全部由代码生成。
- **只有游戏筹码**：实盘桌用平台钱包里的筹码。筹码没有任何现金价值，不能买、不能换、不能转。

## 快速开始

需要 Node 22（`.nvmrc`）。在本目录里运行：

```bash
npm ci
npm run dev      # http://localhost:5175/（没有平台也能玩娱乐桌）
npm test         # 类型检查 + vitest + workerd 里的 Worker 和单独部署测试
npm run build:cf # 页面打包到 dist-cf/games/texas/（Worker 的静态资源）
```

提交改动前再跑一遍 `npm run lint`。无头浏览器冒烟用 `npm run smoke`（先 `build:cf`）。模拟器、配平脚本、冒烟的各段、本地怎么试 Worker 见 [docs/deploy.md](docs/deploy.md) 10.5。

## 目录结构

```
src/core/      规则核心：发牌、下注、牌力、边池、视图
src/ai/        电脑（只拿视图）：胜率表、性格、思考时间
src/tour/      锦标赛规则
src/puzzle/    每日谜题
src/room/      好友房规则，房间和页面共用
src/app/       页面流程：大厅、单机、好友房、锦标赛、谜题、新手指引
src/view/      DOM + CSS 的界面、牌桌、特效、声音
worker/        Cloudflare Worker：探活、登录闸门、钱包转发、好友房
test/          vitest，按层分目录；test/worker/ 和 test/standalone/ 在 workerd 里跑
scripts/       冒烟、模拟、配平、连拍
docs/          设计文档（中文）
```

## 文档

设计文档只有中文版。

- [DESIGN.md](DESIGN.md)：设计摘要、原则，以及每一章在哪个文件。
- [AGENTS.md](AGENTS.md)：模块约定和坑，写给开发者和编程代理。
- [docs/rules.md](docs/rules.md)：规则核心和随机数。
- [docs/ai.md](docs/ai.md)：电脑、性格和配平表。
- [docs/online.md](docs/online.md)：好友房和匹配真人。
- [docs/tournament.md](docs/tournament.md)：Sit & Go 锦标赛和今日锦标赛。
- [docs/economy.md](docs/economy.md)：筹码、钱包和每日额度。
- [docs/features.md](docs/features.md)：新手指引、成就、全下或弃牌、每日谜题等玩法。
- [docs/experience.md](docs/experience.md)：节奏、限制，以及怎么跟玩家说。
- [docs/screens.md](docs/screens.md)、[docs/scenes.md](docs/scenes.md)：界面布局和牌桌局面。
- [docs/art.md](docs/art.md)：美术方向。
- [docs/perf.md](docs/perf.md)：性能怎么量、现在的数字。
- [docs/testing.md](docs/testing.md)：测试、冒烟的各段、已知取舍。
- [docs/deploy.md](docs/deploy.md)：目录、单独部署和本站部署、安全响应头、全部命令。
- [ASSETS.md](ASSETS.md)：每样素材怎么生成。
- [CHANGELOG.md](CHANGELOG.md)：更新日志，更早的在 `docs/changelog-*.md`，目录在更新日志开头。

## 属于 Arcade

这是 Arcade 小游戏站的一个模块，挂在 `/games/texas/` 下，登录和筹码钱包由平台提供。它也能单独部署：`wrangler.jsonc` 是独立配置，`npm run deploy`（或下面的按钮）部署出来就能玩。单独部署时是游客身份，有娱乐桌和好友房，没有钱包。见 [docs/deploy.md](docs/deploy.md) 10.1。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/games/texas)

贡献请向 Arcade 仓库提 PR。提交信息以 `texas:` 开头，模块规矩见 [AGENTS.md](AGENTS.md)。

## 许可证

MIT，见 [LICENSE](LICENSE)。
