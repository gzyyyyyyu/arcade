# 《夜巡》模块约定

> 仓库根 `AGENTS.md` 第 1、2 节优先。本文只写夜巡特有的。玩法、内容、实盘、配平口径见 [DESIGN.md](DESIGN.md)（总纲，按节找文件）。

幸存者类动作游戏，守夜 / 夜探 / 每日首领连战 / 试炼。无联机、无电脑对手；排行榜用平台简单版，录像只存浏览器本地。

## 目录

```
src/core/      模拟核心：每秒 30 拍、确定性；arms/ 是法器和套件规则
src/content/   内容表（法器、怪、波次、地图、角色、夜探、实盘倍数等）；改数值只改这里
src/explore/   夜探规则    src/app/  main.ts 拆出的块    src/meta/  成就图鉴统计
src/view/      画面：art/ 程序画图集、game/ 对局、audio/、ui/ DOM、viewport.ts 适配
src/platform/  存档、云存档、实盘端    src/online/  排行榜、每日、每周夜事、分享
src/replay/    本地录像    worker/  闸门、根路径、实盘带入结回、health（自带 tsconfig）
tools/         截图冒烟、模拟、回归、耗时、手感等    tests/  按层分 core content explore view platform arch
```

文件分工写在各自文件头。

## 规则核心

- `src/core`、`src/content` 不依赖 DOM、Phaser、网络；画面只读状态和事件。
- 确定性：禁 `Math.random`、`Date`、`performance` 和 `Math.sin/cos/tan/atan2/sqrt/hypot/exp/log/pow/cbrt`；浮点只用四则，方向用源码里的单位向量表，开方用固定迭代牛顿法，随机用 sfc32 按用途分流。架构测试锁住。
- 例外：`step` 原地改状态（性能）；存档回放靠「种子 + 输入」重算，重放测试锁指纹。
- explore → core：核心只经 `core/raid-port.ts` 碰夜探，`explore/register.ts` 注册，开夜探局先 import 它（`tests/arch/core-arch.test.ts`）。
- 改数值必跑模拟器（DESIGN 第 8、8.1 节）。规则一改金标准指纹变：确认有意后 `npx vitest run -u`，并 `RULES_VERSION` 加一。

## 画面

- 图全是程序画，开局进图集，每张 ≤ 2048，共四张（主、夜探、特色怪、角色）；加图前算主图集在倍数 3 的高度；不放图片文件。
- 雪地亮：特效用饱和色加深边、普通混合，ADD 只用在暗处。
- iOS：渲染倍数封顶 2、`--app-h` 取可见区、双指放大不改尺寸、safe-area；省内存设备（`?lowmem`）关粒子。
- 触屏可点 ≥ 44×44，鼠标 ≥ 32，字 ≥ 12 像素（`tools/shot.ts` 查）。1280×720、1920×1080、844×390、390×844、360×640 一屏放下、不滚动、选项不折叠（根 docs/ui.md 第 11 节）：先缩按钮间距，长列表翻页（共用 `pager.ts`）。改界面按 [docs/art.md](docs/art.md)，各尺寸看过。
- DOM 类名按屏加前缀（菜单 `yx-m*`，对局限定在 `.yx-hud` 下），新样式限定在根节点下，自定义属性带兜底（`var(--s, 1)`）。
- 截图验收至少一张不开 `auto` 的真实对局（`--flow` 或 `--query "raid=guzhen"`）。

## 命令（本目录）

| 命令 | 用途 |
|---|---|
| `npm ci` / `dev` / `preview` | 安装 / 开发 5178 / 预览 4178（0.0.0.0） |
| `npm test` | 类型检查（页面 + Worker）+ vitest |
| `npm run lint` | Biome，提交前过；放行写 `// biome-ignore lint/<组>/<规则>: <理由>` |
| `npm run build:cf` | 构建到 `dist-cf/games/yexun/` |
| `npm run sim -- --n 200 --danger 2 --build sword` | 机器人模拟，选项见 `tools/sim.ts` 头 |
| `npm run sim:starts` | 起手回归（约 20 分钟，不进 test）；改起手、法器池、流派单后跑 |
| `node tools/sim-merge.ts <目录>` | 拼分片的 `sim --json` 结果 |
| `npm run bench -- <种子> <难度>` / `-- --worst` | 核心每拍耗时 |
| `npm run shot -- --out <目录>` | 截图并查点击区、控制台；`--flow` 走全界面，`--query` 带开发参数 |
| `?fps`（页面参数） | 显示帧率、最长帧、怪数，不写存储 |
| `node tools/feel.ts` | 手感测量 |
| `npm run smoke` | 主流程零报错、省内存、双指放大、WebGL 恢复、回大厅、各尺寸一屏 |

## 存储 key（`yexun.` 前缀，新增补进此表）

`settings`（开关；`platform/save.ts`、`view/audio/sfx.ts`）、`save`（存档；`platform/save.ts`）、`records`（成就图鉴统计；`meta/records.ts`）、
`cloud`、`profile.pre-sync`、`profile.pre-switch.<userId>`（换回后改名 `.restored`）（`platform/cloud.ts`）、`live`（实盘进度，断网后接着结；`platform/live.ts`）、`replays`（本地录像，总量有上限；`replay/store.ts`）。

## 发布

交审前一次：`npm test`、`lint`、`build:cf` 全过，冒烟和截图只跑受影响的流程（电脑 1280 + 手机竖屏）；每个 PR 升版本（`package.json` + lockfile）、`CHANGELOG.md` 写带日期版本段、不攒「未发布」；改规则 `RULES_VERSION` 加一。
提交信息以 `yexun:` 开头，只暂存明确路径，推 `yexun/<说明>` 开 PR；合并部署由维护者做。
