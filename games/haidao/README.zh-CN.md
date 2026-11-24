# 海岛 · Haidao

海盗题材的海岛游戏：建自己的岛，开船打电脑海盗的岛，再守住自己的岛挡一波波来抢的海盗。

[English](README.md) · **简体中文**

![海岛封面](public/cover.webp)

## 玩法

- **建基地不用等**：建筑、城墙、推荐布局；建造和升级立即完成，节奏靠资源和战役星数卡。
- **登陆战**：选海滩、放船登陆，兵自动开打；旗舰放炮击、信号弹、补给支援。战役 30 座岛、6 座首领岛，每座三星。
- **守岛塔防**：6 章 36 关；每波开打前预告下两波，一张克制表定谁打谁，章末机制、关内事件、两个英雄。另有守自己岛的「海盗来袭」和每周一张图、带周榜的「大潮无尽」。
- **护航和寻宝航线**：护送商船到港（定船速、修船、造塔）；全服每天同一条四站寻宝航线，带每日榜。
- **异步攻防**：打别的玩家的岛的快照，每场都由服务端重放结算；有护盾、防守回放和复仇。
- **筹码玩法**：四种玩法可以带平台筹码玩，结果只看档位、种子和局内操作，不看自己的养成。筹码没有任何现金价值，只能单向换成游戏里的金币或木材。
- **训练营**：每个兵种一节短课，另有排兵布阵和摆塔练习。
- **画面和声音全是程序生成**：SVG 素材开局烘焙、WebAudio 现场合成，不放图片和音频文件（见 [ASSETS.md](ASSETS.md)）。

## 快速开始

需要 Node ≥ 22.18（见 `.nvmrc`；`tools/` 里的脚本靠类型剥离直接用 `node` 跑）。

```bash
npm ci
npm run dev        # http://localhost:5170/（预览：npm run preview → 4170）
npm test           # 类型检查（页面 + Worker）+ vitest
npm run build      # 生产构建；npm run build:cf 构建到 dist-cf/games/haidao/
```

不接平台也能玩：游客身份，存档在浏览器本地。其他命令：`npm run lint`（Biome，要零报告）、`npm run sim -- --n 50`（机器人打每一关）、`npm run art -- <目录>`（素材渲成 PNG）、`npm run shot -- --out <目录>`（无头冒烟，第一次先 `npx playwright-core install chromium`）。完整命令表见 [docs/tools-haidao.md](docs/tools-haidao.md)。

## 目录结构

```
src/
  core/       规则核心：纯函数、固定每秒 20 拍、带种子的 RNG，不碰 DOM 和 Phaser
  content/    数据表：建筑、兵、关卡、地图、筹码档位表
  view/       Phaser 场景和 DOM 界面；art/ 是程序画的 SVG 素材
  platform/   本地存档和云存档
  net/        异步攻防、筹码玩法、排行榜的接口调用
worker/       Cloudflare Worker：登录闸门、攻防接口、筹码钱包接口；pvp/ 是 Durable Object 的逻辑
tests/        vitest，含守岛和护航的指纹金样
tools/        模拟器、配平和经济工具、素材预览、无头冒烟
public/       封面、图标、排行榜显示配置
```

## 文档

设计文档只有中文。

- [DESIGN.md](DESIGN.md)：设计总纲和目录：核心循环、防腻、配平方法、分期。
- [docs/design-base.md](docs/design-base.md)：建基地、成长曲线、镜头和手机、训练营。
- [docs/design-raid.md](docs/design-raid.md)：登陆战、异步攻防和服务端权威、新兵种和新塔、每局不一样。
- [docs/design-td.md](docs/design-td.md)、[docs/design-td-more.md](docs/design-td-more.md)、[docs/design-td-ch6.md](docs/design-td-ch6.md)：守岛：一局怎么打、敌人、战役、实盘、关卡机制、大潮、事件、第六章。
- [docs/design-voyage.md](docs/design-voyage.md)：寻宝航线和护航。
- [docs/design-live.md](docs/design-live.md)：筹码：四种实盘、每日上限、倍数表、兑换。
- [docs/ui-haidao.md](docs/ui-haidao.md)：画面和界面实现笔记及目录（场景分工、一屏放下、性能、浏览器存储 key）；细节在 `docs/ui-haidao-*.md`（基地、打击感和骨架、质感和音效、守岛）。
- [docs/backend-haidao.md](docs/backend-haidao.md)：Worker 和 Durable Object 的实现笔记。
- [docs/tools-haidao.md](docs/tools-haidao.md)：目录分工、命令和每个工具的参数。
- [docs/balance-haidao.md](docs/balance-haidao.md)、[docs/balance-haidao-td.md](docs/balance-haidao-td.md)：模拟实测和配平记录。
- [AGENTS.md](AGENTS.md)：给贡献者和编程代理的模块规矩和坑。
- [ASSETS.md](ASSETS.md)：素材来源和许可。
- [CHANGELOG.md](CHANGELOG.md)：更新日志；更早的在 [docs/changelog-archive.md](docs/changelog-archive.md) 和 [docs/changelog-archive-early.md](docs/changelog-archive-early.md)。

## 属于 Arcade

海岛是 Arcade 游戏厅的一个模块，但自成一体：`wrangler.jsonc` 能单独部署成只有游客身份的海岛（`npm run deploy`）。改动走功能分支加 PR，一个 PR 只改本模块，提交信息以 `haidao:` 开头；流程见 Arcade 仓库的贡献指南和 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)
