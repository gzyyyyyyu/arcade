# 牌馆联机、实盘、云存档和部署

> 联机（好友房、快速匹配、牌桌互动）、实盘、云存档、部署和闸门。画面层见 `docs/view.md`，实盘数字见 `docs/stake.md`。

## 1. 联机好友房

- 联机好友房（底座是 `packages/arcade-kit`，房间规范见仓库 `docs/platform-backend.md` 第 4 节）：
  - 每天的额度（kit 的计量）：`wrangler.jsonc` 绑 `METER`（`RoomMeter`，入口 `worker/main.ts` 导出），门槛在 `vars.KIT_QUOTA`（掼蛋 4.5 万停开新房、5.5 万收场；
    10 万行全账户共用，各游戏怎么分见仓库 `docs/platform-backend.md` 4.7）；每人同时 1 个房间（已经有一个的，开房、快速匹配都直接回到那个房间；一整场打完停着等"再来一场"时房间按 kit 的 `idle` 先还名额）、每天 100 个。没绑 `METER` 时 kit 不限额，`tests/config.test.ts` 守着绑定和门槛。
    收场点 `breakPoint` 是结算页（一副打完）。页面上的几句话在 `src/view/common/quota-text.ts`，`npm run quota-smoke` 逐条核对。
  - 发牌（安全）：联机开局走 kit 的 `begin`（256 位熵），核心 `createKeyedGame` 把它存成 `GameState.key`，每一副从 `stream(key, 'deal', 第几副)` 发，`seed` 是空串；
    `key` 只在服务端，`viewFor` 不带。规则版本 2 = 按密钥发牌，1 = 按种子（单机，和更早开的旧联机局）。不要再让联机牌局用种子发牌，也不要给 `rngFor` 喂密钥（它会压成 32 位）。
  - 服务端说了算：房间（`worker/room.ts`）只继承 arcade-kit 的 `GameRoom`，规则从 `src/variants/guandan/net/rules.ts` 来；入座、轮流、30 秒超时代出、掉线 60 秒电脑托管、
    每步最多写 2 行都由底座管，这里不另写一套。下发的只有 `viewFor(state, 座位)`（没入座 = -1，空手牌）和这一步的事件，`tests/net/net.test.ts` 查泄漏。
  - 一副结束（docs 9.1、`docs/core-api.md` 的 nextDeal）：每个真人在结算页点"继续"（`ready`），电脑和托管座位由房间立刻代点，没点的真人 20 秒（`READY_MS`）到点由房间代点；
    最后一个人准备好的那一步里开下一副。玩家发不了开下一副的操作（`next` 解析不认）。这一刻谁能出手用 `actors()`、时限用 `turnMs()`，
    双下的进贡、还贡也靠 `actors()` 两个人同时等。结算页开着时，别人点"继续"的帧（step 不变）要当场收下刷新，不然会堵住开下一副的那一帧。
  - 路由：`POST /games/guandan/room/rooms` 开房（`acceptCreate`），`GET /games/guandan/room/rooms/<6 位码>/ws` 进房（`acceptJoin`），都要登录（问平台 `/api/me`）、同源。
    页面里这些路径按页面所在目录写相对的（`ROOM_REL`、`STAKE_REL`、`MATCH_REL`，ws 地址经 `room-link.ts` 的 `socketUrl`），带挂载点的 `ROOM_PATH`、`STAKE_PATH` 只给 Worker 路由用；
    页面发的请求都经 `platform.ts` 的 `timed()` 带 10 秒超时（`FETCH_TIMEOUT_MS`），网络挂住时开房按钮不一直转、实盘结回的重试等得到失败。
    变量 `ONLINE`：`"on"` 开放；`"off"`（以及配错的值）开房回 404（页面说"好友房暂时关了"），进房接上就以 4004 关掉（和"没有这个房间"一样，客户端不再重连）。
    标题页一直有"好友房"，本机记着这个账号的房间时旁边还有"回到房间"；`?online=1` 是"打开就弹出好友房面板"（平台大厅的入口），邀请链接 `room=` 不带它也能进。
    房间路由不经过 `GATE`：认人由 arcade-kit 问平台，认不出就 4401。
  - 记着的房间分账号（`guandan.room` 带 `userId`）：进房后问一次 `/api/me` 记下是谁的；标题页"回到房间"、大厅"回到刚才的房间"、邀请链接带房主标记之前都现问 `/api/me` 核对，
    不是这个账号的（或旧记录没记账号）就不给并清掉（`myRoom`/`roomOwnerCheck`）；本页正连着、还没问到账号的那一条（`liveCode`）不算旧记录，不清；云同步发现换号、退出时也清（`CloudDeps.forgetRoom`）。回不去的关闭码（`isFinalForRoom`）都清。
  - 页面：`src/view/guandan/net.ts` 的 `NetSession` 和单机的 `Session` 实现同一个 `TableSession` 接口，牌桌场景不分单机联机；收到的帧排队，一帧帧播，
    出手发出去后锁住，等 ack 或报错再解锁。视角旋转在 `src/variants/guandan/net/rotate.ts`：真实座位 s 显示在 (s − 我 + 4) % 4，按队记的值在我坐奇数位时对调。
    大厅是 DOM（`src/view/online.ts`）：开房、输码、选座、房主开局；刷新、切后台回来、掉线都自动接回原座位（进房后地址栏带 `room=<码>`，离开房间时去掉）；关闭码一律换成大白话（`closeText`），
    重连中、连不上时的话走 `NetSession.linkText`：上次断开是 1013 就说"平台有点忙"，不让玩家去查网络（关闭码由 kit 的 `onStatus` 带来，1006 是断网）；4030 是这个人的消息额度用完，不再重连。
  - 开打后座位绑人：坐过的人只能回自己的座位（别的回 `not_your_seat`），没坐过的人只能接管没绑人的电脑座位（`SeatInfo.reserved` 为 false），
    绑了别人的座位接管不了（`seat_reserved`），电脑一直替主人打、显示"电脑代 某某 打"。大厅按 `you.bound` 给离座的人"回到我的座位"，`reserved` 的电脑座位不挂"接管"。
    回归测试在 `tests/room/seats.spec.ts`（防离座后接管对手的电脑座位、看到对手手牌）。
  - 旁观（仓库根 `docs/social.md` 1.4）：开打后没坐下的人也进牌桌（`NetSession.watching`），看的是房间给没入座的公开视图（座位 -1，没有任何人的手牌，`tests/net/net.test.ts` 查泄漏）。
    画面座位 0 是真实 0 号座位上的人：`labels.ts` 的 `isWatching()` 为真时 `fullSeatName(0)` 不叫"你"，`SeatView.self` 为假（画名牌、剩余张数），
    牌桌里判断"是不是我"一律用 `TableScene.isMe(seat)`（旁观时谁都不是），两队叫一队、二队（`side()`；"一二队"在标题字体里）。
    不能出手、不能扔互动（kit `not_seated`），顶上写"旁观中"；`NetSession.freeSeat()` 给"坐下"：回自己绑着的座位，娱乐房间接管第一个没绑人的电脑座位，实盘房间只看。
    `autoSeat` 开打后不再替人接管（先旁观）。坐下后会话换座位、牌桌整个重画。结束页旁观的人只有"回首页"、没有分享。
  - 快速匹配（设计在 kit 的 `docs/match.md`，房间规范是仓库根 `docs/platform-backend.md` 4.6 的匹配桌一行）：
    排队是 `worker/match.ts` 的 `Queue`（kit `MatchQueue` 的子类，`wrangler.jsonc` 的 `MATCH`，每个档位一个实例），路由 `GET /games/guandan/room/match/<档位>` 走 kit 的 `acceptMatch`（`gate.ts`，同样受 `ONLINE` 开关；没有 `WALLET` 只开 `fun`）。
    档位在 `src/variants/guandan/net/match.ts`：`fun` 用娱乐好友房的规则，`real-<档位>` 用好友房实盘的规则（开桌选项 `{ stake }`，房间的 `parseRoomOpts` 校验）；改档位或桌大小跑 `tests/core/match.test.ts`（kit 的 `matchConfigErrors`）。
    页面：选难度页的 `match`、选档页的"和电脑 / 快速匹配"（控件 `mode:0` / `mode:1`）→ `online.ts` 的 `openMatch`（排队卡 `#ol-match-wait`，人数、倒计时、`#ol-match-solo` 不等了、`#ol-match-cancel` 取消）；
    排到了 `join(code, false, null, true)`，房间信息里 `room.match` 为真（`NetSession.match`）：大厅和牌桌不摆房间码、叫朋友、邀请、开局，分享卡不带房间码；`solo` 由标题页转同档单机（娱乐 `newGame`、实盘带入一份）。
    陌生人聊天：设置"聊天"一行的"不和陌生人"（`strangerChat` 为假，默认开；手机横屏左栏放不下第七行，和 `chat` 并成一行三档）时，匹配桌的 `NetSession` 不给 `onChat`（kit 不带 `chat=1`），`chatOn` 为假，牌桌不给聊天页；记着的房间带 `match: true`，刷新接回去也照这个设置。
  - 报位置、收邀请（`src/view/common/social.ts`）：kit 的 `mountSocial`，`main.ts` 在 `detectOnce` 之后挂，没平台、没登录不挂（启动那次超时成"不知道"时再问一次、10 秒）；`where()` 在好友房里报 `place: room`、房间码和真人几个（"3/4"），
    别的时候报 `place: game`；`presenceNow()` 在房间的每个事件上调，位置（房间码、真人数）和上次报的不一样才报，`PRESENCE_RETRY_MS`（11 秒）后补报一次——
    平台同一人 10 秒内只记第一次，刚进房、人数接连变时那次常被挤掉。邀请横条和"去"（跳 `/games/<id>/?room=<码>`）都是 kit 的。
    房间大厅的"叫朋友来"（`ol-share`）和两个玩法牌桌顶上"大厅"右边的邀请图标（控件 `invite`，匹配桌不摆）都调 `openInvitePanel`：kit 的"叫朋友来"面板，
    没挂上 social 时 `friends: false` 只有复制链接；链接按当前页面地址拼。开完房有好友（`hasFriends`）就直接弹这个面板。
  - 好友房面板顶上"好友在打"（`ol-friends`，0.40.2）：面板打开时读一次好友列表，`friendTables` 挑在线、在牌馆好友房里的，同一桌并一行、最多 2 桌，
    "加入"走和邀请链接一样的 `rejoin`（等人时自动坐空位，开打了接管电脑或旁观）；没人在打这一块不显示。
    面板传 `zIndex: INVITE_Z`（8800）：要盖住房间弹窗 `#online`（8500），在"请横过来"（9000）、出错面板（9500）之下；改这几个 DOM 层级时 `tests/view/share-card.test.ts` 会核对。
  - 改了房间和页面之间的约定（动作、视图形状）就加 `src/net/version.ts` 的 `CLIENT_VERSION`：旧页面进房会被 4005 请去刷新。改规则加 `RULES_VERSION`，打到一半的房间按旧规则打完。
  - 验收：`npm run test:room`（真房间机器人对打、写入行数、断线、让位、座位绑人、结算等人）、`npm run room-sim`（规则层大批量）、`npm run online-smoke`（四个浏览器端到端，约 5 分钟，`--quick` 跳过 70 秒托管那项）。

