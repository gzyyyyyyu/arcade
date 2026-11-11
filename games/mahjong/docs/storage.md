# 浏览器存储（一律 `mahjong.` 前缀）

> 从 [DESIGN.md](../DESIGN.md) 第 8 节拆出。加键、改格式时同步本表。

读写都经 `src/storage.ts`（`readText`/`writeText`/`removeKey`/`readJson`/`writeJson`）：隐私模式、存满了不抛错，读回退、写返回 false；存的不是合法 JSON 当没存过。`test/storage.test.ts` 守着"别处不直接调 localStorage"（云存档 `net/cloud.ts` 的存储是注入的，也走这几个函数）。

| key | 存什么 |
|---|---|
| `mahjong.solo` | 单机打到一半的一场（状态 + 钱包 ref 和 op），回来接着打 |
| `mahjong.daily` | 每日挑战，按玩法分两份（`sichuan-xuezhan`、`riichi`；老数据只有川麻那一份的结构读成川麻），每份：最近 7 天的今日成绩（日期 → 净得分、算成绩的那一场的号、交上每日榜了没有 `sent`）、最好成绩、连续打卡（最后一天和连续几天）；读不出来当空 |
| `mahjong.hekiri` | 每日何切：最近 7 天每天的成绩（日期 → 总分 0–100 和五题评价 `o` 好 / `n` 接近 / `x` 差）、最好的一天、连续打卡（最后一天和连续几天）；已有今天的成绩，再做就是练习，不改；读不出来当空 |
| `mahjong.ting` | 听牌速判：JSON `{ v: 1, best, daily? }`，`best` 是本机最好的一轮分数（整数，没玩过是 0），`daily` 是今日一轮的记账 `{ date, score, correct, bestStreak, done, sent }`（只留一天，日期变了丢；字段不对当没有，见 docs/practice-modes.md）；读不出来当没有 |
| `mahjong.ladder` | 茶馆擂台：JSON `{ v: 1, titles, best, run? }`，`titles` 是打通过的打法（`xz`、`xl`、`x3`、`rc`），`best` 是每种打法最远赢到第几桌（0–3），`run` 是没打完的一轮 `{ mode, key, table, retried, solo? }`（密钥 8 个 32 位整数，`solo` 是这一桌的单机存档号）；字段不对的丢掉，读不出来当空（见 docs/practice-modes.md） |
| `mahjong.cloud` | 云存档的元数据：JSON `{ userId, rev, dirty, at }`（这台设备同步的账号、槽 `ladder` 的版本、有没有待传、上次上传成功的时刻）；读不出来当没同步过 |
| `mahjong.ladder.pre-sync` | 云存档合并前本机擂台记录的备份（只留最近一次） |
| `mahjong.ladder.pre-switch.<账号>` | 换号前这个账号在本机的擂台称号和最远几桌；登录回这个账号后并回来，传上去以后改名 `.restored` |
| `mahjong.prefs` | 声音、茶馆底噪、安全牌提示（立直，默认开）、振动、速度、上次选的档位、娱乐难度和玩法 |
| `mahjong.comms` | 互动的总开关关着（"不看"） |
| `mahjong.chatOff` | 聊天三档：没有是开，`1` 是"不看"，`stranger` 是"不和陌生人"（匹配桌不收不说） |
| `mahjong.chat` | kit 的聊天设置：弹幕开关、电脑版聊天框收没收起 |
| `mahjong.nick` | 单独部署时好友房里的昵称 |
| `mahjong.guide` | 新手引导看过没有 |
| `mahjong.guide.rc` | 立直的新手说明看过没有（第一次进立直单机牌桌弹） |
| `mahjong.hint` | 已经打出过几张牌（只数到 6）：前几次操作条显示"点两下或往上拖打出"，之后不再显示 |
| `mahjong.hint.rotate` | 竖屏"横过来玩更舒服"的提示出过没有 |
| `mahjong.hint.fun`（kit 写） | "点头像扔道具"的提示出过没有 |
| `mahjong.dex` | 图鉴：川麻番型、立直役各和过几次（只记自己和出来的）；`last` 是最后记过的那一手的标识，刷新后同一手不再记；`fresh` 是新收集、还没在图鉴页看过的（"玩法:id"），老数据没有 |
| `mahjong.ach` | 成就：`{ got, played, wins }`，已解锁的 id、打完几场、这一场和了几把；`last` 是最后判过的那一步的标识 |
| `mahjong.record` | 单机打完了几场、赢了几场、最后记的是哪一场（同一场只记一次），主页的战绩卡用 |
| `mahjong.streak` | 单机连输几场、最后记的是哪一场（同一场只记一次），结算页按它说一句、给降档 |
| `mahjong.fun.blocked`（sessionStorage，kit 写） | 按人屏蔽、全部屏蔽，按房间分开 |
