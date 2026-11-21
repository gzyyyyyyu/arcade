-- 约局（平台 0.42.0，docs/social.md 1.6、docs/platform-backend.md 15.22）：在好友页定个时间、选一个能开好友房的游戏，发给全部好友。
-- 一人一行（每人同时只有一个约局）：再约就覆盖，取消把 at 改成 0；day/made 记这天（北京时间）约了几次，按 meetupsPerDay 封顶。
-- 好友按主键查对方这一行；表只有"约过局的人"那么大，不加别的索引。Cron 删已经过了的。
CREATE TABLE meetups (
  host_id TEXT NOT NULL PRIMARY KEY,
  game TEXT NOT NULL,
  at INTEGER NOT NULL,
  day TEXT NOT NULL,
  made INTEGER NOT NULL
) WITHOUT ROWID;
