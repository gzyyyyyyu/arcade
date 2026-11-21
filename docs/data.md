# 平台数据（D1）

> 从 [platform-backend.md](platform-backend.md) 拆出来，**节号沿用原来的第 7 节（7.1–7.5）**，别处写的「platform-backend.md 7.x」就是这里的 7.x。
> 表结构以 `platform/migrations/` 为准；本文和迁移不一致时改本文。
> 文中不带文件名的其他节号：4.x 指 [rooms.md](rooms.md)，5.1–5.4 指 [accounts.md](accounts.md)，第 6 节指 [cost-guard.md](cost-guard.md)，第 7 节指 [data.md](data.md)，15.x 指 [api.md](api.md)，第 16 节指 [monitoring.md](monitoring.md)，其余指 [platform-backend.md](platform-backend.md)。


## 7. 数据（平台 D1）

库名 `arcade`（`primary_location_hint` 为 apac），Worker 里的绑定名 `DB`；库 id 不写在仓库里，部署时由 `production` 环境的 secret 注入。迁移文件放 `platform/migrations/`，编号递增、只增不删，时间一律存 Unix 毫秒整数。
自托管时同一份迁移的 PG 版在 `tools/selfhost/pg/migrations/`，文件名一一对应（3.1）。

### 7.1 现有的表

```
users(id PK, username UNIQUE, display_name, friend_code UNIQUE, avatar_json, catchphrase_id, created_at, last_seen_at, role,
      presence_json, presence_at, show_where, show_feed, show_mates, invite_quota, game_prefs)   WITHOUT ROWID
      -- id：128 位随机数（base64url 22 位），不用自增，免得暴露注册顺序和人数；username：归一化后的小写用户名
      -- role：'user' | 'admin'；presence_*、show_*（默认 1）：在线位置和三个"让好友看到"的开关；invite_quota：可空，按角色用默认；game_prefs：隐藏游戏里和默认不一样的那部分（15.21），可空
sessions(token_hash PK, user_id, created_at, renewed_at, expires_at)                    WITHOUT ROWID，索引 (user_id)
credentials(user_id, type, secret, created_at, PRIMARY KEY (user_id, type))             WITHOUT ROWID    -- type：'password' | 'recovery'
friendships(user_a, user_b, status, requested_by, created_at, PRIMARY KEY (user_a, user_b), CHECK (user_a < user_b))
                                                                                         WITHOUT ROWID，索引 (user_b)   -- 一对人一行；status：'pending' | 'accepted'
blocks(blocker, blocked, created_at, PRIMARY KEY (blocker, blocked))                    WITHOUT ROWID
saves(user_id, game_id, slot, rev, data, size, updated_at, PRIMARY KEY (user_id, game_id, slot))   WITHOUT ROWID
rate_counters(key PK, window_start, count, blocked_until)                               WITHOUT ROWID    -- 固定窗口计数；blocked_until 给失败计数的指数延迟用
meter_hourly(hour PK, requests, rows_read, rows_reg, rows_auth, rows_save, rows_social, rows_acct, rows_sys, rows_board, rows_wallet, rows_live, rows_mon,
             login_attempts, recover_attempts, db_size, updated_at)                     WITHOUT ROWID    -- hour：UTC 小时；6.6 的计量
boards(user_id, game_id, board_id, score, updated_at, PRIMARY KEY (user_id, game_id, board_id))   WITHOUT ROWID，索引 boards_rank (game_id, board_id, score DESC, updated_at)
settings(key PK, value, updated_at)                                                     WITHOUT ROWID    -- registration、wallet_rules、invite_rules、notice、hidden_games
wallets(user_id PK, rev, state, updated_at)                                             WITHOUT ROWID    -- 5.9
wallet_stats(day PK, data, created_at)                                                  WITHOUT ROWID    -- 每天的全站筹码统计，只有合计
invites(id PK, from_id, to_id, game, room, created_at, until, dismissed)               WITHOUT ROWID，索引 (to_id, until)、(from_id, created_at)   -- 好友房邀请（15.15）
feed(id PK, user_id, game, kind, data, created_at)                                      WITHOUT ROWID，索引 (user_id, created_at)   -- 好友动态（15.17）
feed_reactions(item_id, user_id, kind, created_at, PRIMARY KEY (item_id, user_id))      WITHOUT ROWID
challenges(id PK, game, owner_id, payload, created_at, until)                           WITHOUT ROWID，索引 (owner_id, created_at)   -- 异步挑战（15.18）
challenge_results(challenge_id, user_id, score, stats, created_at, PRIMARY KEY (challenge_id, user_id))   WITHOUT ROWID
mates(lo, hi, game, n, lo_wins, hi_wins, team_n, team_wins, last_op, last_at, PRIMARY KEY (lo, hi, game))   WITHOUT ROWID，索引 mates_hi (hi)   -- 搭子战绩（15.19）
invite_codes(id PK, code, owner_id, created_at, expires_at, used_by, used_at, revoked_at, max_uses, uses)   WITHOUT ROWID，唯一索引 (code)、索引 (owner_id, created_at)   -- 邀请码（15.20）；max_uses 1 是普通码
invite_code_uses(code_id, user_id, used_at, PRIMARY KEY (code_id, user_id))   WITHOUT ROWID，索引 (user_id)   -- 每次用码注册一行
play_tally(day, game, variant, mode, tier, dur, outcome, n, PRIMARY KEY (day, game, variant, mode, tier, dur, outcome))   WITHOUT ROWID   -- 真人对局统计，只存汇总（5.11）
monitor_counts(day, game, kind, sig, n, first_ver, ver, last_at, PRIMARY KEY (day, game, kind, sig))   WITHOUT ROWID   -- 浏览器报错计数（第 16 节）；巡检状态放 settings 的 monitor 一行
```

