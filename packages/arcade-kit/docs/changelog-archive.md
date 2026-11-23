# 更新日志（归档）

0.11.0–0.27.0 的版本段，从 [CHANGELOG.md](../CHANGELOG.md) 挪来，内容不再维护；0.10.2 及更早的在 [changelog-archive-2.md](changelog-archive-2.md)。

## 0.27.0（2026-11-20）

- **新可选钩子 `RoomGame.idle(state)`**：牌局没结束、但只在等"再来一场"这类事时返回 true。从不是变成是的那一步，房间就把开房名额还给计量
  （匹配桌是每个排进来的人的），房间照常开着、照常收操作；之后 `over` 变真时再还一次，计量认重复还。每人同时只能开 1 个房间时，
  以前打完停着等再来一场的那几分钟里开房的人被 `has_room` 挡回旧房间。不写 `idle` 的游戏和以前一样，`over` 才还。
  - **单向**：进了 idle 只能留在 idle 或者 over。游戏从 idle 回到在打（不占名额接着打，能绕过每人同时几个房间），房间记日志、按打完收尾；
  - 计量说满了（stopWrites）时 idle 也算收场点（`land` 和 `windDown` 两处），房间以 4000 + `quota` 关房。
- **待还名额按人合并**：房间要还的名额以前是一个对象，后来的会被先到的挡掉（`??=`）或者冲掉（`=`）：匹配桌没来的人那批（退当天次数）还没还上时
  进 idle 或打完，到场的人就漏还、或者没来的人的退次数丢了。现在同一个房间码的按人取并集、退次数的人单独记，还的时候分两次找计量。
- 文档：`docs/room-options.md` 加 `idle` 一节，`docs/rooms.md` 的可选接口清单列上它。
- 测试：`test/pause.ts` 加 `PAUSE_ACT.idle`、`wake`；`pause.test.ts` 测进入 idle 就能再开房、房间照常收操作，没进 idle 的照旧占着，
  从 idle 回到在打按打完收尾，计量退避期内进 idle 时和没来的人那批合并、过了退避一起还（没来的人连次数一起退），stopWrites 时进 idle 就以 quota 关房。

## 0.26.0（2026-11-18）

联机稳定性第二轮（10-16 审 kit 时清单里剩的三条）：

- **重连后补发有分寸**（`RoomClient`）：以前没确认的操作在 onopen 一次全发，断线时攒得多就撞上房间每人 10 个的令牌桶，被当成违规 1008 断开、不再重连。
  现在最多留 `PENDING_MAX`（8，和房间记得的 moveId 一样多：更早的房间认不出是重发，补发可能做两遍）个，挤掉最早的；超过 `PENDING_TTL_MS`（60 秒）的丢掉；
  先发 `RESEND_BATCH`（4）个，其余等前面的有了 ack 或被拒再发。
- **连上就断不再快速重连**（`RoomClient`）：以前收到 welcome 就把退避清零，弱网、代理掐连接时"进房 → 马上断"每次都半秒就重连。
  现在进了房间、连着待够 `STABLE_MS`（30 秒）再断才清零；失败次数照旧在 welcome 时清零（不会因此变成 failed）。
- **房间清半开的连接**（`GameRoom`）：浏览器那头没了、关闭帧又没到时，房间一直当他在线，掉线托管、"没人"关房都不开始算。
  新的 `RoomLimits.deadSocketMs`（默认 90 秒）：闹钟醒来时，回过 ping、之后这么久没再回过的连接（看 `getWebSocketAutoResponseTimestamp`）
  关掉（新的 `CLOSE.goingAway` 1001，客户端照常重连），当掉线记下，和这一步的其他改动一起提交（还是一步最多 2 行）。从没回过 ping 的连接不管：不发心跳的旧页面、各游戏测试里不发 ping 的连接都不会被误关（各游戏的 test:room 不用改）。
- 测试：`test/client.test.ts` 加"进房马上断退避不清零""补发有分寸"两条，原来"进房后退避清零"改成待够 30 秒；`test/room.test.ts` 加"半开的连接"一条。三条新测试都做了反证（改回旧行为会失败）。
- 用本地打包的 0.26.0 跑过每个游戏和平台的 `npm test`、有 `test:room` 的也跑了，都过；自己写假 `ctx` 跑房间测试的游戏（比如弹里个弹的 `test/fake-workers.ts`）没有 `getWebSocketAutoResponseTimestamp` 也照常：
  房间按可选调用取，没有就当"从没回过 ping"、不清，旧运行时同样。**升级不用补**（`test/room.test.ts` 有一条 ctx 没有这个方法时闹钟照常、不关连接）。

## 0.25.2（2026-11-10）

- 只改文档和注释，代码行为不变。README 压到约 180 行：先写直接安装再写按别名装，开头加英文最小示例（规则、Worker、浏览器三段）和子路径表；各部分的用法挪到 `docs/`（`rooms.md`、`room-options.md`、`deploy-modes.md`、`table-fun.md`、`chat.md`、`match.md`、`viewport.md`、`share.md`、`theme.md`），README 里指向仓库文件的链接改成 GitHub 绝对链接（npm 包里不带 `docs/`）。
- 改正过时的说法：仓库里的游戏也按 npm 别名装（不再是 `file:`），版本示例改成 `^0.25.1`；普通 Node 能加载的入口写全（只有 `room`、`meter`、`match`、`testing` 依赖 `cloudflare:workers`）。
- `AGENTS.md` 每条只留守什么和哪个测试守着；0.19.1 及以前的更新日志挪到 `docs/changelog-archive.md`；更新日志和代码注释里的内部称呼改成写明原因。

## 0.25.1（2026-11-03）

- "叫朋友来"面板在电脑大屏（宽 ≥ 1280、高 ≥ 720）上放大一档：面板宽 420 → 560，标题 17 → 22、好友名 15 → 19、按钮字 14 → 17、按钮高 44 → 52，间距跟着放。原来 1920 上面板只占五分之一宽、字 12–14 像素，像缩小了的手机界面（雀馆看图第 23 条）。手机和平板尺寸不变；翻页本来就按实际行高分，行变高时一页自己少放几个。
- 面板的颜色本来就走 `--ak-*` 主题（底 `bg`、字 `fg`、次按钮 `soft`、边 `border`、主按钮 `accent`）；和游戏自己的弹窗不是一套的，由游戏传主题对齐，kit 不改默认色。

## 0.25.0（2026-11-02）