## 2. 斗地主的联机

- 好友房和快速匹配（娱乐和实盘）：房间是同一个 `worker/room.ts`，规则走 `src/net/hall.ts`（开房选项 `variant: 'ddz'`，状态里带 `variant` 的转给斗地主，没有的就是掼蛋、形状一点没动）。
- 页面的联机会话基类是 `common/room-link.ts` 的 `RoomLink`（连接、座位、帧队列、出手锁到 ack、聊天、互动），掼蛋 `NetSession`、斗地主 `doudizhu/net.ts` 的 `DdzNetSession` 各自继承；`DdzScene` 经 `DdzTableSession` 接口同时用单机和联机会话，会话放在 `app.ddzNet`。
- 玩法由房间信息 `room.opts.variant` 说了算，不看 `guandan.variant`：开房、匹配、记着的房间（`guandan.room` 的 `variant`）知道玩法就直接按它连，输码和邀请链接先当掼蛋连，发现不对就换会话重连。
- kit 的 `RoomInfo.seats` 按最大座位数给 4 个，斗地主只用前 3 个（`seatCountOf`）。匹配档位 `ddz-fun`、`ddz-real-<档位>`、不洗牌实盘 `ddz-clump-<档位>`，一桌 3 人。冒烟 `npm run online-smoke -- --ddz`（三个浏览器，约 2 分钟）。
- 斗地主好友房实盘：开房请求体 `{ variant: 'ddz', stake: 档位 }`（`hall.ts` 的 `parseHallOpts`），桌在 `src/variants/doudizhu/net/stake.ts`（状态 `DdzNet.stake`、视图 `DdzNetView.stake`），3 副或任何一家到 ±一份（50 分），ref `ddz-<16 位十六进制>`；一场的数按规则版本记（`StakeRules`：存档 `rules`、桌 `DdzStakeTable.rules`、结回请求体 `rules`，没有字段 = 版本 1，老的 8 副 / 6 副、每分 1/40 按老数打完），
  带入、结回、离开、再带入的规矩和掼蛋好友房是同一份实现（`src/net/stake-table.ts`），房间的 `perform` 也是同一个；电脑暂用最强一档。房间测试 `tests/room/ddz-stake.spec.ts`，规则层 `tests/ddz/ddz-net-stake.test.ts`，冒烟 `npm run stake-smoke -- --ddz-room`。