迁移：0001 账号、0002 `users.role`、0003 排行榜、0004 设置、0005 钱包、0006 在线位置、0007 邀请、0008 动态、0009 挑战、0010 搭子、0011 邀请码、0012 监控（`monitor_counts`、`meter_hourly.rows_mon`）、0013 真人对局统计（`play_tally`）、0014 长期邀请码（`max_uses`、`uses`、`invite_code_uses`）和 `users.game_prefs`。设计取舍（都为少写行数）：
- **全部用 `WITHOUT ROWID`**：主键是 TEXT 或多列的普通表，SQLite 会另建一个自动唯一索引、每次插入多算 1 行；`WITHOUT ROWID` 表的主键就是表本身。
- **`credentials` 主键是 `(user_id, type)`，没有 identifier 列和额外索引**：密码和恢复码都是先按用户名找到用户再比对，注册因此从约 13 行降到约 9 行。代价是每种类型只能有一条；以后多个 passkey、第三方登录**另建表**，不改这张表。
- **注销是直接删除**，没有 `deleted_at`，也没有游客。
- **`users.role` 不建索引**：只有管理接口和 Cron 按它查，人数少，全表扫比每次插入多写一行索引划算。
- **`boards` 主键以 `user_id` 开头**：按人删是主键前缀扫描；**排名索引带上 `updated_at`**：同分先达到的在前，也能直接按索引取前 50（`platform/test/boards.test.ts` 在 2,000 人的榜上断言读的行数少于 300）；Cron 删旧的每日榜也沿这个索引按 `board_id` 范围删。
- **一定要先迁移再部署**：新 Worker 上报计量时要写新加的列，没有就上报失败、fail-closed 进停服档。CI 部署前会自动跑迁移（第 8 节）。

### 7.2 每个操作写几行

D1 按写入行数计费：插入时表本身一行，每个索引再各算一行；更新不碰索引列只算 1 行，改了带索引的列算 2 行；**删除即使表带索引也只算 1 行**；删不存在的行 0 行。"类别"是 6.6 的预算类别。
依据：`platform/test/d1-facts.test.ts` 实测（插入 users 3、sessions 2、credentials 1、saves 1、friendships 2）；每个接口的测试都用 `meta.rows_written` 断言下表的值。

