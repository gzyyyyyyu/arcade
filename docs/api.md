# 平台接口约定（`/api/*`）

> 给平台和游戏的开发者参考。接口**只增不改**（`platform/AGENTS.md`）：已上线的字段不改含义、不删除，新能力加新字段或新路径，所以路径里不带版本号。不存在的路径返回 404 `not_found`。
> 括号里的版本号是该接口所在的平台版本。数字（限流、预算）以 `platform/worker/api/lib/config.ts` 为准，本文和代码不一致时改本文；限流见 15.6，写入行数的来历见 [data.md](data.md) 7.2。
> 设计和理由：账号和防刷见 [accounts.md](accounts.md)，云存档、钱包、战绩见 [platform-backend.md](platform-backend.md) 第 5 节，写入预算见 [cost-guard.md](cost-guard.md)。
> 从 platform-backend.md 拆出来，**节号沿用原来的第 15 节（15.1–15.22）**，别处写的「platform-backend.md 15.x」就是这里的 15.x；文中不带文件名的其他节号按 platform-backend.md 开头的对照去找。

## 15. 接口约定（`/api/*`）

### 15.1 通用规则

- **格式**：请求和响应都是 JSON（`content-type: application/json`），UTF-8；字段名 camelCase；时间是 Unix 毫秒整数。
- **身份**：凭 cookie `__Host-sid`（5.1）。唯一的例外是 `/api/admin/*` 可以用 `Authorization: Bearer <ADMIN_TOKEN>`（5.8、15.7），别的接口不认 `Authorization` 头。
- **只认站点主机名**：请求的 Host 必须是 `SITE_ORIGIN` 的主机名，否则 404 `not_found`。
- **写请求**（POST、PUT、PATCH、DELETE）必须带 `X-Arcade: 1`，且 `Origin` 等于站点地址（浏览器同域 `fetch` 自动带）。不开 CORS，`OPTIONS` 返回 405。这只挡浏览器里的跨站请求（5.2）。
- **请求体上限**：默认 8 KB；`PUT /api/saves/…` 为 52 KB（48 KB 数据加外层，在 keepalive 的 64 KB 之内）。先看 `content-length`，没有时边读边数，超了立即 413。整个请求体嵌套最多 64 层，超了 400 `bad_request`（解析前数括号）。
- **响应头**：所有 `/api` 响应带 `cache-control: no-store`。
- **检查顺序**（便宜的在前，5.4；按 `platform/worker/api/router.ts` 的实际顺序）：
  1. Host → 404；方法和路径白名单 → 404 / 405；
  2. 熔断档位、停增长档要停的接口和这个接口所属类别的写入预算（内存里，6.6）→ 503 `busy`（退出在任何档位都照做）；
  3. 写请求的 `X-Arcade`、`Origin` → 403 `forbidden`；
  4. 路径参数（`gameId` 白名单 404 `unknown_game`、槽名 422 `invalid_slot`、榜单 ID / 好友码 / 用户 id 格式 404 `not_found`），在读请求体和会话之前校验，不碰 D1；
  5. 请求体大小 → 413；JSON 解析和嵌套层数 → 400；
  6. 读会话（D1 读）→ 要登录的接口 401 `unauthorized`；
  7. 接口内部依次：预期账号 `userId`（格式不对 400，和会话不一致 409 `wrong_user`）→ 其余字段的类型和内容（400 / 404 / 422）→ isolate 内存限流 → 持久限流计数（超限 0 行写入，429）→ 业务。

  所以没登录或会话失效时，哪怕请求体字段格式不对，回的也是 401（匿名接口不读会话）。第 2 步的 503 先于 `wrong_user`，每天次数用完的 429 在 `wrong_user` 之后；存档在停增长档的 503 是接口内部判断的，排在 `wrong_user` 之后，交分的停增长档在第 2 步。
- **错误响应**：`{"error": "<错误码>", "message": "<给玩家看的中文>"}`；429 另带 `retryAfter`（秒）和 `Retry-After` 头。调用方按 `error` 判断，`message` 只拿来显示。

| HTTP | `error` | 什么时候 |
|---|---|---|
| 400 | `bad_request` | 不是 JSON、缺字段、类型不对；预期账号 `userId` 格式不对；读榜的 `scope` 不对 |
| 400 | `bad_amount` | 管理员加减筹码的数不是非零整数，或超过单次上限（响应带 `max`） |
| 400 | `invite_invalid` | 邀请码不对、已用、过期或撤回（不说是哪种；只写了试码计数 1 行） |
| 401 | `unauthorized` | 要登录但没登录，或会话已失效（同时清掉两个 cookie）；管理接口的 Bearer 令牌不对 |
| 401 | `bad_credentials` | 用户名、密码或恢复码不对（不说是哪个不对） |
| 403 | `forbidden` | 写请求缺 `X-Arcade: 1` 或 `Origin` 不对 |
| 403 | `registration_closed` | 注册已关闭且没带邀请码（写 0 行） |
| 403 | `not_admin` / `admin_protected` | 管理接口，登录了但不是管理员 / 会话管理员动管理员账号或建管理员 |
| 403 | `not_friend` | 邀请：不是好友、屏蔽了、对方不存在、叫自己，一律这个 |
| 404 | `not_found` | 没有这个接口，或要找的对象不存在（好友码、好友请求、屏蔽对象、不认识的榜） |
| 404 | `unknown_game` | `gameId` 不在平台的游戏白名单里 |
| 405 | `method_not_allowed` | 路径对、方法不对 |
| 409 | `username_taken` / `invite_used` / `quota_full` | 用户名已占用 / 邀请码被别人先用了 / 邀请名额用完（带 `quota`） |
| 409 | `conflict` | 存档版本冲突，响应里带 `current` |
| 409 | `wrong_user` | 带的预期账号和会话不一致，"账号换过了，刷新一下页面"；不带 `current`，写 0 行 |
| 409 | `cannot_delete_self` / `last_admin` | 会话管理员删自己 / 删最后一个管理员 |
| 409 | `relief_used` / `relief_not_needed` / `no_change` | 领补给：今天领过了 / 筹码还够用；管理员加减筹码什么也没变（带 `wallet`） |
| 409 | `full` | 挑战已有 100 个人交了 |
| 413 | `too_large` / `quota_exceeded` | 请求体或单个存档槽超限 / 存档每人合计 256 KB 或每个游戏 8 个槽超了 |
| 422 | `invalid_username`、`weak_password`、`invalid_display_name`、`reserved_display_name`、`invalid_slot`、`invalid_target` | 字段格式对但内容不合规 |
| 422 | `limit_reached` / `unblock_first` | 待处理好友请求或好友数到上限 / 想加的人是自己屏蔽了的 |
| 422 | `invalid_board`、`invalid_score` | 交分的榜单 ID 不收；分数不是安全整数（含不是数字）、超过上限（排行榜 ±1e12）。所有收分数的接口（排行榜、挑战）一样 |
| 429 | `rate_limited` / `too_soon` | 超了限流，带 `retryAfter` / 同一个存档槽 10 秒内重复写 |
| 500 | `internal` | 服务端出错（日志里记接口和错误码，不记请求体） |
| 503 | `busy` | 这一类的写入预算用完、停增长档的注册 / 交分 / 新建存档槽 / 存档覆盖变大、只读档的写接口（和查好友码），或停服档的所有接口（6.6） |
| 503 | `unavailable` | D1 一时出错或读不到全站计量；带 `retryAfter`（2、5 或 10 秒）。和 `busy` 不同，过几秒就好 |

- **401 清 cookie**：只要请求带着 `__Host-sid` 却没有有效会话（改了密码、退出其他设备、过期），**所有要登录的接口**的 401 都附上两个清 cookie 的 `Set-Cookie`。没带 `__Host-sid` 的 401 不发。
- **客户端约定**：返回的不是 JSON（Cloudflare 或网关的出错页）按"连不上"处理，断网同理；**只有接口明确回了 `error: "busy"` 才算停服**（`unavailable` 按"连不上、过几秒再试"）。连不上时不要放登录入口、也不要叫人去登录（5.7）。

**用户对象**（下文的 `user`）：`{"id", "username", "displayName", "friendCode", "avatar": null, "catchphraseId": null, "createdAt"}`，管理员多 `"isAdmin": true`，`showWhere` / `showFeed` / `showMates` 三个开关。
只返回给本人；给别人看的是**公开资料** `{"userId", "displayName", "avatar"}`，不含用户名（5.6）。下文"谁能调"里的"平台页"是**界面约定**，服务端拦不住游戏页调用（5.2）。

### 15.2 账号

