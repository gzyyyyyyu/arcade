# 雀馆 · Mahjong

浏览器里的麻将，一套引擎加可插拔的玩法：川麻·血战到底和日本立直麻将。单机和电脑打，也能开好友房和朋友打。

[English](README.md) · **简体中文**

<img src="public/cover.svg" alt="雀馆封面" width="360">

## 功能

- **川麻·血战到底**：换三张、定缺、刮风下雨、一炮多响、查花猪查大叫。规则选项里有血流成河（胡了接着打）和三人两房。
- **立直麻将**：天凤式四人，半庄、东风战或一局，赤宝牌 3 张。
- **电脑**：九个性格，每场状态不同，只拿自己座位能看到的信息。娱乐三档难度，实盘档位越高越强。
- **好友房和快速匹配**：分享链接叫朋友，掉线托管，中途接管，旁观，再来一场。快速匹配按档位和陌生人排桌。
- **每日玩法**：每日挑战、每日何切、听牌速判、茶馆擂台，成绩进平台的每日榜。
- **手感和画面**：听牌提示、新手的推荐出牌、安全牌角标、拖牌出牌、大牌演出。牌和图都由代码生成（DOM + SVG），声音由 WebAudio 合成。
- **图鉴和成就**：番型 / 役收集、22 个成就，存在本机。
- **只有游戏筹码**：实盘桌用平台钱包里的筹码。筹码没有任何现金价值，不能买、不能换、不能转。

## 快速开始

需要 Node 22（`.nvmrc`）。在本目录里运行：

```bash
npm ci
npm run dev      # http://localhost:5176/games/mahjong/（没有平台也能单机玩）
npm test         # 类型检查 + vitest（规则、电脑、架构约束、房间规则）+ workerd 里的 Worker 测试
npm run build    # 正式构建
```

提 PR 前再跑 `npm run lint` 和 `npm run smoke`。好友房、快速匹配、单独部署的冒烟，模拟器和配平脚本见 [docs/dev.md](docs/dev.md)。

## 目录结构

```
src/core/          引擎：牌、手牌分析、牌桌小件、筹码账
  variants/<id>/   玩法：sichuan-xuezhan、riichi
src/ai/            电脑（只拿视图）、性格、场地
src/game/          档位、快速匹配、每日玩法、成就、图鉴
src/room/          好友房规则，房间和页面共用
src/app/ src/view/ 页面流程、牌桌（DOM + SVG）、主页和选桌页
worker/            Cloudflare Worker：登录闸门、实盘接口、房间
test/              vitest 和 workerd 测试
dev/ scripts/      本地假平台；冒烟、模拟器、截图
docs/              设计文档（中文）
```

## 文档

设计文档只有中文版。

- [DESIGN.md](DESIGN.md)：设计目录，各章在 `docs/design-*.md`（规则、引擎、筹码、电脑、联机、画面）。
- [AGENTS.md](AGENTS.md)：模块约定和坑，写给开发者和编程代理。
- [docs/dev.md](docs/dev.md)：全部命令、完整目录、单独部署和本站部署、健康检查。
- [docs/riichi.md](docs/riichi.md)：立直麻将。
- [docs/practice-modes.md](docs/practice-modes.md)：每日挑战、何切、听牌速判、擂台、云存档。
- [docs/online-social.md](docs/online-social.md)：牌桌互动、分享图、颁奖、好友。
- [docs/table.md](docs/table.md)：牌桌布局和演出。
- [docs/collection.md](docs/collection.md)：图鉴和成就。
- [docs/balance.md](docs/balance.md)、[docs/balance-results.md](docs/balance-results.md)：配平目标和实测结果。
- [docs/art.md](docs/art.md)：画风。
- [docs/storage.md](docs/storage.md)：全部浏览器存储 key。
- [ASSETS.md](ASSETS.md)：素材来源和许可。
- [CHANGELOG.md](CHANGELOG.md)：更新日志，更早的在 `docs/changelog-archive-*.md`。

## 属于 Arcade

这是 Arcade 小游戏站的一个模块，挂在 `/games/mahjong/` 下，账号、排行榜、云存档和筹码钱包由平台提供。它也能单独部署：`wrangler.jsonc` 是独立配置，`npm run deploy`（或下面的按钮）部署出来就能玩。单独部署时是游客身份，有单机和好友房，没有钱包。见 [docs/dev.md](docs/dev.md) 第 3 节。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/games/mahjong)

贡献请向 Arcade 仓库提 PR。提交信息以 `mahjong:` 开头，模块规矩见 [AGENTS.md](AGENTS.md)。

## 许可证

MIT，见 [LICENSE](LICENSE)。标题字体是思源宋体 Noto Serif SC 的子集（SIL Open Font License 1.1，见 [ASSETS.md](ASSETS.md)）。
