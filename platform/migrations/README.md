# D1 迁移

平台库（D1，自托管时是 SQLite 或 PostgreSQL）的结构变更，按文件名顺序执行。每个文件开头的注释写了为什么这样建表、每次写几行；表结构的正本是这些文件，接口怎么用这些表见仓库根 `docs/platform-backend.md` 第 6、7 节。

| 文件 | 做了什么 |
|---|---|
| `0001_accounts.sql` | 账号、会话、凭证、好友、屏蔽、云存档、限流计数、每小时计量（`meter_hourly`） |
| `0002_admin.sql` | `users.role`：普通用户和管理员 |
| `0003_boards.sql` | 排行榜（每人每榜只留最好的一条）；计量加排行榜写入 |
| `0004_settings.sql` | 运行时设置（键值表）：注册开关、公告、钱包和邀请码规则、监控状态 |
| `0005_wallet.sql` | 钱包（一人一行 JSON）和每日统计；计量加钱包写入 |
| `0006_presence.sql` | 好友在线：`users` 上的位置、时间和"让好友看到我在哪"开关；计量加在线写入 |
| `0007_invites.sql` | 一键叫人（好友房邀请，10 分钟有效） |
| `0008_feed.sql` | 好友动态和点赞；`users.show_feed` 开关 |
| `0009_challenges.sql` | 异步挑战和每人的成绩 |
| `0010_mates.sql` | 搭子战绩（一对好友一个游戏一行）；`users.show_mates` 开关 |
| `0011_invite_codes.sql` | 注册邀请码；`users.invite_quota`（单人额度，空就按角色用默认） |
| `0012_monitor.sql` | 浏览器报错按签名每天计数；计量加监控写入 |
| `0013_play_tally.sql` | 真人对局统计（只存每天的汇总，不存哪一局、哪个人） |
| `0014_invites_and_prefs.sql` | 长期邀请码（`max_uses`、`uses`、每次使用一行的 `invite_code_uses`）；`users.game_prefs`（隐藏游戏的个人偏好） |

## 约定

- **只增不删**：新改动加新文件 `000N_*.sql`，编号接着往下排；已经合并的迁移不改（线上已经执行过，改了也不会重跑，只会让新库和线上不一样）。
- **加列用 `ALTER TABLE … ADD COLUMN`，必须带默认值或允许空**：老行没有这一列，读到的是默认值，代码按"没有"处理，不回填。
  需要初始值的（比如开关默认开）写在 `DEFAULT` 里，不在迁移里跑 `UPDATE`：大表全表改写会把一天的写入额度吃掉。
- **主键是 TEXT 或多列的表用 `WITHOUT ROWID`**：省掉一个隐藏的唯一索引，每次插入少写一行（写入行数按 `docs/platform-backend.md` 7.2 计）。
- **新索引要算写入代价**：每个索引让每次插入多写一行；只为管理页、Cron 偶尔查的列不建索引。
- **计量**：新的写入类别在 `meter_hourly` 加一列 `rows_<类别>`，和 `worker/api/lib/db.ts` 的写入类别对上。
- 自托管的 PostgreSQL 有一套对应的迁移（仓库根 `tools/selfhost/pg/migrations/`），平台加迁移时那边要跟着加一份。
