-- 多次邀请码（平台 0.40.0，docs/platform-backend.md 15.20）：管理员建的长期码能用 max_uses 次；普通用户的码 max_uses = 1，照旧。
-- 码的类型显式存在 max_uses 里，不靠推断；uses 是用了几次。占名额是注册 batch 里的条件更新 `uses < max_uses`（并发只放过名额那么多人）。
ALTER TABLE invite_codes ADD COLUMN max_uses INTEGER NOT NULL DEFAULT 1;
ALTER TABLE invite_codes ADD COLUMN uses INTEGER NOT NULL DEFAULT 0;
-- 表只有"每人几个码"那么大，回填几十行；不回填的话老的已用码会被当成还能再用一次
UPDATE invite_codes SET uses = 1 WHERE used_at IS NOT NULL;

-- 每次使用一行：谁、什么时候。注册时写 2 行（表 + user 索引）；注销按 user 索引删
CREATE TABLE invite_code_uses (
  code_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  PRIMARY KEY (code_id, user_id)
) WITHOUT ROWID;
CREATE INDEX invite_code_uses_user ON invite_code_uses (user_id);
INSERT INTO invite_code_uses (code_id, user_id, used_at) SELECT id, used_by, used_at FROM invite_codes WHERE used_by IS NOT NULL;

-- 隐藏游戏（15.21）：每人和默认不一样的那部分，{"show":[…],"hide":[…]} 的 JSON；空 = 全按管理员的默认（settings 的 hidden_games）
ALTER TABLE users ADD COLUMN game_prefs TEXT;
