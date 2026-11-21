-- PG 版（和 platform/migrations/0015_meetups.sql 一一对应，自托管 PG 模式用）
-- 文本列一律 COLLATE "C"：SQLite 按字节比较和排序，PG 默认按库的区域规则。
-- 约局（平台 0.42.0，docs/social.md 1.6、docs/platform-backend.md 15.22）：一人一行，再约覆盖，取消把 at 改成 0；
-- day/made 记这天（北京时间）约了几次。好友按主键查；Cron 删已经过了的。
CREATE TABLE meetups (
  host_id TEXT COLLATE "C" NOT NULL PRIMARY KEY,
  game TEXT COLLATE "C" NOT NULL,
  at BIGINT NOT NULL,
  day TEXT COLLATE "C" NOT NULL,
  made BIGINT NOT NULL
);