| 接口 | 谁能调 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|---|
| `GET /api/me` | 任何人；游戏页可调 | — | 200 `{"user": user 或 null, "service": "ok" \| "readonly", "saves": "ok" \| "paused", "registration": "open" \| "closed", "notice": {"text", "at"} 或 null, "hiddenDefault"?: [游戏 id]}`；`user` 里有 `gamePrefs: {"show", "hide"}`（15.21） | 503 `busy`（停服档） | 0；顺带的 `last_seen_at` 每小时 ≤ 1、续期每 30 天 1 |
| `POST /api/auth/register` | 未登录 | `{"username", "password", "displayName", "inviteCode"?}` | 201 `{"user", "recoveryCode"}`，设两个 cookie；带普通码注册的人和邀请人自动成为好友 | 403 `registration_closed`；400 `invite_invalid`；409 `username_taken` / `invite_used`；422 同 5.1；429 | 9（带普通码 15、长期码 13；关闭时 0） |
| `POST /api/auth/login` | 任何人 | `{"username", "password"}` | 200 `{"user"}`，设两个 cookie | 401 `bad_credentials`；429（含用户名被暂时锁住） | 成功 6（+1 重新哈希）；失败 1–2；超限 0 |
| `POST /api/auth/logout` | 任何人（没登录也 204，幂等） | `{}` | 204，清两个 cookie | — | 1（没有会话时 0） |
| `POST /api/auth/recover` | 任何人 | `{"username", "recoveryCode", "newPassword"}` | 200 `{"user", "recoveryCode": 新码}`，其他会话全部失效，给当前设备设新 cookie | 401 `bad_credentials`；422 `weak_password`；429 | 6 + 原有会话数 |
| `PATCH /api/me` | 登录；平台页 | `{"displayName"?, "showWhere"?, "showFeed"?, "showMates"?}`，至少一样 | 200 `{"user"}` | 422 `invalid_display_name` / `reserved_display_name`；429（改昵称每天 10 次；只改开关的和隐藏游戏共用每天 60 次） | 2 |
| `PUT /api/me/games` | 登录；平台页 | `{"hidden": [游戏 id]}`：我要隐藏的（15.21） | 200 `{"user", "hiddenDefault"}` | 400（不是数组、没登记的 id）；429（每天 60 次） | 2 |
| `POST /api/account/password` | 登录；平台页 | `{"currentPassword", "newPassword"}` | 204；其他会话失效，当前设备换新令牌 | 401 `bad_credentials`；422；429；503 `busy` | 4 + 会话数 |
| `POST /api/account/recovery-code` | 登录；平台页 | `{"currentPassword"}` | 200 `{"recoveryCode"}`，旧码作废 | 401；429；503 | 2 |
| `POST /api/account/logout-others` | 登录；平台页 | `{"currentPassword"}` | 204 | 401；429；503 | 1 + 其他会话数 |
| `POST /api/account/delete` | 登录；平台页 | `{"currentPassword"}` 或 `{"recoveryCode"}` | 204，清两个 cookie，数据按 7.3 删除 | 401；429 | 见 7.2 |

- `GET /api/me` 没带 `__Host-sid` 时直接返回 `user: null`（档位取内存里的），不碰 D1；带了但会话无效同样返回 `null` 并清 cookie。`saves` 为 `paused` 表示存档预算用完或停增长档，游戏暂停云同步。
  `registration` 在任何情况下都返回（关闭是默认值），取自 D1 开关并缓存 30 秒（5.8）；游戏登录闸门就是调这个接口（15.8）。`notice` 是管理员发的大厅公告、`hiddenDefault` 是管理员设的默认隐藏的游戏，都只在登录时有；注册开关、公告、默认隐藏一条查询一起读、每个 isolate 缓存 30 秒，管理员改了最多 30 秒生效。
- 登录先查用户名有没有被暂时锁住，再算 PBKDF2，被锁时不花 CPU；找回不按用户名锁（5.1）。再验证接口的密码错误记在 `reauth:fail:<userId>`，连续 5 次后同样要等，不和登录失败共用（5.2）。
- 注销用 POST 而不是 DELETE：有些客户端和代理会丢掉 DELETE 的请求体。恢复码格式 `XXXXX-XXXXX-XXXXX-XXXXX`（Crockford base32）。

### 15.3 云存档

| 接口 | 谁能调 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|---|
| `GET /api/saves/<gameId>[?userId=<id>]` | 登录；游戏页可调 | `userId` 可选 | 200 `{"saves": [{"slot", "rev", "updatedAt", "data"}]}`（没有存档时是空数组） | 401；404 `unknown_game`；400（`userId` 格式不对）；409 `wrong_user` | 0 |
| `PUT /api/saves/<gameId>/<slot>` | 登录；游戏页可调（含 `fetch keepalive`） | `{"baseRev": 0 或当前 rev, "data": 任意 JSON, "userId"?: 预期账号}` | 200 `{"rev": 新 rev, "updatedAt"}` | 409 `conflict` / `wrong_user`；400；413 `too_large` / `quota_exceeded`；422 `invalid_slot`；429 `too_soon` / `rate_limited`；404；503 `busy`（停增长档） | 成功 2；409、`too_soon`、`quota_exceeded`、停增长档覆盖变大为 1（只有 `save:<userId>` 计数）；格式错、`wrong_user`、`too_large`、`rate_limited`、停增长档新建槽为 0 |

- `baseRev` 为 0 表示新建；云端已有这个槽时也按冲突处理（停增长档例外：直接 503）。冲突响应 `{"error": "conflict", "current": {"rev", "updatedAt", "data"}}`，游戏合并后用 `current.rev` 重交；`baseRev` 大于 0 但云端没有这个槽时 `current` 为 `null`，游戏改用 `baseRev` 0 重交。
  `rev` 从 1 开始，每次成功加 1。`data` 按序列化后的 UTF-8 字节数算，≤ 48 KB。429 `too_soon` 带 `retryAfter` 和 `Retry-After`。
- **判断顺序**（一条 SQL 没写进去时再读一次判断）：版本不对 409 → 10 秒内 `too_soon` → 停增长档覆盖变大 503 → `quota_exceeded`。`GET` 不做 `last_seen_at` 写入，所以游戏要另外调 `/api/me`（5.5）。
  没有按单个槽读的 GET，也没有删除单个槽的接口（注销会删光）。

**预期账号 `userId`**（为什么要它见 5.5）：
- **可选**，不带就和以前一样，老游戏不用改。值填 `/api/me` 返回的 `user.id`。`PUT` 只认请求体里的 `userId`；`GET` 只认查询参数 `?userId=`。
- **和会话不一致**：409 `wrong_user`，在接口的第一步判断，**写 0 行、读 0 行（不读存档表），不计数，也不返回任何存档数据**。
- **格式不对**：400。合格的是 1–64 个 `[A-Za-z0-9_-]` 的字符串。GET 另有几种也算格式不对：带了多个 `userId`、`?userId` 没有等号或值为空、参数名大小写不同（`userid`、`UserId`，解码后比较），免得游戏端拼错了被悄悄当成"没带"。
- **没登录或会话失效**：路由的登录检查在前，一律 401。只读档下读存档照常，带了 `userId` 也照常判断。
- **409 有两种，必须按 `error` 区分**：`conflict`（同账号版本冲突，带 `current`，合并后重交）和 `wrong_user`（**没有 `current`**，不合并、不重试，按"换了账号"处理）。把 `wrong_user` 当成 `conflict` 去合并，就正好把账号串了。

### 15.4 好友

| 接口 | 谁能调 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|---|
| `GET /api/friends` | 登录；游戏页可调 | — | 200 `{"friends": [公开资料 + "lastSeenDaysAgo" + 在线信息（15.14）+ "together"（15.19）], "incoming": [公开资料], "outgoing": [公开资料]}` | 401 | 0 |
| `GET /api/friends/code/<code>` | 登录 | — | 200 `{"user": 公开资料, "relation": "none" \| "pending_out" \| "pending_in" \| "friends" \| "self"}`，我屏蔽了对方时多 `"blocked": true` | 404（格式不对或没找到）；429（每天 100 次）；503 `busy` | 1（`fcode`，没找到也计）；格式不对、超限 0 |
| `POST /api/friends/requests` | 登录 | `{"friendCode"}` 或 `{"userId"}`（战绩页上的"加好友"；不计查码次数） | 200 `{"status": "pending" \| "friends"}`（对方已发过请求，或两人同时互发，直接成为好友） | 404；422 `invalid_target` / `unblock_first` / `limit_reached`；429（每天 30 个） | 新请求 3；直接成为好友 2；码找不到 1；重复发或已是好友 0 |
| `POST /api/friends/<userId>/accept` | 登录 | `{}` | 200 `{"status": "friends"}` | 404（没有这条请求，或是我屏蔽了的人发的）；422 `limit_reached` | 1 |
| `POST /api/friends/<userId>/decline` | 登录 | `{}` | 204 | 404 | 1（没有这条请求 0） |
| `DELETE /api/friends/<userId>` | 登录 | — | 204（删好友，或撤回自己发出的请求；搭子战绩这一对一起删） | 404 | 1（+ 一起打过的游戏数） |
| `GET /api/blocks` / `POST /api/blocks` / `DELETE /api/blocks/<userId>` | 登录；平台页 | `{"userId"}` | 屏蔽 204（同时删好友关系或请求、搭子战绩；已屏蔽着也是 204）；解除 204 | 404；422 `invalid_target`；429（合计每天 30 次） | 屏蔽：计数 1 + blocks 1（+ 删关系 1 + 游戏数）；解除 2；已屏蔽 / 没屏蔽过 0 |
| `POST /api/me/friend-code` | 登录；平台页 | `{}` | 200 `{"friendCode"}`，旧码和旧链接立刻失效 | 429（每天 3 次） | 3 |

路径里的 `<userId>` 是 22 位 base64url，格式不对回 404、不碰库；`<code>` 按 5.6 归一化。`lastSeenDaysAgo` 0 表示今天来过（北京时间日历天），不返回精确时间；好友按最近来过排前面。
被屏蔽的人发请求的表现见 5.6。

