# 《掼蛋》模块约定

> 总仓库规范见仓库根的 `AGENTS.md`，其中第 1、2 节的硬约束优先于本文件。本文件只写掼蛋特有的约定。

## 1. 目录

```
src/core/   牌馆通用层（docs/doudizhu.md 第 1 节；纯函数、确定性，不引用任何玩法）：cards 牌的编码、rng（包一层 kit 的 `arcade-kit/prng`，只有这一处能引它）、seats n 人座位环、play 牌型识别框架 PatternSet、stake 实盘档位表
src/variants/guandan/   掼蛋（玩法之间互不引用，tests/architecture.test.ts 守着）：
  core/     规则核心（纯函数、确定性）：cards 两副牌与级牌牌序（再导出通用层的编码）、patterns 牌型/比大小/枚举（guandanPatterns 是它的 PatternSet）、game 状态机与玩家视角、options 规则开关
  ai/       电脑对手：plan 理牌、bot 决策、persona 强弱五档和性格/状态/局面、venue 场地 → 电脑、memory 记牌（只用公开信息）、hints "提示"按钮的轮换列表、random 随机机器人（模拟基准）
  net/      联机（房间和页面共用，纯函数）：rules 把规则核心接成 arcade-kit 的 RoomGame、rotate 视角旋转（我总在下）、
            stake 好友房实盘的桌（开房选项、带入、每个座位的账、结回）、match 快速匹配的档位和开桌选项、fun-moments 短语表、电脑互动性格、名场面映射（接 kit 的 table-fun）、awards 结束颁奖、together 搭子战绩
  stake/    实盘的规则（纯函数，和 core 同样的约束）：档位、每副的分、封顶、结回额、钱包 ref / op 的拼法、单机一场和好友房每个座位的账（docs/stake.md 第 1 节）；
            titles 称号（只用公开信息，和 public/titles.json 对齐）、stats 结回时带给平台的战绩小结
src/variants/doudizhu/   斗地主（同样的分层；规则取舍见 docs/rules.md、电脑见 docs/ai.md 的"斗地主"一节）：
  core/     规则核心：patterns 牌型（ddzPatterns 是它的 PatternSet）、game 叫分 / 出牌 / 翻倍 / 结算的状态机和玩家视角
  ai/       电脑：hand 拆牌、search 残局搜索、decide 叫分和出牌（新手 / 普通 / 高手）
  net/      联机：rules 斗地主房间规则（娱乐和实盘）、stake 好友房实盘的桌、match 快速匹配档位 ddz-fun 和 ddz-real-<档位>
  stake/    单机实盘的规则（docs/stake.md 第 10 节）：规则版本、每分、封顶、一场几副（现行 3 副）、每档的电脑、ref 的拼法
src/net/    两个玩法之间的联机部分（可以都引）：hall 牌馆的房间规则（一个 RoomGame 按 variant 转给掼蛋或斗地主）、stake-table 好友房实盘的桌里玩法无关的部分（掼蛋和斗地主各绑一份）、version 页面版本、emotes 互动编号表、
            fun-text 互动短语表和电脑表情旁的话、room-info 房间是哪个玩法 / 几个座位 / 是不是实盘、error-text 房间拒绝操作的短码 → 大白话
src/view/   画面层（Phaser 4），按玩法分目录；互相引用的规矩由 tests/architecture.test.ts 守着（玩法之间互不引用，common 不引用任何玩法）：
  common/   两个玩法共用、自己不引用任何玩法：anim 动画、audio 合成音效、theme 间距配色、device 设备、textures 纹理烘焙、fonts 内嵌字体、home-layout 主页排版、idle 降帧、pace 牌局节奏常量、orientation 请横过来、errors 出错面板、
            a2hs 添加到主屏幕、attention 轮到我时的振动和标题闪烁、lobby 回大厅、platform 有没有平台、cloud 云存档、achievements 成就、labels 座位名、tutorial 新手引导外壳（runTutorialSteps）、stake-text 实盘说的话、
            stake-api 单机实盘的钱包和接口、seed 随机种子、daily 每日挑战玩法无关的部分、share-card 分享卡的画和分享、social 报位置和收好友邀请、room-link 联机会话基类 RoomLink（连房间、座位、帧队列、出手锁到 ack、聊天、互动）和开房、记着的房间
  guandan/  掼蛋：session 单机会话、net 联机会话 NetSession、stake 单机实盘、daily 每日挑战（种子、榜名、8 副累计分、DailySession）、labels 牌型名和级数、tutorial 新手引导、share-card 分享卡的数据、
            counter 记牌器、recap 每副复盘、highlights 名场面、feed 好友动态的名场面、suggest 公开事件后的短语建议、overlays 结算和整局结束和实盘结果弹窗、play-fx 出牌动画和炸弹特效和进贡、table-ui 按钮和顶栏和记牌器和互动、actions 判定和提示和出牌（这四个是 TableScene 的方法实现，函数接收场景实例）
  doudizhu/ 斗地主：
            session 单机会话、net 联机会话 DdzNetSession、stake 单机实盘、daily 每日挑战（种子、榜名）、puzzle 残局闯关、view 理牌分列和牌型说法、
            rules 玩法说明文字（牌桌和主页的"规则"共用，`ui/panels.ts` 的 `openDdzRules`）、tutorial 新手引导（外壳与掼蛋共用 `common/tutorial.ts` 的 `runTutorialSteps`）、
            counter 记牌器、overlays 结算和残局结果和实盘结果弹窗、play-fx 出牌动画和炸弹特效、
            table-ui 按钮和顶栏和残局条和记牌器和互动（后三个是 DdzScene 的方法实现，函数接收场景实例）
  scenes/   场景：TableScene 掼蛋牌桌、DdzScene 斗地主三人桌（都继承 shared/TableSceneBase 共用流程骨架，shared 归通用层、不引用任何玩法；场景类只管状态和流程，每个方法的实现在玩法目录的 overlays / play-fx / table-ui 里，场景里留一行转调，每个文件不超过 800 行）、TitleScene 主页、BootScene 启动（后两个是两个玩法的入口）
  table/ ui/ art/ fonts/   两个玩法共用的部件：table 牌桌部件（nudge 顺手提示和催促炸弹）、ui 组件与弹窗（kit 按钮和弹窗、panels、patterns 牌型图示、cloud 云朵图标、stake 选档、focus 键盘焦点）、art 程序生成 SVG、fonts 字体文件
  根目录     认得两个玩法的入口层文件（可以都引）：app 当前会话和启动参数、store 存储（全部 key）、online 好友房大厅、personas 电脑的台词和出手节奏、stake-stray 钱包里不在本机的掼蛋单机实盘
src/debug/  URL 参数、调试跳转（jump）、window.__game 调试桥
worker/     线上 Worker：main.ts 部署入口（只导出默认导出和 Durable Object 类：workerd 把入口的每个具名导出都当入口，多导出常量单独部署时起不来）、index.ts 请求处理、gate.ts 登录闸门和房间路由、room.ts 联机房间、match.ts 快速匹配的排队、
            stake.ts 单机实盘的带入 / 结回 / 放弃（转给平台钱包 WALLET）
public/     favicon、cover.png（平台封面）、titles.json（称号表，平台按 id 显示）、daily.json（掼蛋 gd、斗地主 ddz、每日残局 ddzpz 的分数怎么显示，平台读）、_headers
tests/      vitest，按层分目录：
            core/ 掼蛋规则核心、电脑、统计；net/ 联机规则和会话、互动；stake/ 实盘；view/ 画面层的非渲染逻辑和源码检查；ddz/ 斗地主（规则、电脑、联机、实盘、残局）；
            根目录放跨层检查（architecture、config、gate）、金样和共用的 helpers.ts；
            architecture.test.ts 检查通用层和各玩法 core/ai/stake 的纯度，以及 variants、画面层（view/guandan、view/doudizhu、view/common、scenes/shared、两个牌桌场景）玩法之间互不引用；
            golden.test.ts 掼蛋金样（tests/golden/ 只放哈希，场景在 golden-scenarios.ts）；
            tests/room/ 是在 workerd 里跑真房间的测试（`npm run test:room`，单独的配置）
tools/      sim.ts 机器人对打；probe.ts 跟牌积极度（两者可用 `--baseline` 对旧版电脑）；replay-log.ts 试玩日志复盘；shot.ts 无头冒烟与截图；no-scroll.ts 一屏放下、控件不压、字不裁的检查；mem.ts 内存估算；build-cf.ts 部署构建；art-preview.ts / cover.ts 美术预览与封面；
            online-dev.ts 本地联机栈（wrangler dev + fake-platform/ 假平台，含假钱包 RPC；standalone 时原样用 wrangler.jsonc）；standalone-smoke.ts 单独部署冒烟；online-smoke.ts 四客户端联机冒烟（`--ddz` 三客户端斗地主，`--clump` 不洗牌房间）；room-sim.ts 房间规则层批量对打；
            ddz-sim.ts 斗地主机器人对打（`--mingpai 500` 量明牌）；ddz-stake-sim.ts 斗地主实盘模拟（`--fun` 量娱乐单机的一局）；stake-sim.ts 实盘计分模拟（docs/stake.md 的数字）；ai-sim.ts 场地、性格、耗时模拟（docs/ai.md 的数字）；
            quota-smoke.ts 额度提示冒烟；match-smoke.ts 快速匹配冒烟；stake-smoke.ts 单机和好友房实盘冒烟
docs/       view.md 画面层约定（第 3 节展开）、net.md 联机/实盘/云存档/部署（第 3 节展开）、stake-sim.md 实盘模拟、changelog-archive.md 更新日志存档、design.md 设计、rules.md 规则核实、core-api.md 接口、stake.md 实盘设计、ai.md 电脑的场地、性格、强弱数字、art.md 主页和牌桌的美术现状、doudizhu.md 牌馆（掼蛋 + 斗地主）的分层、掼蛋金样、斗地主的画面和各模式
```