## 3. 实盘

- 实盘（设计和数字在 `docs/stake.md`，钱包接口是仓库 `docs/platform-backend.md` 5.9）：
  - 规则都在 `src/variants/guandan/stake/`（纯函数）：档位、每分 = 一份的 1/`POINTS_PER_SHARE`（现为 25，CI 模拟定）、封顶 ±一份、单机 3 副 / 好友房 3 副（实盘要 3–8 分钟）、单机每档的电脑、结回额、ref 和 op 的拼法。
    Worker、页面、以后的房间都从这里取，不各算一份。
    一场用哪一套数记在状态里（`rules`：2 = 现在，没有 = 3 副之前开的 `RULES_V1`：8 副 / 5 副、每分 1/20）；旧存档、旧房间按旧的打完，改数只加新版本、不改旧的（`docs/stake.md` 1.5）。钱包的 ref、op 只能是 8–64 位的 `[A-Za-z0-9_-]`（不能带冒号），测试锁着。
  - 单机：`worker/stake.ts` 的 `POST /games/guandan/api/stake/{buyin,settle,refund}` 认人（kit 的 `whoIs`）、只认本站 Origin、查数在规则范围里，
    转给服务绑定 `WALLET`（`entrypoint: WalletService`、`props.game: guandan`，`tests/config.test.ts` 守着），`mode: client`。钱包的回话原样带回；
    业务上的拒绝走返回值（200 + `{ ok: false, error }`），HTTP 状态码只说"没到钱包"（400 / 401 / 403 / 503）。
  - 页面：`src/view/guandan/stake.ts`（存档 `guandan.stake`、`StakeSession`、结回和放弃）、`src/view/common/stake-api.ts`（钱包和三个接口、钱包忙时重试，斗地主共用）、`src/view/ui/stake.ts`（选模式、选档位）、`src/view/common/stake-text.ts`（说的话）。
    一场结束先把要结的数记进存档，再去结回；结回、放弃遇到 `busy` / `internal` / 连不上按同一个 op 重试，还不行留着存档下次再结；`no_stake`（结过）、`expired`（过期退回过）都算办完。
    实盘不计战绩、不写 `guandan.save`、规则用默认；主页直接有"娱乐 / 实盘 / 好友房"三张卡，实盘卡进选档。冒烟 `npm run stake-smoke`（本地栈的假平台带一个内存里的假钱包 RPC）。
  - 好友房：开房请求体 `{ stake: 档位 }` → kit 的开房选项（`RoomOpts`，规则的 `options` 校验）。桌在 `src/variants/guandan/net/stake.ts`，状态里是 `NetState.stake`（娱乐房间没有这个字段，
    所有实盘的钩子对它原样返回）：`begin` 给每个真人记带入（真人不到 2 个整场不计输赢）、`seated` 管换人——
    接管开局时就是电脑的座位记一笔带入，点"离开"的人按当时的分马上结回（一副打到一半离开的，等这副打完再结，docs/stake.md 3.3），走了又回来用新的 ref `<ref>s<座位>n<第几份>` 再带入一份，
    带入被拒的人有"重新带入"（不轮流的 `buyin`）；每副 `stakeDeal` 记账，一场结束（3 副 / 过 A / 到账的都封顶）`over` 为真、记结回，`closing` 就地结束。
    结回带战绩小结 `stats`（`src/variants/guandan/stake/stats.ts`）。房间的 `perform`（`worker/room.ts`）去钱包办：带入前先 `view`（钱包只记最近 32 个 op），
    `busy` / `internal` / 异常抛出去让 kit 退避重试，业务拒绝回 `{ ok: false, error }` 交给 `settled`。视图 `NetView.stake` 公开每个座位的分和到账，被拒原因只给自己。
    房间测试 `tests/room/stake.spec.ts` 用 `tests/room/wallet.ts` 的假钱包（测试入口 `tests/room/main.ts` 多导出 `FakeWallet` / `WalletBank`，WALLET 绑到自己）。