- 新子路径 `arcade-kit/viewport`：手机平板的可见区、双指放大、转屏补算、安全区、渲染倍数、省内存、WebGL 丢失恢复收成一份（`watchViewport`、`watchStage`、`visibleBox`、`safeInsets`、`renderScale`、`isLowMemoryDevice`、`lowMemoryTier`、`onWebglLoss`、`webglUsable`、`isIOS` 系列）。默认值取开盘的实现（仓库根 AGENTS.md 第 4 节以开盘为准）：放大判定 `|scale − 1| > 0.02`、补算 300ms、写 `--app-h`、`scrollTo(0, 0)`、省内存设备（iOS 或触屏）渲染倍数封顶 2、WebGL 丢了 3 秒才提示；另外默认所有设备都跑、也听 visualViewport 的 scroll。牌馆的做法（钉元素扣安全区、省内存三档、20 秒降档、只认放大）做成选项。这一版不改任何游戏，各游戏迁过来时传原值，行为不变。
- 判断和公式是纯函数，单测在 `test/viewport.test.ts`；DOM 接线（转屏补算、放大中不动、取消监听、真的 WebGL 丢失和恢复）在无头浏览器里三个尺寸实测过。
- `dprScale({ dpr, cap, lowMemory, lowMemoryCap })`：只按像素比、可以是小数的渲染倍数（海岛 cap 2 / 省内存 1.5，夜巡 3 / 2，弹里个弹 2），和设计尺寸取整的 `renderScaleFor` 并列。
- 测试：`test/viewport-dom.test.ts` 用手写的假 window、visualViewport 测 `watchViewport`（放大不动、缩回跟上、转屏先量再补、判重、取消监听摘干净、`--app-h` 取整）和 `onWebglLoss`（提示、收起、取消监听）；`test/viewport-games.test.ts` 把五个有画布的游戏原来的渲染倍数公式照抄，和 kit 传对应参数的结果逐个比（7 种尺寸 × 7 种像素比 × 省内存开关）。不加 happy-dom 依赖。

## 0.24.3（2026-11-02）

- 牌桌互动面板的短语页按可用高度翻页，不再在框里滚动（和聊天短语、"叫朋友来"同一个 `pageChips`）：可用高度取 224 和"屏幕高减去面板其余部分"里小的那个，放得下就一页；放不下时底下一行 `‹ 1/3 ›`（`data-key` 是 `fun:phrases-prev` / `fun:phrases-next`，翻页键 44 像素见方），换页签再回来还在那一页。原来手机横屏上最后一行被滚动框截掉一截，看着像字被裁了。
- "叫朋友来"的好友列表和互动面板的短语区不再是滚动框：要不要翻页按各行带小数的真实行高加间距算（原来按取整的 `offsetHeight` 累加、再看 `scrollHeight`，游戏给按钮加的阴影、伪元素会把 `scrollHeight` 撑大，只有一个好友也显示 `1/1`、还差 2–8 像素要滚），游戏的字体晚到时重新分一次。量的时候除掉弹出动画的缩放（面板从 0.92–0.94 倍放大进来，动画没走完就量，每行少算 6%，一页多塞一行，压到底下的按钮）。
- "叫朋友来"一页放得更多：提示那一行没字时不占地方（有字时出来、重新分页），翻页键和"复制邀请链接"同一行；分页时列表高度钉在最满那一页实际用的高度，面板跟着收，不留空白。844×390 上一页从 2 个好友变成 3 个。
- 分享卡的大数字和小数据可以带 `sign`（输赢的分、筹码）：正绿负红，描一圈白边，各游戏的底色上都看得清；不给照旧是白字。游戏要传了才有，不传不变。

## 0.24.2（2026-11-02）

- 修：房间判断"别人看不看得出这一步"（不轮流的操作，0.7.1）时，按房间的最大座位数挨个问 `game.view`，这一局用不到的空座（雀馆三人局、斗地主开在 4 座房间里）也问。游戏的 `view` 接不住不存在的玩家就抛错，这个连接被断开。现在只问这一局在用（`seatCount` 以内）、不是空座的座位。游戏不用改代码。
- 单测：`test/ledger.test.ts`「这一局的座位比房间少」：3 人局开在 4 座房间，走一次别人看不出来的一步和一次看得出来的一步；测试用的记账桌问用不到的座位时会抛错（改回旧写法这条就挂）。

## 0.24.1（2026-11-02）

- "叫朋友来"面板的好友列表不再滚动，改成按列表的可用高度翻页（和 0.24.0 聊天短语同一个做法，分页用同一个 `pageChips`）：放得下就一页、没有翻页键；放不下时列表下面一行 `‹ 1/3 ›`，最后一页再点回第一页。翻到行少的末页，列表高度不变。窗口变了重新分页。翻页键 44 像素见方，`data-key` 是 `invite:prev` / `invite:next`。游戏不用改代码。

## 0.24.0（2026-11-02）

- 聊天的快捷短语不再滚动，改成按可用空间分页：一页放得下几条放几条，放不下翻页。电脑版聊天框两行一页，短语下面一行 `‹ 1/3 ›`；手机输入条一行一页，最右一个 `1/3 ›` 芯片，点一下翻页，最后一页再点回第一页。只有一页时没有翻页控件。翻页控件的点按区都 ≥ 44 像素。
- 窗口、字号变了会重新量、重新分页，当前页号保持在范围内。游戏不用改代码；短语多、窗口窄时会多出翻页，`data-key` 新增 `chat:phrases-prev` / `chat:phrases-next`（原来的 `chat:phrase<i>` 不变，翻到别的页时不在页上的短语按钮是隐藏的）。
- 分页的算法是纯函数 `pageChips`（`arcade-kit/fun-logic`），单测在 `test/fun-logic.test.ts`。

## 0.23.1（2026-10-31）

- 牌桌互动的首次提示（"点头像扔道具，长按连扔"）点屏幕任何地方立刻收起，不用等 3 秒。点的那一下照常落到牌和按钮上，不被吞掉（全站界面规范 `docs/ui.md` 第 11 条）。监听在提示自己收起和 `destroy()` 时摘掉。
- "点一下就收"是导出的纯函数 `tapDismiss`，单测在 `test/table-fun.test.ts`。

## 0.23.0（2026-10-31）

- 新子路径 `arcade-kit/prng`：单机规则核心用的 sfc32 伪随机，把四个游戏各抄一份的实现收进来。
  - `hashSeed`、`createRng`、`rngFor` 是牌馆、开盘的写法；`hash32`、`streamRng`、`intModulo` 是海岛、夜巡的写法（两种哈希给出的数不同，不能互换；海岛的整数取法是 `u32 % n`，单独给出）。
  - `Sfc32` 类有 `u32`、`next`、`int`、`pick`、原地 `shuffle`、`snapshot`。
  - 只搬不改：`test/prng.test.ts` 的黄金向量是从四个游戏原来的代码算出来的，逐位相等。游戏的存档续玩、回放、每日题、服务端复算都靠它不变。
  - 种子只有 32 位、不保密，**不得用于联机发牌**，联机照旧用 `arcade-kit/rng` 的 ChaCha20。
  - 各游戏换成 import 它是下一步，各自开 PR；这一版没有游戏改动。

## 0.22.2（2026-10-31）

- 只整理代码，行为和对外接口不变：`GameRoom`（`src/room.ts`）里不碰 DO 状态的三块拆成独立文件——`room-seats.ts`（座位和身份的纯函数）、`room-rate.ts`（短语、聊天、入站令牌桶和每人份额）、`room-persist.ts`（存储那一行的结构、SQLite / PG 读写、旧房间补字段）。`room.ts` 从 2137 行减到约 1900 行，`ChatRate`、`EmoteRate`、`chatRateOf`、`emoteRateOf` 仍从 `room.ts` 导出。新加 `test/room-parts.test.ts` 直接测这几块的纯函数。

## 0.22.1（2026-10-27）

- 头像点按热区（`.atf-hot`）夹回可见区：热区按头像居中放大到 44 见方，头像离屏幕边不到 22 像素时会伸出屏幕（牌馆竖屏 375×667、390×844 左边座位伸出 4 像素），伸出去的那截点不到。改由纯函数 `hotBox` 算位置，单测在 `test/fun-logic.test.ts`。