## 2. 规则核心的约束

- `src/core`、`src/variants/*/core`、`src/variants/*/ai`、`src/variants/*/stake` 不依赖 DOM、Phaser、网络；禁止 `Math.random`、`Date`、`Math.exp/log/pow/sin` 等；随机一律 `rngFor(seed, 用途, …)`。
  `tsconfig.core.json` 只给 ES 库，误用浏览器全局会编译失败。
- 状态是纯 JSON（牌是 0..107 的整数），`dispatch` 不修改传入的状态。同一种子 + 同一串动作必须逐位相同（`tests/core/game.test.ts` 回放测试）。
- 电脑只能读 `viewFor(state, seat)`，不能碰 `GameState`；`viewFor` 不得包含别人的手牌（防泄漏测试）。联机时下发的也是它。
  给电脑的随机种子、"这一场"的种子一律按用途派生（单机 `guandan/session.ts` 的 `soloSeeds`，房间 `rules.ts` 的 `aiSeed`、`formSeed`），不给牌局种子或密钥本身——
  拿着它就能重算发牌。守着的测试：`tests/core/ai.test.ts` 的反事实测试（单机和房间两条路径 0 不一致，外加阳性对照）、
  `tests/architecture.test.ts`（`src/variants/guandan/ai` 不引用 `GameState`、不出现 `'deal'`/`'firstLead'`）。README"电脑不看牌"一节是给外人看的版本。
