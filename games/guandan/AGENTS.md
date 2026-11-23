# 牌馆（掼蛋 + 斗地主）模块约定

> 仓库根 `AGENTS.md` 第 1、2 节的硬约束优先。这里只写本模块特有的规矩，细节按主题在 `docs/`：
> 目录和命令 `structure.md`、存储 key `storage.md`、规则核心 `core-api.md`、画面 `view.md`、联机和实盘 `net.md`、
> 实盘设计 `stake.md` / `stake-ddz.md`、电脑 `ai.md`、两个玩法的分层 `doudizhu.md`、规则取舍 `rules.md`。

## 1. 分层（`tests/architecture.test.ts` 守着）

- `src/core` 通用层；`src/variants/<玩法>/{core,ai,stake}` 纯函数、确定性，不碰 DOM、Phaser、网络、`Math.random`、`Date`、平台相关的数学函数；
  随机一律 `rngFor(seed, 用途, …)`（`tsconfig.core.json` 只给 ES 库）。
- 玩法之间互不引用；`view/common`、`scenes/shared` 不引用任何玩法。
- 电脑只读 `viewFor(state, seat)`，不碰 `GameState`；给电脑的种子按用途派生，不给牌局种子或密钥（`tests/core/ai.test.ts` 的反事实测试）。

## 2. 必守的坑

- 推进状态只走 `Session.apply` → `dispatch` → 场景按事件播放；画面不自己判牌型（`interpret` / `beats` / `hintList`）。
- 进牌桌走 `startWhenReady`，后烘的纹理用 `texOr`；动画时长经 `dur()`；布局数字只放 `table/layout.ts`，停顿只放 `common/pace.ts`。
- 不变的形状用 `ui/kit.ts` 的 `bakeInto` 烘成图，别留常驻 Graphics（每帧重新三角化，`docs/view.md` 第 4 节）。
- 文字走 `kit.text()`、最小字号 18；点按区至少 `minHit()`；任何界面不滚动（`tools/no-scroll.ts`）。
- DOM 的 CSS 以 `.gd-` 类、`--gd-` 变量为本模块的命名空间（`common/theme.ts`；页面只属于本游戏，变量挂 `:root`），`--ak-` 只给 kit 部件配主题；新类都带 `gd-` 前缀。
- 存储只在 `src/view/store.ts` 读写，key 带 `guandan.` 前缀，新 key 补进 `docs/storage.md`。
- 联机：服务端只下发 `viewFor`；联机发牌用密钥不用种子；改了房间和页面的约定加 `src/net/version.ts` 的 `CLIENT_VERSION`。
- 实盘的数只在各玩法的 `stake/`，改数加新版本、不改旧的（打到一半的一场按自己的版本带回）；动到实盘期望先报 2,000 局模拟。
- 互动（`arcade-kit/table-fun`）免费、不挡操作，电脑出牌不读互动；`src/net/emotes.ts` 编号只往后加。
- `worker/main.ts` 只导出默认导出和 Durable Object 类；`wrangler.jsonc` 不写平台绑定、路由；`ONLINE`、`GATE` 开关见 `docs/net.md`。

## 3. 改完跑什么

- 规则或电脑：`npm test`、`npm run typecheck:core`、`npm run sim -- --deals 5000 --mode random`；强弱、性格、场地表见 `docs/ai.md` 第 7 节。
- 画面：`npm run shot`（相关一段、一个尺寸）；新大纹理先 `node tools/mem.ts`；性能 `node tools/perf.ts`。
- 联机或实盘：`npm run test:room`、`npm run room-sim`、`npm run online-smoke`、`npm run stake-smoke`。
- 掼蛋行为有意变了：`node tools/golden.ts --write` 重写金样，diff 里说明为什么变。