## 0.22.0（2026-10-21）

- **浏览器错误上报 `arcade-kit/report`**：`reportErrors({ game, version })` 挂上 `error` 和 `unhandledrejection`，把没人接住的报错 POST 给平台 `/api/client-error`，返回卸载函数。
  只发 `{game, ver, msg, stack, path}`（msg 截 200 字、stack 截 1000 字、path 不带 query 和 hash），不带账号、昵称、cookie；同签名（msg 前 80 字）一页只报一次、一页最多 5 条；
  优先 `sendBeacon`，没有就 `fetch`（keepalive），失败吞掉不重试；"Script error." 和浏览器扩展的报错不报；没有 window 时什么也不做。单测在 `test/report.test.ts`。

## 0.21.3（2026-10-20）

- 补 0.21.2：聊天框小按钮的 `::before` 是从内边框算起的，芯片自带 1 像素边框，上下各少 1，1920 实测点按区只有 42。标题行改成上下各扩 5、常用语各扩 7（行距 12 → 14，滚动框上下留 7），实测 44；框比 0.21.2 再高 2 像素，看起来的按钮大小不变。单测把边框算进去。

## 0.21.2（2026-10-20）

- 电脑版聊天框里的小按钮点按区补到 44 像素：标题行的按钮（画 36）和常用语（画 32）用 `::before` 上下扩出去，看起来不变；常用语换行的行距 6 → 12，两行各扩一半不互相压，框高多 6 像素。掼蛋多尺寸检查在 1104×884、1366×1024、1920×1080 报的 32–36 像素。

## 0.21.1（2026-10-20）

德州报的两处气泡问题：
- **1280 自己的气泡下沿和聊天框底边重叠几像素**：聊天框的完整矩形原本就是硬禁区，可是判定只看"重叠面积是不是 0"，气泡贴着框边也算合格，画出来描边和阴影就压上去几像素。现在硬禁区（名牌、标签、聊天框、"互动"按钮、开着的菜单）四周各让出 `HARD_PAD`（4 像素）再找位置。
- **1920 打开聊天菜单时盖住自己大半个气泡**：开着的菜单以前不算禁区。现在它也是硬禁区，新冒的气泡避开它；菜单刚打开时，被它盖住的气泡挪到别处（挪不开就留在原地，菜单关了自然露出来）。
- 加了 3 条单测：`padBox`、1280 气泡和聊天框之间至少隔 4 像素、1920 气泡挪到菜单外面。

## 0.21.0（2026-10-20）

- **可插拔的存储（KitStore），给自托管 PG 模式**（接口六条和自托管的需求对过）：
  env 里有 `KIT_STORE` 绑定时，房间、计量、排队的存储走宿主的 PostgreSQL（`src/store.ts` 的 `MirrorStore`：同步读写内存镜像，每一步末尾一次事务提交脏行和当前闹钟）；
  没有时照旧直接用 `ctx.storage.sql`，同表同列同 SQL，Cloudflare 和自托管 SQLite 模式的行为逐字不变，已有数据照读。游戏代码、`wrangler.jsonc` 不用改。
  - "一步之内没有 await"不变；PG 模式这一步的 send / close 排队，提交成功才发（等于 Cloudflare 的输出门）；提交失败作废缓存、不发，连着的人 1013 断开重连；没有改动的步骤不提交。
  - 进程重启：三个类都加了 `kitWake(name)`（只有绑定能调的 RPC，幂等），宿主按 PG 里存的闹钟逐个唤醒；进房时 `acceptJoin` 在内部地址上多带房间码（`&code=`），重启后直接进房也能从 PG 读回来。
  - 计量的进房猜码计数（原来 KV 的 get、put 中间隔着 await）在 PG 模式里镜像里同步读改写，没了丢更新的窗口；`kitMiss`、`kitMisses`、`kitMissBlocked` 多一个可选的 key 参数（PG 模式靠它找行，默认模式不看）。
  - RPC 回话用完就释放：不释放的话对象空闲了也驱逐不掉（本地 workerd 实测）。
- **测试两遍**：`npm test` 多跑一遍 `vitest run -c vitest.pg.config.ts`（测试 Worker 多绑一个假 PG，`test/fake-pg.ts`），同一套 425 条都过；
  直接读写 sqlite 的几处测试换成两种存储都能用的帮手（`test/helpers.ts` 的 `roomRow`、`setRoomRow`、`setMeterDay`……）。
  PG 专有的在 `test/store.test.ts`：不碰 sqlite、每次提交 ≤ 2 行、状态没变不提交、提交慢时消息等提交完、提交失败不广播并 1013、重启后 kitWake 恢复闹钟且幂等、重启后直接进房、计量和排队的 kitWake、猜码计数在 PG 里。
  房间状态全丢后桌上筹码到期退回靠平台钱包的 until，`testing.test.ts` 的"到期原样退回"已经覆盖。

## 0.20.4（2026-10-20）

- **头像旁所有气泡都不压名牌**：0.20.3 只管了首次提示；普通聊天、表情、电脑起哄的气泡还是"压名牌代价 ×3"，掼蛋 1920 上自己说话的气泡压住了上家阿强名牌的下半截。
  现在所有气泡都先找一点都不压名牌、标签、"互动"按钮和聊天框的位置（`placeClear`，可以压一点头像边角），尽量靠近说话人；实在找不到时普通气泡退回原来"压得最少的一侧"照样冒（话不丢），首次提示仍然换短句或晚点再试。合并成内部的 `bubbleSpot`，加了单测。

## 0.20.3（2026-10-20）

- **首次提示"点头像扔道具"不再盖任何座位的名牌**：0.20.1 起名牌和标签（`FunSeat.plate`、`marks`）只是代价 ×3，头像四边都压到时提示还是会挑一边盖上。
  现在提示一点都不许压名牌、标签、"互动"按钮和聊天框：四边都会压就在可见区里找最近的空处（新的 `placeClear`）；整句放不下换短句"点头像扔道具"；还放不下就过 2 秒再试，没冒出来不记"已提示"。普通聊天、表情气泡照旧贴着说话人。
- **弹幕里自己那条"我：…"换成卡通第二版的配色**：原来深红底金边，现在奶油渐变底、深棕描边、深棕字（"我："红棕），和别人那种半透明深色底一眼分得开。

## 0.20.2（2026-10-18）

- **电脑版聊天框照常展开**：0.20.1 把快捷短语换行排开后，框变高了；1920 宽的掼蛋被判"放不下"、默认收成"聊天"小按钮，和"电脑上聊天要显眼"冲突。
  现在聊天框里的快捷短语最多两行（按钮矮一点，32 像素），多出的在框内上下滚；空记录区最少一行（原来两行，空时那句提示一行放得下）。框的总高度和 0.20.0 一样，掼蛋 1920 实测 216 像素、照常展开，8 个短语全看得见。
  手机输入条上的照旧横着滑。

## 0.20.1（2026-10-18）