- 联机用的核心接口（`timeoutAction`、`previewNext`、规则版本、`SeatAction`/`TableAction`）见 `docs/core-api.md` 5.1，测试在 `tests/net/online.test.ts`。
  改了会影响牌局结果的规则要加 `RULES_VERSION`，并让旧版本的牌局能按旧规则打完。
- 规则有出入的点先查 `docs/rules.md`；改规则要同步改该文档、`docs/core-api.md` 和测试，地方差异做成 `options.ts` 开关。
- 改电脑策略后跑 `npm run sim`（`--mode random|greedy|ai|easy-vs-hard|normal-vs-prev`），确认无非法动作、无死锁、难度梯度还在。
  改强弱、性格、场地表后跑 `npm run ai-sim -- solo|room|style`，把新数字写进 `docs/ai.md` 和 `docs/stake.md` 1.3、3.1（好友房实盘每档要"两个普通真人搭档期望加两倍标准误 ≤ 0"）。
  配平目标是仓库 `docs/balance.md`（两个玩家模型：普通、小白 `rookie`）：实盘小档、娱乐新手档按小白调，其余按普通调（掼蛋的例外，`docs/ai.md` 2.1）；`ai-sim -- grid` 量搭档 × 对手的每种组合。
  没给性格时 `decide` 就是难度预设本身（聪明提示、代打、`sim` 都靠这个），新加的打法参数默认 0、不改原来的行为。
  新旧电脑对比不在仓库里留旧版副本：需要时用 git worktree 取旧版（`git worktree add ../gd-old <旧版 tag>`，在里面 `npm ci` 或链上本目录的 `node_modules`），
  `npm run sim -- --mode normal-vs-prev --baseline ../gd-old/games/guandan/src/variants/guandan/ai`（`tools/probe.ts` 同样用 `--bot prev --baseline <目录>`）；没给 `--baseline` 会报错并打印这套步骤。强弱另用 `ai-sim` 的胜率表对比（docs/ai.md）。