| 操作 | 写入行数 | 怎么来的 | 类别 |
|---|---|---|---|
| 注册 | 9（关闭时 0） | users 3（表 + `username`、`friend_code` 两个唯一索引）+ credentials 2 + sessions 2 + 限流 2（`reg:ip`、`reg:all`）。关闭时过完内存令牌桶、读 1 行开关就回 403 | 注册 |
| 带邀请码注册 | 普通码 15、长期码 13；码不对 1 | 注册的 9 + `inv:ip` 1 + 占名额 1 + 使用记录 2（表 + `user_id` 索引）+ 和邀请人的好友关系 2（只有普通码；邀请人好友满了也少这 2 行） | 注册 |
| 登录成功 | 6（需重新哈希 +1） | sessions 2 + `login:ip` 1 + `last_seen_at` 1 + 占一次尝试 1 + 清零 1 | 登录找回 |
| 登录失败 | 1–2 | `login:ip` 1；用户名存在时再加失败计数 1 | 登录找回 |
| 任何超限被拒（429） | 0 | 带条件的 UPSERT 不成立（5.4） | — |
| 普通请求鉴权 | 0 | 只读 sessions | — |
| 更新 `last_seen_at` / 会话续期 | 每人每小时 ≤ 1 / 每 30 天 1 | 这两列没有索引 | 好友与资料 |
| 退出 | 1 | 删会话 | 账号安全 |
| 找回密码 | 6 + 原有会话数 | credentials 2 + 删所有会话 + 新会话 2 + `rec:ip` 1 + `last_seen_at` 1；清零 `login:fail` 时 +1 | 登录找回 |
| 改密码 | 4 + 会话数 | credentials 1 + 删所有会话 + 当前设备新会话 2 + `acct` 1 | 账号安全 |
| 退出其他设备 / 换恢复码 | 1 + 其他会话数 / 2 | 删其他会话 + `acct` 1 / credentials 1 + `acct` 1 | 账号安全 |
| 再验证失败 | 1 | `reauth:fail` | 账号安全 |
| 改昵称、改"让好友看到"的开关（`PATCH /api/me`） | 2 | users 1 + 限流 1（共用每天 10 次） | 好友与资料 |
| 换好友码 | 3 | users 2（改了唯一索引列）+ 限流 1 | 好友与资料 |
| 存档写入（首次或覆盖） | 2 | saves 1 + 每人每天计数 1 | 存档 |
| 存档 409、`too_soon`、`quota_exceeded`、停增长档覆盖变大 | 1 | 只有 `save:<userId>` 计数 | 存档 |
| 存档格式错、`wrong_user`、`too_large`、`rate_limited`、停增长档新建槽 | 0 | 在写计数之前就拒了 | 存档 |
| 读存档 | 0 | 只读；`userId` 不一致时连存档表都不读 | — |
| 发好友请求（新请求 / 对方先发过 / 并发输掉 / 码找不到 / 重复等） | 3 / 2 / 1 / 1 / 0 | friendships 表 + `user_b` 索引 + `freq` 计数；改 `status` + `freq`；只有 `freq`；`fcode` | 好友与资料 |
| 查好友码 | 1（格式不对 0） | `fcode` 计数；只读档或这类预算用完时 503、0 行 | 好友与资料 |
| 接受好友 / 拒绝、删好友、撤回 | 1 / 1（+ 一起打过的游戏数） | 改 `status` / 删一行 + 搭子战绩每个游戏 1 行 | 好友与资料 |
| 屏蔽 / 解除屏蔽 | 2，有关系要删时 3，是好友时再加游戏数 / 2；已屏蔽过、没屏蔽过 0 | `block` 计数 1 + blocks 1 + 删关系 1 / 计数 1 + 删 1 | 好友与资料 |
| 交分：第一次上榜、刷新最好成绩 / 没更好 / 被拒 | 3 / 1 / 0 | `score` 计数 1 + boards 表 1 + 排名索引 1；只有 `score` 计数 | 排行榜 |
| 交分带合格的 `tally`（5.11） | 上面的数 + 1 | `play_tally` 1（UPSERT）；没刷新最好成绩时共 2 | 排行榜 |
| 读榜 | 0 | 只读；读的行数和榜的大小无关（15.5） | — |
| 钱包：带入、结回、放弃、兑换、领补给 | 1 | wallets 1（新号第一次用时是插入，也是 1）；当天计数、到期退回都在这一行里 | 钱包 |
| 钱包：被拒、重复的 op、写满 1,000 次、兑换额度用完、档位或预算停了 / `rev` 冲突 | 0 / 输的那次 0，重算后 1 | 先读、算完才写；带 `rev` 条件的更新不成立是 0 行，最多试 4 次 | 钱包 |
| 结回带合格的 `tally`（5.11） | 2 | wallets 1 + `play_tally` 1（UPSERT）；被拒、重复的 op 仍是 0 | 钱包 |
| 看钱包 | 0；有到期退回时 1 | 没有钱包的人不建行；`GET` 顺带数今天各游戏的人数（只读，扫 wallets，每个 isolate 10 分钟一次） | 钱包 |
| 筹码统计（Cron，每天） | 1 | `wallet_stats`；同一天记过 0；不占 `cleanupMaxRows` | 系统 |
| 浏览器报错 `POST /api/client-error` | 记下 1；同一签名 5 分钟内、限流、预算用完 0 | monitor_counts 1（每签名每天一行，UPSERT） | 监控 |
| 每 5 分钟的巡检（Cron） | 结果没变 0；变了或满 15 分钟 1 | settings 的 monitor 一行 | 监控 |
| 报位置 `POST /api/presence` | 位置没变每人每 2 分钟 ≤ 1；位置变了马上 1，但每人每 10 秒 ≤ 1；节流内 0 | users 1（`presence_*`、`last_seen_at` 同一行） | 在线 |
| 发邀请 / "不了" | 3 / 1 | invites 表 1 + 两个索引 2；只改 `dismissed` | 在线 |
| 好友动态 `POST /api/feed`、结回生成 / 赞、扔道具 | 2；满 10 条、关了开关、预算用完 0 / 2；再点 0 | feed 1 + 索引 1 / 赞计数 1 + feed_reactions 1 | 在线 |
| 发起挑战 / 交挑战成绩 | 4 / 1；交过、满了、过期 0 | `chal` 计数 1 + challenges 2 + 发起人的结果 1 / challenge_results 1 | 排行榜 |
| 搭子战绩 `together()` | 每对好友：新的 2，已有的 1；重复 op、不是好友 0 | mates 1（+ `hi` 索引 1，只在新插入时） | 排行榜 |
| 同桌的屏蔽关系 `ARCADE.blockedAmong()` | 0 | 只读，一条查询，最多读 81 行；不同步计量 | 好友与资料（只记读） |
| 生成 / 撤回邀请码 | 3；额度满、每日满 0 / 1；不是自己的等 0 | invite_codes 1 + 两个索引 2；额度和每天上限写在插入条件里，不另开计数行 / 改 `revoked_at` | 好友与资料 |
| 改邀请额度、单人额度、管理员撤回码、改默认隐藏的游戏 | 2；没变化 0 | settings / users / invite_codes 1 + `admin` 每日计数 1 | 账号安全 |
| 管理员建长期码 | 4 | invite_codes 1 + 两个索引 2 + `admin` 每日计数 1 | 账号安全 |
| 改隐藏游戏的偏好 | 2；超限 0 | `users.game_prefs` 1 + `prefs` 计数 1 | 好友与资料 |
| 注销 | 约 1 + 2 + 会话数 + 存档数 + 成绩数 + 好友关系数 + 屏蔽数 + 限流行数 + 钱包 0–1 + 其他表 | 一次 batch | 账号安全 |
| 管理员建号 / 重设密码 / 删号 | 6 / 1 + 会话数 + 失败计数 0–2 + 1（换恢复码 +1） / 同注销 + 1 | users 3 + 密码 1 + 恢复码 1 + 每日计数 1；不建会话 | 账号安全 |
| 管理员改注册开关、公告、钱包规则 | 2；没变化 0 | settings 1 + 每日计数 1；用令牌调时另有认证的 4 行 | 账号安全 |
| 令牌认证（Bearer） | 成功 4；失败 2；限流或被拒 0 | 两个失败名额各占 1 行，成功再各还 1 行（5.8） | 账号安全 |
| 管理员列账号、看设置 | 0 | 只读，不计每日次数 | — |
| **之后的清理**（Cron） | 每个过期计数行 1、每个过期会话 1、每个旧计量行 1、每条 60 天前的每日榜、每周榜成绩 1、每行 7 天前的报错计数 1 | 每新建一行计数，一生共 2 行写入 | 系统 |

