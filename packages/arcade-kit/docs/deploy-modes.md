# 两种部署方式、自托管存储、部署要准备的东西

> 总览和子路径表见 [README](../README.md)。

## 两种部署方式：平台模式和独立模式

同一份游戏代码两种部署，**由 env 决定，不由代码决定**（`guest.ts` 的 `isStandalone(env)`）：

| | 平台模式（本站正式环境） | 独立模式（任何人单独部署一个游戏） |
|---|---|---|
| 条件 | 有服务绑定 `ARCADE`；或者写了 `GATE: "login"` | 没有 `ARCADE`，`GATE` 也不是 `"login"` |
| 认人 | 经 `ARCADE` 问平台 `/api/me`（`whoIs`） | 游客 cookie：游戏 Worker 自己发，`userId` 是 `g:` 加 cookie 值的 SHA-256 前 128 位 |
| 首页 `loginGate` | 没登录 302 到 `/login`，平台不可用 503 | 放行，没有游客 cookie 就补发一个 |
| 开房 `acceptCreate` | 没登录 401 | 没有游客 cookie 就现发（回话带 Set-Cookie） |
| 进房 `acceptJoin` | 没登录 4401 | 没有游客 cookie 4401（进房不发 cookie，页面刷新首页即可） |
| 昵称 | 平台的 displayName | 地址上的 `?name=`，`cleanNickname` 清洗；不合格或没带是"游客"加 4 位数字 |
| 计量 `METER`、房间、协议 | 照常 | 照常（`KIT_QUOTA` 一样管额度） |

- **安全**：有 `ARCADE` 绑定时游客 cookie 一律不看（测试覆盖：本站带游客 cookie 开房 401、进房 4401、首页 302）。
  `GATE: "login"` 却没绑 `ARCADE`（部署工具漏了绑定）时**不退成游客模式**，按平台不可用拒绝（fail-closed）。同源检查两种模式都照旧。
- **游客 cookie**：https 下名字是 `__Host-kit-guest`（`HttpOnly; Secure; SameSite=Lax; Path=/`，约 400 天），值是 32 字节 `crypto.getRandomValues`。
  同一个站点下的几个游戏默认共用一个游客身份（和平台的一个账号一样），想分开就传 `guest: { cookie: '<游戏 id>-guest' }`，
  `loginGate`、`acceptCreate`、`acceptJoin` 三处要传同一个。http（`wrangler dev` 用局域网 IP 打开）下浏览器不收 Secure cookie，名字不带 `__Host-`、不带 Secure。
- **昵称**：NFKC 归一后只许字母（含汉字）、数字和空格 `_ - . ·`，1 到 12 个字（`NICKNAME_MAX`）；不能含保留词：kit 自带"电脑、机器人、游客、AI、bot……"（`RESERVED_NICKNAMES`），
  游戏把自己电脑人物的名字传进 `guest: { reserved: [...] }`。浏览器用 `withNickname(url, name)` 给开房、进房地址带上。
- **站点根路径**：独立部署到 `workers.dev` 时游戏仍挂在 `/games/<id>/`。Worker 入口最前面加
  `const root = standaloneRoot(request, env, '<id>'); if (root) return root;`，独立模式下 `/` 302 到 `/games/<id>/`，
  `/api/me` 回 200 `{ standalone: true }`（页面的 `detectPlatform` 认作没有平台，控制台不冒 404）；平台模式回 null，不管。
  这两个路径要先到 Worker：把 `"/"`、`"/api/me"` 加进 `assets.run_worker_first`。

**独立配置的 wrangler.jsonc**（游戏仓库里放这一份；本站正式部署时由维护者的部署工具补上 `ARCADE`、`WALLET` 和 `GATE: "login"`、路由）：

```jsonc
{
  "name": "<游戏 id>",
  "main": "worker/main.ts",
  "compatibility_date": "2026-10-01",
  "workers_dev": true,                    // 独立部署用 <name>.<子域>.workers.dev
  "assets": { "directory": "./dist-cf", "binding": "ASSETS", "run_worker_first": ["/", "/api/me", "/games/<id>/", "/games/<id>/rooms", "/games/<id>/rooms/*"] },
  "durable_objects": { "bindings": [{ "name": "ROOM", "class_name": "Room" }, { "name": "METER", "class_name": "RoomMeter" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Room", "RoomMeter"] }]
  // 不写 services（没有 ARCADE、WALLET），不写 GATE
}
```

**页面怎么降级**：开局时 `const p = await detectPlatform()`（问同域 `/api/me`，默认 2.5 秒超时）：
- `{ platform: true, user }`：有平台，照常（`user` 为 null 是没登录）；
- `{ platform: false }`：404 或不是平台的 JSON，独立部署。藏起登录、云存档、排行榜、钱包（实盘），"回大厅"改成回游戏首页（`./`）；
- `{ platform: 'unknown' }`：5xx、429、断网、超时。平台可能只是抖了一下，按游戏自己的取舍（比如先按有平台、稍后再问一次）。