## 3. 画面与联机约定

细节在 `docs/view.md`（画面层）和 `docs/net.md`（联机、实盘、云存档、部署）；下面只留必须守的约束和守着它的测试。

### 画面层（`docs/view.md`）

- 推进状态只走 `Session.apply(action)` → 核心 `dispatch` → 场景按事件顺序播放 → `sync()` → `pump()`；画面不自己判牌型和大小，用 `interpret` / `beats` / `hintList`（view 1）。
- 新文字一律走 `ui/kit.ts` 的 `text()`，最小字号 18，手机横屏按 `typeFloor` 托底，放不下就删字、不缩字；标题字体缺字 `tests/view/view.test.ts` 会报（view 2、15）。
- 尺寸按实际可见区 `appBox`，不用 `screen` 和 `100vh`；viewport 的监听和补算用 `arcade-kit/viewport`，改值前看 kit README 的"手机和平板"表（view 3）。
- 手机平板 `RENDER_SCALE` 封顶 2，新加大纹理先跑 `node tools/mem.ts`；纹理烘焙分两段，用到后一段的走 `texOr`，进牌桌走 `startWhenReady`，不直接 `scene.start('table'|'ddz')`（view 5、12）。
- 动画时长一律经 `dur()`，要 await 的动画走 `tweenP` / `wait` / `settle`；闲着降帧在 `idle.ts`，一秒看一次、不改成每帧（view 4）。
- 布局数字只放 `src/view/table/layout.ts`，停顿和过场时长只放 `common/pace.ts` 的 `PACE`，不写裸数字；`tests/view/venue.test.ts` 锁着普通出牌 ≤ 900 毫秒（view 6、7）。
- 手牌分列是纯函数 `table/columns.ts`，一列最多 5 张；键盘、右键、悬停的接法见 view 8、9；座位和电脑人物见 view 10。
- 斗地主复用掼蛋的牌桌部件，推进只走 `DdzSession.apply`；每日挑战、残局、单机实盘的画面见 view 11。
- 主页排版是纯函数 `home-layout.ts`（view 13）；回大厅统一由 `common/lobby.ts` 做：左上角小房子"大厅"指向 `/`，对局中先确认，离开前 `cloud.flushOnHide()`（view 14）。
- 间距、圆角、按钮配色只从 `theme.ts` 取；牌桌操作区同时只有一个红色主按钮；画布里能点的一律用 `ui/kit.ts` 的 `Button` / `iconButton` / `segmented`，弹窗用 `modal()`。
- 点按区域至少 44 CSS 像素（`minHit()`），挨得近的收 `setHit`、不许互相压着；输赢的分和筹码一律正绿负红（`signColor`）。`tests/view/ui-theme.test.ts` 查 DOM 按钮（view 15）。
- 任何界面都不许要滚动才能看全，控件不许相交、带字的元素不许被裁；`tools/no-scroll.ts` 在 shot、online-smoke、stake-smoke 里量（view 16）。
- 改了画面后跑 `npm run shot`，并亲自看 `shots/` 里 1280×720、844×390、1920×1080 的截图。无头截图里精灵缺方块是 SwiftShader 多纹理合批的问题，已在 `src/main.ts` 绕开（view 17）。
- 存储只在 `src/view/store.ts` 里读写（测试检查）；调试桥 `window.__game` 只在开发模式或 `?debug=1` 时挂。

### 联机、实盘、云存档、部署（`docs/net.md`）