### 15.5 排行榜

简单版，不防作弊（9.2）。代码 `platform/worker/api/scores/boards.ts`，写入记"排行榜"类预算（6.6）。

| 接口 | 谁能调 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|---|
| `POST /api/scores` | 登录；游戏页可调 | `{"gameId", "boardId", "score", "userId"?, "tally"?}`（`tally` 见 5.11，不合格忽略） | 200 `{"best": 最好成绩, "improved": true}`（新纪录）或 `{"best": 原来的, "improved": false}`（没比原来好，含相等） | 400；404 `unknown_game`；409 `wrong_user`；422 `invalid_board` / `invalid_score`；429（每天 200 次）；503 `busy` | 新上榜或刷新纪录 3；没更好 1；各种被拒 0；带合格的 `tally` 时各加 1（被拒的不加） |
| `GET /api/boards/<gameId>/<boardId>?scope=all\|friends` | 登录；游戏页可调 | `scope` 默认 `all` | 200 `{"entries": [{"rank", "displayName", "avatar", "score", "isMe"}], "me": {"rank", "score"} 或 null}` | 400（`scope` 不对）；401；404 `unknown_game` / `not_found` | 0 |

- **榜单 ID**：每日榜 `daily-YYYY-MM-DD[-v<n>]`，日期必须是北京时间的昨天、今天或明天；一天几个每日榜的游戏（`games.ts` 的 `daily` 写了子榜）是 `daily-YYYY-MM-DD-<子榜>[-v<n>]`，子榜要登记过（`[a-z][a-z0-9]{0,15}`，不能像版本号 `v2`），
  写了子榜的游戏不再收不带子榜的每日榜，没写子榜的游戏不收带子榜的；
  每周榜 `week-<YYYY>-W<ww>-<子榜>[-v<n>]`（比如 `week-2026-W44-tide`），按**北京时间的 ISO 周**（周一 0 点换周，年份按这周的周四算），子榜要在 `games.ts` 该游戏的 `weekly` 里登记，写法同每日子榜；
  交分只收这周的，跨周一 0 点打完的一局在周一 0 点后一天内还能交上周（和每日榜同样留一天），别的周 422 `invalid_board`。算周的函数在 `platform/shared/weekly.ts`，排行页和接口共用；
  固定榜要在 `games.ts` 该游戏的 `boards` 里登记，名字不以 `daily`、`week` 开头。读榜时每日榜、每周榜不限日期（过期还没删的照样能读），固定榜同样要登记过。
- **分数**：安全整数，|score| ≤ 1e12；越高越好，越低越好的游戏交相反数。**每天 200 次**：`score:<userId>`，所有游戏、所有榜合计，没刷新纪录的也算，超了 429、写 0 行。
- **预期账号 `userId`**：规则同 PUT 存档，只认请求体：不一致 409 `wrong_user`，在计数之前判断；格式不对 400。读榜不带 `userId`（读到的只拿来显示，用错账号读一次也不会串号）。
- **读榜返回**：`entries` 是前 50 名，同分同名次（1、1、3），同分时先达到的排前面；只给昵称、头像、分数，**不给用户名，也不给 userId**。`me` 是我的名次和分数，不在前 50 也给，没交过分时是 null；
  全站范围里比我高的人最多数到 1 万个（`boardRankCountMax`），再多时 `me.rank` 是 null，界面显示"1 万名以后"。我和第 50 名同分但达到得比他晚时，`me.rank` ≤ 50 而 `entries` 里没有我，界面在榜单下面单独显示一行"我：第 X 名"。
  `friends` 范围只算我和已接受的好友。读的行数和榜的大小无关（好友榜从好友名单出发按主键逐个查，`CROSS JOIN` 固定连接顺序）。
- **给游戏的约定**：一局结束出结算画面时交一次，不要每一步都交；200 显示"新纪录"或"最好成绩 X"；429 提示"今天的成绩先记到这里"，不重试；503 `busy` 提示"排行榜暂停，稍后再来"，不重试；
  409 `wrong_user` 提示刷新页面，不重试；连不上提示"没连上，成绩没记上"，可以给"重试"按钮，不自动循环；401 是没登录（登录闸门会先挡住）；422 或 404 是游戏代码的错，开发时修掉。不需要游戏 Worker 参与，浏览器直接调同域 `/api`。

### 15.6 限流总表

键里的 `<ip>` 是 5.1 的 IP 哈希；"天"按 UTC 算。持久计数一律用带条件的 UPSERT：**超限被拒的请求写 0 行**；每新建一行，日后清理再算 1 行（5.4、7.2）。数字以 `config.ts` 为准。

| 键 | 窗口 | 上限 | 超了 | 每次写 |
|---|---|---|---|---|
| isolate 内存令牌桶 | 1 分钟 | 每个 IP 的匿名接口 10 次；注册先过它再读开关 | 429，不碰 D1 | 0 |
| 浏览器报错（另一个内存令牌桶） | 1 分钟 / 5 分钟 | 每个 IP 10 条；同一签名每个 isolate 5 分钟记 1 次（第 16 节） | 429 / 静默 204 | 0 |
| `reg:ip:<ip>` / `reg:all` | 天 | 20 次注册尝试（通过格式检查的才算）/ 300 | 429 | 1 |
| `login:ip:<ip>` | 1 小时 | 30 次尝试（成败都算） | 429 | 1 |
| 登录全站（随计量上报） | 1 小时 | 300 次，只算用户名存在的 | 429 | 0 |
| `login:fail:<username>` | 24 小时 | 只在用户名存在时记，算密码之前先占一次（对了清零，锁着时 0 行、429）；连续失败 5 次后，每次等 30 秒 × 2^(失败数 − 5)，最长 1 小时；登录成功或找回成功清零 | 429 | 失败 1（锁着时 0）；清零 1 |
| `rec:ip:<ip>` / 找回全站（随计量上报） | 1 小时 | 10 次 / 100 次（只算用户名存在的） | 429 | 1 / 0 |
| `inv:ip:<ip>` | 1 小时 | 10 次试邀请码（成败都算）；不设全站上限（15.20） | 429 | 1 |
| `reauth:fail:<userId>` | 24 小时 | 再验证的密码错误，规则同 `login:fail` | 429 | 失败 1（锁着时 0）；成功清零 1 |
| `acct:<userId>` | 天 | 改密码、换恢复码、退出其他设备合计 10 次（成功的才算） | 429 | 1 |
| `profile:<userId>` | 天 | 10 次改昵称或开关 | 429 | 1 |
| `prefs:<userId>` | 天 | 60 次改隐藏游戏的偏好（15.21） | 429 | 1 |
| `save:<userId>` | 天 | 500 次 PUT（含冲突、`too_soon`、`quota_exceeded` 和停增长档覆盖变大的 503） | 429 | 1 |
| 同一个存档槽 | 10 秒 | 1 次 | 429 `too_soon` | 0（看行里的 `updated_at`） |
| `freq:<userId>` | 天 | 发 30 个好友请求（撤回、被拒都不退还；重复发、已是好友不计） | 429 | 1 |
| 待处理请求 / 好友数 | 当前 | 发出的、收到的各 20（我屏蔽了的人发来的不占）/ 好友 200 | 422 `limit_reached` | 0（数现有行，条件写进 SQL） |
| `fcode:<userId>` / `fcnew:<userId>` | 天 | 100 次查好友码（没找到也计）/ 3 次换好友码 | 429 | 1 |
| `block:<userId>` | 天 | 屏蔽和解除合计 30 次 | 429 | 1 |
| `score:<userId>` | 天 | 交分 200 次 | 429 | 1 |
| `chal:<userId>` / `react:<userId>` | 24 小时 / 天 | 发起挑战 20 个 / 赞和扔道具 100 次 | 429 | 1 |
| 邀请（`invites` 表本身） | 24 小时 | 每人 50 条、叫同一个好友至少隔 1 分钟（写在插入条件里） | 429 | 0 |
| `admin:fail:<ip>` / `admin:fail:all` | 1 小时 | 管理接口令牌的失败名额 10 次 / 全站 30 次；比对前先占，比对成功还回去 | 429（不比对） | 占 1；成功还 1 |
| `admin:<userId>` / `admin:token` | 天 | 每个管理员（令牌单独一份）300 次成功的写操作；列表和看设置不算 | 429 | 1 |
| 钱包写入（记在钱包行里） | 北京时间天 | 每人 1,000 次，各游戏合计；带入、兑换、领补给到了上限就停（5.9） | 带入、兑换回 `limit`；领补给 429 | 0 |
| 网关规则 | 10 秒 | 每个 IP + 机房 60 次，`/api/*` 和各游戏的开房、进房、`/api/` 请求（5.4） | Cloudflare 直接拦 10 秒，不进 Worker | 0 |
| 游戏房间进房（kit，游戏 Worker 里） | — | 每次进房调一次 `/api/me`（算平台的调用）；房间自己的额度见 4.6 | — | 0 |
| 写入分类预算（6.6） | 天 | 注册 2,700 / 登录找回 9,000 / 存档 4,300 / 好友与资料 5,000 / 账号安全 2,000（超额封顶 3,000）/ 排行榜 2,500 / 钱包 6,000 / 在线 4,000 / 监控 1,000 / 系统 3,500 行（合计 4 万） | 只停这一类，503 `busy`；账号安全类的例外见 6.6 | — |
| 全站档位（6.6） | 天 | 调用 4 万 / 6 万，D1 写 5 万 / 8 万，读 300 万 / 450 万，库 300 / 400 MB | 停增长、只读、停服，503 `busy` | 约每 50 次调用 1 |

