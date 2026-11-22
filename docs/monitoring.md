# 监控和告警

> 本文是平台文档的第 16 节（16.1–16.3），别处写的「platform-backend.md 16.x」就是这里的 16.x。
> 检查项和阈值以 `platform/worker/api/ops/monitor.ts` 为准；本文和代码不一致时改本文。
> 文中不带文件名的其他节号按全站编号找，对照表见 [README.md](README.md#节号对照)。


## 16. 监控和告警

不引入新服务、不给 Cloudflare 加新凭证：平台自己巡检、把结果放在公开的 `/api/monitor`。仓库不带告警通道，由运营站点的人自己接（16.3）。
接口是公开的，所以返回和日志里只有模块、检查项和计数，没有域名、IP、用户名、userId。

### 16.1 接口

| 接口 | 认证 | 返回 | 写 |
|---|---|---|---|
| `GET /api/health` | 无，任何档位都答 | `{"ok", "version", "db"}`：`db` 是 `SELECT 1` 成不成；查不了回 503 | 0 |
| `POST /api/client-error` | 无；只查 Origin，不要 `X-Arcade`（kit 的 `reportErrors` 用 `sendBeacon` 发，带不了自定义头） | 204；`game` 不在 `games.ts`、没有 `msg` 400；每 IP 每分钟超 10 条 429 | 见 7.2 |
| `GET /api/monitor` | 无，任何档位都答，`cache-control: no-store` | `{"checks": [{"id", "ok", "n"?, "pct"?, "skip"?}], "at"}`，`at` 是巡检最后一次写状态的时间 | 0 |

`/api/client-error` 的请求体 `{"game", "ver", "msg", "stack"?, "path"?}`：`msg` 截到 200 字、`stack` 截到 1,000 字、`path` 去掉 `?` 和 `#` 以后的部分（里面可能有房间码、邀请码），
整条 `console.error` 成一行 JSON 进 Workers Logs（`wrangler.jsonc` 的 `observability` 开着）。库里只存签名（游戏 + `msg` 前 80 字的 SHA-256 前 16 位）和计数，不存报错原文。
同一签名每个 isolate 5 分钟只记一次，刷屏的报错不会把监控类预算用光。

### 16.2 检查项和阈值

巡检是第 2 个 Cron（`*/5 * * * *`），每天 UTC 19:17（北京时间 03:17）那次清理之后也跑一遍。阈值在 `config.ts` 的 `monitor*`。

| 检查项 | 失败的条件 | 说明 |
|---|---|---|
| `health:<游戏>` | 同域查 `/games/<id>/health`：5 秒超时、网络错、非 2xx、`ok` 不是 `true` | 只查 `status: 'playable'` 的游戏；回 404 算还没接（`skip: true`），不告警。没设 `SITE_ORIGIN`（本地、一键部署）不查 |
| `errors:<游戏>` | 10 分钟内浏览器报错 ≥ 20 条，或当前版本才出现、以前几天没见过的签名报到 ≥ 5 次 | 10 分钟的数按状态里的快照算：快照只在当天总数变了时记，10 分钟前或更早里最新的那条就是 10 分钟前的数 |
| `wallet` | 有钱包的余额或桌上的筹码不是非负整数 | 每天那次查，其余几次沿用。各天的筹码统计记不下已结的带入，算不出逐笔对账，所以只查这个 |
| `quota` | 当天用量（调用数、写入、读取里最高的那项）≥ 停服线（6.6 的 `off`）的 80% | 读 `/api/monitor` 时按计量现算，不存 |
| `cron` | 状态 30 分钟没更新 | 状态没变时每 15 分钟也写一次心跳，加上 Cron 的 5 分钟间隔，正常时最多 20 分钟旧，漏掉一次 Cron 也不报 |

状态放 `settings` 的 `monitor` 一行 JSON，只在结果变了时写（另加每 15 分钟一次心跳，每天约 96 行），写入记在监控类（7.2）。停服档不巡检。

### 16.3 告警流程

仓库只提供 `/api/monitor`，告警由运营方用自己的定时任务和通知渠道接；GitHub Actions 和 Issue 都不用来告警。最小的做法是在任意一台机器上用 cron
每几分钟读一次接口，有检查项 `ok` 是 `false`（或接口读不到）就发通知。下面的例子要 `curl` 和 `jq`，`notify` 换成自己的通知命令（邮件、聊天机器人的 webhook 等）：

```sh
#!/bin/sh
# /usr/local/bin/arcade-monitor.sh，crontab 里写：*/10 * * * * /usr/local/bin/arcade-monitor.sh
SITE=https://game.example.com
if body=$(curl -fsS --max-time 20 "$SITE/api/monitor"); then
  failed=$(printf '%s' "$body" | jq -r '.checks[] | select(.ok == false) | .id' | tr '\n' ' ')
else
  failed="接口读不到"
fi
[ -n "$failed" ] && notify "arcade 告警：$failed"
```

- 想只在结果变了时通知、恢复时再发一条，把上次的 `$failed` 存进文件比较即可。
- `cron` 这一项本身就能发现巡检停了（16.2），所以外面的定时任务只要读得到接口就够，不用另查 Cron。
- 查问题：Workers Logs 里按 `client-error` 和签名找原文，接口的错误日志只有路径和错误类型。
