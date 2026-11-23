# 《海岛》模块约定

> 仓库根 `AGENTS.md` 第 1、2 节的硬约束优先。本文件只写海岛特有的规矩和坑；细节按主题查下面的文档。

## 1. 文档地图

- 设计：[DESIGN.md](DESIGN.md) 是总纲和目录，各玩法在 `docs/design-*.md`（节号沿用，「DESIGN 10.4」按目录找文件）。
- 画面和界面：[docs/ui-haidao.md](docs/ui-haidao.md)（目录、通用界面、一屏放下、浏览器存储 key）和 `docs/ui-haidao-*.md`；改对应代码时同步改。
- 目录分工、常用命令、工具参数：[docs/tools-haidao.md](docs/tools-haidao.md)。后端：[docs/backend-haidao.md](docs/backend-haidao.md)。配平数据：[docs/balance-haidao.md](docs/balance-haidao.md)。

## 2. 规则核心

- `src/core`、`src/content` 不依赖 DOM、Phaser、网络；画面只读核心的状态和事件。改数值只改 `src/content/`。
- **确定性**（异步攻防在服务端重放，要和浏览器逐位一致）：禁止 `Math.random`、`Date`、`performance` 和
  `Math.sin/cos/tan/atan2/sqrt/hypot/exp/log/pow/cbrt`；坐标是整数（1 格 = 100 单位），开方用整数牛顿法；随机用 sfc32 按用途分流。`tests/arch.test.ts` 锁住。
- `stepBattle` 原地改状态（每秒 20 拍）；回放靠「布局 + 部队 + 种子 + 操作」重算。
- 规则一改 `RULES_VERSION`（`src/core/types.ts`）加一；不按版本分叉，golden 只锁当前版本。
- 改守岛数值重生成 `node tools/td-golden.ts`，改护航重生成 `node tools/escort-golden.ts`；`git diff` 只许出现预期的值变化。
- 改实盘的表或内容（悬赏出海、悬赏守岛、护航、航线），跑对应 `tools/*-live-sim.ts --n 2000`，改前改后的数报主线。

## 3. 画面

- 素材全部程序画（`src/view/art/`，SVG 字符串开局烘焙），不放图片文件；`npm run art -- <目录>` 渲 PNG 看。
- 场景（`BattleScene` / `TdScene` / `BaseScene`）只管生命周期，新逻辑进 `battle*.ts`、`td*.ts`、`base*.ts`；层级用 `depth.ts` 的 `DEPTH`，不直接写数字。
- 动画、飘字、粒子走对象池，静态大块烘成一张图，不在每帧新建对象。
- 界面类名 `hd-` 前缀、限定在根节点下；可点 ≥ 44×44，字号只有 12 / 14 / 16 / 20；资源不够写「还差 N」。
- 五个尺寸一屏放下（例外见 ui-haidao.md「一屏放下」）；改界面后跑 `node tools/noscroll.ts --out <目录>`。
- 浏览器存储 key 一律 `haidao.` 前缀，加、删 key 同步改 ui-haidao.md 的清单。

## 4. 后端

- DO 每个方法最多写 2 行、不用闹钟和 `setTimeout`；结算一律服务端用 `src/core/pvp.ts` 重放。改 Base / Harbor 的方法同步 `worker/pvp/api.ts` 的 `BASE_METHODS` / `HARBOR_METHODS`。
- Worker 入口只导出 default 和 DO 类（`Base`、`Harbor`、`RoomMeter`）。
- pvp `find` / `revenge` 和四种实盘（live / td / escort / map）`buyin` 的请求体必须带 `rules`，低于当前版本回 409 `need_reload`（`worker/live.ts` 的 `checkRules`，在钱包和存储之前判）。

## 5. 坑

- 测试由 Node 原生加载（`vite.config.ts` 关了 Vite 的模块执行器）：相对 import 写 `.ts` 扩展名，不能用 `vi.mock`。
- `biome.jsonc` 是全仓模板，不在模块里改规则；放行写 `// biome-ignore lint/<组>/<规则>: <理由>`。
- 冒烟 `tools/shot.ts` 按当前目录找文件，在模块目录里跑（`npm --prefix` 或 `env -C`）。
- 大批量模拟用 `nice`；守岛指纹分 8 片并行比（`tests/td-golden-<片>.test.ts`）。