### 15.7 管理接口

只给命令行建号工具和管理员用，认证、权限和限流规则见 5.8。两种认证都可以：Bearer 令牌（不要 `X-Arcade` 和 `Origin`），或管理员会话（写请求照常要）。
这些接口都记"账号安全"类预算；停服时都 503 `busy`；只读档下写接口 503，用 Bearer 调时读接口也 503。令牌认证本身：成功写 4 行、失败 2 行、被拒 0 行；令牌不对回 401 `unauthorized`。`<id>` 是 22 位 base64url 的用户 id，格式不对回 404。

| 接口 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|
| `GET /api/admin/users` | — | 200 `{"users": [{"id", "username", "displayName", "role", "createdAt", "lastSeenAt", "wallet"}]}`，按创建时间倒序，最多 500 条；`wallet` 是 `{"balance", "onTable", "played"}`，没有钱包时 `balance` 是 `null` | 401；403 `not_admin`；429；503 | 0 |
| `POST /api/admin/users` | `{"username", "displayName", "password"?, "role"?}` | 201 `{"user", "password"?, "recoveryCode"}`；`password` 只在服务端生成时返回；不建会话；不看注册开关，校验和注册一样 | 400；403 `admin_protected`（会话管理员建管理员）；409；422；429 | 6 |
| `POST /api/admin/users/<id>/password` | `{"password"?, "newRecoveryCode"?: boolean}` | 200 `{"password"?, "recoveryCode"?}`；这个人的所有会话失效；失败计数清零 | 403 `admin_protected`；404；422；429 | 密码 1 + 会话 n + 失败计数 0–2 + 每日计数 1（+1 换恢复码） |
| `POST /api/admin/users/<id>/delete` | `{}` | 204；和本人注销删得一样干净（7.3） | 403 `admin_protected`；404；409 `cannot_delete_self` / `last_admin` | 同注销 + 1 |
| `GET` / `POST /api/admin/settings/registration` | `{"open": boolean}` | 200 `{"open", "switchOpen", "forcedOff", "updatedAt"}`：`open` 是实际开没开，`switchOpen` 是 D1 开关上记的值，`forcedOff` 表示总闸关着；POST 总闸关着时照样记下 | 400；401；403；429；503 | GET 0；POST 2 |
| `GET` / `POST /api/admin/settings/notice` | `{"text"}`，空字符串是撤下 | 200 `{"notice": {"text", "at", "by"} 或 null, "max": 120}`；换行和连续空白并成一个空格；本 isolate 的 `/api/me` 马上变，别的最多晚 30 秒 | 400（超过 120 字，带 `max`） | GET 0；POST 2 |
| `GET` / `POST /api/admin/settings/wallet` | 要改的几条，如 `{"reliefTo": 3000}` | 200 `{"rules", "defaults", "range", "log", "updatedAt"}`：`rules` 是 `{"reliefTo", "winUnits", "newBalance", "adminAdjustMax", "exchangeCap"}`，`log` 是最近 20 次改动；改了即时生效（本 isolate 马上，别的最多晚 30 秒）；没有真的变化不写 | 400（不是整数、超出 `range`，整个拒，带 `field` 和 `range`） | GET 0；POST 2；没变化 0 |
| `GET` / `POST /api/admin/settings/invites` | `{"userQuota"?, "adminQuota"?, "ttlDays"?, "perDay"?}` | 200 同钱包规则的形状（15.20） | 400（超出范围） | GET 0；POST 有变化 2 |
| `POST /api/admin/users/<id>/invite-quota` | `{"quota": 整数 0–1000 \| null}`（null 恢复默认） | 200 `{"quota", "custom"}` | 404 | 2 |
| `GET /api/admin/invite-codes?status=unused\|used\|multi\|all` / `POST /api/admin/invite-codes/<id>/revoke` | — / `{}` | 全站最近 100 条（还能用的才给 `code`；每条有 `uses`、`maxUses`，长期码的 `expiresAt` 不过期时是 null、`users` 是用它注册的人）/ 204；名额用完、已撤回的 404 | 401；403 | 0 / 2 |
| `POST /api/admin/invite-codes` | `{"maxUses"?: 2–10000（默认 100）, "days"?: 1–365 \| null（默认不过期）}` | 201 `{"id", "code", "link", "maxUses", "expiresAt"}`：建一个长期码（15.20），记在当前管理员名下 | 400；403 `session_required`（令牌不能建） | 4 |
| `POST /api/admin/invite-codes/<id>/uses` | `{"maxUses": 2–10000}`（不小于已经用掉的次数） | 200 `{"id", "maxUses"}`：改长期码能用几次，只改没撤回的长期码 | 400；403 `session_required`（令牌不能改）；404（不存在、不是长期码、已撤回）；409 `below_used`（带 `used`） | 2 |
| `GET` / `POST /api/admin/settings/games` | `{"hidden": [游戏 id]}` | 200 `{"hidden"}`：默认隐藏的游戏（15.21），本 isolate 马上变，别的最多晚 30 秒 | 400（没登记的 id） | GET 0；POST 2 |
| `GET /api/admin/play-tally?days=N` | — | 200 `{"from", "to", "rows": [{"game", "variant", "mode", "tier", "n", "dur": {桶: 局数}, "outcome": {桶: 局数}}]}`，北京时间最近 N 天（1–90，默认 30，含今天）按游戏、玩法、mode、档位汇总（5.11），局数多的在前 | 400；401；403 | 0 |
| 钱包相关 `GET /api/admin/wallet-stats`、`wallet/<用户名>`、`POST wallet/adjust`、`GET wallet-adjustments`、`GET overview` | 见 15.9 | | | |

命令行建号工具对应 `list`、`create`、`reset`、`registration open|close|status`（5.8）。

### 15.8 游戏登录闸门的调用约定

游戏要登录才能进。游戏 Worker 只在**首页的导航请求**上，通过服务绑定 `ARCADE` → `arcade` 问平台"这个人登录了没有"（`worker/gate.ts` 是掼蛋的实现，kit 提供 `loginGate`）：

```ts
const res = await env.ARCADE.fetch('https://<站点>/api/me', {   // 主机名就是 SITE_ORIGIN 的主机名
  headers: { cookie: request.headers.get('cookie') ?? '', 'cf-connecting-ip': request.headers.get('cf-connecting-ip') ?? '' },
});
```

- **判定**：200 且 `body.user` 不为 `null` → 放行；200 且 `user` 为 `null` → 302 到 `/login?from=<游戏id>`（要带着查询回来，比如房间码，用 `/login?next=<encodeURIComponent(路径 + 查询)>`，5.7）；
  其他状态码、不是 JSON、超过 3 秒、绑定不存在 → 回 503 页（**fail-closed**，宁可暂时谁都进不去，也不放行没受邀的人）。
- **只拦首页三个路径**：`/games/<id>`、`/games/<id>/`、`/games/<id>/index.html`（`wrangler.jsonc` 的 `assets.run_worker_first`）。js、图片等资源不经过 Worker。
- **只转发两个头**：整串 `Cookie`（平台只读 `__Host-sid`）和 `cf-connecting-ip`。不用带 `Origin` 和 `X-Arcade`（GET 不检查）。地址的主机名必须是站点主机名，别的写法回 404。
- 平台 `/api/me` 续期或清失效会话时下发的 `Set-Cookie`，闸门在放行和跳登录时原样带回浏览器，平台不可用（503）时不带；否则只玩游戏、不回平台页的人 cookie 到期不续。
- 平台停服（`API_MODE=off` 或计量到停服档）时回 503，游戏应回 503 页；只读档回 200，玩家照常放行。每次闸门检查算平台的 1 次调用；没带 cookie 时不碰 D1。
- 游戏侧开关 `GATE`：`off` 以外的任何值（包括没配）都按 `login` 处理，配错时同样不放行；本站部署时由 `deploy.mjs` 注入 `GATE: "login"`（[new-game.md](new-game.md) 第 4 节）。
- **联机房间进房也走这个约定**（`acceptJoin` / `acceptCreate`，5.3）：同样只转发两个头、3 秒超时、fail-closed，但把"平台不可用"和"没登录"分开报（进房 1013 / 4401，开房 503 / 401）。每次进房算平台 1 次调用。
- **同一个绑定上的 RPC**：平台的默认入口是 `WorkerEntrypoint`，`ARCADE` 绑定除了 `fetch` 还能调 `blockedAmong(userIds)`（好友房聊天用，`packages/arcade-kit/docs/chat.md`）：
  回这几个人之间的屏蔽关系 `[[屏蔽的人, 被屏蔽的人], …]`。`userIds` 去重、不像用户编号的忽略，最多 9 个（超过回 `[]`、不查）；只读，一条查询，一行不写；停服或出错回 `[]`、不抛异常，房间退回只用本地屏蔽。
  `/api` 里没有这条路（浏览器拿到了就能试出谁屏蔽了自己）。旧平台、单独部署的游戏没有这个方法，游戏要当它可能不存在。
  入口改成类以后 RPC 能调到原型上的每个公开方法，所以定时清理 `scheduled` 写成实例字段（RPC 只认原型上的方法，cron 照常找得到它），经 RPC 只露出 `fetch` 和 `blockedAmong`，测试锁住了原型上的方法名（`platform/test/blocked-among.test.ts`）。

