# 平台接口：账号、云存档、管理、登录闸门、邀请码、隐藏游戏

> 平台接口约定（第 15 节）的分册，通用规则、限流总表、错误码和各节在哪个文件见 [api.md](api.md)。节号全站通用，见 [README.md](README.md#节号对照)。

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
- **可选**，不带时不核对账号。值填 `/api/me` 返回的 `user.id`。`PUT` 只认请求体里的 `userId`；`GET` 只认查询参数 `?userId=`。
- **和会话不一致**：409 `wrong_user`，在接口的第一步判断，**写 0 行、读 0 行（不读存档表），不计数，也不返回任何存档数据**。
- **格式不对**：400。合格的是 1–64 个 `[A-Za-z0-9_-]` 的字符串。GET 另有几种也算格式不对：带了多个 `userId`、`?userId` 没有等号或值为空、参数名大小写不同（`userid`、`UserId`，解码后比较），免得游戏端拼错了被悄悄当成"没带"。
- **没登录或会话失效**：路由的登录检查在前，一律 401。只读档下读存档照常，带了 `userId` 也照常判断。
- **409 有两种，必须按 `error` 区分**：`conflict`（同账号版本冲突，带 `current`，合并后重交）和 `wrong_user`（**没有 `current`**，不合并、不重试，按"换了账号"处理）。把 `wrong_user` 当成 `conflict` 去合并，就正好把账号串了。

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
  `/api` 里没有这条路（浏览器拿到了就能试出谁屏蔽了自己）。单独部署时没有这个方法，游戏要当它可能不存在。
  入口是类，RPC 能调到原型上的每个公开方法，所以定时清理 `scheduled` 写成实例字段（RPC 只认原型上的方法，cron 照常找得到它），经 RPC 只露出 `fetch` 和 `blockedAmong`，测试锁住了原型上的方法名（`platform/test/blocked-among.test.ts`）。

### 15.20 邀请码

公开注册默认关，**新人凭老用户给的邀请码注册**。管理员开关（5.8 的 `registration`）：开着时码可填可不填，关着时必须带有效的码。

- **码**：12 位 Crockford base32（60 bit），显示成 `ABCD-EFGH-JKMN`；不分大小写，输入时去掉空格和横线，`I`/`L` 当 `1`、`O` 当 `0`。
- **两种码**，类型显式存在 `max_uses`：**普通码**（`max_uses` = 1）谁都能生成，按下面的额度，一码一人，注册后两人自动成为好友；
  **长期码**（`max_uses` 2–10000，默认 100）只有管理员在管理页建（`POST /api/admin/invite-codes`，令牌不行），建好后能改次数（`POST /api/admin/invite-codes/<id>/uses`，不小于已用），默认不过期（`expires_at` 存成远未来，接口给 `null`），不占额度、不算每天上限，注册后不加好友，能撤回（撤回不影响已经注册的人）。
  用户侧的生成接口传什么都只建普通码。注册的 `reg:ip`、`reg:all` 上限对两种码一样算。
  **存明文**：码本身是唯一索引，注册时直接按码查；很多人先生成、过几天才发，"我的"里没用的码要能再复制、再分享，只存哈希就只能撤回重生成。码只能拿来注册、7 天过期，泄露的代价很小，和"密码、恢复码、令牌只存哈希"不冲突。
  用掉、撤回、过期以后接口里只给末 4 位。链接 `/i/<码>` 打开注册页并预填好码（注册关着时也露出"注册"页签）。
- **额度**（管理员可调，存在 `settings` 的 `invite_rules`，即时生效）：`userQuota` 普通用户每人几个（默认 3，范围 0–100）、`adminQuota` 管理员每人几个（50，0–1000）、`ttlDays` 码的有效期（7 天，1–90）、`perDay` 每人每 24 小时最多生成几个（5，1–100）。和钱包规则一样按 30 秒缓存读，没存的条目用默认值，读库失败直接报错（5.9）。
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
