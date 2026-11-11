-- PG 版（和 platform/migrations/0013_play_tally.sql 一一对应，自托管 PG 模式用）
-- 文本列一律 COLLATE "C"：SQLite 按字节比较和排序，PG 默认按库的区域规则。
-- 真人对局统计（平台 0.27.0，docs/platform-backend.md 5.11）：只存汇总，不存哪一局、哪个人。
CREATE TABLE play_tally (
  day TEXT COLLATE "C" NOT NULL,
  game TEXT COLLATE "C" NOT NULL,
  variant TEXT COLLATE "C" NOT NULL,
  mode TEXT COLLATE "C" NOT NULL,
  tier TEXT COLLATE "C" NOT NULL,
  dur TEXT COLLATE "C" NOT NULL,
  outcome TEXT COLLATE "C" NOT NULL,
  n BIGINT NOT NULL,
  PRIMARY KEY (day, game, variant, mode, tier, dur, outcome)
);
