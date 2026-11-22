# 平台：钱包、战绩、真人对局统计

> 平台文档的分册，节号全站通用（对照表见 [README.md](README.md#节号对照)）；总体设计见 [platform-backend.md](platform-backend.md)，接口细节见 [api.md](api.md)。

> 筹码体系的方案正本是 [economy.md](economy.md)；本文写平台这一侧的实现。

### 5.9 钱包

方案正本是 `docs/economy.md`；这里写平台怎么实现、写几行。代码在 `platform/worker/api/wallet/`：`state.ts`（类型和纯函数的账）、`parse.ts`（游戏传来的参数）、`store.ts`（读写、规则、统计）、`api.ts`（浏览器和管理页接口）、`service.ts`（给游戏的 RPC，入口类 `WalletService`），测试 `platform/test/wallet.test.ts`。

- **存储**：表 `wallets`，一人一行，状态整个放在 `state`（JSON）里：余额、各游戏桌上那一份（`游戏:ref` 为 key，含档位、金额、`mode`、带入时间、到期时间）、补给日期、当天和前一天的计数、
  最近 32 个操作 id 和结果、最近 16 个到期退回的 `游戏:ref`、`career`（5.10）、`ledger`（最近 30 笔余额变动）、`adminLog`。
  - **为什么一行 JSON**：每个动作都要同时改余额、桌上那一份和当天计数，拆成几张表每次要写好几行；一行 JSON 每次只写 1 行，状态几 KB。
  - **并发**：用 `rev` 做乐观并发 `UPDATE … WHERE user_id = ? AND rev = ?`，写 0 行说明被抢先，重读重算再写，最多 4 次，还不行回 `busy`；第一次建行用 `INSERT … ON CONFLICT DO NOTHING`。遇到 D1 标"重试即可"的暂时性错误，平台自己退避重试最多 3 次。
  - **新号**：注册时不建行，第一次带入（或领补给）时才建，送 10,000；没有钱包的人看钱包是余额 10,000、`fresh: true`，不写库。
  - **换日**：北京时间 0 点。碰钱包时发现过了 0 点，就把当天计数挪到"前一天"。跨零点还在桌上的 client 那一份算进新一天这个游戏的带入，否则 23:50 带入、00:10 结回时本金会被当成赢的。
- **给游戏的 RPC**：`WalletService`（`WorkerEntrypoint`），参数是一个对象，回 `{ ok: true, wallet, credited?, capped?, left?, dup?, exchangeLeft?, exchangeCap? }` 或 `{ ok: false, error, wallet?, left? }`。业务拒绝都用返回值、不抛异常。

  | 方法 | 参数 | 成功 | 写入 |
  |---|---|---|---|
  | `view(userId)` | — | 钱包；另带这个游戏（绑定的 `game`）今天还能兑换多少 `exchangeLeft` 和今天的上限 `exchangeCap`（管理页设成 0 时两个都是 0，界面写"今天兑换关了"） | 0；有到期退回时 1 |
  | `buyin(req)` | `userId, game, ref, tier, amount, until, mode, op` | 余额扣掉 `amount`，记到这个游戏桌上那一份 | 1 |
  | `settle(req)` | `userId, game, ref, amount, mode, op`，可选 `stats`（5.10）、可选 `tally`（5.11） | `credited` 进余额（client 模式超出每日上限的在 `capped` 里，不进），清掉那一份 | 1；带合格的 `tally` 时 2 |
  | `refund(req)` | `userId, game, ref, mode, op` | 那一份原样退回，清掉 | 1 |
  | `exchange(req)` | `userId, game, op, amount` | 游戏内货币换的筹码进余额：`credited` 是实际入账，`left` 是这次之后今天这个游戏还剩的额度 | 1 |
  | `together(req)` | `op, players: [{userId, team?, win}]` | 搭子战绩，一场整桌报一次（15.19）；回 `pairs` | 每对 1–2 行，记在排行榜类 |

  - `game` 是登记的游戏 id；`tier` 是 `small` / `mid` / `big` / `lux`（一份 2,000 / 10,000 / 50,000 / 200,000，`economy.md` 第 2 节）；`ref`、`op` 是 8–64 位 `[A-Za-z0-9_-]`；`amount`、`until`（Unix 毫秒）是非负安全整数；
    `mode` 是 `server`（结果由服务端说了算，如好友房）或 `client`（浏览器算的）。
  - **重复请求**：同一个游戏的同一个 `op` 再来，什么都不改、写 0 行，回第一次的结果并带 `dup: true`（按 `游戏:op` 分开记；补码的带入另记在那一份上最近 16 个）。
    **重复要是同一件事**：每个 `op` 连同指纹（类型、`mode`、`ref`，带入再加 `tier`）记下，指纹不同回 `op_conflict`、写 0 行——单机接口的 `op` 由浏览器给、好友房的 `op` 能猜，只认 `op` 的话，有人先用单机占住房间接下来的 `op`，房间补码就被当成已扣过。
  - **出错重发是安全的**：回了 `internal`（或调用抛错、超时）时，拿**同一个 `op`** 再调一次：写成了的回第一次的结果，没写成的照常做。
  - **带入**：每次 1 到一份（`bad_amount`）；`until` 已过回 `bad_until`，超过 24 小时按 24 小时算。同一个 `ref` 再带入是补码，要同一档（`at_table`）、同一 `mode`（`bad_mode`），加到那一份上，到期时间取晚的；
    新开一份、补码都只要余额 ≥ 这次的 `amount`（`no_funds`）。到期退回过的 `ref` 不能再开（`expired`）。
  - **兑换**：`amount` 至少 1（`bad_amount`）。每人每个游戏每天（北京时间）最多换进 `exchangeCap`（默认 2,000，管理页可调），当天计数记在钱包行 `today.games.<game>.ex`；超出的只入剩下的那部分（回话 `credited < amount`、`left: 0`），
    剩 0 回 `exchange_cap`（带 `left: 0`、写 0 行）；`exchangeCap` 是 0 就是关掉兑换。和带入一样受只读档、钱包预算（`busy`）和每天 1,000 次写入（`limit`）管；指纹只有类型，同一个 `op` 先用在别的操作上回 `op_conflict`。
  - **结回**：要有这个游戏、这个 `ref` 的那一份，`mode` 一致。没有回 `no_stake`（已到期退回过的回 `expired`）——钱包里没带入就没有结回。`amount` 可以是 0，最多是带上桌的加 20 份（只防写错）。
  - **错误码**：`bad_request`、`unknown_game`、`bad_game`、`no_user`、`limit`（今天写满 1,000 次）、`no_funds`、`at_table`、`bad_amount`、`bad_until`、`bad_mode`、`no_stake`、`expired`、`op_conflict`、`exchange_cap`（今天兑换额度用完）、`no_change`（兑换时余额已到上限）、`busy`、`internal`。被拒时一般带当前的 `wallet`。
- **游戏怎么接**：在游戏 `wrangler.jsonc` 里加一个服务绑定（和认人的 `ARCADE` 分开）：`"services": [{ "binding": "WALLET", "service": "arcade", "entrypoint": "WalletService", "props": { "game": "texas" } }]`；
  `await env.WALLET.buyin({ userId, game: 'texas', ref: roomId, tier: 'small', amount: 2_000, until: Date.now() + 6 * 3_600_000, mode: 'server', op })`。平台要先部署（带 `WalletService` 的版本），游戏才能部署带这个绑定的版本。
- **防别的游戏冒充 game id**：只有本账号里的 Worker 能声明到 `arcade` 的服务绑定，公网和浏览器碰不到 RPC（`/api` 里没有带入、结回、放弃、兑换这几条路，测试锁住）。**绑定上必须写 `props.game`**，参数里的 `game` 必须和它一致，
  否则这几个方法（含 `view`）一律回 `bad_game`、不碰库。`props` 写在调用方自己的部署配置里，游戏代码在运行时改不了。每个游戏只能动自己那一份，结回、放弃还要对得上 `ref`。信任边界就是这个账号：账号里的 Worker 都经 PR 审阅后由 CI 部署。
- **服务绑定 RPC 在免费版**：能用；不另收请求费（游戏调平台算一个请求，两边 CPU 合计；平台 6.6 计量照样算 1 次调用）；算调用方的子请求（免费版每次调用最多 50 个）；CPU 每次 10 ms，钱包一次操作远低于它；
  异常只保证 `name` 和 `message`，所以业务错误都用返回值；命名入口要从平台主模块导出。
- **计量和熔断**：每次 RPC 算平台 1 次调用；写入记在"钱包"类预算（6.6，6,000 行）。停服档全停（`busy`）；只读档或钱包类预算用完：停带入、兑换和领补给，**结回、放弃照收**（桌上的筹码总要能回来），看钱包照常；
  停增长档：不建新钱包，已有的照常。
- **每人每天 1,000 次写入**（北京时间，各游戏合计，记在钱包行里）：到了上限不能带入、兑换（`limit`），不能领补给（429）；结回、放弃、到期退回不受限。
- **管理员可调的规则**：补给额（默认 2,000）、单机每日净赢份数（默认 10）、新号送多少（默认 10,000）、管理员单次调整上限（默认 ±1,000,000）、兑换每人每游戏每天上限 `exchangeCap`（默认 2,000，0–1,000,000，0 是关掉）这五个数存在 `settings` 的 `wallet_rules` 一行里（连同最近 20 次改动记录），管理页改了即时生效（15.7）。钱包按 30 秒缓存读这一行，读不到用代码默认值。
- **client 模式的每日上限**（`economy.md` 第 4 节）：每个游戏每天净赢 ≤ 10 份。净赢 = 当天这个游戏 client 模式结回进钱包的 − 带入的；份 = 当天这个游戏带上桌的各份里最大的那一份，每份取 min(档位一份, 实际带上桌的)；
  结回时最多进到"净赢正好 10 份"，超出的在 `capped` 里不进钱包；**带上桌的那一份总能拿回来**（到顶以后至少退回带入的数）；放弃、到期退回把那一份从"带入"里减回去，否则转几圈能撑大上限；server 模式（好友房）不设上限。
- **浏览器接口**（15.9）：`GET /api/wallet` 看自己的钱包；`POST /api/wallet/relief` 领每日补给（余额加桌上的不到补给额、北京时间今天没领过，就补到补给额），按 5.2 的 CSRF 规矩，一天只能领一次。大厅有筹码在桌上时提醒并直达游戏，`canRelief` 时就地放"领补给"按钮。
- **到期退回**：每次碰钱包时，先把过了 `until` 的那一份原样退回、记下 `游戏:ref`。之后这个 `ref` 来结回、放弃、带入都回 `expired`。被拒的操作不写库，到期退回留到下次能写时。
- **统计**（`economy.md` 第 6 节）：每天的 Cron（7.3）先记一行北京时间昨天的全站统计到 `wallet_stats`（1 行，系统类）：全站筹码总量、钱包数、新号送的、补给、管理员调整、兑换（`exchange`），各游戏的带入 / 结回 / 退回 / 到顶没进 / 兑换（`ex`）。管理页显示最近 30 天，"庄家"一列 = 带入 − 结回 − 退回。
- **删号**：钱包行在 `deleteUserStatements` 里（7.3）。`wallet_stats` 只有全站合计，不带人。
- **管理员调整**：`GET /api/admin/wallet/<用户名>` 查人（钱包、`career`、`ledger`、调整记录）；`POST /api/admin/wallet/adjust {username, amount, note?}` 正数加负数扣，单次上限见上；`GET /api/admin/wallet-adjustments` 看全站最近 10 次。
  只认管理员会话（令牌 403），按 5.2 做 CSRF，记在账号安全类；每次只写钱包那 1 行，加到余额上限、扣到 0 为止，不碰桌上那一份；记录存在钱包 state 的 `adminLog`（每人最近 20 条）。
- **流水**：钱包 state 里的 `ledger` 记每人最近 30 笔余额变动 `{"at", "t", "g"?, "a", "capped"?}`，`t` 是 `grant`、`buyin`、`settle`、`refund`、`expire`、`relief`、`admin`、`exchange`。跟着钱包那 1 行一起写，不新增行；本人的 `GET /api/wallet` 回自己的，游戏的 RPC 不回。

### 5.10 战绩（career）

平台要把游戏串起来：战绩页、排行榜、称号墙。数据从结回时带上来，跟着钱包那一行一起写，不新增行、不新增请求。

- **怎么带**：钱包 RPC 的 `settle(req)` 多一个可选字段 `stats`（这一份的小结）。游戏自己的 `/api/stake` 之类路由只原样转发，不改不补。不带 `stats` 也照常结回，只是局数、称号不记。
- **给游戏的类型**（游戏不能 import 平台代码，照抄）：

  ```ts
  /** settle 可选带的这一份小结。JSON 后 ≤ 256 字节；不合格就整份忽略，结回照常，回话里 statsIgnored 说原因 */
  export interface SettleStats {
    /** 这一份里打了几局（开盘：一整局半年；掼蛋：副数；德州：手数）：非负整数，超过 1,000 按 1,000 算 */
    rounds: number;
    /** 其中赢了几局：非负整数，超过 rounds 按 rounds 算。什么算赢由游戏定 */
    wins: number;
    /** 这一份里最大的一把净赢了多少筹码：非负整数；记的时候截到不超过这一份结回的 amount */
    best: number;
    /** 这一份里拿到的称号 id，最多 5 个，每个 1–24 位 [a-z0-9_] 且以字母开头；拿过的再报也行，平台去重 */
    titles?: string[];
    /** 游戏自定义的数，max 和 sum 合计最多 3 个；key 1–16 位 [a-z0-9_] 且以字母开头，值是安全整数。max 取历史最大，sum 累加 */
    max?: Record<string, number>;
    sum?: Record<string, number>;
  }
  ```

  回话多一个可选的 `statsIgnored: 'too_big' | 'bad_stats'`：JSON 超过 256 字节或形状不对时整份忽略，钱照常结。局数、赢的局数、最大一把超出时是截断不是忽略。重复的 `op` 回第一次的结果，小结不会记两次。
- **存在哪**：钱包 state 里的 `career`，按游戏分：`n`（结回过几份）、`net`（累计净赢）、`wk`（本周周一日期）、`wnet`（本周净赢，`wk` 不是这周就当 0，不用 Cron 清零）、`rounds`、`wins`、`best`、
  `titles`（id → 第一次拿到的时间，每游戏最多 64 个）、`max` / `sum`（自定义数，每游戏最多 8 个 key）。
  - 净赢、本周净赢由平台按钱算，**不靠小结**：放弃、到期退回不算一份、不动净赢；client 模式到顶没进钱包的不算赢。总的本周净赢在查询时按各游戏 `wk` 是这周的 `wnet` 求和。
- **称号的名字**：小结里只有 id。每个游戏放一个静态文件 `/games/<id>/titles.json`（同域公开 HTTP 接口），格式 `{ "bluff_king": { "name": "诈唬王", "desc": "一句话说怎么拿到的" } }`，`name` 建议 2–6 个字。
  平台的称号墙在浏览器里读：文件最多 32 KB、3 秒超时；读不到或没有这个 id 时显示"神秘称号"。加新称号只改游戏自己的文件。
- **谁看得到**：`career` 全部字段对登录的人公开；余额、桌上的、操作记录、管理员调整只有本人和管理员看得到。
- **成本**：结回带不带小结、小结被忽略，请求数和写入都不变（钱包那 1 行）。

### 5.11 真人对局统计

游戏结回、交分时可以多带一个可选的 `tally`，平台只给"北京时间哪天、哪个游戏、哪个玩法、哪种 mode、哪个档位、多长时间、什么结果"这个组合加 1，存在 `play_tally`。**不存哪一局、哪个人**（没有用户 id、没有对局 id），玩家界面看不到，只有管理员在 `/admin` 的"真人对局"里看汇总（15.7）。用来知道哪个游戏、哪个玩法、哪个档位有多少人在打、一局打多久、大致输赢。

- **怎么带**：钱包 RPC 的 `settle(req)` 和 `POST /api/scores` 的请求体多一个可选字段 `tally`：`{ "variant"?, "durSec", "result"? }`。`variant` 是玩法 id（`^[a-z][a-z0-9-]{0,15}$`，默认 `main`）；`durSec` 是 0–86400 的整数秒；`result` 是 `win` / `lose` / `draw`。
  不带或不合格（形状、范围不对）就当没带：**静默忽略，不让结回、交分失败**，不带的游戏不用改。

  ```jsonc
  // settle：mode 和档位取桌上那一份的，结果按进钱包的筹码和带入比
  { "userId": "…", "game": "texas", "ref": "room-0001", "amount": 3500, "mode": "server", "op": "…", "tally": { "variant": "holdem", "durSec": 640 } }
  // POST /api/scores：没有筹码，mode 和档位记 none，结果只看 result
  { "gameId": "kaipan", "boardId": "daily-2026-10-14-classic", "score": 1200, "tally": { "durSec": 420, "result": "win" } }
  ```

- **分段**：时长 `lt1m`（<60 秒）、`1-5m`、`5-15m`、`15-30m`、`30-60m`、`ge60m`，左闭右开。结回的结果按进钱包的筹码 `got` 和带入 `stake`：`bust`（拿回 0）、`lose`（净值 < 0）、`even`（= 0）、`win`（0 < 净值 < `stake`）、`big`（净值 ≥ `stake`，翻倍以上）；
  带入是 0 时没法比，用 `result`（`win` / `lose` / `draw` → `win` / `lose` / `even`），没有就记 `even`。交分的结果只看 `result`（`draw` 记 `even`），没报是 `na`。
- **存储**：`play_tally(day, game, variant, mode, tier, dur, outcome, n)`，主键是前七列；记一局是一条 `ON CONFLICT … DO UPDATE SET n = play_tally.n + 1` 的 UPSERT，1 行。结回只在钱包写成功后记（重复的 `op`、被拒的都不记），算进"钱包"类；交分在每次被接受的请求里记（没刷新最好成绩也记），算进"排行榜"类；被拒的请求 0 行。统计写出错只记日志，不影响结回、交分。
- **留多久**：每天 Cron 删 `tallyKeepDays`（默认 180）天前的（7.3）。
