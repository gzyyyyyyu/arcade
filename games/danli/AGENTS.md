# danli 模块约定（《弹里个弹》）

> 总规范见仓库根的 `AGENTS.md`（拆成独立仓库后，以本文件和 `DESIGN.md` 为准）。设计正本是 [DESIGN.md](DESIGN.md)；实现里拿不准的地方在 PR 里提出来，不自己改设计。
> 命令和目录见 [README.md](README.md)，数值见 [docs/balance.md](docs/balance.md)。

## 硬约束

- 模块 id `danli`，Worker 名 `danli`，路径 `/games/danli/`，开发端口 5179、预览 4179；冒烟、截图、性能脚本用系统分配的临时端口（端口写 0），`npm run dev:worker` 用 4179。
- 只改 `games/danli/`；不读、不引用其他游戏的源码。共用的东西只走 `arcade-kit`（npm 上的 `@yyyu-star/arcade-kit`，按别名装）和平台的公开 `/api`。
- 规则核心 `src/core/`（含地图数据）、电脑 `src/ai/` 和好友房的规则 `src/net/` 是纯函数：不碰 DOM、网络、存储；
  不用 `Math.random`、`Date`、`performance.now`、三角函数、开方、`**` 这类结果依赖平台的东西（角度用 `core/fixed.ts` 的整数表，开方用 `isqrt`）；
  炮弹用定点整数（1/1024 单位）、固定步长；道具的倍率用万分比整数；随机只用 `arcade-kit/rng`（ChaCha20）按用途分流：`open` 开局（出生点洗牌、谁先手）、`wind` 每回合的风（序号是回合数）、`ai` 电脑出手的误差（序号是回合数）。
  准备房间里"随机"地图在页面里抽（不进规则核心），抽到的写进开局设置。好友房另有 `match`：从房间的种子按局号分出这一局的种子和"随机"地图（`src/net/rules.ts`）。
  `test/arch.test.ts` 检查这些。
- 画面（`src/view/`）只读状态和事件：事件按顺序放成动画，地形在画面里另存一份，放到"爆炸"那一刻才挖；不自己算规则。
- 坑形（`core/craters.ts`）是规则：改了就是规则含义变了（`RULES_VERSION`），要过 `test/craters.test.ts`（不出包围盒、只扫方框和逐格判断一样、画面按事件挖和规则核心一样）；
  焦痕（`view/scorchPaint.ts`）只是画面，按位置散列，不用 `Math.random`。服务端存的坑是"x、y、大小、武器序号"四个数一个。
- 浏览器存储的键一律 `danli.` 前缀（DESIGN.md 第 8 节）：`danli.solo`（单机存档：种子 + 整局的开局设置 + 操作序列；操作格式变了要升存档版本，版本对不上的直接丢掉）、
  `danli.prefs`（`src/room.ts` 逐项检查着读，坏了的那一项用默认）、`danli.room`（好友房最近的房间码，`src/friend.ts`；离开、房间关了就删）。
- 好友房（DESIGN.md 5.6）只用 kit：房间类 `worker/room.ts` 继承 `GameRoom`（`maxAiBatch` 1，其余 kit 默认），规则在 `src/net/rules.ts`，Worker 路由只接 `acceptCreate` / `acceptJoin`，页面用 `RoomClient`。
  - kit 一开房就开局，准备、对局、结算是游戏自己的阶段，`over` 永远是 false（"再来一局"在同一个房间）；准备阶段的操作都是 `free`；
  - 一回合一条 `act`（`turn` / `pass`；道具是每种几个 `p1 p2 fork b10 b20 b50` 加 `lid` `plane`，0 个不写，`parse` 不认识的字段一律拒）；
    `auto`（电脑代出）、`handoff`（交出房主）只由房间的 `ai` / `timeout` 给，`parse` 不收；错误码只用固定短码；
  - 视图里绝不能有种子（房间的、这一局的）和服务端的局面（`lite`、`carves`），`test/net.test.ts` 检查；快照上限 20 KB；
  - 页面的动画时长不能超过 `src/net/anim.ts` 估的（房间按它停顿）；飞行、掉落、连发放快的时长画面和房间共用 `anim.ts` 的 `flightMs`、`fallMs`、`paced`；最长一手 ≤ 20 秒（`test/net.test.ts`）；
  - 规则的结构版本 `RULES_VERSION`：状态格式、规则含义变了要加一（进行中的房间按开局时的版本打完）；
    规则含义变了，`RULES_VERSION` 和 `CLIENT_VERSION` / `minClientVersion` 一起升（`src/net/rules.ts`；房间只收不低于它的页面，旧页面收到 4005、提示刷新）。
