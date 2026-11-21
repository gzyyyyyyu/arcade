# 《夜巡》模块约定

> 总仓库规范见仓库根的 `AGENTS.md`，其中第 1、2 节的硬约束优先于本文件。本文件只写夜巡特有的约定。设计正本是 [DESIGN.md](DESIGN.md)。

## 1. 这是什么

幸存者类动作游戏：道士夜巡雪夜古镇，只管走位，法器自动出手，升级三选一、进化。两个模式：守夜（撑到天亮）、夜探（搜打撤），外加每日首领连战（守夜的子模式，5 分钟）。
没有联机，没有电脑对手；排行榜走平台的简单版（不防作弊），录像只存在浏览器本地。玩法、内容、数值骨架、实盘、配平口径都在 [DESIGN.md](DESIGN.md)，这里不重复。

## 2. 目录

```
src/core/      模拟核心：固定节拍（每秒 30 拍）、确定性；arms/ 是 2.0 法器和套件的规则
src/content/   内容表：法器、怪、刷怪表和危险档、地图、角色、夜探、宝物、成就、实盘倍数、法器池、每周夜事；改数值只改这里
src/explore/   夜探的规则：地图生成、宝箱、守卫、撤离、结算、机器人
src/app/       入口 main.ts 拆出来的块：结算、菜单状态快照、实盘文案、启动参数、开发用的调试开局
src/meta/      成就和图鉴的累计统计
src/view/      画面层：art/（程序画的图集）、game/（对局场景）、audio/（合成音效和音乐）、ui/（DOM 界面）、viewport.ts（iOS 和多尺寸适配）
src/platform/  本地存档、云存档、实盘浏览器端
src/online/    排行榜、每日挑战、每周夜事、分享卡、社交部件
src/replay/    浏览器本地录像：格式、录制、回放、存储
worker/        Worker：登录闸门、单独部署的根路径、实盘带入结回、巡检用的 health（自己一份 tsconfig）
tools/         截图和冒烟、机器人模拟、起手回归、核心耗时、手感、封面、字体子集、方向表
tests/         vitest，按被测的层分 core/ content/ explore/ view/ platform/ arch/
```

每个文件的分工写在它自己的文件头。

## 3. 规则核心的约束

- `src/core`、`src/content` 不依赖 DOM、Phaser、网络；画面层只读核心的状态和事件，不自己算规则。
- **确定性**：禁止 `Math.random`、`Date`、`performance`，以及 `Math.sin/cos/tan/atan2/sqrt/hypot/exp/log/pow/cbrt`；
  浮点只用四则运算（IEEE 754 在所有引擎上逐位一致），方向用写死在源码里的单位向量表，开方用固定迭代的牛顿法；
  随机用自己的 sfc32，按用途分流。架构测试扫源码锁住。
- **设计上的例外**：`step` 原地修改它拥有的状态（几百个单位每秒 30 拍，整体复制太慢），不是"输入旧状态、输出新状态"。
  存档和回放靠"种子 + 输入"重算；确定性由重放测试（状态指纹逐拍相同）锁住。
- 依赖方向 explore → core：核心只经 `core/raid-port.ts` 的接口和钩子表碰夜探，`explore/register.ts` 注册实现，开夜探局的入口先 import 它（`tests/arch/core-arch.test.ts` 守着）。
- 改数值必须跑模拟器（DESIGN.md 第 8 节、8.1 配平口径），不凭感觉。
- 规则一改，`tests/core/core.test.ts` 的金标准指纹就会变：确认是有意的改动后用 `npx vitest run -u` 更新，同时把 `RULES_VERSION` 加一（旧录像会标"旧版本"）。

## 4. 画面

- 所有图都是程序画的（`src/view/art/`），开局画进图集，每张 ≤ 2048：主图集、夜探图集、特色怪图集、角色图集共四张；加图前先算主图集在渲染倍数 3 时的高度；不放图片文件。
- 雪地很亮：特效用饱和色 + 深色边、普通混合，ADD 叠加只用在暗处（亮的雪地上叠加的斩痕几乎看不见）。
- iOS：渲染倍数封顶 2（`viewport.ts`）、`--app-h` 按看得见的区域、双指放大时不改尺寸、safe-area；省内存设备（`?lowmem` 可模拟）关粒子。
- 可点的东西：触屏 ≥ 44×44 CSS 像素，鼠标设备可以小到 32，`tools/shot.ts` 检查；字不小于 12 像素。任何界面在 1280×720、1920×1080、844×390、390×844、360×640 下一屏放下、不滚动，选项不折叠（仓库根 docs/ui.md 第 11 节）：放不下先缩按钮和间距、改排布，长列表翻页（图鉴、藏宝阁、玩法说明、排行、回放共用 `src/view/ui/pager.ts`，按内容区高度分页）。改界面按 [docs/art.md](docs/art.md) 的布局规则，改完在手机竖横屏、平板、电脑各尺寸看过。
- DOM 界面的类名按屏加前缀（菜单 `yx-m*`，对局的限定在 `.yx-hud` 下），新增样式都限定在所属根节点下，自定义属性带兜底值（`var(--s, 1)`）。不加前缀的类名会串到别的界面。
- 截图验收至少有一张不开 `auto` 的真实对局（`--flow`，或 `--query "raid=guzhen"`）：`auto` 局没有新手提示等，看不出真人局的问题。