### 15.9 钱包

浏览器只有下面两个接口加管理页的接口；带入、结回、放弃、兑换只有游戏的服务端经 RPC 能调（5.9），`/api` 里没有这几条路（404）。前两个记"钱包"类预算，管理接口记"账号安全"类。

| 接口 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|
| `GET /api/wallet` | 要登录 | 200 `{"wallet", "tiers", "reliefTo", "winUnits", "playing", "ledger", "week"}`。`wallet` 是 `{"balance", "stakes": [{"game", "ref", "tier", "amount", "mode", "at", "until"}], "canRelief", "writesLeft", "caps": {"<game>": {"net", "cap"}}, "fresh"}`（`fresh: true` 是还没有钱包，看到的是新号的 10,000）；`tiers` 是各档一份多少；`ledger` 是自己最近 30 笔进出；`week` 是本周各游戏的净赢；`playing` 是北京时间今天各游戏带筹码上过桌的人数（只有人数，每个 isolate 缓存 10 分钟） | 401；503 | 0；有到期退回时 1（只读档不写） |
| `POST /api/wallet/relief` | `{}`，要 `X-Arcade` 和 `Origin` | 200 `{"wallet"}`，把余额加桌上的补到补给额 | 403；409 `relief_not_needed` / `relief_used`（带 `wallet`）；429（今天写满 1,000 次）；503 `busy` | 1；被拒 0 |
| `GET /api/admin/wallet-stats` | 管理员（5.8 两种认证） | 200 `{"days": [{"day", "total", "wallets", "grant", "relief", "games": {"<game>": {"in", "out", "back", "capped", "ex", "players"}}, "active", "reliefCount", "admin", "exchange"}]}`（`ex`、`exchange` 是兑换进来的，早期记录里没有），最近 30 天，新的在前 | 401；403 | 0 |
| `GET /api/admin/wallet/<用户名>` | 管理员会话（令牌 403） | 200 `{"user", "wallet", "log", "career", "ledger"}` | 400；401；403；404 | 0 |
| `POST /api/admin/wallet/adjust` | 管理员会话，`{"username", "amount", "note"?}`，`note` 最多 40 字 | 200 `{"wallet", "credited"}`，`credited` 是实际加减的数；没有钱包的先按新号建 | 400 `bad_amount`（带 `max`）；403；404；409 `no_change`；503 | 1；被拒 0 |
| `GET /api/admin/wallet-adjustments` | 管理员会话 | 200 `{"recent": [{"username", "displayName", "at", "amount", "note", "by"}]}`，全站最近 10 次 | 401；403 | 0 |
| `GET /api/admin/overview` | 管理员（两种认证） | 200 `{"today", "days"}`：今天现算的一份（多 `visitors`，看 `users.last_seen_at`）和今天以前最近 6 天的记录；管理页顶上的"今日概况"和 7 天趋势用它 | 401；403；429；503 | 0（读行数约钱包数 × 2 + 用户数） |

### 15.10 错误码给玩家怎么说

原则：玩家正常玩不该碰到限制；万一碰到，给一句大白话，说清楚出了什么事、怎么办，不只回一个错误码。平台页面照这张表显示（`/api` 回包里的 `message` 就是"给玩家看"这一列）；游戏收到钱包 RPC 的错误码时可以按游戏的语气改字，但"怎么办"要留着。

**钱包 RPC（游戏收到，5.9）**

| 错误码 | 什么时候 | 给玩家看 | 游戏怎么做 |
|---|---|---|---|
| `no_funds` | 余额不够这次带入 | 钱包里的筹码不够，少带一点，或者去大厅领补给 | 给"少带一点"的选项和去 `/wallet` 的链接 |
| `limit` | 今天带入、领补给合计满 1,000 次 | 今天开局太多了，明早 0 点恢复；桌上的照常结回 | 娱乐模式照常能玩 |
| `at_table` | 同一个 `ref` 补码换了档 | 这一桌带的是别的档，换一桌再开 | 一般是游戏写错了，记日志 |
| `expired` | 这一份放了超过 24 小时，已经原样退回 | 这一份放太久了，已经原样退回钱包 | 不用再结回 |
| `no_stake` | 结回、放弃时那一份不在（多半已经结过） | 这一份已经结过了 | 刷新钱包显示 |
| `busy` | 档位或钱包预算停了带入、并发冲突 | 服务器今天有点忙，先不能带筹码开局；娱乐局照常玩，明早恢复 | 结回、放弃收到 `busy` 时隔几秒静默重试（只有停服档会拒结回） |
| `bad_request` / `bad_amount` / `bad_until` / `bad_mode` / `bad_game` / `unknown_game` / `no_user` / `op_conflict` | 参数不对（程序写错；`op_conflict` 是同一个 `op` 用来做了两件事） | 出了点问题，这一份筹码没动，刷新一下再试 | 记日志，不重试 |
| `exchange_cap` | 今天这个游戏的兑换额度用完（带 `left: 0`） | 今天换满了，明早 0 点再换 | 货币留着不扣，不重试 |
| `internal` | 平台出错 | 出了点问题，筹码没动，过一会儿再试 | 结回隔几秒用**同一个 `op`** 重试一次 |
| 成功但带 `capped` | 单机实盘今天这个游戏净赢到顶 | 今天单机实盘赢够了，多出的 N 没进钱包；好友房不限 | 照常显示结果，把 N 写出来 |
| 成功但带 `statsIgnored` | 战绩小结不合格（5.10） | 不给玩家看 | 测试里修 |

**`/api`（平台页面和游戏都可能收到）**

| 错误码 | 什么时候 | 给玩家看 |
|---|---|---|
| `rate_limited`（429，带 `retryAfter` 秒） | 各种每人、每 IP 的次数（15.6） | 操作太频繁了，歇一会儿再试（N 分钟后） |
| `too_soon`（429） | 同一个存档槽 10 秒内又存 | 游戏静默稍后再存，不提示 |
| `quota_exceeded`（413） | 云存档空间、槽数满了 | 云存档空间满了，删掉不用的存档再试 |
| `busy`（503） | 全站到了只读档、某一类预算用完 | 服务器今天有点忙，先只能看、不能改，明早恢复 |
| `unavailable`（503，带 `retryAfter` 秒） | D1 一时出错、读不到全站计量 | 服务器一时连不上数据库，过几秒再试 |
| `relief_used` / `relief_not_needed`（409） | 补给今天领过了 / 钱包加桌上的还够补给额 | 今天的补给已经领过了，明早 0 点再来 / 筹码还够用：钱包加桌上的不到补给额才能领 |
| `limit_reached`（422） | 好友 200 个、待处理请求 20 个满了 | 好友或待处理的请求到上限了，先处理掉一些再加 |

### 15.11 战绩

战绩（钱包行里的 `career`，5.10）对登录的人公开；余额、桌上的筹码、操作记录不在这里。记"好友与资料"类，只读。

| 接口 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|
| `GET /api/stats/<用户 id 或 me>` | 要登录 | 200 `{"user": {"userId", "displayName", "avatar"}, "relation", "week", "games": {"<game>": {"n", "net", "wnet", "rounds", "wins", "best", "titles": [{"id", "at"}], "max", "sum"}}, "together"?}`；`relation` 同查好友码（我屏蔽了的人发来的请求按 `none` 给）；`week` 是北京时间这周一；`wnet` 不是这周的按 0 给；只列结回过的游戏；`relation` 是 `friends`、两边都开着、一起打过时多 `together`（15.19） | 401；404（没有这个人、id 格式不对、对方屏蔽了我） | 0 |

页面：`/me/stats` 是自己的，`/u/<用户 id>` 是别人的；称号名从各游戏的 `titles.json` 读，读不到显示"神秘称号"。别人的战绩页按关系给按钮：加好友、对方想加你（接受）、等对方接受、你们是好友。

页面上的“徽章”卡（街机厅徽章，`src/features/badges/badges.ts`）是纯前端：用上面的 `games` 在浏览器里现算（局数、胜场、称号数、单把最大、本周净赢等，每枚最多铜银金三档），不存、不新增接口；别人的页面显示的是他的徽章。

### 15.12 排行榜页

`/boards`：顶上一排页签，"总榜"加上每个接了钱包或登记了 `featuredDaily` 的可玩游戏（飞驰、弹里个弹两样都没有，不开页签）；游戏页签里放它的本周净赢和那一个代表性每日榜（海岛只有本周净赢）。右上角"全部 / 只看好友"一键切换，点名字进战绩页；宽度不到 600 时页签折成几行排满，不横着滑。大厅顶栏有"排行"入口，大厅首页不放排行。页签怎么算见 `platform/src/pages/boards/boards-logic.ts`。

本周净赢和称号都从钱包行里的 `career` 汇总，**不新增写入**；比的是这周带筹码的局赢了多少，不比总余额（`economy.md` 第 5 节）。记"排行榜"类（只读）。