牌桌互动的遮挡和两个公开参数（只修布局，不加功能）：
- **气泡不盖名牌**：头像旁的气泡（含首次提示"点头像扔道具"）把各家的名牌（名字、筹码数）当硬禁区（代价 ×3，和按钮、聊天框一样）。0.18.2 当软的，别处也挤时提示还是会盖住对家的名字和筹码。接线抽成纯函数 `bubbleZones`，测试带反证。
- **头像旁的标签**（麻将体检：首次提示"点头像扔道具"压住右上家的缺门签）：`FunSeat` 加 `marks`（缺门签、庄家这类小标签的屏幕矩形），和名牌一样当硬禁区。
- **电脑版聊天框的快捷短语**（麻将体检：最后一个只露半截）：聊天框里那排换行排开、全部看得见；手机输入条上的照旧横着滑。
- **竖屏自己的气泡和"互动"按钮**：核对过 0.19.1 已经修好（按钮是硬禁区），补了接线的测试。
- **"互动"按钮的大小**：`buttonStyle` 加 `fontSize`、`icon`（像素，给了就不按 `scale` 算；字不小于 12、图标不小于 16）。德州、麻将可以不再覆盖 `.atf-btn`，颜色、圆角走主题变量。
- **默认收起聊天框**：`TableFunOptions.chatFolded()`。玩家没点过收起、展开时听它，给了 `chatDock` 也生效；玩家点过就以玩家为准。德州可以不再自己往 `texas.chat` 写 `folded`。

## 0.20.0（2026-10-18）

快速匹配（设计 docs/match.md）：同一个游戏、同一个档位排队，凑满一桌立刻开，最多等 15 秒，到点 ≥ 2 个真人开桌、只剩自己转单机。不新建 Worker。
- **排队** `arcade-kit/match` 的 `MatchQueue`（新入口，DO）：每个档位一个实例；0 行存储（排着的人就是休眠的 WebSocket）、一个闹钟（最早那个人到点）；同一个人再排旧连接 4001 让位；
  每人每小时 30 次（4029）、队长 200（1013）；排队连接只收不发（发了 1008）。凑桌前问平台 `ARCADE.blockedAmong`，屏蔽过的两个人不同桌；单独部署没有平台时跳过。
- **入口** `acceptMatch(request, env, tier, { tiers })`：认人、查 Origin 和进房一样；入队前问一次计量（新的只读 `kitPeek`）：有开着的房间回 `has_room`，今天的次数用完、联机忙、计量连不上回 `solo`。
- **房间** `kitCreateMatch`：一次占齐所有人的名额（新的 `kitReserveMany`，占不齐一个都不占），排进来的人建房时坐好（`matchSeats(n, count)` 可覆盖，默认随机）；
  都连上就和最后一个人进房同一步开打，等满 `RoomLimits.matchJoinMs`（20 秒）没来的电脑代打、来了交还；外人进房 4004，`start` 回 `not_host`，等人时不能换座；
  打完、关房还每个人的名额（`kitReleaseMany`）。`RoomInfo.match` 告诉页面这是匹配桌。好友房行为不变。
- **页面** `MatchClient`（`onWaiting`、`onMatched`、`onHasRoom`、`onSolo`，断线不重连）和转单机的默认文案 `MATCH_TEXT`（"今天联机局数用完了，先和电脑打"等）。
- **安全审阅改的几处**：凑桌找平台、找房间各等最多 3 秒（`MATCH_CALL_MS`，用 `scheduler.wait`，不占闹钟），屏蔽名单超时按空的、建房超时这一桌转单机；
  入队先回 101 再凑桌；`MatchClient` 到点再过 10 秒（`MATCH_GRACE_MS`）没结果自己转单机；开打时没来的人退名额和当天次数；
  队长上限只数还排着的连接；每小时的入队记录清掉一小时前的；新纯函数 `matchConfigErrors`（`arcade-kit/game`）让游戏在测试里查档位配置；
  `kitReserveMany` 的注释写明一次写 1 + 人数 行（计量里，不算房间的一步）。
- **聊天框放不下就先收着**（掼蛋 0.24.0 线上问题）：电脑版聊天框四个角都会压到头像、名牌、出牌区时（新纯函数 `dockFits`，按排出来的真实高度判断），玩家又没自己展开或收起过，默认收成"聊天"小按钮。
  掼蛋 1280×720 上它原来压在左上角，盖住左家的头像和剩余张数、点不到他；1920 放得下照常展开（截图核对过）。
- 额度：匹配桌也占每天的开房名额（`dailyRoomsPerUser`，默认 6，游戏 `vars.KIT_QUOTA` 里改）；全站开房数一张桌只记 1。
- 文档：docs/match.md 改成实现版（陌生人打字聊天默认开、设置里能关，开放公开注册时重新评估；屏蔽名单直接用平台 0.25.0 的 RPC）；README 加"快速匹配"一节。
- 测试：`match.test.ts` 18 条、`client.test.ts` 加 4 条（MatchClient、兜底）、`game.test.ts` 加 1 条（matchConfigErrors）、`fun-logic` 加 1 条（dockFits）；`FlakyMeter` 改拦 `kitReserveMany` / `kitReleaseMany` / `kitPeek`。
  反证七处（外人能进、不自动开打、不按 joinBy 开、没来的不托管、只还第一个人的名额、建房不设超时、没来的不退名额）各有测试失败。

## 0.19.1（2026-10-18）

0.19.0 接进掼蛋后截图看出的两处：
- 气泡压到叠在它上面、能点的东西（"互动""聊天"按钮、聊天框）代价按 3 倍算（`placeBubble` 的新参数 `hard`，倍数 `HARD_COST`）：按钮在气泡上面，压了字就看不见；
  原来只按面积挑，掼蛋手机横屏的好友房里"右边压按钮"和"上边擦左家名牌"面积差不多，自己的气泡钻到了"互动"按钮底下。
- 弹幕层裁在弹幕区（`danmakuArea` 或默认区）里：从区的右沿出现、左沿消失，不再飘出区外擦过两边的座位。
- 测试：`fun-logic` 加 1 条（面积差不多时按钮当 hard 就换到另一侧）；反证：倍数改成 1 时失败。

## 0.19.0（2026-10-18）

聊天打磨（因为聊天太简陋、不显眼，电脑上气泡太小；设计见 docs/chat.md 第 5 节），并进了原定 0.18.2 的三处界面小修。游戏升级后不用改代码就能用，要摆得准再传几个可选项。
- **聊天入口**：电脑上牌桌一角常驻聊天框（最近几条记录、一排快捷短语、输入框，回车发送，可收起、可展开记录）；手机上"互动"旁边一个"聊天"按钮（未读红点），
  点开是贴在手牌和操作按钮上面的输入条（快捷词、输入框、发送、记录、✕），键盘弹起时站到键盘上面。快捷短语点了按短语发，走互动的通道和冷却。
- **弹幕**：所有人说的话（含自己、含短语）从右往左飘，自己的高亮；按轨道排，避开手牌、按钮、头像、名牌、中间信息区（新选项 `center()`）、聊天框和气泡；
  弹幕垫在效果层最底下，气泡永远在上面。同屏最多 12 条（手机 6 条），只动 transform。"弹幕：开 / 关"默认开，减少动态效果或省内存（新选项 `lite()`，默认看 deviceMemory ≤ 2）时默认关；
  `fun.danmaku()` / `fun.setDanmaku(on)` 给游戏设置用。
