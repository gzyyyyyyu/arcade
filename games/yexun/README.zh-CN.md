# 夜巡 · Night Patrol

网页上的幸存者类动作游戏：小道士夜巡雪夜古镇，符箓、桃木剑、雷符自己出手。

[English](README.md) · **简体中文**

![夜巡封面](public/cover.webp)

## 玩法

- **两个模式。** **守夜**：顶住成群的跳尸纸人，撑到天亮。**夜探**：进镇搜宝箱，趁撤离门开着撤出去。
- **只管走位。** 法器自动出手；升级三选一，法器进化、合成。
- **搭配多。** 24 件法器、20 个被动、10 个流派；10 个角色，各有自己的法器池和一个主动技能。
- **地图和对手。** 8 张守夜地图、6 个夜探镇子加教学镇，每张图一种地图事件；首领、精英、咒印，危险 0–5 加噩梦 1–3。
- **天天有得玩。** 每日守夜、首领连战（每日 / 自由）、每周夜事挑战和排行榜、局外成长、70 个成就、本地录像回放。
- **实盘。** 接上 Arcade 钱包就能带筹码打守夜或夜探（各四档，规则和娱乐一样）。筹码只是游戏币，不能买、不能兑换、不能转让。
- **确定性核心。** 每秒 30 拍的固定步长模拟：同种子同输入，整局相同；录像和机器人模拟靠它。
- **全部由代码生成。** 图用 Canvas 2D 画，声音用 Web Audio 合成，不放图片和音频文件。

## 快速开始

Node 22（见 `.nvmrc`），在本目录里：

```sh
npm ci
npm run dev       # http://localhost:5178/
npm test          # 类型检查（页面和 Worker 两份）+ vitest
npm run build:cf  # 部署用的构建，产物在 dist-cf/games/yexun/
```

模拟器、冒烟、截图等其他命令见 [AGENTS.md](AGENTS.md) 的命令表。截图和冒烟要 `playwright-core` 和 chromium-headless-shell，系统要有中文字体。

单独部署：`npm ci && npx wrangler login && npm run deploy`，得到 `yexun.<你的子域>.workers.dev`，打开 `/` 会转到 `/games/yexun/`。没有平台时没有登录、云存档、排行榜和实盘，单机娱乐照常。

## 目录结构

```
src/
  core/       确定性模拟核心（每秒 30 拍，不碰 DOM、网络、时间、随机）
  content/    内容表：法器、怪、地图、角色、实盘倍数
  explore/    夜探规则：地图生成、宝箱、守卫、撤离、结算
  view/       Phaser 画面、DOM 界面、程序合成的图和声音
  platform/   本地存档、云存档、实盘的浏览器端
  online/     排行榜、每日挑战、每周夜事、分享
  replay/     本地录像
worker/       Worker：登录闸门、实盘带入带回、铜钱换筹码、/health
tools/        冒烟、截图、模拟器、机器人、封面、字体子集
tests/        vitest，按层分目录
docs/         设计文档
```

## 文档

设计文档只有中文版。[DESIGN.md](DESIGN.md) 是总目录，各份设计稿的节号整套统一。

- [docs/design-play.md](docs/design-play.md)：一句话、质量验收、两个模式、新手保护、首领连战、试炼和周目标。
- [docs/design-content-1.md](docs/design-content-1.md)：内容表总则、法器、被动、进化和合成。
- [docs/design-content-2.md](docs/design-content-2.md)：套装和流派、怪物和首领、地图。
- [docs/design-content-3.md](docs/design-content-3.md)：角色、局外成长、选卡、守夜夜市。
- [docs/design-live.md](docs/design-live.md)：实盘：规则、带回倍数、角色和地图系数、配平目标。
- [docs/design-arch.md](docs/design-arch.md)：架构（核心、内容、画面、输入录像、平台、Worker、排行榜）和性能预算。
- [docs/design-art-tools.md](docs/design-art-tools.md)：画风和声音、机器人和配平工具、测试。
- [docs/design-misc.md](docs/design-misc.md)：登记、内容规模、已知问题、验收标准、和平台的关系。
- [docs/art.md](docs/art.md)：界面流程、HUD、各尺寸排法、省内存设备、配色。
- [docs/balance-play.md](docs/balance-play.md)：全流派配平的量测数据。
- [ASSETS.md](ASSETS.md)：每样素材的来源和许可。
- [AGENTS.md](AGENTS.md)：模块约定：规则核心、画面、命令、存储 key、发布。
- [CHANGELOG.md](CHANGELOG.md)：每版改了什么；更早的从 [docs/changelog-archive.md](docs/changelog-archive.md) 起。

## 属于 Arcade

夜巡是 Arcade 小游戏厅的一个模块（`games/yexun`），也能拆出来单独部署；平台和贡献指南见仓库根目录。

## 许可证

MIT，见 [LICENSE](LICENSE)。毛笔字 `public/fonts/brush.woff2` 是马善政楷书的子集，按 SIL OFL 1.1 授权（[OFL.txt](public/fonts/OFL.txt)），细节见 [ASSETS.md](ASSETS.md)。