## 4. 牌桌互动

- 牌桌互动（整套用 kit 的 `arcade-kit/table-fun`，规范是仓库根 `docs/table-fun.md`，和德州、麻将同一个组件；公平底线：人人一样、免费、不挂筹码，不停计时、不挡牌和按钮）：
  - kit 管头像菜单、互动面板、表情菜单、首次提示、冷却、护盾、连击、回敬、长按连扔、电脑反应（`botReact`）、污渍；掼蛋只接线（`TableScene.buildFun`）：
    头像的屏幕矩形（世界坐标 × 画布缩放，`worldRect`）、名字、谁是电脑和性格（`variants/guandan/net/fun-moments.ts` 的 `TEMPER`：阿强爱闹、老张普通、小美高冷）、
    不能盖的地方（操作按钮和手牌那一条）、"互动"按钮的位置（我的头像和"理牌"之间）、发送通道（好友房 `net.emote`，单机直接交回 `fun.receive`）。
  - kit 的 DOM 层盖在画布上：有弹窗（`overlay` 或 `ui/focus.ts` 的焦点层）时整个藏起来（`syncFunShown`，每 200 毫秒对一次、变了才写），不然会挡住弹窗上的按钮。
  - 编号（`src/net/emotes.ts`，只往后加）：客气话 0–7、嘲讽 8–19 合起来是 kit 的短语表（`PHRASES`），表情 20–31、道具 32–39 正好是 kit 的排法。
  - 名场面（`variants/guandan/net/fun-moments.ts`，纯函数有单测）：炸弹压了对方、头游、双下 → kit 的 `bomb`、`first-out`、`double-down`；单机交给 `fun.moment`，好友房在 `worker/room.ts` 的 `onStep` 里问每个电脑的 `botReact`、经 `botEmote` 发。
    真人冲电脑扔的在 `onEmote` 里用 kit 的 `hitEvent` 认、电脑回应。冷却只在内存里，不写存储、不记真人短语。电脑出牌（`src/variants/guandan/ai`）绝不读这些。
  - 电脑气泡里的话是掼蛋自己的台词（`MOOD_LINES`，按 kit 的六种情绪，经 `moodLines` 传给 kit），好友房的页面也用它配电脑的表情。
  - 掼蛋自己多的在 `table/nudge.ts`：公开事件后的顺手提示（`suggest.ts`）、好友房里轮到的人想了 8 秒以上别人能扔的"催促炸弹"、
    单机里我想了 8 秒以上爱闹的电脑按 `URGE_P` 扔一个催促炸弹（`slowUrge`，每手最多判一次，走 kit 的收，同样受护盾）。收到的短语、表情配掼蛋自己的提示音（`funIn`）。
  - 好友房聊天（kit 的 chat，设计在 kit 的 `docs/chat.md`）：房间 `rules.ts` 写 `chat: true`；页面 `NetSession` 的 `onChat` 换成画面座位交给 `chatSink`（牌桌挂上、关时摘掉），
    `TableFun` 给 `chat` / `chatEnabled`（设置"聊天：开 / 不看"，`guandan.settings` 的 `chat`）；kit 的聊天框、手机"聊天"按钮（掼蛋指定在顶栏 `chatButton`）、弹幕，牌桌给 `plate`（`SeatView.plateBox`）和 `center`（`TrickView.boxes`）让它避开；单机用 kit 的 `localChat`，只在自己头像旁冒，不发不存，电脑不读。房间只转发不存，规则、电脑都不读；`tests/room/routes.spec.ts` 走真路由核对，`online-smoke` 里 1 号打一句、房主看到。
  - 设置里能整个关掉（字段名仍是 `taunts`）；点头像"屏蔽他"、面板里"全部屏蔽"只管这个房间（kit 存 sessionStorage `guandan.fun.blocked`）。冒烟点的控件是 kit 的名字（`fun:button`、`fun:seat3`、`fun:prop0`……，换成世界坐标放进 `controls()`）。
  - 轮到我：提示音、振动、后台标题闪（振动和标题闪在 `attention.ts`），最后 5 秒嘀嗒；轮到的人想了 8 秒以上别人能扔"催促炸弹"，纯画面。
  - 称号和每副复盘只用公开信息（出牌记录、名次），电脑决策不读表情。
  - 再来一场：娱乐房间打到 gameOver 先不 `over`，用 kit 的 `pause`/`resume` 停 `AGAIN_MS`（3 分钟）；有人发不轮流的 `again { code }`（他先开好新房间），
    大家跟过去按和他的相对位置自动坐（kit 让开房的人坐 0 号）。没人点就结束、还名额。实盘房间不等。
  - 走开了：`timeout()` 给的操作带 `idle: true`（`parse` 会去掉，浏览器伪造不了），`NetState.idle` 数每个座位连着几手被代出，
    到 `IDLE_AFTER`（2）后这一手只等 `IDLE_MS`（3 秒）；自己出一手或发 `back`（"我回来了"）清零。代出什么不变，规则核心看不到这个记号。
    浏览器每次连上（welcome：打开页面、断线重连）看到自己还 afk 就自动发一次 `back`：连得上说明人回来了；一直连着只是走开的照旧要自己点。

