-- 真人对局统计（docs/platform-backend.md 5.11）。只存汇总：每天、每个（游戏, 玩法, mode, 档位, 时长段, 结果段）一行，n 是局数；
-- 不存哪一局、哪个人。Cron 留 tallyKeepDays 天（默认 180）。
CREATE TABLE play_tally (
  day TEXT NOT NULL,
  game TEXT NOT NULL,
  variant TEXT NOT NULL,
  mode TEXT NOT NULL,
  tier TEXT NOT NULL,
  dur TEXT NOT NULL,
  outcome TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, game, variant, mode, tier, dur, outcome)
) WITHOUT ROWID;