**最坏情况**（匿名刷登录，每次换 IP、随机用户名）：每次尝试新建一个 `login:ip` 行（1），日后清理再 1 行（记系统类）。全站每小时 300 次的上限有上报滞后（6.6），按被刷时 30 个 isolate 估（推断），每小时约 600 次，一天约 1.4 万次。
真正封顶的是"登录找回"类预算（9,000 行，加上滞后超出约几百行）；之后登录、找回 503，已登录的玩家照常存档。清理的那一半记系统类（3,500 行），用完 Cron 当天停清，剩下的留到第二天。
各类预算合计 4 万，加上账号安全类最多 3,000 行的超额和各类的滞后，离只读档的 5 万还有约 7,000 行余量；正常情况下一类被刷不会连带全站只读。

### 7.3 注销与清理

- **注销**：再验证后一次 `db.batch`（D1 里是一个事务），删掉这个人在 users、sessions、credentials、saves、boards、friendships（两个方向）、blocks（两个方向）、wallets、invites（发出的、收到的）、feed（本人发的）、feed_reactions（本人赞的；别人给本人动态的赞 7 天后跟着 Cron 删）、
  challenges 和 challenge_results（本人发起的连同所有结果、本人交的结果）、mates（本人在 `lo`、`hi` 两边的）、invite_codes（本人生成的连同别人用它的 `invite_code_uses` 一起删；本人注册时用过的码只清 `used_by`、删 `invite_code_uses` 里本人那行（走 `user_id` 索引），`uses`、`used_at` 留着，邀请人的额度、长期码的名额不还，不然"邀请 → 让对方注销 → 再邀请"能绕过额度）、
  rate_counters（键里带他的用户 id 或用户名的）里的所有行。计数键清单在 `deleteUserStatements`（`worker/api/account/session.ts`）：`login:fail`、`reauth:fail`、`profile`、`acct`、`save`、`freq`、`fcode`、`fcnew`、`block`、`score`、`admin`、`react`、`chal`。
  管理员删号、一年清理用同一套语句。`blocks` 按被屏蔽方删除没有索引、要扫全表，注销很少，接受。**以后加的表和新的计数键都要加进这个 batch，并有"注销后删干净"的测试。**