## 自托管 PG 模式的存储（KitStore）

kit 的三个 Durable Object（房间 `GameRoom`、计量 `RoomMeter`、排队 `MatchQueue`）的存储可以换：**有没有 `KIT_STORE` 绑定决定**，游戏代码、`wrangler.jsonc` 都不用改。
游戏要用 kit ≥ 0.21 才能跑这个模式。

| | 默认（Cloudflare、自托管 SQLite 模式） | 自托管 PG 模式（arcade-host 的生成器注入 `KIT_STORE`） |
|---|---|---|
| 条件 | 没有 `KIT_STORE` | 有 `KIT_STORE`（服务绑定，`props.game` 是游戏 id，游戏改不了） |
| 存哪 | `ctx.storage.sql` 的 `kit_room`、`kit_day`、`kit_user` 表和 KV 的 `miss`（同表同列同 SQL，已有数据照读） | 宿主的 PostgreSQL，主键 (游戏, 角色, 名字, 表, 键)；DO 自己只用 workerd 的内存存储放闹钟 |
| 一步之内 | 同步读写 sql，没有 await | 同步读写内存镜像（`src/store.ts` 的 `MirrorStore`），没有 await |
| 广播 | Cloudflare 的输出门保证落盘后才发 | 这一步的 send / close 先排队，`flush`（一次事务提交脏行和当前闹钟）成功才发；没有改动不提交 |
| 写存储失败 | 作废缓存 | 一样作废缓存、不发这一步的消息，连着的人 1013 断开（客户端照常重连，拿到 PG 里的状态）；kit 不重试，下一步自然重写 |
| 每步 ≤ 2 行 | 按 `rowsWritten` 记 | 按镜像的 put / delete 记（建表那 2 行没有，开房那一步是 2 行） |
| 进程重启 | — | 宿主按 PG 里存的闹钟逐个调 `kitWake(name)`（三个类都有，幂等，只有绑定能调），kit 读回来、重设闹钟（过期的马上响）；直接进房也会按房间码读回来 |

- 角色名（`ns`）是 `room` / `meter` / `match`，名字是 `idFromName` 用的那个（房间码、`kit-meter`、`kit-miss:<key>`、`kit-match:<档位>`），kit 自己记、调 DO 时自己带，不依赖 `ctx.id.name`。
- `KIT_STORE` 的 RPC 形状见 `src/store.ts` 的 `KitStoreRpc`：`load(ns, name) → { rows, alarmAt }`、`commit(ns, name, puts, deletes, alarmAt)`、`wipe(ns, name)`。RPC 的回话用完就释放（不释放的话对象空闲了也驱逐不掉）。
- 桌上筹码的兜底不变：房间状态全丢了，平台钱包到 `until` 原样退回（钱包在平台库里，不靠房间）。
- 测试两遍：`vitest run`（默认）和 `vitest run -c vitest.pg.config.ts`（多绑一个假 PG，`test/fake-pg.ts`），同一套房间、计量、排队的测试都过；PG 专有的几条（提交在广播前、提交失败不广播、重启后 kitWake、每次提交 ≤ 2 行）在 `test/store.test.ts`。

## 游戏部署要准备的东西

CI 的 `pkg-arcade-kit.yml` 只跑测试；kit 改动时依赖它的游戏的流程也会跑一遍测试。用 kit 的游戏要准备这些（写在游戏自己的 `wrangler.jsonc` 里，整体部署见仓库根 [README](https://github.com/gzyyyyyyu/arcade/blob/main/README.md) 的部署一节）：

- 绑定：`ROOM`（游戏的房间 DO）、`METER`（`RoomMeter`）、`ARCADE`（到平台 Worker 的服务绑定，`/api/me` 认人走它；独立部署不绑，见本文"两种部署方式"）；
- 变量：`GATE` 有三种意思：`"login"` 必须接平台（没绑 `ARCADE` 时 fail-closed）；`"off"` 本地开发不拦首页；不写时看有没有 `ARCADE`；
- 变量：`KIT_QUOTA`（可选，改每天的额度门槛，见 [rooms.md](rooms.md) 的"每天的额度"）；`SITE_ORIGIN`（可选）：Origin 只认这个站点。
  不设就认请求自己的 origin（游戏和平台挂在同一个站点下，浏览器从哪个站点打开、连的就是哪个），想更严的在部署时注入，再由游戏传给 `acceptCreate` / `acceptJoin` 的 `siteOrigin`；
- kit 里不写死站点地址：同站校验默认用请求的 origin，`/api/me` 按请求的 origin 拼地址、经 `ARCADE` 绑定去问。