| 接口 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|
| `GET /api/leaderboard?scope=all\|friends` | 要登录 | 200 `{"week", "scope", "boards": {"total" \| "<game>" \| "titles": {"entries": [{"rank", "userId", "displayName", "avatar", "value", "isMe"}], "me": {"rank", "value"} \| null}}, "daily": {"<game>" \| "<game>:<子榜>": "<今天的每日榜 id>" \| null}}`；每榜前 50，同分同名次；本周榜只排这周净赢 > 0 的人（输了、打平的不上榜，这时 `me` 是 null），称号榜只算拿过称号的人 | 400；401 | 0 |

- **读多少**：全站汇总每个 isolate 缓存 5 分钟（换周、换日立即重算）。缓存过期时读一遍 wallets 加 users，并按 `boards_rank` 索引的前缀查出登记了每日榜的各游戏今天的榜 id。只看好友时另外读我的好友关系，在缓存里筛。
- **每日挑战**由 `games.ts` 的 `daily` 登记驱动：`daily: true` 表示有每日榜；一天有几个每日榜的，`daily` 写子榜列表 `[{"id": "vigil", "name": "守夜"}, …]`。排行页只放 `featuredDaily` 指定的那一个，放在这个游戏的页签里；其余每日榜的数据和接口照旧，页面不列。
  读榜用 `GET /api/boards/<game>/<每日榜 id>`；每日榜 id 带规则版本，平台不知道游戏现在是第几版，所以取今天已有的榜里版本号最大的。
- **分数怎么显示由游戏给**：游戏在自己的模块里放 `/games/<id>/daily.json`（每日榜）和 `/games/<id>/boards.json`（固定榜，格式相同，按榜 id 分开写在 `boards` 下），平台在浏览器里读（文件最多 32 KB）：
  `{"note": "每天一样的行情，比谁打得好。", "score": [{"from": 100000000000, "text": "通关 · {n} 元"}, {"text": "撑了 {n} 个月"}]}`。`score` 从上往下取第一条能用的：没写 `from` 的总能用，写了的要分数 ≥ `from`；
  `{n}` 是分数减去 `from`，按千分位写；`text` 最多 30 字；`note` 可选，最多 80 字。有子榜的游戏写 `{"boards": {"vigil": {"note": …, "score": […]}}}`，某个子榜没写就用最外层的。读不到、格式不对：分数直接按千分位写，不报错。
- **复合编码的分数**：一条规则可以写 `fields` 把分数拆成几个数：`{"fields": {"d": [1e10, null], "s": [1e4, 1e6], "k": [1, 1e4]}, "fmt": {"s": "mmss"}, "text": "危险{d} · {s} · 斩 {k}"}`。
  每个字段 = ⌊(分数 − `from`) ÷ 除数⌋ mod 取模（取模写 `null` 就不取模），除数、取模都要是正整数；字段名 1–8 个小写字母（不能叫 `n`），最多 6 个；`fmt` 可选，`"mmss"` 把字段写成"分:秒"。
- **各游戏总榜**：`games.ts` 里登记的固定榜（`boards` 可写成 `{"id", "name"}`），数据和接口保留，排行页不列。
- **每周挑战**由 `games.ts` 的 `weekly` 登记驱动（`[{"id": "tide", "name": "大潮"}]`），数据和接口保留，排行页不列；
  读的一方按北京时间自己算出榜名，直接 `GET /api/boards/<game>/week-<周>-<子榜>`（不经 `/api/leaderboard`，不带版本号的那个榜）。分数写法读游戏的 `/games/<id>/weekly.json`，格式同 `daily.json`，按子榜写在 `boards` 下。

### 15.13 好友页

好友页"我的好友码"下面是一个大按钮：有系统分享（`navigator.share`）就叫"分享给朋友"（旁边留"复制链接"），没有（多半是电脑）就叫"复制我的好友链接"。用户自己关掉分享面板不算失败，别的原因分享不了就退回复制。
好友列表里点名字进对方的战绩页。请求次数和写入不变（15.4、7.2）。

### 15.14 好友在线

好友页能看到好友在不在线、在哪（"在掼蛋房里 · 3/4 人""在大厅"）。只给好友看；本人能在"我的"里关掉，关了谁都看不到（`docs/social.md` 1.2）。

| 接口 | 谁能调 | 请求 | 成功 | 错误 | 写入 |
|---|---|---|---|---|---|
| `POST /api/presence` | 登录；平台页和游戏页（kit 的 `arcade-kit/social`） | `{"place": "lobby" \| "game" \| "room", "game"?: 游戏 id, "room"?: 房间码, "seats"?: "3/4"}` | 204 | 400（`game` 不是登记的游戏、`room` 不是 6 位数字、`seats` 不是"数/数"）；401；403 | 见 7.2 |
| `GET /api/friends` | 不变 | — | 每个好友多 `"online": boolean`，在线又开着开关时还有 `"where": {place, game?, gameName?, room?, seats?}`；在线的排前面 | — | 0 |

- **节流**：位置没变（`place`、`game`、`room` 都一样，只是 `seats` 变了不算）时按 `presenceEveryMs`（110 秒）节流：不到这么久的直接 204、写 0 行；位置变了（进房、换游戏、回大厅）马上写，但同一个人最快 `presenceMoveGapMs`（10 秒）写一次。
  "变没变"和写在同一条 `UPDATE … WHERE` 里比，不先读。页面在前台每 2 分钟报一次、切回前台时补报一次，后台不报。
- **在不在线**：最近 `presenceOnlineMs`（5 分钟）内报过就是在线。**隐私开关** `users.show_where`（默认开）：关了以后好友那边 `online` 恒为 `false`、没有 `where`；报位置照常写。
- **存什么**：只在 `users` 上加三列（`presence_json`、`presence_at`、`show_where`），不建新表；`last_seen_at` 跟着一起写。
- **静默**：这个接口不该打扰玩家，"在线"类预算用完或全站只读时回 204 不写。

### 15.15 一键叫人

| 接口 | 谁能调 | 请求 | 成功 | 错误 | 写入 |
|---|---|---|---|---|---|
| `POST /api/invites` | 登录；平台页和游戏页 | `{"to": 好友的 userId, "game": 登记的游戏 id, "room": 6 位数字的房间码}` | 200 `{"id"}` | 400；403 `not_friend`；429 `rate_limited`；401；403（CSRF） | 3；被拒 0 |
| `GET /api/invites` | 登录；平台页和游戏页 | — | 200 `{"invites": [...同前], "meetups": [{"host": {"id", "name"}, "game", "at"}], "mine": {"game", "at"} 或 null, "online": 数字}`：`invites` 是给我的、没过期、没点"不了"、对方现在还是好友的，先到期的在前，最多 20 条；`meetups` 是好友约的、开局后 30 分钟以内的，先开的在前，最多 20 条（15.22）；`mine` 是我自己约的；`online` 是几个好友在线（口径同 15.14） | 401 | 0 |
| `POST /api/invites/<id>/dismiss` | 登录 | — | 204（不是给我的、点过的、不存在的也是 204，什么都不改） | 404（id 格式不对） | 1 或 0 |

- **有效期** `inviteTtlMs` 10 分钟；每人最近 24 小时 `invitesPerDay`（50）条，叫同一个好友至少隔 `inviteGapMs`（1 分钟）。这两条和"是好友、没屏蔽"写在插入的同一条语句里（`INSERT … SELECT … WHERE`），并发冲不破；不是好友的先回 403，不透露次数。
- **跳转地址**按 `/games/<game>/?room=<room>` 拼，所以 `game` 只收登记的 id、`room` 只收 6 位数字。
- **收**：平台页和游戏页在前台每 30 秒问一次，有就在顶上弹一条"老王叫你来掼蛋 [去] [不了]"；点"去"先记"不了"再跳。删了好友、屏蔽之后，没过期的邀请也不再给对方看。同一次轮询顺带回约局和在线好友数（顶栏用）。
- **好友页的"加入"**：好友在线、开着"让好友看到我在哪"、在房间里时，那一行有"加入"，直接打开他的房间（满了或开打了由房间那头处理）。"叫他来"在游戏里的好友列表上（kit）。
- **存储**：`invites` 表。Cron 删 2 天前的，注销时发出的、收到的一起删。

### 15.16 好友周榜和超越提示

只读，不新增写入：用现有的 `boards` 表按好友名单查，读的时候比，不存。

| 接口 | 谁能调 | 请求 | 成功 | 错误 | 写入 |
|---|---|---|---|---|---|
| `GET /api/friends/week/<gameId>[?board=<子榜>]` | 登录；平台页 | 有子榜的游戏必须带 `board`，没有子榜的不能带 | 200 `{"week": "这周一的日期", "entries": [{rank, displayName, avatar, score, isMe}]（前 50）, "me": {rank, score} \| null}` | 404 `unknown_game` / `not_found`；401 | 0 |
| `GET /api/friends/overtakes` | 登录；平台页 | — | 200 `{"overtakes": [{gameId, "board"?, "by": {userId, displayName}, score, mine}]}`，每个每日榜最多一条 | 401 | 0 |

- **比什么**：只算登记了 `daily` 的游戏。这周（北京时间周一 0 点起）每天的 `daily-<日期>` 榜里，我和每个好友各取最好的一次；同分先达到的在前；同一周里规则改版（`-v<n>`）的两版不能比，只认这周最新的那一版。
- 排行页游戏页签里代表性每日榜的"只看好友"显示这个。**超越提示**：好友这周的最好成绩比我的高，就在大厅顶上提一句（只提好友里最高的那个；我这周还没成绩的不提）。读的行数：好友 ≤ 200 时一次几百行以内。