- 电脑人物的名字在 `src/ai/personas.ts`：加、改名字时在 PR 说明里写上，由平台另开 PR 登记进保留昵称。
- `wrangler.jsonc` 是独立配置：不写平台绑定和 `GATE`（接入平台时由部署工具补），只用部署配置检查允许的字段（仓库根 docs/new-game.md 第 4 节）；`observability` 开着。
- 监控（仓库根 docs/platform-backend.md 第 16 节）：`worker/route.ts` 最前面接 `/games/danli/health`（不登录、不读存储，版本号从 `package.json` 导入），`test/worker-health.test.ts` 检查；页面入口调一次 `reportErrors`。
- 画面全部是模块里的程序画法（地图数据、地形、远景、角色、图标、标题字、页面样式），不引用模块外的文件；改了画法或加了素材，来源写进 `ASSETS.md`。
- 音效在 `src/view/sound.ts`，全部 WebAudio 现场合成，不放音频文件；同一时刻最多 6 个、每种有最短间隔。
- lint 用仓库统一的 `biome.jsonc`，不在模块里改规则；放行某一处用 `// biome-ignore <规则>: <理由>`。
- Node 版本钉在 `.nvmrc`（22.18.0 起原生跑 TS，`scripts/*.ts` 和 `npm run cpu` 靠它）。
- 临时脚本放 `scripts/_*.ts`，用完删掉。提交信息以 `danli:` 开头，分支 `danli/<说明>`；只暂存明确路径。

## 改了什么要跑什么

| 改了 | 跑 |
|---|---|
| 任何代码 | `npm run lint`、`npm test`（tsc + vitest + CPU 预算）、`npm run build:cf` |
| 界面 | `npm run smoke`（单机手机横竖屏各一遍，再走一遍好友房：本机起真的 Worker，A、B 两个上下文）；`npm run shots` 截验收图（`shots/<屏>-<场景>.png`，已被 gitignore），自己看一遍 |
| 数值（`core/weapons.ts`、`core/items.ts`、`core/rules.ts` 的常量、`core/physics.ts` 的重力风力、`core/maps.ts` 的地形和出生点）或电脑 | docs/balance.md 第 2 节那一组模拟器，结果更新到 docs/balance.md |
| 电脑（`ai/online.ts`）、规则核心的计算量 | `npm run cpu`（开发机每一步 p99 ≤ 3 ms，有环境变量 CI 时 8 ms；`npm test` 也会跑） |
| 好友房的视图 | 看一眼快照上限（`test/net.test.ts`） |
| 动画节奏 | 画面和房间一起改 `net/anim.ts`，过 `test/net.test.ts` 的最长一手 |
| 坑形 | `test/craters.test.ts`，升 `RULES_VERSION`（和 `CLIENT_VERSION`） |
| kit 的存储或运行时用法变了 | 房间测试在 Node 里跑真的 kit 房间（`test/fake-workers.ts` 顶替 Workers 运行时，`vitest.config.ts` 把 `cloudflare:workers` 指过去），只复刻 kit 用到的那几样，跟着补 |
| 模块的文件 | 仓库根 `node tools/check-isolation.mjs` |