## 5. 分享卡、颁奖、动态、搭子

- 分享卡（`src/view/guandan/share-card.ts` 拼数据、`src/view/common/share-card.ts` 画和分享，仓库根 `docs/social.md` 1.1）：整局结束页、单机实盘结算、好友房实盘结算（到账的人）右上角一个"分享"图标，用 kit 的分享卡画 1080×1350 的战绩图。
- 结算页一出来就 `prepareResult` 先画好（kit 的 `prepareShare`），按钮的点击里同步调 `share()`、前面不许 await：iOS 只许在点击的那一下里调系统分享。
- 卡上只有公开的：胜负或这一场的筹码、打了几副、我的头游和炸弹次数、我的称号（模板拼的话）；图标是 `favicon.svg`。链接是游戏地址（`location.origin + location.pathname`，好友房带 `?room=`），kit 按它在卡的右下角画二维码。冒烟的控件名 `share`，`gameover` 一段点一次、把预览卡存成 `16b-share-card.png`。
- 结束颁奖（`src/variants/guandan/net/awards.ts`，设计 `docs/design.md` 4.1）：好友房一场打完评本场 MVP、最惨的人、炸弹王（2–3 个），数据是房间攒的 `NetState.log`（公开的名次、炸弹，随视图下发、`rotate.ts` 转座位），
- 页面 `NetSession.matchLog` 取、`TableScene.roomAwards` 评、`addAwards` 画，分享卡经 `shareCardOf` 的 `awards` 写进去。只用公开信息、话从模板拼；改评法同步改 design.md 4.1 和 `tests/core/awards.test.ts`。
- 好友动态的名场面（`src/view/guandan/feed.ts`、`public/moments.json`，设计 `docs/design.md` 4.2）：一副打完 `TableScene.feedDeal` 从 `highlights.ts` 的名场面里挑和我有关的一条，经 `social.ts` 的 `postFeed`（kit 的 `postMoment`）报给平台；
- 一局最多 `FEED_MAX`（2）条、同一种一次，只报娱乐、不是旁观。加编号同时加模板（只用 `{name}`、`{n}`，≤ 40 字），`tests/view/feed.test.ts` 核对。冒烟的假平台都回 204。
- 搭子战绩（`src/variants/guandan/net/together.ts`，设计 `docs/design.md` 4.3）：`worker/room.ts` 的 `onStep` 用 `matchEnd` 认"这一步刚打完一场"，调 kit 的 `reportMatch`（交给 waitUntil、不重试、不写状态）。
- win 的定义改了同步改 design.md 4.3 和 `tests/core/together.test.ts`；房间测试的假钱包（`tests/room/wallet.ts`）记下每次 `together`，`bots.spec`、`stake.spec` 核对报了几次、报了谁。