### 15.17 好友动态

好友的名场面按模板生成一条动态，只给好友看，保留 7 天；好友能点赞或扔一个道具，每条每人一次。本人能在"我的"里关掉（`showFeed`）。写在"在线"类预算：类别预算用完、全站只读、本人关了开关，就不生成，**结回照常**。

**两个来源**：
1. **实盘结回自动生成**（游戏不用改）：`settle` 成功、带了合格的 `stats` 时，平台判断要不要生成：只记"值得说"的——这一份净赢 ≥ 半份，或这一份里拿到了**第一次拿到**的称号；输了、`statsIgnored`、重复的 `op`、到期退回、放弃都不生成。
   存 `{tier, units, titles}`（`units` 是净赢按份算乘 10 取整）；文字在浏览器里拼，称号名读游戏的 `titles.json`。
2. **游戏报的娱乐名场面**：

| 接口 | 谁能调 | 请求 | 成功 | 错误 | 写入 |
|---|---|---|---|---|---|
| `POST /api/feed` | 登录；游戏页（kit 的 `postMoment`） | `{"game": 登记的游戏 id, "moment": 名场面编号, "n"?: [整数, …]}` | 204（超了每天 10 条、关了开关、预算用完都静默 204、不写） | 400（游戏没登记、编号不是 1–24 位 `[a-z0-9_]` 字母开头、`n` 超过 3 个或不是安全整数）；401；403 | 2；被丢的 0 |

   只报编号和数字，**文字由游戏的 `public/moments.json` 给模板**（`{"four_bombs": {"text": "{name}一副牌扔了 {n} 个炸弹"}}`）：只认占位符 `{name}`（发的人的昵称）、`{n}` `{n2}` `{n3}`，模板 ≤ 40 字，有别的花括号、缺数字、读不到、没有这个编号，那条就不显示；拼出来一律按纯文本渲染。
   每人每天（北京时间）10 条，两个来源合计；第 11 条起静默丢弃。

| 接口 | 谁能调 | 请求 | 成功 | 错误 | 写入 |
|---|---|---|---|---|---|
| `GET /api/feed` | 登录；平台页 | — | 200 `{"items": [{"id", "user": 公开资料, "game", "kind": "settle" \| "moment", "at", "data", "reactions": {"like": 3, "tomato": 1}, "mine"?: "like"}]}`：我和好友最近 7 天的，新的在前，最多 50 条；关了开关的人的不给 | 401 | 0 |
| `POST /api/feed/<id>/react` | 登录；平台页 | `{"kind": "like" \| 道具 id}`（道具 id 用 table-fun 的那几个） | 204；每条每人一次，再点不改、0 行 | 400；404（不是好友的、自己的、过期的、不存在的，一律 404）；429（每人每天 100 次） | 1；被拒 0 |

**存储**：`feed`（`id` 是时间前缀 + 随机，按 id 排序就是按时间；`data` JSON ≤ 200 字节；索引 `(user_id, created_at)`）和 `feed_reactions`；Cron 删 7 天前的（`id` 带时间前缀，赞按 `item_id` 范围删）；注销时删本人发的、本人赞的。
界面：动态页 `/feed`（全部，按剩下的高度翻页、不滚，电脑上排两列；说明默认最多两行，超出的点"展开"在弹窗里看全文，"扔个道具"也在弹窗里选）；顶栏一个"动态"按钮，有新的带红点，点开是最新 8 条（电脑上挂在按钮下面，手机上从底下弹出半屏），底下"看全部"进动态页。"看过"记在本机 `localStorage` 的 `arcade.feedSeen`，只是提醒，换设备不同步。

### 15.18 异步挑战

把一局的开局（种子和设置）做成链接发出去，打开的人就是同一个开局；大家的成绩挂在同一个挑战下互相看得到。靠游戏规则核心的确定性，平台不重算、不解析，只存、只排序。只给登录的人；发给谁不限（不一定是好友）。

| 接口 | 谁能调 | 请求 | 成功 | 错误 | 写入 |
|---|---|---|---|---|---|
| `POST /api/challenges` | 登录；游戏页 | `{"game": 登记的游戏 id, "payload": 任意 JSON, "score": 安全整数, "stats"?: 任意 JSON}` | 200 `{"id", "until"}`；发起人这局的成绩同时记成第一条结果 | 400；422 `invalid_score`（分数不是安全整数）；413 `too_big`（`payload` 或 `stats` 超过 1 KB）；429（每人每天发起 20 个）；503（停增长档） | 4；被拒 0 |
| `GET /api/challenges/<id>` | 登录；游戏页 | — | 200 `{"game", "payload", "owner": {"userId", "displayName"}, "until", "results": [{"rank", "userId", "displayName", "score", "stats", "isMe"}]（前 50）, "count", "me": {"rank", "score", "stats"} \| null}` | 404 `not_found`（不存在、过期、格式不对一律这个）；401 | 0 |
| `POST /api/challenges/<id>/results` | 登录；游戏页 | `{"score": 安全整数, "stats"?: 任意 JSON}` | 200 `{"result": "ok"}` 或 `{"result": "already", "mine": {"score", "stats"}}`（交过了，回原来那条，不改） | 404；409 `full`（已有 100 个人交了）；400；422 `invalid_score`；413；503（停增长档） | 1；交过、被拒 0 |

- **每人每挑战只记第一次**：结果表主键 `(挑战 id, 用户 id)`，`INSERT … ON CONFLICT DO NOTHING`。**排序**：分数高的在前，同分先交的在前；越低越好的游戏交相反数。结果列表里是昵称和 userId，不给用户名。
- **数字**（`config.ts`）：有效期 30 天，过期后打开、交成绩都是 404；每人每天发起 20 个；每个挑战最多 100 个人交；`payload`、`stats` 各 ≤ 1 KB，原样存、原样回，平台不解析。
- **存储**：`challenges`（`id` 是 36 进制毫秒时间补到 9 位 + 64 位随机；索引 `(owner_id, created_at)` 给注销）和 `challenge_results`。Cron 按 id 范围删 30 天前的挑战和结果；注销删本人发起的挑战（连同结果）和本人交的结果。
- 记"排行榜"类预算；停增长档时发起和交成绩都 503，打开照常。单独部署（没有平台）时游戏不显示"挑战好友"。kit 先不包，开盘直接调；多个游戏用时再抽进 `arcade-kit/social`。

### 15.19 搭子战绩

好友房打完一场，游戏的房间服务端把同桌真人报给平台；平台按"我和他"两人一对累计：一起打了几场、各自赢了几场、做搭档几场、搭档时赢了几场。好友页每个好友下面写"一起打了 23 场 · 你赢 12 · TA 赢 9"，战绩页按游戏分开写在"和我一起"一栏。只给好友看，本人能在"我的"里关掉（`showMates`）。

**为什么不挂在 `settle` 上**：结回只有实盘才有，好友房的娱乐局不结回；而且一场里每个人各结一次，平台要把几次结回拼成一桌才知道谁和谁一起。所以单开一个方法，一场一次、整桌一起报。
**只走服务绑定**：钱包服务绑定（`WALLET`）上多一个方法 `together`，只有房间的服务端能调，浏览器碰不到（`/api` 里没有这条路）。

| 方法 | 参数 | 回话 | 写入 |
|---|---|---|---|
| `together(req)` | `{"op": 这一场的编号, "players": [{"userId", "team"?: 0–3, "win": boolean}]}`；`op` 8–64 位 `[A-Za-z0-9_-]`；`players` 2–8 个真人，`userId` 不重复；电脑不报；`team` 有队伍的游戏才带；`win` 由游戏定（掼蛋：这一场赢了的那队；德州：这个人离桌或散桌时净赢为正；麻将：这一场分数为正） | `{"ok": true, "pairs": n}`；`{"ok": false, "error": "bad_request" \| "bad_game" \| "busy" \| "internal"}` | 新的一对 2 行，已有的一对 1 行；只记已经是好友的对；重复的 `op`、不是好友的对 0 行 |

- `game` 取绑定上写的游戏（不信请求里的）。**只记好友**：先一条查询找出两两之间是好友的对，只给这些对写行（陌生人同桌不记；以后才加好友的从加好友以后算）。
  **一场只算一次**：每对的行上记着最后一次的 `op`，同一个 `op` 再报，`UPSERT … WHERE last_op <> excluded.last_op` 不加、0 行；游戏的 `op` 用房间编号 + 场次。
- 记"排行榜"类预算；不是正常档或预算用完都回 `busy`、0 行，游戏不重试、不提示玩家。和结回一样信游戏报的输赢（服务端说了算）；单机对电脑不报。kit 的 `reportTogether` 由房间在一场结束时调；单独部署没有 `WALLET` 绑定时直接跳过。

