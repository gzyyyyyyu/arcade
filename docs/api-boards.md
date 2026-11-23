# 平台接口：排行榜、钱包、战绩、排行榜页

> 平台接口约定（第 15 节）的分册，通用规则、限流总表、错误码和各节在哪个文件见 [api.md](api.md)。节号全站通用，见 [README.md](README.md#节号对照)。

### 15.5 排行榜

简单版，不防作弊（9.2）。代码 `platform/worker/api/scores/boards.ts`，写入记"排行榜"类预算（6.6）。

| 接口 | 谁能调 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|---|
| `POST /api/scores` | 登录；游戏页可调 | `{"gameId", "boardId", "score", "userId"?, "tally"?}`（`tally` 见 5.11，不合格忽略） | 200 `{"best": 最好成绩, "improved": true}`（新纪录）或 `{"best": 原来的, "improved": false}`（没比原来好，含相等） | 400；404 `unknown_game`；409 `wrong_user`；422 `invalid_board` / `invalid_score`；429（每天 200 次）；503 `busy` | 新上榜或刷新纪录 3；没更好 1；各种被拒 0；带合格的 `tally` 时各加 1（被拒的不加） |
| `GET /api/boards/<gameId>/<boardId>?scope=all\|friends` | 登录；游戏页可调 | `scope` 默认 `all` | 200 `{"entries": [{"rank", "displayName", "avatar", "score", "isMe"}], "me": {"rank", "score"} 或 null}` | 400（`scope` 不对）；401；404 `unknown_game` / `not_found` | 0 |

- **榜单 ID**：每日榜 `daily-YYYY-MM-DD[-v<n>]`，日期必须是北京时间的昨天、今天或明天；一天几个每日榜的游戏（`games.ts` 的 `daily` 写了子榜）是 `daily-YYYY-MM-DD-<子榜>[-v<n>]`，子榜要登记过（`[a-z][a-z0-9]{0,15}`，不能像版本号 `v2`），
  写了子榜的游戏不收不带子榜的每日榜，没写子榜的游戏不收带子榜的；
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

### 15.9 钱包

浏览器只有下面两个接口加管理页的接口；带入、带回、放弃、兑换只有游戏的服务端经 RPC 能调（5.9），`/api` 里没有这几条路（404）。前两个记"钱包"类预算，管理接口记"账号安全"类。

| 接口 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|
| `GET /api/wallet` | 要登录 | 200 `{"wallet", "tiers", "reliefTo", "winUnits", "playing", "ledger", "week"}`。`wallet` 是 `{"balance", "stakes": [{"game", "ref", "tier", "amount", "mode", "at", "until"}], "canRelief", "writesLeft", "caps": {"<game>": {"net", "cap"}}, "fresh"}`（`fresh: true` 是还没有钱包，看到的是新号的 10,000）；`tiers` 是各档一份多少；`ledger` 是自己最近 30 笔进出；`week` 是本周各游戏的净赢；`playing` 是北京时间今天各游戏带筹码上过桌的人数（只有人数，每个 isolate 缓存 10 分钟；读不到时不带这一项，大厅不显示人数） | 401；503 | 0；有到期退回时 1（只读档不写） |
| `POST /api/wallet/relief` | `{}`，要 `X-Arcade` 和 `Origin` | 200 `{"wallet"}`，把余额加桌上的补到补给额 | 403；409 `relief_not_needed` / `relief_used`（带 `wallet`）；429（今天写满 1,000 次）；503 `busy` | 1；被拒 0 |
| `GET /api/admin/wallet-stats` | 管理员（5.8 两种认证） | 200 `{"days": [{"day", "total", "wallets", "grant", "relief", "games": {"<game>": {"in", "out", "back", "capped", "ex", "players"}}, "active", "reliefCount", "admin", "exchange"}]}`（`ex`、`exchange` 是兑换进来的，早期记录里没有），最近 30 天，新的在前 | 401；403 | 0 |
| `GET /api/admin/wallet/<用户名>` | 管理员会话（令牌 403） | 200 `{"user", "wallet", "log", "career", "ledger"}` | 400；401；403；404 | 0 |
| `POST /api/admin/wallet/adjust` | 管理员会话，`{"username", "amount", "note"?}`，`note` 最多 40 字 | 200 `{"wallet", "credited"}`，`credited` 是实际加减的数；没有钱包的先按新号建 | 400 `bad_amount`（带 `max`）；403；404；409 `no_change`；503 | 1；被拒 0 |
| `GET /api/admin/wallet-adjustments` | 管理员会话 | 200 `{"recent": [{"username", "displayName", "at", "amount", "note", "by"}]}`，全站最近 10 次 | 401；403 | 0 |
| `GET /api/admin/overview` | 管理员（两种认证） | 200 `{"today", "days"}`：今天现算的一份（多 `visitors`，看 `users.last_seen_at`）和今天以前最近 6 天的记录；管理页顶上的"今日概况"和 7 天趋势用它 | 401；403；429；503 | 0（读行数约钱包数 × 2 + 用户数） |

### 15.11 战绩

战绩（钱包行里的 `career`，5.10）对登录的人公开；余额、桌上的筹码、操作记录不在这里。记"好友与资料"类，只读。

| 接口 | 请求 | 成功 | 主要错误 | 写入 |
|---|---|---|---|---|
| `GET /api/stats/<用户 id 或 me>` | 要登录 | 200 `{"user": {"userId", "displayName", "avatar"}, "relation", "week", "games": {"<game>": {"n", "net", "wnet", "rounds", "wins", "best", "titles": [{"id", "at"}], "max", "sum"}}, "together"?}`；`relation` 同查好友码（我屏蔽了的人发来的请求按 `none` 给）；`week` 是北京时间这周一；`wnet` 不是这周的按 0 给；只列带回过的游戏；`relation` 是 `friends`、两边都开着、一起打过时多 `together`（15.19） | 401；404（没有这个人、id 格式不对、对方屏蔽了我） | 0 |

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
- **各游戏总榜**：`games.ts` 里登记的固定榜（`boards` 可写成 `{"id", "name"}`），有数据和接口，排行页不列。
- **每周挑战**由 `games.ts` 的 `weekly` 登记驱动（`[{"id": "tide", "name": "大潮"}]`），有数据和接口，排行页不列；
  读的一方按北京时间自己算出榜名，直接 `GET /api/boards/<game>/week-<周>-<子榜>`（不经 `/api/leaderboard`，不带版本号的那个榜）。分数写法读游戏的 `/games/<id>/weekly.json`，格式同 `daily.json`，按子榜写在 `boards` 下。