## 5. 常用命令（都在本目录运行）

| 命令 | 用途 |
|---|---|
| `npm ci` | 安装依赖 |
| `npm run dev` / `npm run preview` | 开发 0.0.0.0:5178 / 预览 0.0.0.0:4178 |
| `npm test` | 类型检查（页面 + Worker）+ vitest |
| `npm run lint` | Biome lint（只查不格式化）；提交前要过，确有意为之的写法用 `// biome-ignore lint/<组>/<规则>: <理由>` 放行 |
| `npm run build:cf` | 部署用构建到 `dist-cf/games/yexun/` |
| `npm run sim -- --n 200 --danger 2 --build sword` | 机器人模拟，出胜率和节奏表；选项（地图、角色、实盘、法器池、按批提前停等）见 `tools/sim.ts` 文件头，口径见 DESIGN 第 8 节 |
| `npm run sim:starts` | 起手回归：每个角色正常起手和第二件起手各跑一小把，第二件胜率不到一半就失败；改起手、法器池、流派单后跑（约 20 分钟，不进 `npm test`） |
| `node tools/sim-merge.ts <目录>` | 把拆成几片跑的 `sim.ts --json` 结果按格拼成一张表 |
| `npm run bench -- <种子> <难度>`、`npm run bench -- --worst` | 核心每拍耗时：整局 / 300 怪满额的最坏拍 |
| `npm run shot -- --out <目录>` | 无头浏览器截图并检查点击区和控制台；`--flow` 走一遍全部界面，`--query` 带开发参数（快进、选卡、换法器），选项见 `tools/shot.ts` 文件头 |
| 页面加 `?fps` | 左下角显示每秒帧数、最长一帧、场上怪数（真机验收用，不写存储） |
| `node tools/feel.ts` | 手感测量：固定帧间隔走一段"走—停—转向"，报抖动、起停突变、回跳 |
| `npm run smoke` | 仓库硬规范的冒烟：主流程零报错、省内存设备、双指放大、WebGL 丢失恢复、回大厅、HUD 和选模式页在各尺寸一屏放下；各段内容见 `tools/smoke.ts` 文件头 |

## 6. 浏览器存储 key（全部 `yexun.` 前缀）

在用：
- `yexun.settings`（音效、音乐、震屏、固定摇杆、自动放技能等开关；`src/platform/save.ts`、`src/view/audio/sfx.ts`）；
- `yexun.save`（局数、最好成绩、引导进度、铜钱流水、加成、解锁、危险档、角色、每个角色的开局配置（起手、心法）、咒印、藏宝阁；`src/platform/save.ts`）；
- `yexun.records`（成就和图鉴的累计统计，`src/meta/records.ts`）；
- `yexun.cloud`（云存档元数据）、`yexun.profile.pre-sync`（合并前的本地备份）、`yexun.profile.pre-switch.<userId>`（换账号时另存的旧账号存档，换回去以后改名 `.restored`）（`src/platform/cloud.ts`，`profile` 是云存档的槽名）；
- `yexun.live`（实盘这一份的进度：带入、撑到第几拍、结回，刷新、断网后接着结；`src/platform/live.ts`）；
- `yexun.replays`（浏览器本地录像：最近几局和每个榜最好的一局，总量有上限；`src/replay/store.ts`）。

新增 key 必须带前缀并补进这张表。

## 7. 发布

本目录 `npm test`、`npm run build:cf` 全过，跑 `npm run smoke`，再跑 `npm run shot` 并逐张看截图；每个要部署的 PR 都升一次版本（`package.json` 和 lockfile），`CHANGELOG.md` 写成带日期的版本段，不攒"未发布"段（合并即部署，版本要能对上线上）；改了规则就把 `RULES_VERSION` 加一；
提交信息以 `yexun:` 开头，只暂存明确路径；推 `yexun/<说明>` 分支开 PR。合并和部署由维护者做。