- 联机房间（`worker/room.ts`）只继承 arcade-kit 的 `GameRoom`，规则来自 `src/variants/guandan/net/rules.ts`；服务端说了算，下发的只有 `viewFor(state, 座位)` 和这一步的事件，`tests/net/net.test.ts` 查泄漏（net 1）。
- 联机开局走 kit 的 `begin` 的密钥发牌，`seed` 是空串；不要让联机牌局用种子发牌，也不要给 `rngFor` 喂密钥（net 1）。
- 开打后座位绑人：坐过的人只能回自己的座位，绑了别人的座位接管不了；回归测试 `tests/room/seats.spec.ts`（net 1）。
- 改了房间和页面之间的约定（动作、视图形状）加 `src/net/version.ts` 的 `CLIENT_VERSION`；改规则加 `RULES_VERSION`，打到一半的房间按旧规则打完（net 1）。
- 旁观看到的是没入座的公开视图，不含任何人的手牌；快速匹配、记着的房间分账号、额度和路由开关见 net 1，斗地主的联机见 net 2。
- 每天额度绑 `METER`、门槛在 `vars.KIT_QUOTA`，`tests/config.test.ts` 守着；页面上的几句话在 `quota-text.ts`，`npm run quota-smoke` 核对（net 1）。
- 实盘的规则都在各玩法的 `stake/`（纯函数），Worker、页面、房间都从这里取，不各算一份；改数只加新版本、不改旧的；钱包 ref、op 只能是 8–64 位的 `[A-Za-z0-9_-]`；业务拒绝走返回值，HTTP 状态码只说"没到钱包"（net 3）。
- 牌桌互动整套用 kit 的 `arcade-kit/table-fun`，公平底线：人人一样、免费、不挂筹码，不停计时、不挡牌和按钮；电脑出牌绝不读互动和表情；编号 `src/net/emotes.ts` 只往后加（net 4）。
- 分享卡、结束颁奖、好友动态、搭子战绩只用公开信息；改评法、win 的定义、模板分别同步 `docs/design.md` 4.1–4.3 和对应测试（net 5）。
- 云存档只同步 `stats` 和 `tutorial` 两个槽；换账号不合并、不上传；没有提示 cookie 时一个请求都不发；单独部署不启动云存档（net 6）。
- `wrangler.jsonc` 是独立配置，不写 `ARCADE`、`WALLET`、`GATE`、路由；没有平台绑定就是单独部署；站点地址不进仓库，部署时由部署工具注入（net 7）。
- `GET /games/guandan/health` 不认人、不读存储、不碰平台；登录闸门 fail-closed，`GATE: "off"` 才放行（net 8、9；`tests/gate.test.ts`、`tests/config.test.ts`）。
- 验收：`npm run test:room`、`npm run room-sim`、`npm run online-smoke`（约 5 分钟，`--quick` 跳过托管那项）、`npm run stake-smoke`。

## 4. 常用命令（在本目录运行）

全部命令和说明见 `README.md` 的"本地开发"，这里只列和约定直接相关的：

- 改规则或电脑后：`npm test`、`npm run typecheck:core`、`npm run sim -- --deals 5000 --mode random`；改强弱、性格、场地表后 `npm run ai-sim -- solo|room|style|time|length`（数字写进 `docs/ai.md`，见第 2 节）。
- 改画面后：`npm run shot`（`-- --gallery --out <目录>` 出美术图集，加 `--audit --sizes 667x375,844x390` 逐屏量字号和点按区、写 `audit.md`，`docs/art.md` 第 7 节）；内存 `node tools/mem.ts [--scales auto,1,2,3]`。
- 改联机或实盘后：`npm run test:room`（workerd 里的真房间）、`npm run room-sim`、`npm run online-smoke`、`npm run stake-smoke`、`npm run match-smoke`；本地联机栈 `npm run online-dev`。
- 金样：`node tools/golden.ts [--write | --dump <场景> <文件>]`（牌馆重构，`docs/doudizhu.md` 第 2 节）：重算各场景的哈希 / 有意改了掼蛋行为时重写 `tests/golden/guandan.json` / 导出一个场景的明细做 diff；试玩日志复盘 `node tools/replay-log.ts <log.jsonl>`。
- `npm run deploy` 拆成独立仓库后才用；在总仓库里正式部署只经 PR 合并进 main 后由 CI 完成。


## 5. 浏览器存储 key（全部 `guandan.` 前缀）