## 6. 云存档

- 云存档（`src/view/common/cloud.ts`；规格见仓库 `docs/platform-backend.md` 5.5、15.1–15.3）：只同步 `stats` 和 `tutorial` 两个槽，牌局和设置不同步。
- store 里改这两个槽的函数发 `onSyncedChange`，`main.ts` 接到 `CloudSync.markDirty`；云同步写回本地走 `rawStore`，不再触发通知。合并：数字取大、布尔取或、数组并集。
- 上传 10 秒防抖 + 同槽至少隔 5 分钟（每人每天 100 次 PUT）；切后台 / pagehide 用 keepalive 补传，离上次上传不到 3 分钟不补；429 之后的改动不早于 retryAfter；400 是请求本身不合格，这个槽本次打开不再传，不算"连不上"。
- 换账号（`/api/me` 的 user.id ≠ `guandan.cloud` 的 userId）不合并、不上传：识别到就备份、清空本地、存盘，再拉新账号的数据（拉取失败或页面被关也不会留下"旧数据 + 新账号"）；
- 换号前先看存盘的元数据，别的标签页已经换过就只跟上内存；换号时清掉跟着旧账号的 413 封槽、429 等待、上传间隔。
- 平台按 cookie 记账，页面开着时别的标签页可能换了账号：每个 PUT 和 GET（`?userId=<user.id>`）都带 `/api/me` 给的 `userId`，不是当前会话账号时平台回 409 `wrong_user`、一行不写——不合并、不重试，按换账号处理
  （备份到 pre-switch、清本地、元数据不记账号，再问 `/api/me`）；409 要按 `error` 区分 `conflict` 和 `wrong_user`；GET 回来时本页账号已变就丢掉结果。