- **气泡**：字号按屏幕（电脑 18–22px、手机 ≥ 15px），最多两行折行，不再一行截断；聊天的停 5 秒（`CHAT_UI.bubbleMs`）；新气泡也避开正在显示的气泡。
  位置由纯函数 `placeBubble` 挑：朝牌桌中间、另一侧、上、下，避开"互动"按钮、聊天框、名牌、别家头像（原 0.18.2：竖屏自己的气泡被按钮压住、道具气泡盖住对家名字和筹码）。
  `FunSeat` 加可选的 `plate`（名字和筹码那块）。
- **记录**：最近 30 条，名字按座位配色；电脑在聊天框里，手机在互动面板的聊天页。
- **设置存储**：新选项 `prefsKey`（默认 `<storageKey>.chat`，必须是 `<游戏id>.<名字>`，不合格构造时抛错），存弹幕开关、聊天框收起和记录展开。
- **互动按钮的尺寸参数**（原 0.18.2）：`buttonStyle?() → { scale?, row? }`，替掉游戏对 `.atf-btn` 的覆盖；不传就不写行内样式，旧覆盖照样生效。图标尺寸走 `--atf-icon`。
- 新选项 `chatDock()`、`chatButton()`、`danmakuArea()` 让游戏指定聊天框、手机聊天按钮的位置和弹幕区；纯函数 `chatMode`、`chatFont`、`danmakuLanes`、`danmakuSpeed`、`pickLane`、`placeDock`、`barBottom`、`placeBeside`、`seatColor` 在 `fun-logic`。
- `controls()` 改成报 `.atf-ui` 里所有带 `data-key` 的东西（聊天框、聊天按钮、输入条都能点到）。
- 测试：`fun-logic` 加 14 条（气泡 4 条；版式、轨道、停靠、输入条、按钮、配色 10 条），`table-fun` 加 2 条（prefsKey），主题守卫扫 `table-chat.ts`。
  反证两处：不看 avoid 时气泡测试失败；轨道不看 blocked 时 2 条失败。

## 0.18.1（2026-10-18）

- 单机也能聊（聊天要单机也能用）：`arcade-kit/chat` 加 `localChat(say, opts?)`，返回和 `RoomClient.chat` 一样用法的发送函数：过同一套 `checkChat`、本地限速（默认同房间 3 秒一条、一分钟 10 条，`opts.now` 给测试注入），
  行就调 `say(text, masked)`。只在浏览器本地显示自己说的，不发、不存，不碰 DOM；电脑不读。
- `ChatSendResult` 类型挪到 `chat.ts`（`client.ts` 照旧导出，旧代码不用改），`chat.ts` 不依赖 `client.ts`。
- 测试：`test/chat.test.ts` 加 3 条（过滤同房间、限速两道和拒发不占条数、`ms`/`perMin` 为 0 不限）；反证：让被拒的也占条数，测试失败。docs/chat.md、README 写明单机怎么接。

## 0.18.0

好友房打字聊天（设计 `docs/chat.md`；`docs/social.md` 3.1 改成要做）。游戏要显式打开，不开的游戏行为完全不变。
- **房间**：`RoomGame.chat = true` 后入座的人能发 `{ t: 'chat', text }`；房间过 `checkChat`、按座位限速（3 秒一条、一分钟 10 条，`RoomLimits.chatMs` / `chatPerMin`，`KIT_QUOTA` 可改），
  只转发给连接时带了 `chat=1` 的连接（`{ t: 'chat', seat, text, masked? }`）。0 行存储、不改 seq、不进快照和 welcome；被拒回 `CHAT_ERRORS` 里的 code、不占条数。`welcome.chat` 带节奏和字数。
- **过滤**（新入口 `arcade-kit/chat`，纯函数）：NFKC 规整、去零宽和方向控制符；≤ 30 个字；链接、连续 7 位以上的数字（空格、横线、中文数字拆开的也认）、微信 QQ 号样式整条拒发；
  **标准千分位的金额放行**（1,000,000，≤ 10 位，审阅时加的），拒发提示"不能发号码，金额请写成 1,000,000"；脏话按 `chat-words.ts` 打码照发，游戏能用 `chatWords` 加词。
- **页面**：`RoomClient` 的 `onChat`、`onChatError`、`chat(text)`（本地先挡）、`chatWait()`；`acceptJoin` 把 `chat=1` 转给房间。
  `TableFun` 的 `chat` / `chatEnabled` 选项、`chat(seat, text)` 收、`chatError(code)`：聊天页、4 秒气泡、小红点、键盘避让。`bubble()` 多一个 `cls` 参数并返回气泡元素。
- 平台屏蔽名单：这一版只有 kit 本地屏蔽，平台 RPC 出了再接。
- 测试：`test/chat.test.ts` 20 条（过滤的绕法和误伤、金额、打码；房间转发、旧页面收不到、限速两道、被拒不占数、chat_off、不进快照和存储、聊天代码不碰存储和钩子；`RoomClient` 本地挡和分流）。
  反证：去掉房间的限速、不看 `chat=1` 都转发，对应测试失败。演示页截了 1280×720 和手机横屏 844×390，控制台零报错。

## 0.17.0

- 牌桌互动加可选的 `hintSeat()`：首次提示"点头像扔道具，长按连扔"冒在哪个座位由游戏定，返回 null 表示现在会挡住东西（比如那家刚出的牌），组件过 2 秒再问。
  掼蛋手机横屏上提示一直冒在右家头像左边，正好盖住右家刚出的牌（验收时发现）。不给就和以前一样挑第一个电脑。
- 挑座位的逻辑抽成纯函数 `hintSeatFor`，`test/table-fun.test.ts` 加两条（反证：忽略游戏给的座位，测试失败）。

## 0.16.0

DOM 组件的主题参数（因为 kit 的菜单、面板和各游戏的风格不一致）。
- **`--ak-*` 变量**：`share.ts` 的预览层、`social.ts` 的邀请横条和"叫朋友来"面板、`table-fun.ts` 的菜单和面板，颜色、圆角、字体改成 `var(--ak-xxx, <原来的值>)`，
  共 11 个：`bg`、`fg`、`accent`、`accent-fg`、`border`、`radius`、`radius-btn`、`font`、`overlay`、`soft`、`title`（每个用在哪见 README"主题"一节）。**默认值就是原来写死的值，不传主题外观不变。**
- **`theme?: KitTheme`**：`ShareOptions`（`shareCard`、`prepareShare`）、`SocialOptions`（`mountSocial`；`handle.openInvite` 的面板默认用它）、`InvitePanelOptions`（`openInvite`）、`TableFunOptions` 都多一个可选的 `theme`，
  传了就把变量写到组件根节点的 style 上，没传就不写（游戏也可以只在自己的 CSS 里把 `--ak-*` 写在 `:root` 上，靠继承生效）。
