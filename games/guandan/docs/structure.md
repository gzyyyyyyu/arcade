# 代码结构和常用命令

> 改了目录、加了文件就同步这里。

## 1. 目录

```
src/core/   牌馆通用层（docs/doudizhu.md 第 1 节；纯函数、确定性，不引用任何玩法）：cards 牌的编码、rng（包一层 kit 的 `arcade-kit/prng`，只有这一处能引它）、seats n 人座位环、play 牌型识别框架 PatternSet、stake 实盘档位表
src/variants/guandan/   掼蛋（玩法之间互不引用，tests/architecture.test.ts 守着）：
  core/     规则核心（纯函数、确定性）：cards 两副牌与级牌牌序（再导出通用层的编码）、patterns 牌型/比大小/枚举、game 状态机与玩家视角、options 规则开关
  ai/       电脑对手：plan 理牌、bot 决策、persona 强弱五档和性格/状态/局面、venue 场地 → 电脑、memory 记牌（只用公开信息）、hints "提示"按钮的轮换列表、random 随机机器人（模拟基准）
  net/      联机（房间和页面共用，纯函数）：rules 把规则核心接成 arcade-kit 的 RoomGame、rotate 视角旋转（我总在下）、
            stake 好友房实盘的桌（开房选项、带入、每个座位的账、结回）、match 快速匹配的档位和开桌选项、fun-moments 短语表、电脑互动性格、名场面映射（接 kit 的 table-fun）、awards 结束颁奖、together 搭子战绩
  stake/    实盘的规则（纯函数，和 core 同样的约束）：档位、每副的分、封顶、结回额、钱包 ref / op 的拼法、单机一场和好友房每个座位的账（docs/stake.md 第 1 节）；
            titles 称号（只用公开信息，和 public/titles.json 对齐）、stats 结回时带给平台的战绩小结
src/variants/doudizhu/   斗地主（同样的分层；规则取舍见 docs/rules.md、电脑见 docs/ai.md 的"斗地主"一节）：
  core/     规则核心：patterns 牌型（ddzPatterns 是它的 PatternSet）、game 叫分 / 出牌 / 翻倍 / 结算的状态机和玩家视角
  ai/       电脑：hand 拆牌、search 残局搜索、decide 叫分和出牌（新手 / 普通 / 高手）
  net/      联机：rules 斗地主房间规则（娱乐和实盘）、stake 好友房实盘的桌、match 快速匹配档位 ddz-fun 和 ddz-real-<档位>
  stake/    单机实盘的规则（docs/stake-ddz.md）：规则版本、每分、封顶、一场几副（现行 3 副）、每档的电脑、ref 的拼法
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
tools/      sim.ts 机器人对打；probe.ts 跟牌积极度（两者可用 `--baseline` 对旧版电脑）；replay-log.ts 试玩日志复盘；shot.ts 无头冒烟与截图；no-scroll.ts 一屏放下、控件不压、字不裁的检查；mem.ts 内存估算；perf.ts 性能量测（各段脚本时间、长任务、帧、首屏、包体积，`--dist` 背靠背）；build-cf.ts 部署构建；art-preview.ts / cover.ts 美术预览与封面；
            online-dev.ts 本地联机栈（wrangler dev + fake-platform/ 假平台，含假钱包 RPC；standalone 时原样用 wrangler.jsonc）；standalone-smoke.ts 单独部署冒烟；online-smoke.ts 四客户端联机冒烟（`--ddz` 三客户端斗地主，`--clump` 不洗牌房间）；room-sim.ts 房间规则层批量对打；
            ddz-sim.ts 斗地主机器人对打（`--mingpai 500` 量明牌）；ddz-stake-sim.ts 斗地主实盘模拟（`--fun` 量娱乐单机的一局）；stake-sim.ts 实盘计分模拟（docs/stake.md 的数字）；ai-sim.ts 场地、性格、耗时模拟（docs/ai.md 的数字）；
            quota-smoke.ts 额度提示冒烟；match-smoke.ts 快速匹配冒烟；stake-smoke.ts 单机和好友房实盘冒烟
docs/       structure.md 目录和命令（本文件）、storage.md 浏览器存储 key、core-api.md 规则核心的约束和接口、view.md 画面层、net.md 联机/实盘/云存档/部署、stake.md 掼蛋实盘设计、stake-ddz.md 斗地主实盘设计、stake-sim.md 实盘模拟、ai.md 电脑的场地、性格、强弱数字和改电脑的流程、design.md 设计、rules.md 规则核实、art.md 美术现状、doudizhu.md 牌馆（掼蛋 + 斗地主）的分层、掼蛋金样、斗地主的画面和各模式、changelog-archive*.md 更新日志存档（三份）
```

## 2. 常用命令（在模块目录运行）

全部命令和说明见 `README.md` 的"本地开发"，这里只列和约定直接相关的：

- 改规则或电脑后：`npm test`、`npm run typecheck:core`、`npm run sim -- --deals 5000 --mode random`；改强弱、性格、场地表后 `npm run ai-sim -- solo|room|style|time|length`（数字写进 `docs/ai.md`，见第 2 节）。
- 改画面后：`npm run shot`（`-- --gallery --out <目录>` 出美术图集，加 `--audit --sizes 667x375,844x390` 逐屏量字号和点按区、写 `audit.md`，`docs/art.md` 第 7 节）；内存 `node tools/mem.ts [--scales auto,1,2,3]`。
- 改联机或实盘后：`npm run test:room`（workerd 里的真房间）、`npm run room-sim`、`npm run online-smoke`、`npm run stake-smoke`、`npm run match-smoke`；本地联机栈 `npm run online-dev`。
- 金样：`node tools/golden.ts [--write | --dump <场景> <文件>]`（牌馆重构，`docs/doudizhu.md` 第 2 节）：重算各场景的哈希 / 有意改了掼蛋行为时重写 `tests/golden/guandan.json` / 导出一个场景的明细做 diff；试玩日志复盘 `node tools/replay-log.ts <log.jsonl>`。
- `npm run deploy` 拆成独立仓库后才用；在总仓库里正式部署只经 PR 合并进 main 后由 CI 完成。