- 回到前台（`resume`）也问一次 `/api/me`，按上次尝试的时间限 1 分钟一次。多标签页靠 `storage` 事件同步元数据：rev 取大；别的页传完、本页没改过的槽，本页的待上传跟着清掉。
- 没有提示 cookie `__Host-arcade_li` 时一个请求都不发；单独部署不启动云存档（有没有平台由启动时那一次 `/api/me` 判断，没登录也会发这一个）；连不上、停服时登录状态不明：图标不显示"未登录"、点了只给说明，不引人去登录（15.1、5.7）。
- 本地联调：`npm run dev` 把 `/api` 转发到平台的 `npm run dev:api`（5181），浏览器先在 5181 登录；冒烟里 `/api` 由 `tools/shot.ts` 的假平台回答。

## 7. 两种部署和站点地址

- 两种部署（arcade-kit 的独立模式，由 env 决定）：`wrangler.jsonc` 是独立配置，不写 `ARCADE`、`WALLET`、`GATE`；本站部署时部署工具（`tools/deployer`）按 `tools/workers.json` 补上平台绑定和 `GATE=login`。
- 没有 `ARCADE`、`GATE` 也不是 login 就是单独部署：`gate.ts` 先调 `standaloneRoot`（站点根转到 `/games/guandan/`），`loginGate`、`acceptCreate`、`acceptJoin` 传同一个 `GUEST`（昵称不许含电脑的名字，掼蛋三个、斗地主两个，`tests/gate.test.ts` 和画面上的名字核对），
- 没有 `WALLET` 时单机实盘接口和实盘房间回 409 `no_wallet`、房间的 `perform` 兜底拒绝。页面在 `src/view/common/platform.ts`：启动时 kit 的 `detectPlatform` 问一次 `/api/me`（进房、直接进牌桌之前等它；标题页不等，先按有平台画，问完是单独部署再重画一次），
- 回 `{ standalone: true }`（单独部署时 kit 的 `standaloneRoot` 接住 `/api/me`，所以 `run_worker_first` 里有它）或 404 是单独部署——不摆实盘和云存档（主页没有"实盘"卡）、"大厅"变"首页"回 `./`、`currentUserId` 回固定的游客（同一个浏览器就是同一个游客）、好友房面板填昵称（`guandan.nick`）并用 `withNickname` 带在开房、进房地址上；
- 5xx、超时按有平台处理。本地：`npm run online-dev`（和 online/stake/quota 冒烟）写一份补了平台绑定的派生配置连假平台；`npm run standalone-smoke` 原样用 `wrangler.jsonc`。
- 站点地址不进仓库：`wrangler.jsonc` 不写路由，部署时由部署工具用部署环境的 secret `SITE_HOST`
- 注入 `<站点>/games/guandan`、`<站点>/games/guandan/*` 两条路由和 `SITE_ORIGIN`（没设就失败，不带着空路由部署）。
- 代码里的同站校验用 `SITE_ORIGIN`，没设就按请求自己的 origin；给玩家看的话不写域名；测试夹具用 `game.example.com`。

