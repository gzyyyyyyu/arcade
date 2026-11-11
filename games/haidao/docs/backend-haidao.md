# 海岛后端（异步攻防与实盘）实现笔记

> 从 AGENTS.md 搬来。Durable Object 的通用规矩（只用 `ctx.acceptWebSocket`、一个闹钟、每步最多写 2 行存储）见 AGENTS.md 和仓库根规范。

- DO：`BASE` → `Base`（每人一个）、`HARBOR` → `Harbor`（全站一个）、`METER` → kit 的 `RoomMeter`，都是 SQLite 后端（`wrangler.jsonc` 的 migrations `v1`）。上线后新加类另加 `v2`，不改 `v1`。
- 匹配分档：`Harbor.pick` 先找主寨同级和低一级，没有才给高一级（`hqLo` / `hqHi` 收窄 `eligible` 和 SQL 的主寨区间，DESIGN.md 5.9）。
- 攻防汇总：真人对真人结算后 `settleAt` 再调 `Harbor.tally`（1 行，写 SQLite 表 `pvp_stats` 的唯一一行；`upsert` 已写满 2 行，所以单独一个方法，不并进匹配表）。汇总不含 userId、昵称、raidId。
  `GET /games/haidao/api/pvp/stats` 只给平台管理员：`whoIs` 认人（401），再经 `ARCADE` 问平台 `/api/me` 看 `user.isAdmin === true`（否则 403），单独部署 501；用平台管理员账号登录后在浏览器直接打开这个地址看 JSON。
- 悬赏守岛、护航、寻宝航线（实盘，DESIGN.md 10.5、12.1、11.1）：`POST /games/haidao/api/{td,escort,map}/{buyin,settle,refund}`、`GET <玩法>/today`，和悬赏出海共用 `worker/live.ts` 的 `handleLive`，几种之间的区别都在 `LIVE_KINDS` 一张表里：钱包 ref 由 Worker 加前缀（守岛 `ht-`、护航 `he-`、航线 `hm-`，出海没有前缀，兑换是 `hx-`），任何一种请求见到任何一种前缀都回 400 `bad_ref`；守岛四档由 `TD_LIVE_OPEN` 控制（关掉的档 `buyin` 回 400 `tier_closed`）；每日场次各自记在 Base 状态行的 `live` / `td` / `escort` / `map` 里（`slotBegin` / `slotUndo` / `slotLeft`），vars `HAIDAO_TD_DAILY` / `HAIDAO_ESCORT_DAILY` / `HAIDAO_MAP_DAILY`，默认 8 / 4 / 1（DESIGN.md 4.0 的合计上限），部署白名单放行前不写进 wrangler.jsonc。
- 规则版本闸门：pvp `find` / `revenge`、live `buyin`、td `buyin` 的请求体必须带 `rules`（`RULES_VERSION`），没带、不是整数或低于当前版本回 409 `need_reload`（`worker/live.ts` 的 `checkRules`，在钱包和存储之前判）；页面弹「游戏更新了」带刷新按钮。
- 实盘：钱包绑定 `WALLET` 由部署工具按仓库根的 `tools/workers.json` 补上（不写在 wrangler.jsonc）；单独部署没有它，`/api/live/*` 回 501。每天实盘场次上限是 vars `HAIDAO_LIVE_DAILY`（默认 8）。改倍数表，或改悬赏岛借用的关卡（c07、c10、c16）的布局、防御，都要重跑 `node tools/live-sim.ts --n 2000` 并更新 DESIGN 4.3。
