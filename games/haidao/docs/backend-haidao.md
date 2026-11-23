# 海岛后端（异步攻防与实盘）实现笔记

> Durable Object 的规矩：每个方法最多写 2 行存储、不用闹钟和 `setTimeout`、只走 HTTP 不用 WebSocket（模块 AGENTS.md 第 4 节）。

- DO：`BASE` → `Base`（每人一个）、`HARBOR` → `Harbor`（全站一个）、`METER` → kit 的 `RoomMeter`，都是 SQLite 后端（`wrangler.jsonc` 的 migrations `v1`）。上线后新加类另加 `v2`，不改 `v1`。
- 匹配分档：`Harbor.pick` 先找主寨同级和低一级，没有才给高一级（`hqLo` / `hqHi` 收窄 `eligible` 和 SQL 的主寨区间，DESIGN.md 5.9）；都空时第四档影子岛（`HarborStore.recent`，近 14 天上传过、主寨 [自己 − 1, 自己]，回 `{ id, shadow: true }`，不加锁）。
- 影子岛、切磋（design-raid 5.10）：`Harbor.roster`（只读，最多 `ROSTER_MAX` = 20 行）；harbor 表多两列 `name`、`ref`（老表启动时 `PRAGMA table_info` 查、没有就 `ALTER TABLE` 补；`ref` 是名单编号，加列那次给旧行一次补随机数，之后新行插入时生成、upsert 不改它）。`Harbor.rosterTarget` 按 ref 在同一个名单查询里找人（只读），切磋只收 ref 不收 userId。`Base` 新方法 `peek`（只读最新快照）、`note`（往防守记录追加一条，1 行）、`attackerOf`（按 raidId 查进攻方，切磋回去用），都同步进 `BASE_METHODS` / `HARBOR_METHODS`。
- `Base` 状态行多三项：`spar`（24 小时内点名切磋过谁）、`week`（本周赢的奖杯）、`holds`（守住次数）；老状态缺字段由 `state()` 用 `emptyState` 补齐。
- 攻防汇总：真人对真人结算后 `settleAt` 再调 `Harbor.tally`（1 行，写 SQLite 表 `pvp_stats` 的唯一一行；`upsert` 已写满 2 行，所以单独一个方法，不并进匹配表）。汇总不含 userId、昵称、raidId。
  `GET /games/haidao/api/pvp/stats` 只给平台管理员：`whoIs` 认人（401），再经 `ARCADE` 问平台 `/api/me` 看 `user.isAdmin === true`（否则 403），单独部署 501；用平台管理员账号登录后在浏览器直接打开这个地址看 JSON。
- 悬赏守岛、护航、寻宝航线（实盘，DESIGN.md 10.5、12.1、11.1）：`POST /games/haidao/api/{td,escort,map}/{buyin,settle,refund}`、`GET <玩法>/today`，和悬赏出海共用 `worker/live.ts` 的 `handleLive`，几种之间的区别都在 `LIVE_KINDS` 一张表里：钱包 ref 由 Worker 加前缀（守岛 `ht-`、护航 `he-`、航线 `hm-`，出海没有前缀，兑换是 `hx-`），任何一种请求见到任何一种前缀都回 400 `bad_ref`；守岛四档由 `TD_LIVE_OPEN` 控制（关掉的档 `buyin` 回 400 `tier_closed`）；每日场次各自记在 Base 状态行的 `live` / `td` / `escort` / `map` 里（`slotBegin` / `slotUndo` / `slotLeft`），vars `HAIDAO_TD_DAILY` / `HAIDAO_ESCORT_DAILY` / `HAIDAO_MAP_DAILY`，默认 8 / 4 / 1（DESIGN.md 4.0 的合计上限），部署白名单放行前不写进 wrangler.jsonc。
- 规则版本闸门：pvp `find` / `revenge` 和四种实盘（悬赏出海、悬赏守岛、护航、航线）的 `buyin` 请求体必须带 `rules`（`RULES_VERSION`），没带、不是整数或低于当前版本回 409 `need_reload`（`worker/live.ts` 的 `checkRules`，在钱包和存储之前判）；页面弹「游戏更新了」带刷新按钮。
- 实盘不看墙钟：`settle` 只收浏览器报的带回倍数 `bp`（`mode: 'client'`），不量这一局用了多久；带入后 24 小时（`BUYIN_TTL_MS`）内结都有效；局长的上限在规则核心里按游戏拍算（守岛 `TD_MAX_TICKS`、护航 `ESCORT_MAX_TICKS`），暂停时拍数不走。所以守岛里的暂停（P）不影响结算；局中刷新页面照旧按「中途离开」结 0。
- 实盘：钱包绑定 `WALLET` 由部署工具按仓库根的 `tools/workers.json` 补上（不写在 wrangler.jsonc）；单独部署没有它，`/api/live/*` 回 501。每天实盘场次上限是 vars `HAIDAO_LIVE_DAILY`（默认 8）。改倍数表，或改悬赏池里的关（`src/content/livetable.ts` 的 `LIVE_TABLE.live`，冻结副本在 `bountylevels.ts`）的布局、防御，都要重跑 `node tools/live-sim.ts --kind live --n 2000` 并更新 balance-haidao.md 第 2 节。
