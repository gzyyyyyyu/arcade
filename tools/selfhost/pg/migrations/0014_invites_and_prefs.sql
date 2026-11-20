-- PG 版（和 platform/migrations/0014_invites_and_prefs.sql 一一对应，自托管 PG 模式用）
-- 文本列一律 COLLATE "C"：SQLite 按字节比较和排序，PG 默认按库的区域规则。
-- 多次邀请码（平台 0.40.0，docs/platform-backend.md 15.20）：管理员建的长期码能用 max_uses 次；普通用户的码 max_uses = 1，照旧。
ALTER TABLE invite_codes ADD COLUMN max_uses BIGINT NOT NULL DEFAULT 1;
ALTER TABLE invite_codes ADD COLUMN uses BIGINT NOT NULL DEFAULT 0;
-- 不回填的话老的已用码会被当成还能再用一次
UPDATE invite_codes SET uses = 1 WHERE used_at IS NOT NULL;

-- 每次使用一行：谁、什么时候
CREATE TABLE invite_code_uses (
  code_id TEXT COLLATE "C" NOT NULL,
  user_id TEXT COLLATE "C" NOT NULL,
  used_at BIGINT NOT NULL,
  PRIMARY KEY (code_id, user_id)
);
CREATE INDEX invite_code_uses_user ON invite_code_uses (user_id);
INSERT INTO invite_code_uses (code_id, user_id, used_at) SELECT id, used_by, used_at FROM invite_codes WHERE used_by IS NOT NULL;

-- 隐藏游戏（15.21）：每人和默认不一样的那部分，{"show":[…],"hide":[…]} 的 JSON；空 = 全按管理员的默认（settings 的 hidden_games）
ALTER TABLE users ADD COLUMN game_prefs TEXT COLLATE "C";
