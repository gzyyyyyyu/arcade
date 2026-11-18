# 海岛 · Haidao (games/haidao)

A pirate island base-building and raiding game: build your island (everything finishes instantly — no timers), collect gold and timber,
then sail out and storm AI pirate islands — pick a beach, land your boats, let the crew fight and back them up with flagship barrages and signal flares.
Three stars per island, loot to spend back home. Built with TypeScript, Phaser 4 and a deterministic fixed-tick battle simulation; every sprite is generated in code (SVG).
It is one module of the Arcade monorepo, but deploys on its own too. Docs below are in Chinese. MIT licensed.

《海岛》：海盗题材的海岛攻防。在自己的岛上摆建筑、升级（立即完成，不用等），攒金币和木材；开船去打电脑海盗的岛，选海滩登陆，兵自动开打，
旗舰放炮击、信号弹支援，拆掉主寨拿星、抢资源回家升级。

已有的玩法：

- **单机建基地**：城墙、推荐布局，建造升级立即完成。
- **守岛塔防**：四章 24 关，开局从自己的基地带塔上驻守台；每波开打前预告下两波和路线，一张克制表定谁打谁；每章最后两关各多一件工具（漂流补给箱、潮汐水闸、岸防老炮）。另有守自己岛的"海盗来袭"，和每周一张图的大潮无尽（成绩交平台每周榜）。
- **护航和寻宝航线**：护航是护送商船沿航线到港，定船速、修船、造塔（三张图三档难度，DESIGN 第 12 节）；寻宝航线每天全服同一条四站航线，比宝分，交平台每日榜（DESIGN 第 11 节）。
- **战役和收集**：30 关战役、6 座首领岛、每日悬赏、成就和掉宝收藏。
- **异步攻防**：登录后可以打别的玩家的岛（服务端重放结算、护盾、防守回放、复仇，匹配先找同级和低一级；见 DESIGN 第 5 节）。
- **实盘**：可以带筹码玩悬赏出海、悬赏守岛、护航、寻宝航线四种（结果只由档位、种子和局内操作决定，不看自己的养成；每种每天有场次上限，见 DESIGN 第 4.0 节），也能把筹码单向换成金币木材（第 4 节；筹码无任何现金价值）。

## 文档

- [DESIGN.md](DESIGN.md)：设计正本（循环、成长、防腻、经济、公平、画面、配平、分期）；模拟实测数据见 [docs/balance-haidao.md](docs/balance-haidao.md)
- [AGENTS.md](AGENTS.md)：给开发者和代理的模块约定（目录、命令、存储 key）
- [ASSETS.md](ASSETS.md)：素材来源和许可
- [CHANGELOG.md](CHANGELOG.md)：版本记录；0.31.0 以前的见 [docs/changelog-archive.md](docs/changelog-archive.md)

## 本地开发

需要 Node ≥ 22.18（见 `.nvmrc` 和 `package.json` 的 `engines`；`tools/*.ts` 直接用 `node` 跑，靠的是 22.18 起默认开启的类型剥离）。共用包从 npm 装（见 `package.json` 里的 `arcade-kit` 别名），直接 `npm ci` 就行。

| 命令 | 用途 |
|---|---|
| `npm run dev` / `npm run preview` | 开发 0.0.0.0:5170 / 预览 0.0.0.0:4170 |
| `npm test` | 类型检查（页面和 Worker 两份）+ vitest |
| `npm run build` / `npm run build:cf` | 构建 / 部署用的构建（产物在 `dist-cf/games/haidao/`） |
| `npm run typecheck` | 只做类型检查（页面和 Worker 两份） |
| `npm run lint` | Biome 检查，要零报告 |
| `npm run sim -- --n 50` | 机器人打每一关 |
| `npm run art -- <目录>` | 素材图鉴、基地全景、战斗定格渲成 PNG |
| `npm run shot -- --out <目录>` | 无头浏览器冒烟截图（临时端口），检查控制台零报错 |

## 新人上手

上手就是 `npm ci`、`npm run dev`（打开 http://localhost:5170/，没有平台也能玩：游客身份，存档在浏览器本地）、改完提交前 `npm test`，命令见上表。

- 代码分两层：`src/core/` 是规则核心（纯函数、固定步长、带种子的 RNG，不碰 DOM 和 Phaser，同一种子同一串操作结果逐位相同），`src/view/` 是画面（Phaser 场景和 DOM 界面，只读核心给的状态和事件）。目录和约定见 [AGENTS.md](AGENTS.md)。
- 改了守岛数值，`tests/td-golden.test.ts` 会失败：确认是有意的改动后，用 `GOLDEN_UPDATE=1 npx vitest run tests/td-golden.test.ts` 重生成指纹（命令细节见 AGENTS.md）。
- 冒烟：`npm run shot -- --out <目录>` 起临时端口、开无头浏览器把主流程走一遍并存截图，控制台有报错会失败。需要先装浏览器：`npx playwright-core install chromium`。
- 看素材不用浏览器：`npm run art -- <目录>` 把图鉴渲成 PNG。机器人跑配平：`npm run sim -- --n 50`；其余脚本在 `tools/`，用法见 AGENTS.md 的命令表。
- 服务端（异步攻防的匹配、重放结算、实盘钱包接口）在 `worker/`：`worker/pvp/` 是 Base、Harbor 的逻辑类（测试用内存假存储），`worker/do.ts` 是 Durable Object 外壳。

## 单独部署

`wrangler.jsonc` 是独立配置：`npm run deploy` 得到一个不要平台、谁打开都能玩的海岛（游客身份、存档只在浏览器本地）。

## 参与贡献

改动走功能分支加 PR，一个 PR 只改本模块，提交信息以 `haidao:` 开头。流程、审阅和合并要求见仓库根的 [CONTRIBUTING.md](../../CONTRIBUTING.md)，本模块的约定见 [AGENTS.md](AGENTS.md)。