- **1 年未登录**：每天的 Cron 找出 `last_seen_at` 早于 365 天前、`role = 'user'` 的用户（没有索引，只花读行数），每次最多 200 个，按注销同样的语句删。**管理员不清**。注意存档接口不更新 `last_seen_at`（5.5）。
- **每天的 Cron 先记筹码统计**（5.9），先于一年清理；出错只记日志，不影响后面的清理。
- **每天的 Cron 还清理**：过期的会话、窗口已过的 `rate_counters`、**60 天前的每日榜**（`dailyBoardKeepDays`，北京时间，带不带 `-v<n>` 都算；固定榜不动；沿排名索引按 `board_id` 范围删，这也是榜单 ID 把日期放在版本号前面的原因，9.2）、
  **60 天前那周以前的每周榜**（同一个 `dailyBoardKeepDays`，只扫登记了 `weekly` 的游戏，`week-YYYY-Www` 补了零，按范围删同样走索引）、
  7 天前的 `meter_hourly` 和 `monitor_counts`、180 天前的 `play_tally`（`tallyKeepDays`）、2 天前的邀请、7 天前的动态和赞、30 天前的挑战和结果、过期或撤回满 30 天、一次没用过的邀请码。清理的写入算进"系统"类，每次最多删 3,000 行（`cleanupMaxRows`），删不完的留到第二天。
  每一段单独兜住：一段出错只记段名和错误类型，接着清下一段。
- 隐私说明里写明：备份（Time Travel）会在 30 天内自然过期。

### 7.4 房间数据

进行中的牌局状态只放在房间 DO 里，结束后随 `deleteAll()` 删掉，不写 D1（战绩走钱包的 `settle` 小结和 `together()`，5.9、5.10）。排行榜只有 `boards`；没有赛季榜，要做的话先考虑在 `games.ts` 登记一个固定榜复用 `boards`。
**写入要算索引行**（7.2）：新加索引前先算一遍"每次写入多几行 × 每天多少次"。

### 7.5 备份、迁移、容量

- **备份**：D1 Time Travel 付费版可回滚 30 天、免费版 7 天；房间 DO 的 SQLite 也能回滚 30 天。自托管见 `tools/selfhost/README.md` 的 `backup.sh` / `restore.sh`。
- **迁移**：只增不删，先加新字段、再停用旧字段。CI 里先迁移、再发布（第 8 节）。
- **容量**：单库免费 500 MB、付费 10 GB，现阶段远远够用。