**看**：`GET /api/friends` 每个好友多一个可选的 `together: {"n", "wins", "theirWins", "teamN", "teamWins"}`（各游戏加起来）；没一起打过、或任意一方关了开关就不带。好友页按 `teamWins` 挑"最佳搭档"（`teamN` ≥ 3 里 `teamWins` 最多的）。
`GET /api/stats/<id>` 在 `relation` 是 `friends`、两边都开着、一起打过时多 `together: {"<game>": {同上五项}}`。
**开关**：`PATCH /api/me {"showMates": boolean}`；关了照样记（对方那边也要算），只是两边都看不到这一对。
**存储**：`mates`，`(lo, hi, game)` 主键（两人的 userId 按字典序），一对一行；删好友、屏蔽时删这一对的所有行（计进那两个接口的写入行数）；注销删 `lo` 或 `hi` 是本人的；不进 Cron。

### 15.20 邀请码

测好后关掉公开注册，之后**新人只能凭老用户给的邀请码注册**。管理员开关（5.8 的 `registration`）不变：开着时码可填可不填，关着时必须带有效的码。

- **码**：12 位 Crockford base32（60 bit），显示成 `ABCD-EFGH-JKMN`；不分大小写，输入时去掉空格和横线，`I`/`L` 当 `1`、`O` 当 `0`。
- **两种码**，类型显式存在 `max_uses`：**普通码**（`max_uses` = 1）谁都能生成，按下面的额度，一码一人，注册后两人自动成为好友；
  **长期码**（`max_uses` 2–10000，默认 100）只有管理员在管理页建（`POST /api/admin/invite-codes`，令牌不行），建好后能改次数（`POST /api/admin/invite-codes/<id>/uses`，不小于已用），默认不过期（`expires_at` 存成远未来，接口给 `null`），不占额度、不算每天上限，注册后不加好友，能撤回（撤回不影响已经注册的人）。
  用户侧的生成接口传什么都只建普通码。注册的 `reg:ip`、`reg:all` 上限对两种码一样算。
  **存明文**：码本身是唯一索引，注册时直接按码查；很多人先生成、过几天才发，"我的"里没用的码要能再复制、再分享，只存哈希就只能撤回重生成。码只能拿来注册、7 天过期，泄露的代价很小，和"密码、恢复码、令牌只存哈希"不冲突。
  用掉、撤回、过期以后接口里只给末 4 位。链接 `/i/<码>` 打开注册页并预填好码（注册关着时也露出"注册"页签）。
- **额度**（管理员可调，存在 `settings` 的 `invite_rules`，即时生效）：`userQuota` 普通用户每人几个（默认 3，范围 0–100）、`adminQuota` 管理员每人几个（50，0–1000）、`ttlDays` 码的有效期（7 天，1–90）、`perDay` 每人每 24 小时最多生成几个（5，1–100）。
  "用掉的额度" = 已用的码 + 还有效的码（没用、没撤回、没过期）；过期、撤回的未用码把额度还回来；管理员能给某个人单独改（`users.invite_quota`，空 = 按角色用默认）；已用的码一直算在额度里，被邀请的人注销了也算。

| 接口 | 谁能调 | 请求 | 成功 | 错误 | 写入 |
|---|---|---|---|---|---|
| `GET /api/invite-codes` | 登录 | — | 200 `{"quota", "taken", "left", "todayLeft", "ttlDays", "codes": [{"id", "hint", "code"?, "createdAt", "expiresAt", "status": "unused" \| "used" \| "expired" \| "revoked", "usedAt"?, "usedBy"?: 公开资料 \| null}]}`，新的在前，最多 50 条；`code` 只有没用的才给；`usedBy` 为 `null` 表示用的人已注销 | 401 | 0 |
| `POST /api/invite-codes` | 登录；要 CSRF | `{}` | 201 `{"id", "code", "link": "/i/<码>", "expiresAt", "left"}` | 409 `quota_full`（带 `quota`）；429（24 小时满 `perDay`）；403；503（停增长档） | 3；被拒 0 |
| `POST /api/invite-codes/<id>/revoke` | 登录；要 CSRF | `{}` | 204 | 404（不是自己的、不存在、已用、已撤回） | 1；被拒 0 |
| `POST /api/auth/register` | 匿名 | 多一个可选 `inviteCode` | 同 15.2 | 403 `registration_closed`；400 `invite_invalid`；409 `invite_used`；429 | 普通码 15、长期码 13；码不对 1 |

- **生成**：额度和每天的上限都写在插入语句的条件里（`INSERT … SELECT … WHERE (用掉的额度) < 额度 AND (24 小时内生成的) < perDay`），并发冲不破，被拒 0 行；不另开计数行。
- **注册时的顺序**：令牌桶 → 读开关（关着又没带码 403）→ 校验请求体（422）→ **试码**：`inv:ip:<ip>` 每 IP 每小时 10 次（成败都算，超了 429、0 行）→ 按码查（不对 400）→ `reg:ip`、`reg:all` → 用户名查重 → 一个 batch：
  ① 占名额 `UPDATE invite_codes SET uses = uses + 1, used_by = 新 id, used_at = now WHERE id = ? AND uses < max_uses AND revoked_at IS NULL AND expires_at > now`；② 使用记录 `INSERT INTO invite_code_uses … WHERE EXISTS (… used_by = 新 id)`；
  ③ users 那条改成 `INSERT … SELECT … WHERE EXISTS (SELECT 1 FROM invite_codes WHERE id = ? AND used_by = 新 id)`，credentials、sessions 以"users 里有这个新 id"为条件。第 ① 条没改成（最后一个名额被别人先占了）后面一行都不写，回 409 `invite_used`；
  所以最后一个名额两人同时用，恰好一人成功。④ 普通码再加与邀请人的好友关系一行（`accepted`），邀请人好友满了 200 就只是不加好友，号照建。D1 的 batch 是一个事务、按顺序执行。
- **试码的防撞库**：码 60 bit，每 IP 每小时 10 次。**不设全站每小时上限**：全站计数只要算了乱试的，就能被几个 IP 段耗光，挡住所有拿着真码的人；真码注册成功以后照旧受 `reg:ip`、`reg:all` 管。
- **删干净**：注销、一年清理删本人生成的所有码；本人用过的码 `used_by` 清成空、`invite_code_uses` 里本人那行删掉（`uses`、`used_at` 留着，邀请人那边还算已用，长期码名额不还）。Cron：一次没用过的码过期或撤回满 30 天就删。隐私说明写明谁邀请了谁（邀请人能在"我的"里看到用了自己码的人的昵称）。
- **界面**：`/me` 的"邀请朋友"栏（还能邀请几个、生成、列表、复制链接、系统分享、撤回；只列普通码）；注册页的"邀请码"输入框（注册关着时必填）；管理后台一页：四个数、建长期码、给某人改额度、全站的码（可筛长期码，显示 已用/上限 和用它注册的人）和撤回。
- 管理接口见 15.7。存储：`invite_codes` 表（避开好友房邀请的 `invites`）、`invite_code_uses` 和 `users.invite_quota`。

### 15.21 隐藏游戏

管理员设默认隐藏哪些游戏，每个人在 我的账号 → 偏好 里逐个改。这是**显示偏好，不是权限**：被隐藏的游戏不出现在大厅（含"继续玩"）、排行页的游戏页签、好友动态里，直接打开游戏地址照常能玩；总榜（全站本周净赢合计）不拆游戏、不受影响。

- **存储**：默认在 `settings` 的 `hidden_games`（游戏 id 的 JSON 数组）；个人在 `users.game_prefs`，只存和默认不一样的 `{"show": [默认隐藏、我要看的], "hide": [默认显示、我不看的]}`，和默认一样时存空。管理员以后改默认，个人没动过的那部分跟着变。下架了的游戏 id 读的时候去掉。
- **算法只有一处**：`platform/shared/game-prefs.ts`（`hiddenGameIds`、`prefsFor`、`visibleOf`），接口和界面共用；界面只经 `session.tsx` 的 `useVisible` 过滤。
- **接口**：`GET /api/me` 给 `hiddenDefault` 和 `user.gamePrefs`（15.2）；`PUT /api/me/games {"hidden"}` 改个人（`prefs:<userId>` 每天 60 次，2 行；差量按现读的默认算，不用 30 秒缓存，读不到就报错不写）；`GET` / `POST /api/admin/settings/games` 改默认（15.7，2 行）。

### 15.22 约局

| 接口 | 谁能调 | 请求 | 成功 | 错误 | 写入 |
|---|---|---|---|---|---|
| `PUT /api/meetup` | 登录；平台页 | `{"game": 能开好友房的游戏 id, "at": 开局时间（毫秒）}` | 200 `{"meetup": {"game", "at"}}` | 400（游戏不能开好友房、不在整点半点、已经过了、晚于北京时间明天结束）；429 `rate_limited`（今天约满 3 次，Retry-After 到北京时间明天 0 点）；401；403（CSRF） | 1；被拒 0 |
| `DELETE /api/meetup` | 登录；平台页 | — | 204 | 401；403（CSRF） | 有没过的约局 1，没有 0 |

- **一人一行**：再约覆盖；次数（`day`、`made`）和覆盖写在同一条 UPSERT 里，并发冲不破；取消把 `at` 改成 0，当天次数不还。
- **上限**：`meetupsPerDay` 3，`meetupGraceMs` 30 分钟（开局后多久好友还看得到）。开局前 10 分钟起算"到点"是界面的事。
- **读**：跟着 `GET /api/invites` 回（15.15）。扫 `meetups` 整表（只有约过局的人那么多行），每行按主键查一次是不是好友。
- **存储**：`meetups` 表（迁移 0015）。Cron 删开局过了 1 天的和取消了的；注销时删。
