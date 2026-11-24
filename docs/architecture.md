# 小游戏街机厅：整体架构

> 平台和各个小游戏都在 `gzyyyyyyu/arcade` 这一个仓库里，每个是可以单独部署、随时拆分的独立模块（规范见仓库根 `AGENTS.md`）。

## 1. 选型原则

技术栈统一，能部署到 Cloudflare Workers，也能在自己的机器上跑，资源轻量，打包方便。

| 原则 | 落实 |
|---|---|
| 技术栈统一 | 平台和所有游戏都用 TypeScript + Vite，Node 22（`.nvmrc`）。平台界面用 React；游戏按类型选渲染层（开盘、掼蛋、夜巡、海岛用 Phaser，掼蛋用按需裁剪的精简版；牌桌类也有纯 DOM 的），但构建和部署方式一致。后端接口也用 TypeScript 写在 Worker 里。 |
| 都按 Workers 运行时写 | 每个模块构建出静态资源，加上一个 Worker 入口，用 wrangler 打包。账号、好友、排行榜等接口在平台 Worker 里，数据放 D1；联机房间放各游戏 Worker 的 Durable Object。同一份产物既能部署到 Cloudflare，也能用自托管运行时（第 6 节，workerd 加 SQLite 或 PostgreSQL）跑在自己的机器上，所以模块代码只用 Workers 的标准能力。 |
| 资源轻量 | 平台首页只有 React 加一个游戏列表；各游戏只在进入时才加载。游戏素材烘焙成图集或程序生成，正式构建不带 sourcemap。 |
| 打包方便 | 每个模块都是 `npm run build` 加 `wrangler deploy --dry-run` 打包；经 PR 合并进 `main` 后，开了 Cloudflare 部署时由 GitHub Actions 按路径只部署有改动的模块；自托管从同一份源码打整站发布包（[deployment.md](deployment.md)）。 |

## 2. 仓库与目录

| 目录 | 内容 | Worker | 线上路径 |
|---|---|---|---|
| `platform/` | 平台主界面和 `/api`：账号、云存档、好友、排行榜、钱包、战绩、动态与邀请、管理页 | `arcade` | `/`、`/api/*` |
| `games/kaipan/` | 《开盘》股市肉鸽 | `kaipan` | `/games/kaipan/` |
| `games/guandan/` | 《牌馆》掼蛋和斗地主（分层见该模块 `docs/doudizhu.md`） | `guandan` | `/games/guandan/` |
| `games/texas/` | 德州扑克 | `texas` | `/games/texas/` |
| `games/mahjong/` | 《雀馆》麻将：川麻·血战到底和立直麻将 | `mahjong` | `/games/mahjong/` |
| `games/yexun/` | 《夜巡》幸存者类动作游戏 | `yexun` | `/games/yexun/` |
| `games/racing/` | 《飞驰》回合制卡牌赛车（社区贡献者的游戏，只有娱乐模式） | `racing` | `/games/racing/` |
| `games/danli/` | 《弹里个弹》回合制抛物线对战（社区贡献者的游戏，单机对电脑和好友房，只认人、不接钱包） | `danli` | `/games/danli/` |
| `games/haidao/` | 《海岛》海盗题材的海岛攻防：建基地、打电脑关卡、异步攻防（打别人的岛）；接钱包做悬赏出海和筹码单向换资源 | `haidao` | `/games/haidao/` |
| `packages/arcade-kit/` | 共用包（发布在 npm：`@yyyu-star/arcade-kit`）：联机房间基类、开房进房入口、浏览器连接器、协议、计量、快速匹配、手机视口和 WebGL 恢复、牌桌互动、聊天、分享卡、社交部件；只测不部署（`pkg-arcade-kit.yml`） | 无 | 无 |
| `packages/arcade-host/` | 自托管运行时（第 6 节）；只测不部署（`pkg-arcade-host.yml`） | 无 | 无 |

- 每个目录是独立模块：自带依赖、配置、测试和部署流程，不引用目录外的文件（`packages/` 除外），`tools/check-isolation.mjs` 在 CI 里强制检查。
- 拆成独立仓库用 `tools/split-module.sh`（基于 `git subtree split`，保留历史）。
- 游戏目录写在 `platform/shared/games.ts`：名字、介绍、封面、线上路径、本地开发地址、状态；钱包、云存档、分数榜、保留用户名都从这份登记派生。
- 各模块当前版本看各自的 `package.json` 和 `CHANGELOG.md`。

## 3. 部署形态：同一个站点主机名，按路径分给不同的 Worker

站点主机名不写在仓库里，下文写作 `<站点>`：部署到 Cloudflare 时由 GitHub `production` 环境的 secret `SITE_HOST` 注入（各 Worker 的路由和 `SITE_ORIGIN`）；
自托管时由环境变量 `SITE_ORIGIN` 给，`arcade-host` 在一个进程里按同样的路径把请求分给各模块（第 6 节）。

```
https://<站点>/                 → arcade Worker（平台界面，静态资源）
https://<站点>/api/*            → arcade Worker（账号、好友、云存档、排行榜；数据在 D1）
https://<站点>/games/<id>/*     → 各游戏的 Worker（路径路由；静态资源直接返回，首页有登录闸门，
                                   联机房间和实盘接口经服务绑定 ARCADE / WALLET 调平台）
```

