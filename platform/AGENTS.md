# platform 模块约定

> 总规范见仓库根的 `AGENTS.md`。

- 内容：平台主界面（React + Vite，`src/`）和平台 Worker（`worker/`），Worker 名 `arcade`；两边都要的登记表和纯函数放 `shared/`，worker 不引 `src/`，shared 只引自己（`test/architecture.test.ts`）。站点域名和正式 D1 的 id 不写进仓库，部署时注入（README 的部署一节）；代码里不写死站点地址。
- `/api/*`（账号、云存档、好友、排行榜、钱包、社交）的方案和**接口约定**见仓库根的 `docs/platform-backend.md`（第 5–7 节、第 15 节）。
- 游戏目录在 `shared/games.ts`，封面放在 `public/covers/<id>.webp`（16:9），来源写进 `ASSETS.md`。平台只负责展示和跳转，不引用任何游戏的代码。
- 正式环境只有这一个平台 Worker：不开 workers.dev（它绕过网关限速）、不建测试 Worker。测试全在本地：`npm test`（vitest 跑在本地 workerd 里）、
  `npm run dev:api`（wrangler dev + 本地 D1）。
- 测试期是邀请制：注册默认关着，管理员可在 `/admin` 随时开关（D1 `settings`；`vars.REGISTRATION` 是紧急总闸，见 `worker/api/core/settings.ts`），账号由管理员在 `/admin` 或用
  `npm run admin` 建；老用户也能生成邀请码，注册关着时凭码注册（`worker/api/account/invite-codes.ts`，15.20）。没登录的访客在首页一个 `/api` 请求都不发，只有打开登录页时问一次 `/api/me`。
- 管理接口 `/api/admin/*` 的两种认证（Bearer 令牌、管理员会话）和各自能做什么写在 `worker/api/ops/admin.ts` 开头；改权限时同步改那里和测试。
- 改界面后跑相关的那段冒烟（`npm run smoke -- --only=<段>`，分段见 `docs/smoke.md`；改布局跑 `devices`），控制台零报错、没有意料外的 4xx/5xx，并亲自看截图。
  新 CSS 限定在所属页面的根节点下；颜色只用 `src/styles.css` 的变量（`docs/style.md`）。
- 冒烟和 `npm run dev:api` 固定用 5181，冒烟启动前查端口，被占就失败。
- 每次改动同步更新相关文档：`README.md`（功能一节每条一两句）、`docs/pages.md`（页面怎么排的细节）、`docs/style.md`、仓库根 `docs/platform-backend.md`（接口、写入行数）、`CHANGELOG.md`（带日期的版本段，条目分"新增 / 改动 / 修复 / 整理"四类，没有的类不写）。
  文档写现状，过程和历史只进 CHANGELOG。
- 命令：`npm run dev`（界面，5180）、`npm run dev:api`（接口，5181）、`npm test`、`npm run lint`、`npm run smoke`、`npm run build`、`npm run preview`（4180）、
  `npm run deploy`（单独部署平台用，比如 Deploy to Cloudflare 按钮；本仓库的正式站怎么发版见根目录 `CONTRIBUTING.md`）。
- 测试夹具里的站点用保留的示例域名（`game.example.com`、`game.test`），不写正式域名。
- 平台接口只增不改。游戏依赖平台，平台不依赖任何游戏，所以带接口变更的发布顺序是先迁移、再平台、后游戏。

## 交付前

- `npm run lint` 零报告（`biome.jsonc` 是全仓统一的规则，原样从模板复制，不在模块里改）；确实有意这么写的，在那一行上面写 `// biome-ignore lint/<组>/<规则>: <理由>` 放行。
- `npm test` 和 `npm run build` 原样跑完：`npm test` 先查 test 的类型（test 的 tsconfig 没有 DOM，单测只能引不碰 DOM 的文件，纯函数放 `*-logic.ts`），`npm run build` 查界面和 worker 的类型；只跑 vitest 不查类型，删掉、挪走的类型导出它照样跑过。
- 改界面的跑相关的冒烟段，改布局跑 `noscroll`（重叠、裁字都要 0）。
- 动到多个页面共用的布局（`Fit.tsx` 的 `Paged`/`PageTabs`、`.page__body`、卡片高度）时，`noscroll` 和 `phone` 两段必须跑：矮屏和手机最容易放不下（0.39.13–0.39.15 的卡片高度改动就在 844×390、360×640 上放不下）。

## 写接口的规矩

- 每个接口都要有测试：正常路径、错误码、`rowsWritten()` 等于 `docs/platform-backend.md` 7.2 的写入行数；写请求测 CSRF（缺 `X-Arcade` 或 Origin 不对 403）、
  限流 429（被拒的请求写 0 行）。改了写入行数就同步改 7.2。
- 请求体的字段只经 `worker/api/lib/body.ts` 的读取器读（`str`、`count`、`gameId`、`match`、`oneOf`、`scoreOf` 等），不在接口里手写 `typeof`：形状不对一律 400 `bad_request`，分数不对一律 422 `invalid_score`。
- D1 一律经 `worker/api/lib/db.ts` 的 `Db` 调用，指定写入类别（6.6 的分类预算），不直接用 `env.DB`（计量会漏）。
- 限流计数用 `ratelimit.ts` 的带条件 UPSERT（超限 0 行写入）；匿名接口先过内存令牌桶。
- 密码、恢复码、会话令牌、IP 只存哈希；日志不记 cookie、请求体；错误日志只记路径和错误类型。
- 上限和阈值放 `worker/api/lib/config.ts` 的默认值里，线上要调就改 `wrangler.jsonc` 的 `vars.LIMITS`，不在代码里散落数字。
- 迁移只增不删：加新文件 `migrations/000N_*.sql`，不改已合并的迁移。
