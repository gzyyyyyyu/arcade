# 浏览器存储 key（全部 `guandan.` 前缀）

| key | 内容 |
|---|---|
| `guandan.save` | 进行中的整局：`{ v, state: GameState, difficulty, counted, dealsCounted }`；整局结束即删除 |
| `guandan.settings` | 音效档位 `sfx`、音乐档位 `musicVol`（0 关到 3 大）、全部静音 `muted`（大厅关了声音时这一次先静音但不写这一项，见 `common/audio.ts` 的 `applyAudio`）、动画速度、难度、地方规则、牌背、记牌器开关、互动开关（字段名仍是 `taunts`）、娱乐单机的局长 `length`（`short` / `full`）、快速匹配桌上和陌生人打字聊天 `strangerChat`（默认开）、斗地主娱乐的发牌 `ddzDeal`（`classic` / `clump` 不洗牌） |
| `guandan.stats` | 战绩：局数、胜局、连胜、最高连胜、副数、头游次数 |
| `guandan.tutorial` | 新手引导是否看过 |
| `guandan.achievements` | 成就 `{ v, unlocked: id[], gdGames, ddzGames, gdStreak }`（`view/common/achievements.ts`）；坏数据当空；只在本机，不进云同步 |
| `guandan.errors` | 最近 20 条未捕获错误（兜底面板写入） |
| `guandan.cloud` | 云存档元数据 `{ v, userId, rev: {stats?, tutorial?}, dirty: 槽[] }` |
| `guandan.room` | 最近进的好友房 `{ code, host, at, userId, match?, variant? }`（`match: true` 是快速匹配排到的桌，`variant: 'ddz'` 是斗地主房间），刷新、回来时接回去；只给 `userId` 那个账号看；离开房间、回不去的关闭、换号、退出就删 |
| `guandan.<槽>.pre-sync` | 云同步合并改了本地数据前的备份（槽 = `stats` / `tutorial`，只留最近一份） |
| `guandan.<槽>.pre-switch.<旧 userId>` | 换账号清空本地前的备份，每个旧账号一份（和 pre-sync 分开）；写时和已有的合并（只会变多），写完读回核对，没存上就不清空、暂停同步；之后再登录这个账号时并回本地、补传 |
| `guandan.boot` | iOS 防崩溃标记 `{ v, pending, low, ver }`：页面在前台时 pending=1，切后台/离开清 0；打开时还是 1 说明上次被系统杀了，low 升一档（1 = 一倍渲染，2 = 再换 Canvas 渲染）；ver 不是当前版本就整条作废（只在 iOS 上写） |
| `guandan.stake` | 单机实盘这一场：`{ v, userId, ref, tier, share, until, match: { tier, deals }, state, settle }`；只在本机、不进云同步；结回或退回后删，过了 `until` 打开标题页时删 |
| `guandan.a2hs` | 标题页"添加到主屏幕玩更大"提示点过 ✕（值 1） |
| `guandan.nick` | 单独部署时好友房里的昵称（字符串；有平台时不用，昵称以平台账号为准） |
| `guandan.chat` | 聊天的界面设置：弹幕开关、电脑版聊天框收起、记录展开（由 kit 的 table-fun 按 `storageKey: 'guandan'` 读写） |
| `guandan.hint.fun` | 首次进牌桌冒过"点头像扔道具，长按连扔"了（由 kit 的 table-fun 读写），只出一次 |
| `guandan.fun.blocked` | sessionStorage：点头像"屏蔽他"屏蔽了谁（由 kit 的 table-fun 读写，按房间码分开、记座位和名字，那个座位换了人就不算） |
| `guandan.variant` | 主页上次选的玩法：`'guandan'` / `'ddz'`（没有就是掼蛋） |
| `guandan.ddz.save` | 斗地主进行中的一局：`{ v, state: DdzState, level, counted, dealsCounted }`；规则版本不对或整局结束就删 |
| `guandan.ddz.stats` | 斗地主战绩：局数、胜局、副数、赢的副数、当地主几次、当地主赢几次、春天次数（只在本机，不进云同步） |
| `guandan.ddz.tutorial` | 斗地主单机的新手引导是否看过 `{ v, done }`（第一次进单机娱乐牌桌弹，4 步；好友房、实盘、每日、托管、带 seed 的调试开局不弹；设置里"重看引导"一并清掉；只在本机，不进云同步） |
| `guandan.ddz.puzzles` | 斗地主残局闯关过了哪几关 `{ v: 1, done: id[] }`（id 是关卡表里的 `p01`…；坏数据当空；只在本机，不进云同步） |
| `guandan.ddz.dailyPuzzle` | 斗地主每日残局今天的最好成绩 `{ v: 1, date, best, tries }`（`tries` 是今天打完了几次；换一天从头记；坏数据当没打过；只在本机，不进云同步） |
| `guandan.ddz.stake` | 斗地主单机实盘这一场：`{ v, userId, ref, tier, share, until, rules?, state, settle }（rules 是规则版本，没有就是 1）`；只在本机、不进云同步；结回或退回后删 |
| `guandan.<槽>.pre-switch.<userId>.restored` | 上面的备份并回本地、传上去之后改名到这里（安全副本），以后不再并——"当前连胜"会归零，反复并会被旧值抬回去 |

新增 key 必须带前缀、只在 `src/view/store.ts` 里读写（kit 的 table-fun 按 `storageKey: 'guandan'` 自己读写的三个除外），并补进这张表。