| key | 内容 |
|---|---|
| `guandan.save` | 进行中的整局：`{ v, state: GameState, difficulty, counted, dealsCounted }`；整局结束即删除 |
| `guandan.settings` | 音效档位 `sfx`、音乐档位 `musicVol`（0 关到 3 大）、全部静音 `muted`（老存档的 `volume`、`music` 读到时按 `migrateSound` 换成这两档）、动画速度、难度、地方规则、牌背、记牌器开关、互动开关（字段名仍是 `taunts`）、娱乐单机的局长 `length`（`short` / `full`）、快速匹配桌上和陌生人打字聊天 `strangerChat`（默认开）、斗地主娱乐的发牌 `ddzDeal`（`classic` / `clump` 不洗牌） |
| `guandan.stats` | 战绩：局数、胜局、连胜、最高连胜、副数、头游次数 |
| `guandan.tutorial` | 新手引导是否看过 |
| `guandan.achievements` | 成就 `{ v, unlocked: id[], gdGames, ddzGames, gdStreak }`（`view/common/achievements.ts`）；坏数据当空；只在本机，不进云同步 |
| `guandan.errors` | 最近 20 条未捕获错误（兜底面板写入） |
| `guandan.cloud` | 云存档元数据 `{ v, userId, rev: {stats?, tutorial?}, dirty: 槽[] }` |
| `guandan.room` | 最近进的好友房 `{ code, host, at, userId, match?, variant? }`（`match: true` 是快速匹配排到的桌，`variant: 'ddz'` 是斗地主房间），刷新、回来时接回去；只给 `userId` 那个账号看；离开房间、回不去的关闭、换号、退出就删 |
| `guandan.<槽>.pre-sync` | 云同步合并改了本地数据前的备份（槽 = `stats` / `tutorial`，只留最近一份） |
| `guandan.<槽>.pre-switch.<旧 userId>` | 换账号清空本地前的备份，每个旧账号一份（和 pre-sync 分开）；写时和已有的合并（只会变多），写完读回核对，没存上就不清空、暂停同步；之后再登录这个账号时并回本地、补传 |
| `guandan.boot` | iOS 防崩溃标记 `{ v, pending, low, ver }`：页面在前台时 pending=1，切后台/离开清 0；打开时还是 1 说明上次被系统杀了，low 升一档（1 = 一倍渲染，2 = 再换 Canvas 渲染）；ver 不是当前版本就整条作废（只在 iOS 上写） |
| `guandan.stake` | 单机实盘这一场：`{ v, userId, ref, tier, share, until, match: { tier, deals }, state, settle }`；只在本机、不进云同步；结回或退回后删，过了 `until` 打开标题页时删 |
| `guandan.a2hs` | 标题页"添加到主屏幕玩更大"提示点过 ✕（值 1） |
| `guandan.nick` | 单独部署时好友房里的昵称（字符串；有平台时不用，昵称以平台账号为准） |
| `guandan.chat` | 聊天的界面设置：弹幕开关、电脑版聊天框收起、记录展开（由 kit 的 table-fun 按 `storageKey: 'guandan'` 读写） |
| `guandan.hint.fun` | 首次进牌桌冒过"点头像扔道具，长按连扔"了（由 kit 的 table-fun 读写），只出一次 |
| `guandan.fun.blocked` | sessionStorage：点头像"屏蔽他"屏蔽了谁（由 kit 的 table-fun 读写，按房间码分开、记座位和名字，那个座位换了人就不算） |
| `guandan.variant` | 主页上次选的玩法：`'guandan'` / `'ddz'`（没有就是掼蛋） |
| `guandan.ddz.save` | 斗地主进行中的一局：`{ v, state: DdzState, level, counted, dealsCounted }`；规则版本不对或整局结束就删 |
| `guandan.ddz.stats` | 斗地主战绩：局数、胜局、副数、赢的副数、当地主几次、当地主赢几次、春天次数（只在本机，不进云同步） |
| `guandan.ddz.tutorial` | 斗地主单机的新手引导是否看过 `{ v, done }`（第一次进单机娱乐牌桌弹，4 步；好友房、实盘、每日、托管、带 seed 的调试开局不弹；设置里"重看引导"一并清掉；只在本机，不进云同步） |
| `guandan.ddz.puzzles` | 斗地主残局闯关过了哪几关 `{ v: 1, done: id[] }`（id 是关卡表里的 `p01`…；坏数据当空；只在本机，不进云同步） |
| `guandan.ddz.dailyPuzzle` | 斗地主每日残局今天的最好成绩 `{ v: 1, date, best, tries }`（`tries` 是今天打完了几次；换一天从头记；坏数据当没打过；只在本机，不进云同步） |
| `guandan.ddz.stake` | 斗地主单机实盘这一场：`{ v, userId, ref, tier, share, until, rules?, state, settle }（rules 是规则版本，没有就是 1）`；只在本机、不进云同步；结回或退回后删 |
| `guandan.<槽>.pre-switch.<userId>.restored` | 上面的备份并回本地、传上去之后改名到这里（安全副本），以后不再并——"当前连胜"会归零，反复并会被旧值抬回去 |

新增 key 必须带前缀、只在 `src/view/store.ts` 里读写（kit 的 table-fun 按 `storageKey: 'guandan'` 自己读写的三个除外），并补进这张表。