- **新入口 `arcade-kit/theme`**：`KitTheme` 类型、纯函数 `themeVars(theme)`（主题 → `[变量名, 值][]`）、`applyTheme(el, theme)`、`safeThemeValue`。
  值含 `;` `{` `}` `<` `>` `\`、`/*`、`url(`、`expression`、`@import`、`javascript:` 或超过 200 字的字段忽略（防 CSS 注入）。import 时不碰 DOM，无运行时依赖。
- 不动的：分享卡 canvas 的配色（由游戏给的 `card.accent` 定）、`fun.ts` 的素材、状态色（灰、开、选中）、气泡米色底、名场面横幅红渐变。
- 测试：`test/theme.test.ts` 11 条：`themeVars` 的映射、空对象、拒绝注入；源码守卫扫 `share.ts`、`social.ts`、`table-fun.ts`、`fun.ts`，每个 `var(--ak-` 都带默认值、变量名都在 `theme.ts` 的表里，`applyTheme` 写在根节点 `cssText` 之后（自审时发现横条写反了，主题会被清掉）。
  反证：让 `themeVars` 接受带 `;` 的值、去掉 `share.ts` 一处默认值，对应测试都失败。演示页（`demo/*.html?theme`）换深色木纹 + 金色强调，默认和换主题各截了图对比。

## 0.15.1

急修：桌面上点"分享"每次失败（Windows Chrome 上点德州"分享这一场"）。
- **系统分享只给手机、平板**：新纯函数 `useSystemShare(ua, maxTouchPoints)`。Windows Chrome 的 `canShare` 对文件回 true，以前会弹出 Windows 系统共享，选微信后微信 PC 版窗口空白、报"共享失败"；
  现在 Windows、Mac、Linux 桌面（含触屏笔记本）一律直接出预览。iPadOS（桌面版 UA）靠多点触控认成平板；微信内置浏览器照旧不调。
- **桌面预览加"复制图片"**（`navigator.clipboard.write` + `ClipboardItem`，不支持就不摆），成功提示"已复制，去微信里粘贴"；按钮顺序：复制图片、保存图片、复制链接、关闭。`data-key` 是 `share:copy-image`。
- 测试：`share.test` 加 `useSystemShare` 的表驱动（Windows Chrome / Edge、触屏 Windows、Mac Chrome / Safari、Linux、iPadOS、老 iPad、iPhone、安卓手机和平板、鸿蒙、iOS 和 Windows 的微信）和桌面预览的按钮；反证过。
  浏览器实测（Windows UA，`canShare` 假装回 true）：不调系统分享、直接出预览，"复制图片"后剪贴板里是 `image/png`。

## 0.15.0

分享卡加强（为了晒战绩、一键分享、发朋友圈）。
- **右下角二维码**：朋友圈里的图不能点，扫码是唯一入口。内容是运行时的 `location.origin` 加上 `opts.url` 的路径、查询和 `#`（`shareLink`），代码里不写域名。
  纯白框、近黑的格、每格整数像素、留白 ≥ 4 格，下面写"扫码来玩"；名场面和日期往左让。链接太长（> 213 字节）不画码。
- **二维码编码器 `src/qr.ts`**：自己写的最小子集（字节模式、纠错 M、版本 1–10），不引运行时依赖（kit 至今零运行时依赖，引一个就进每个游戏的 lockfile 和审阅范围）。
- **微信内置浏览器**：检测到 `MicroMessenger` 不试系统分享，直接出预览：图用 `data:` URL，提示"长按图片 → 发送给朋友，或保存后发朋友圈"，不给"保存图片"。
- **系统分享的 `text` 末尾带上链接**（有的 App 只取 text）；系统分享的 `url`、"复制链接"也换成 `shareLink` 算出的那一个。
- `drawShareCard(card, canvas?, link?)`、`shareCardBlob(card, link?)` 多一个可选参数，不给就和以前一样不画码。
- 测试：`qr.test`（新）：版本 1–10 的边界长度都用 jsQR（Apache-2.0，devDependency）解回原文，格式信息、版本信息对规范表的已知向量；`share.test` 加链接、文字、码的留白、微信 UA 几条。
  反证：格式信息错 1 位、纠错码生成元错、版本信息 BCH 错、链接用游戏给的域名、微信里给保存、文字不带链接，都让测试失败（格式信息错 1 位解码器会纠正，所以另加了已知向量）。
  浏览器里实画三张演示卡，JPEG 质量 0.6、缩到 360 宽后都解得出链接。

## 0.14.0

第三轮安全审计 kit 的三条。
- **进房猜码限次**（中）：`acceptJoin` 按人、按 IP 数每小时"码不存在"的次数（`KIT_QUOTA` 新字段 `joinMissesPerUser` 20、`joinMissesPerIp` 60）。超了以后进任何房间都回 1013，
  房间在不在都一样；只有这个房间的自己人（房主、坐着的、开打后绑过座位的）照常进，断线重连不受牵连。计数放在计量类按人、按 IP 取的小实例里（不挤全站那一个），每次各 1 行并记进当天的数。
  房间回"码不存在"时在 101 上带内部头 `x-kit-miss`，转给浏览器前去掉。
- **令牌桶按人记**（低）：以前每条连接一个桶，断开重连就拿到一个满的；现在按 userId。
- **旁观名额**（低）：按账号数；房主和开打后绑过座位（离座去看）的人不占名额、也不受限，几个陌生账号占满名额也挡不住他们。
- 评估（只评估，没做）："房主踢人"和"只许好友坐下"见 PR 说明；结论是暂不做，猜码限次加上开打后座位绑人已经够用，出现滥用再加。
- `worker.ts` 只按类型引用 `meter.ts`（门槛由计量的小实例自己按 `KIT_QUOTA` 算）：游戏会在普通 Node 的测试里加载 `worker.ts`，`meter.ts` 依赖 `cloudflare:workers`；加了一条架构测试守住。
- 测试：`room.test` 第三轮审计 4 条；反证（不去内部头、不记数、超限不放自己人、不带超限头、令牌桶按连接、绑过座位的也占名额）都会让测试失败。

## 0.13.1

稳定性小修（含第三轮审计 kit 的 setAlarm 一条）。
- **闹钟设不上不再让房间停住**：
  - 房间：`setAlarm` 出错当场再试一次；两次都失败、又不是闹钟触发的那一步时，按 `getAlarm()` 核对，存储里没有闹钟就补一个 60 秒后的（醒来按状态重新算），不再只等下一个入口。
  - 浏览器：`RoomClient` 加看门狗。状态和进房快照多带一个 `now`（房间发消息时的时间，协议只加字段）；房间说的出手时限或停顿结束过了 `STALL_GRACE_MS`（20 秒）加最多 10 秒抖动还没有新状态，
    就重连一次把房间叫醒（存储一直坏着、补设也失败时的最后一道）。同一个 seq 只踢一次，抖动让一桌人里先到的去踢。旧房间不带 `now` 的不看。
- **`table-fun` 的 `storageKey` 校验**：只认游戏 id 的写法（小写字母、数字、连字符，最多 32 位，不能是 `arcade`），拼出来的 key 一定是 `<游戏id>.` 开头；不合格构造时直接抛错（`checkStorageKey`）。
- **`test/quota.test.ts`"分批报"偶发失败的根因**：打完一局、断开连接后，测试用 `lastStepWrites > 0` 等"房间处理完断开"，可打完那一步就已经 > 0，等于没等；
  机器一忙，断开晚于"拨时间 + 叫醒闹钟"，房间不按"没人了"关，少了关房那一次报数，最后的等式差几行。现在等房间存下 `noHumanSince` 再拨时间（和 `ledger.test` 一样），
  最后的账用等条件成立的方式核对，不按固定时间等。反证：老写法下让断开晚于闹钟处理，必挂（差 4 行）。
- 测试：`client.test`（看门狗 4 条）、`room.test`（重试一次就设上、`now`、补设 60 秒后的、两次都失败照旧）、`table-fun.test`（新）；改坏代码的反证都做过。

## 0.13.0

搭子战绩（平台 0.19.0，`docs/platform-backend.md` 15.19）。
- **`reportTogether(env, op, players)`**（`arcade-kit/room`）：好友房打完一场，把同桌真人（`{ userId, team?, win }`）经钱包服务绑定的 `together()` 报给平台。
  没有 `WALLET`（单独部署）或它没有 `together` 时跳过；去重后少于 2 人、多于 8 人、op 不合格时跳过；回话原样返回，抛错吞掉只记错误类型，不重试。
- **`GameRoom.reportMatch(players, match)`**：按座位给，按开打后绑的人认 userId（电脑座位不报），op 用 `togetherOp(房间码, 开房时刻, match)`，交给 `ctx.waitUntil`，在同步的 `onStep` 里调就行。
- **假钱包**（`arcade-kit/testing`）加 `together`：形状照平台的 parseTogether 查，记到每个人的 `FakeBank.together`，同一个 op 重报不加。
- 测试：`test/together.test.ts` 8 条（跳过的几种情况、正常调用、异常吞掉、op 拼法、假钱包的形状和去重、房间按座位认人，反证过）。

## 0.12.5

社交第二期的好友动态（平台 0.17.0，`docs/platform-backend.md` 15.17）。
- **`postMoment(game, moment, n?, n2?, n3?)`**（`arcade-kit/social`）：报一条娱乐名场面到 `POST /api/feed`，只带游戏 id、编号和最多 3 个整数；文字由游戏的 `public/moments.json` 按编号给模板（`{name}`、`{n}`、`{n2}`、`{n3}`）。
  返回 HTTP 状态（0 = 没连上）。平台超了每天 10 条、关了开关都静默回 204，所以游戏不用管条数；编号、数字本地就不合格的不发、回 400。
- 测试：`test/social.test.ts` 加 2 条（请求形状、本地拦下不合格的）。

## 0.12.4

线上补验发现：掼蛋房间弹窗 `#online` 的 z-index 是 8500，盖住了"叫朋友来"面板（1600）：面板在 DOM 里，但看不见、点不到。
- **默认层级提到 10000 以上**（`SOCIAL_Z`）：邀请横条 10500、"叫朋友来"面板 10600、分享预览 11000，顺序照旧是横条 < 面板 < 预览。三处都能用 `zIndex` 选项再往上提（`mountSocial({ zIndex })`、`openInvite({ zIndex })`、`shareCard` / `prepareShare` 的 `zIndex`）。
- **好友"在哪"用平台给的游戏名**：`Presence` 加可选的 `gameName`（平台在好友列表的 `where` 里给）。`whereText` 先用它，没有再用 `gameName` 回调，都没有才说"在玩游戏"。kit 和游戏不用认识别的游戏。
- 测试：`test/social.test.ts` 的"在哪"加 3 条（平台名优先、好友房、空串退回回调）。

## 0.12.3

开盘、麻将接分享卡时报上来的两处。
- **iOS 上调不起系统分享**：iOS 只许在点击的那一下（用户激活）里调 `navigator.share`，`shareCard` 是点了才画卡（解码图标、`toBlob` 要几百毫秒），激活过期了，只能退到预览。
  加 `prepareShare(card, opts)` → `{ ready, share() }`：结算页一出现就调它先画好，点"分享"时在点击的处理函数里直接调 `share()`（前面别 await）——卡已经画好就同步调 `navigator.share`；
  没画好就等画完再试，调不起来退回预览。`ready` 画失败也是 resolve（到 `share()` 时再报错）。`shareCard` 保留，内部走 `prepareShare`。
- **名场面的结尾引号单独掉到下一行**：折行时收尾的引号、右括号、逗号句号这些标点不放行首，把上一行最后一个字一起带下来（`wrapLines`）。
- 测试：`test/share.test.ts` 加 5 条（结尾引号、中间标点、带下来正好是最后一行要截断、一个字时不硬拆，`prepareShare` 画不了时 `ready` 不抛）。
  浏览器里用演示页 `demo/share.html` 的"分享第一张（先画好）"核对：假的 `navigator.share` 记下被调时还在点击的处理函数里（带 1 个 PNG 文件）；对照的 `shareCard` 是画完才调（已经出了点击）。

## 0.12.2

- **"叫朋友来"面板** `openInvite({ game, room })`（`arcade-kit/social`；mountSocial 返回的 handle 上也有 `openInvite`，自动带上游戏名）：0.12.0 只有 `sendInvite` 接口，游戏里没有叫人的界面。
  - 列好友，在线的在前，写在哪（"在<游戏名>的好友房 · 3/4""在大厅""3 天前来过"）；每人一个"叫他来"，发出后变"已叫"、1 分钟内灰着（这一页里记着，关了再开也灰着）。
  - 叫不了的换成大白话：429 等两分钟以内是"刚叫过他，过一会儿再叫"，更久是"今天叫人的次数用完了，明天再叫"；403 `not_friend` 是"叫不了他（可能已经不是好友了）"。
  - 底下"复制邀请链接"：能系统分享就分享，不能就复制，复制不了把链接写出来。`friends: false` 只有这个按钮（单独部署、没登录）。
  - DOM，样式和 table-fun 一样（同一套颜色、圆角、44px 按钮）；点空白处、✕、Esc 关掉；只在调用时碰 DOM。
- 新的纯函数 `whereText`、`inviteErrorText`，常数 `INVITE_GAP_MS`。
- 测试：`test/social.test.ts` 加两条（在哪的话、叫不了的话）。浏览器里用 `demo/social.html` 的"叫朋友来"按 390×844 和 1200×800 核对过：列表顺序和"在哪"、叫成功变"已叫"、被拒的、次数用完的、复制链接、Esc 关掉、再开还灰着，控制台零报错。

## 0.12.1

- **social 的好友列表一直是空的**：`fetchFriends` 只认每项的 `id`、`name`，平台 `GET /api/friends` 每项一直是公开资料 `{ userId, displayName, avatar }`（`docs/platform-backend.md` 15.4），
  所以全被当成形状不对丢掉了，游戏里"叫他来"出不来。改成认 `userId` / `displayName`（也兼容 `id` / `name`），统一成 `Friend.id`、`Friend.name`，平台原样的字段（`avatar` 等）留着。新导出 `parseFriend`。
- 测试：按平台的真实形状加一条（`test/social.test.ts`）。邀请（`from: { id, name }`、`until` 毫秒）平台照这个形状做，不用改。

## 0.12.0

社交第一期的两个部件（仓库根 `docs/social.md` 1.1–1.3；接口形状由平台实现）。都只在调用时碰 DOM，import 时不碰；已有入口没改。
- **分享卡** `arcade-kit/share`：`drawShareCard` 用 Canvas 画 1080×1350 的战绩图（游戏给 `{ game, title, big, stats≤3, line, accent, art?, player?, date? }`），
  `shareCard` 能带文件就调 `navigator.share`，不能就出预览（保存图片、复制链接、关闭）。不上传、0 行写入。
  `art` 接受一个 `CanvasImageSource`，或者 `{ image, crop?, fit?: 'contain' | 'cover' }` 从图集切一块；是 img 时先 `decode()`，失败就不画 art、照常出卡。
- **报位置、收邀请** `arcade-kit/social`：`mountSocial` 只在有平台、已登录时挂；页面在前台时每 2 分钟 `POST /api/presence`、每 30 秒 `GET /api/invites`，
  顶上弹"老王叫你来<游戏> [去] [不了]"，过期不弹、已经在那个房间的不弹，"去""不了"都 `POST /api/invites/<id>/dismiss`；401 自己停。
  接口小函数 `postPresence`、`fetchInvites`、`dismissInvite`、`sendInvite`（429 → `limit`）、`fetchFriends`、`setShowWhere`，写的请求带 `x-arcade: 1`、同源 cookie。
- 测试：`test/share.test.ts`（截短、颜色、日期、折行、图集切片和 contain/cover 的位置）、`test/social.test.ts`（假 fetch 查每个接口的方法、地址、头、请求体和各种状态码，挑哪条邀请弹）。
  浏览器里用演示页 `demo/share.html`、`demo/social.html` 核对过：三种卡（图标、图集切片、坏图）都出 1080×1350，切片取到对的那格；无头 Chromium 没有带文件的分享，走预览，保存和复制都通；
  横条按到期先后弹、过期收起、"去""不了"各发一次 dismiss、和自己同房间的那条不弹，控制台零报错。

## 0.11.2

- **table-fun 窄屏**：互动面板（440 宽）、点头像的菜单（432 宽）在 390 竖屏上伸出屏幕（麻将接入时发现，先用 CSS 收窄了）。盒子宽度改成 `min(<宽度>px, calc(100vw - 16px))`，
  两边各留 8px；收窄后一排 8 个道具会折成两排，菜单的高度跟着内容走，量完按真实高度重新避开禁区。宽屏不变。接口不变。
- `fun-logic` 加 `fitMenuWidth(宽度, 屏幕宽, 留边 = 8)`，`placeMenu` 按它收窄后的宽度摆（和页面上的 CSS 一致）。
- 测试：`fitMenuWidth` 的取值，390 竖屏上头像在左、中、右、上、下时面板和菜单都夹在 [8, 382] 里。另用演示页（`demo/table-fun.html`）按 390×844 实测：
  菜单 8–382、面板 8–382，都在屏幕里、内容没被截；改回固定宽度时两个都伸到 440 以外（反证）。

## 0.11.1

联机稳定性（按审阅 kit 0.10.2 后列的清单，2026-10-16）。协议不变：没有新消息、新字段，旧页面和新房间、新页面和旧房间都照常。
- **静默死掉的连接**（`client.ts`）：心跳和切回前台时发 `ping`，`PONG_WAIT_MS`（8 秒）内什么都没收到就判死、不等 close 直接重连；建连卡在 CONNECTING 超过 `CONNECT_MS`（10 秒）也重连。
  iOS 锁屏、切 App 以后 socket 常常还是 OPEN、不触发 close，以前会一直停在"已连接"、画面冻住。只看"这段时间收到过没有"，不比时钟，后台被节流的计时器晚跑不会误判。
- **切回前台、网络恢复**：`pageshow`、`online` 改听 `window`（以前 `pageshow` 挂在 `document` 上，永远收不到）；`online` 时等着重连的马上连；
  `pageshow` 带 `persisted`（从往返缓存回来）旧连接一律作废重连；切回前台时旧连接已经 CLOSING/CLOSED 却没等到 close 的，也扔掉马上连。新选项 `windowEvents`（测试注入）。
- **闹钟不丢**（`room.ts`）：`setAlarm` 出错不再往外抛；内存里的闹钟时间改回"不知道"，下一个入口按 `getAlarm()` 重新读、照常重排。以前内存里记着新时间，之后 `planAlarm` 一直以为"已经设了更早的"，房间的超时、托管、关房都不触发。
  闹钟里那一次出错的，按存储里实际的闹钟判断要不要 60 秒后再醒。
- **moveId 去重窗口**：每个座位记最近 8 个做成的 moveId（`recentMoves`，旧房间的状态里没有就当空的），不再只认最后一个：A 的 ack 丢了、之后 B 也做成了，补发 A 仍然只回 ack。
- 测试：客户端 8 条（判死和不误判、建连超时、online、pageshow persisted、CLOSED 没等到 close、摘掉事件），房间 3 条（补发不是最后一个的 moveId、setAlarm 出错后重排、闹钟里重设失败）；每条都做了反证（把对应的那行改坏，测试失败）。

## 0.11.0

- **牌桌互动组件** `arcade-kit/table-fun`（仓库根 `docs/table-fun.md` 第 0 节"互动第二版"）：几个牌桌游戏共用一套，游戏只给头像的屏幕矩形、禁区、发送通道、名场面映射和短语表。
  - `TableFun`（DOM）：头像上的透明热区（点别人出菜单、点自己出表情菜单；长按 0.4 秒连扔上次的道具 / 发上次的表情）、"互动"按钮和面板（短语 / 表情 / 道具、选对象、全部屏蔽）、
    菜单第一格是上次扔的道具、"屏蔽他"（sessionStorage `<id>.fun.blocked`，按 `scope` 分房间）、首次提示"点头像扔道具，长按连扔"（localStorage `<id>.hint.fun`，只一次）、
    冷却转圈、护盾、连击 ×N、回敬、名场面横幅 `banner`；菜单避开游戏给的禁区矩形，点按区 ≥ 44px。
  - 单机（`localBots`）电脑由组件按 `botReact` 反应：一定是表情加一句话的气泡，回扔时道具飞回去；好友房电脑发来的东西晚 0.9 秒播、表情自动配一句话。
  - `controls()` 给冒烟每个能点的东西的中心和大小，`log` 给一行行流水；演示页 `demo/table-fun.html`。
- **`arcade-kit/fun-logic`**（纯函数，房间、测试、页面都能用）：`FUN_TIMING`（冷却 1.5 / 1 秒、护盾 10 秒 6 次、连击 3 秒、长按 0.4 秒、污渍 3 秒）、`FunCooldown`、`FunTally`、
  `botReact(事件, 电脑, 状态, 现在, 随机数, 参数?)`（`BOT_REACT`：被扔 60% 回应、其中四分之一回扔、20 秒最多回扔 2 次，名场面输 40% / 赢 30%，每手 2 次，两次至少隔 1 秒；性格 ×1.5 / ×1 / ×0.3）、
  `placeMenu`、编号换算 `funIdCount`/`funItem`/`stickerId`/`propId`，房间用的 `hitEvent`、`botEmoteIds`、`stickerMood`。
- `fun.ts`：污渍从约 1.7 秒改成 3 秒（`FUN_TIMING.stainMs`）。
- 测试 `test/fun-logic.test.ts`：botReact 的概率区间（按性格）、冷却、护盾、连击（换人断开）、回敬、回扔上限和窗口、每手上限、最小间隔、菜单避开禁区、编号和房间换算。

0.10.2 及更早的见 [changelog-archive-2.md](changelog-archive-2.md)。