## 8. 健康检查和报错

- 健康检查和报错：`gate.ts` 的 `handle` 第一件事是 `GET /games/guandan/health`（`HEALTH_PATH`）→ `{ ok: true, version }`（版本取自 `package.json`，`no-store`；不认人、不读存储、不碰平台，单独部署也一样，`tests/gate.test.ts` 守着），`wrangler.jsonc` 的 `run_worker_first` 里有它、`observability.enabled` 开着（`tests/config.test.ts`）。
- 页面 `main.ts` 开头挂 kit 的 `reportErrors({ game: 'guandan', version })`（`arcade-kit/report`）：没人接住的报错报给平台 `/api/client-error`，和本地的兜底面板（`errors.ts`、`guandan.errors`）互不影响。

## 9. 登录闸门

- 登录闸门（`worker/gate.ts`，用 arcade-kit 的 `loginGate`）：线上只有三个首页路径（`wrangler.jsonc` 的 `assets.run_worker_first`）先进 Worker，js、图片直接走静态资源。
- 变量 `GATE`：`"off"` 原样放行；其他值（包括没配）都要登录：没带平台会话 cookie 的直接 302，带了的经服务绑定 `ARCADE` 问平台 `/api/me`；未登录 302 到 `/login?next=<请求的路径 + 查询>`（登录完回到原链接，房间链接直接进房），
- 已登录和未登录都把平台下发的 Set-Cookie 原样带回；其他一切情况回掼蛋自己的 503 页（`DOWN_PAGE`）——fail-closed。细节（转发哪些头、3 秒超时）以 kit 为准。
- 本地 `npm run dev` / 冒烟走 vite，不经过 Worker；看平台模式的运行时行为用 `npm run online-dev`；`npx wrangler dev`（先 `npm run build:cf`）原样起来是单独部署。