所有 Worker 都关掉 workers.dev，只留站点域名这一个入口，没有测试地址。线上 Worker 只有平台 1 个加每个游戏 1 个，不另建测试环境（platform-backend.md 第 8 节）。

- 为什么放在同一个主机名下：登录状态（cookie）和接口（`/api/*`）可以被所有游戏直接共用，没有跨域问题，游戏不用各自做登录。
- 为什么每个游戏单独一个 Worker：游戏可以单独更新，不用连带重新发布平台；一个游戏出问题也不影响其他游戏。
- 游戏要能在子路径下运行：素材一律用相对路径加载，Vite 的 `base` 和产物目录让 Worker 能按 URL 路径直接找到文件。
- 为什么用路径路由而不是让平台转发：路由直接打到游戏的 Worker，纯静态资源请求不计入平台的请求额度；由平台转发的话，游戏的每个文件请求都会计一次平台的调用。
- 每个游戏的 `wrangler.jsonc` 本身是能单独部署的配置（游客身份，没有登录、云存档、钱包）；接平台的服务绑定、`GATE: "login"`、路由由维护者的部署工具（`tools/deployer/deploy.mjs`）按 `tools/workers.json` 在本站部署时补上。补什么见 [new-game.md](new-game.md) 第 4 节，安全设计见 [deployment.md](deployment.md)。

## 4. 账号、联机房间与费用熔断

完整方案见 [platform-backend.md](platform-backend.md)。要点：

- 账号、好友、排行榜归平台的 `/api/*`，数据在平台独占的 D1；账号用用户名 + 密码 + 恢复码；邀请制：注册默认关着、管理员可以随时开关，不登录不能玩游戏（游戏 Worker 在首页上做登录闸门，见 [platform-features.md](platform-features.md) 5.8、[api-account.md](api-account.md) 15.8）。
- 排行榜是简单版、不防作弊：游戏页直接调 `/api/scores` 交分，平台只防刷额度、查数据格式，不重放验分（platform-backend.md 9.2）。
- 排行榜分两层（游戏多了以后不把所有榜都摊出来）：
  - **总榜**：全站一个，按本周带筹码的输赢（单机实盘、好友房）排，排行页默认就显示它，带"只看好友"；
  - **游戏小榜**：每个游戏一个页签，放这个游戏的本周输赢，加上最多 1 个最能代表这个游戏的每日榜（游戏在 `platform/shared/games.ts` 的登记里指定是哪一个）。
    游戏可以登记更多每日或每周子榜（游戏里自己显示、留着数据），但排行页只列这一个。没有筹码输赢（没接钱包）、也没指定代表性每日榜的游戏不开页签（海岛接了钱包，开页签只放本周输赢）。
  - 大厅首页不放排行（大厅保持干净，ui.md 第 11 节）。
- 钱包在平台，游戏的服务端经 `WALLET` 服务绑定带入、带回（[economy.md](economy.md)）。
- 每个游戏的联机房间放在它自己的 Worker 里（Durable Objects，休眠写法，SQLite 后端）。开房进房的路径各游戏不同，以各游戏的 `wrangler.jsonc` 里 `run_worker_first` 为准。
- 共用代码放进共用包 `packages/arcade-kit`，所有游戏必须遵守其中的房间规范；开房进房靠 `/api/me` 认人、不发入场票，取舍见 [accounts.md](accounts.md) 5.3，房间额度见 [rooms.md](rooms.md) 4.6。
- 牌桌游戏的互动统一做成 kit 里的组件，规范见 [table-fun.md](table-fun.md)；社交部件（分享、在线、邀请、旁观）见 [social.md](social.md)；各游戏的难度和筹码收益按 [balance.md](balance.md) 配平，档位和钱包见 [economy.md](economy.md)。
- 额度：跑在免费版，房间有硬限制和计量（[rooms.md](rooms.md) 4.6、4.7），平台接口按免费版的日额度自计量，到线就停增长、只读或停服（[platform-backend.md](platform-backend.md#66-平台接口的最小计量与熔断) 6.6）；按账单金额熔断没有做（6.2）。

## 5. 本地开发

端口表见 [AGENTS.md](../AGENTS.md) 第 3 节（正本）。开发时，平台的"进入游戏"会跳到游戏自己的开发服务器（`shared/games.ts` 里的 `devUrl`）；正式构建用同域路径。

## 6. 自托管：不用 Cloudflare 也能跑全站

不改任何模块，在外面补上 Cloudflare 替我们做的事，让别人能在自己的机器上跑一整套：`packages/arcade-host` 用一个 [workerd](https://github.com/cloudflare/workerd) 进程跑平台和所有游戏（D1 换成 SQLite 或 PostgreSQL，补上静态资源、路由、Cron 和 DO 存储），
`tools/selfhost` 把各模块打成发布包（裸二进制 + systemd，或 Docker）。两种部署形态的差别见 [platform-backend.md](platform-backend.md#31-部署形态) 3.1，步骤见 [self-hosting.md](self-hosting.md)。
