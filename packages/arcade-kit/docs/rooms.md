# 房间：接入、规矩、额度

> 总览和子路径表见 [README](../README.md)。

## 游戏怎么接（详细）

1. `package.json` 加依赖：仓库外 `npm i arcade-kit@npm:@yyyu-star/arcade-kit`（npm 上的包名是 `@yyyu-star/arcade-kit`，装成别名 `arcade-kit`，代码里照旧 `arcade-kit/room`）；仓库内的游戏也一样按别名装（`"arcade-kit": "npm:@yyyu-star/arcade-kit@^0.25.1"`）。
2. 写规则：实现 `RoomGame<S, A, V, O, E>`（`seats`、`rulesVersion`、`begin`、`parse`、`apply`、`turn`、`view`、`ai`、`timeout`、`over`，其余都是可选），都是纯函数，浏览器和房间共用。
   - **开局用 `begin(entropy, rulesVersion, setup)`**：`entropy` 是房间现生成的 256 位熵（8 个 u32），当 `arcade-kit/rng` 的密钥发牌，
     后面每一副从同一把密钥分出的流里取：`shuffle(deck, stream(key, 'deal', 第几副))`。密钥放在自己的状态里（只在服务端），`view` 绝不能带上它。
     旧的 `start(seed, rulesVersion)` 只给 32 位种子，玩家拿自己的手牌逐个试种子几分钟就能反推出全桌的牌：它已弃用，类型上还是必填（写了 `begin` 的游戏让它抛错即可），
     房间见到没有 `begin` 的游戏会记警告。单机要"同种子同结果"的复现可以照旧用带种子的随机数，联机房间一律用 `begin`；
     换开局方式时升 `rulesVersion`，已经开打的旧房间按开局时记下的版本打完。
   - `view(state, seat)` 只能放这个座位能看到的东西，房间只发它的结果；
   - **`apply` 返回的 `{ error }` 会原样发给出手的人**，所以错误码只能是固定的短码（小写字母、数字、下划线，最长 32），不能带牌面之类的隐藏信息。
     不合这个格式的，房间一律换成 `illegal_move`；
   - 不轮流的阶段（结算页大家点继续、倒计时后发下一副）用 `actors(state)` 返回这一刻能出手的全部座位、`turnMs(state)` 给这个阶段的时限：
     组里的电脑、托管马上代出，真人谁先发都收；时限从进入这组时起算、组里有人出手不重新计时，到点对还没出的真人逐个 `timeout`；
     同一组里别人先出了，后出的人不算 stale。**推荐返回 `{ seats, group }`**，`group` 是这一组的标识（比如 `settle-3`）：出手前后一样、而且出手的人离开了名单、没有新座位加入，才是同一组，否则是新的一手（一组里每个人最多出一次）。
     只返回数组时房间靠"出手的人离开名单、其他人原样留着"推断，所以每个人出手后都要从名单里拿掉；
     这有歧义：`[2, 3]` 里 2 出完剩 `[3]`，和"新的一手只有 3 能出"分不清（会当成同一组），会出现这种情况的游戏一定要给 `group`。
     牌局没打完时名单不能是空的，空了房间记日志、按打完处理（游戏写了 `waiting` 并返回 true 的、在停一会儿（`pause`）的除外）。有人接管组里还没出的电脑座位、收回托管，整组的期限不变；
     页面看 `room.turn.seats`（还没出的座位）和 `room.turn.deadline`（整组一个截止时间）。两个都不写就是一次一个人、30 秒；
   - 在规则测试里挑几个最大的局面，断言 `snapshotBytes(rules, state)` 不超过自己定的上限（重连一律发全量快照，太大会拖慢手机重连）；
   - 可选 `breakPoint(state)`：这一刻是不是"一段的结尾"（比如一副或一手打完、停在结算页）。当天写入到了 stopWrites，在打的房间走到这里就收场（见本文"每天的额度"）；
     不写的话房间一知道要收场就马上关；
   - 开局选项、座位换人、对外的事、不轮流的操作、停一会儿再接着来、快捷短语等见 [room-options.md](room-options.md)，不写就是最简单的行为。
3. 房间类：`export class Room extends GameRoom<S, A, V, Env> { protected readonly game = rules; }`，需要时覆盖 `limits`（默认值 `DEFAULT_LIMITS` 是 4.5、4.6 那些数），
   写成 `{ ...DEFAULT_LIMITS, turnMs: 20_000 }` 这样只改要改的，以后加了新字段不用跟着改。
4. 计量：Worker 的入口文件原样导出 `export { RoomMeter } from 'arcade-kit/meter';`，`wrangler.jsonc`：
   ```jsonc
   "durable_objects": { "bindings": [{ "name": "ROOM", "class_name": "Room" }, { "name": "METER", "class_name": "RoomMeter" }] },
   "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Room", "RoomMeter"] }],   // 免费版只能用 SQLite 后端
   "services": [{ "binding": "ARCADE", "service": "arcade" }],                       // 登录闸门已经有了
   "vars": { "KIT_QUOTA": { "dailyRooms": 300 } }                                     // 可选：只写要改的门槛，见本文"每天的额度"
   ```
   已经上线过 v1 的游戏不能改 v1，另加一条 `{ "tag": "v2", "new_sqlite_classes": ["RoomMeter"] }`。
   **正式环境一定要绑 `METER`**：没绑时不限额、不计数，只是为了老游戏升级 kit 时不至于一下子开不了房。
5. 游戏 Worker 的路由（`test/worker.ts` 是完整例子），只接这两个，不要自己把浏览器的请求转给房间：
   - 开房：`POST …/rooms` → `acceptCreate(request, env)`：成功 201 `{ code }`；失败回 JSON `{ error, code? }`（`protocol.ts` 的 `CreateError`）：

     | 状态 | error | 意思 | 页面可以说 |
     |---|---|---|---|
     | 401 | `login` | 没登录 | 先登录再来 |
     | 403 | `forbidden` | 不是本站页面 | 从游戏大厅打开 |
     | 409 | `has_room` | 这个人已经有一个开着的房间，`code` 是它的码 | 你已经有一个房间了，先回去（给"回到房间"按钮） |
     | 429 | `daily_limit` | 这个人今天开房次数用完了 | 今天开房次数用完了，明天再来 |
     | 503 | `busy` | 今天联机的人太多（写入到了 busyWrites，或全站开房数到了） | 今天联机的人太多了，明天再来，单机照常玩 |
     | 503 | `unavailable` | 平台或计量暂时连不上、房间出错 | 暂时开不了房，稍后再试 |
     | 400 | `bad_options` | 开房时带的选项不合格（见 [room-options.md](room-options.md) 的"开房就定选项"） | 页面自己的选项写错了，一般不会出现 |

     房间走 RPC 建，身份不经过任何请求头；
   - 进房：`GET …/rooms/<码>/ws`（WebSocket 升级）→ `acceptJoin(request, env, code)`。被拒时先接受升级再用关闭码关掉
     （浏览器的 WebSocket 拿不到 HTTP 状态码）：没登录 4401、别的网站 4403、码不对或没有这个房间 4004、页面太旧 4005、旁观的人满了 4003、
     这个人的重连次数用完 4029、这个人的入站额度用完 4030、今天联机的人太多不进新人 4503——这些客户端都不再重连；平台暂时认不了人（503、超时）是 1013，客户端按退避重连，开房时则回 503。
6. 浏览器：`new RoomClient({ url, clientVersion, onMessage, onStatus })`，`sit`、`start`（只有房主能开）、`act`、`leave`、`close`。
   - 收到 `welcome`（进房、重连）整桌重画；收到 `state` 按 `frames` 依次播放（每帧带相对延迟，电脑连续出手时用）；
   - `act` 自动带上 `baseSeq`（看到的最新 seq）；牌局在那之后变过的，房间回 `stale`，界面按最新状态让玩家重新出；
   - 没确认的 `act` 在重连后按原 `moveId` 补发：最多留 `PENDING_MAX`（8，和房间记得的 moveId 一样多，更早的房间认不出是重发）个、超过 `PENDING_TTL_MS`（60 秒）的丢掉，
     先发 `RESEND_BATCH`（4）个，其余等前面的有了回音（ack 或被拒）再发，不会一下子撞上房间每人 10 个的令牌桶被 1008 断开；
   - 开打以后换座位有限制（见本文"房间怎么守规矩"的"座位绑人"）：坐过的人回别的座位是 `not_your_seat`，接管别人坐过的电脑座位是 `seat_reserved`，按"座位被占"提示；
   - 大厅和牌桌用这几个字段：
     - `room.seats[i].reserved`：开打后这个座位绑了人（主人离座了也算）。`kind: 'ai'` 且 `reserved` 的座位别人接管不了，不要挂"接管"按钮；
     - `room.seats[i].name`：绑了人的电脑座位是原主人的昵称，可以显示"电脑代 小王 打"；没绑人的电脑座位是 null。判断是不是电脑看 `kind`，不看 `name`；
     - `you.bound`：这个人绑定的座位（离座了也还是它；没开打、没坐过是 null）。`you.seat` 是 null、`you.bound` 不是 null 时，给他显示"回到我的座位"（发 `sit(bound)`）；
     - 只下发"绑没绑"和公开的昵称，不下发 userId；
   - 开局选项：房主 `start(opts)`，`opts` 是任意 JSON，游戏的 `options` 校验；不合格回 `bad_options`，有人坐在这一局用不到的座位上回 `seat_closed`；
   - `onStatus('reconnecting', 关闭码)`：正在重连，码是这次断开的原因（1006 网断了、1013 平台忙），可以据此换提示；
   - `onStatus('closed', 关闭码, 原因)`：按码提示（4401 去登录、4005 刷新页面、4503 今天人太多……）；4000 带原因 `CLOSE_REASON.quota` 是今天的额度满了、房间在这一副打完时收场，
     页面可以说"今天联机的人太多了，这一副打完先散了，单机照常玩"；`onStatus('failed')`：连着 `maxFailures`（默认 20）次没进得了房间，提示"连不上"，用户点了调 `retry()`。
     失败次数在收到 `welcome` 时才清零（被拒的连接也会先 open 再关）；退避要进了房间、连着待够 `STABLE_MS`（30 秒）再断才清零，连上就断的链路照样越等越久。
   - 断线怎么认：每 25 秒的心跳和每次切回前台都发一个 `ping`，`PONG_WAIT_MS`（8 秒）内什么都没收到（房间自动回的 `pong` 也算）就判这条连接死了，
     不等 `close`、直接按 1006 重连——iOS 锁屏、切 App 后 socket 常常还显示 OPEN、也不触发 close。建连卡在 CONNECTING 超过 `CONNECT_MS`（10 秒）同样重连。
     监听 `document` 的 `visibilitychange`、`window` 的 `pageshow` 和 `online`：网络恢复、切回前台时别等退避；从往返缓存（bfcache，`pageshow` 带 `persisted`）回来的页面旧连接一律作废。
     测试和非浏览器环境可以传 `events`、`windowEvents` 注入事件源。
   - 房间那头也清半开的连接：闹钟醒来时，回过 ping、之后 `RoomLimits.deadSocketMs`（默认 90 秒）没再回过的连接关掉（1001，客户端照常重连；从没回过 ping 的不管：不发心跳的旧页面、测试连接不会被误关），
     当掉线处理（座位记 away、开始算"没人"），和这一步的其他改动一起提交。以前浏览器那头没了、关闭帧又没到时，房间一直当他在线，掉线托管和"没人"关房都不开始算。

## 登录闸门、开房、默认文案、假钱包

几个游戏各抄一份的通用部分收在 kit 里，测试见 `test/gate.test.ts`、`test/create.test.ts`、`test/testing.test.ts`。

- **登录闸门** `loginGate(request, env, { downPage? })`（docs/platform-backend.md 5.8、15.8）：游戏 Worker 把首页（`/games/<id>/`、`/games/<id>/index.html`）交给它。
  `env` 要有 `ASSETS`、`ARCADE`，`GATE` 写 `"off"` 时不拦。处理分四种：
  - 登录了：回页面，带上平台续期的 `Set-Cookie`，不缓存；
  - 没登录：302 到 `/login?next=<原路径和查询参数>`（好友房链接的 `?room=` 原样带回），同样带 `Set-Cookie`；
  - 平台不可用：503 整页，`Retry-After: 30`；
  - 默认的 503 页不带游戏名，游戏可以传自己的 `downPage`（标题、配色）。

  游戏自己的接口（单机带入结回之类）用 `whoIs` 认人，回话用 `json(body, status, setCookie)`。认人之前读请求体用 `readJson(request, 最多几字节)`：
  不带 content-length 或超长的一律不读。
- **开房** `createRoom(url, opts)`：POST `{ opts }` 带 `X-Arcade: 1`，回 `{ code }` 或 `{ error, code? }`。401 当 `login`，回话不是 JSON 当 `unavailable`，网络断了是 `offline`。
  游戏 Worker 那边从请求体的 `opts` 取开局选项交给 `acceptCreate` 的 `options`。
- **默认文案** `createText(error, overrides?)`、`closeText(code, reason?, overrides?)`：开房失败、断开时给玩家看的话，只写各游戏通用的说法（表在 `ROOM_TEXT`）。
  游戏按 key 换掉个别措辞，比如 `{ roomClosed: '房间关了，桌上的筹码已经结回钱包', quota: '……这一手打完先散了……' }`。
  key 有两类：开房错误码，以及 `CLOSE` 里的名字，外加 `quota`、`other`。房间拒了某个操作（`ErrorMsg`）的话跟游戏规则走，不在这里。
- **假平台钱包** `arcade-kit/testing`：只给游戏的 workerd 测试、冒烟和本地 `wrangler dev` 用，不进线上代码（它依赖 `cloudflare:workers`，也不能进浏览器包）。
  - 复刻的范围：平台钱包的接口形状和关键规则，即带入、结回、放弃、只结一次、余额够这次才能带、操作 id 去重、按 `ref` 分份（同一个游戏可以同时有好几份）、到期退回、client 每天净赢上限（`WIN_UNITS`）、小结 `stats` 的上限、补给（余额加桌上的，桌上有筹码也能领）、搭子战绩 `together`（5.9、5.10、15.9、15.19）。
    计量、熔断档、流水、战绩怎么存这些不复刻。不维护游戏名单，只核对 `props.game` 和参数一致。
  - 规则数取平台默认值（`NEW_BALANCE`、`RELIEF_TO`、`WIN_UNITS`、`TIERS`）；钱包档位 id 是 `small`、`mid`、`big`、`lux`。
  - 测试辅助：`FakeBank` 的 `calls`、`writes` 数调了几次、写了几次；`stats` 记结回成功带的小结（含 `game`）；`together` 记搭子战绩；`setBalance` 造余额。
  - **平台改了钱包接口，平台 PR 的描述里写"影响 kit/testing"，由维护者安排 kit 跟上**（一个 PR 只改一个模块）。
  - 接法：测试 Worker 的主模块 `export { FakeBank, WalletService } from 'arcade-kit/testing'`，wrangler 配置加 DO 绑定 `FAKE_BANK`（`FakeBank`）。
    `WALLET` 绑回这个测试 Worker 自己：
    ```jsonc
    "services": [{ "binding": "WALLET", "service": "<测试 Worker 名>", "entrypoint": "WalletService", "props": { "game": "<游戏 id>" } }]
    ```
    本地的假平台（假的 `ARCADE`）里先 `const r = await walletHttp(request, env); if (r) return r;` 接住 `/api/wallet*`。

## 搭子战绩（reportTogether）

好友房打完一场，房间的服务端把同桌真人和各自输赢报给平台（[docs/platform-backend.md](https://github.com/gzyyyyyyu/arcade/blob/main/docs/platform-backend.md) 15.19），平台给其中已经是好友的每一对累计"一起打了几场、谁赢了几场、做搭档几场"。
只走钱包服务绑定 `WALLET` 的 `together()`，浏览器碰不到；娱乐、实盘都报，单机不报。

```ts
import { GameRoom } from 'arcade-kit/room';

export class CardRoom extends GameRoom<State, Action, View, Env> {
  protected override onStep(s: State): void {
    // 一场刚分出输赢的那一步报一次；"一场"和 win 怎么算由游戏定，写进 DESIGN
    if (justEnded(s)) this.reportMatch([0, 1, 2, 3].map((seat) => ({ seat, team: seat % 2, win: seat % 2 === s.winner })), s.matchNo);
  }
}
```

- `reportMatch(players, match)`（`GameRoom` 的 protected 方法）：players 按座位给，按开打后绑在座位上的人（`owners`）认 userId，没绑真人的座位（电脑）不报；
  `match` 是这一场在房间里的序号，op 拼成 `<房间码>-<开房时刻>-<match>`（`togetherOp`）——房间码会被别的房间重用，带上开房时刻才不会撞；同一场重报给同一个 match，平台按 op 去重。
  交给 `ctx.waitUntil` 去办、不 await：`onStep` 是同步的，不能卡住广播；也不走 `effects`/`perform`，那条路会退避重试、要写状态，而这件事平台忙（`busy`）时少记一场就算了。
- `reportTogether(env, op, players)`（`arcade-kit/room` 转出）：底下那个函数，自己拼 userId 时直接用。没有 `env.WALLET`（单独部署）或它没有 `together` 时跳过；去重后少于 2 人、多于 `TOGETHER_MAX`（8）人、op 不是 8–64 位 `[A-Za-z0-9_-]` 时跳过；
  回话原样返回（`{ ok: true, pairs }` 或 `{ ok: false, error }`），RPC 抛错吞掉、只记错误类型（不记 userId），都**不重试**。
- `team` 只有分队的游戏带（同一个数字是一队，0–3）；`win` 由游戏定、写进游戏自己的 DESIGN（分队的按这一场赢的那队，按分算的按这一场分数为正，平台 15.19 列了几种）。
- 测试：`arcade-kit/testing` 的假钱包有 `together`，形状照平台查、按 op 去重，每个人的 `FakeBank.together` 记一笔给测试核对（假钱包不管好友关系，两两都算一对）。

## 浏览器错误上报（report）

游戏入口里调一次，线上出了没人接住的报错平台就能收到：

```ts
import { reportErrors } from '@yyyu-star/arcade-kit/report';
reportErrors({ game: 'kaipan', version: __APP_VERSION__ }); // 返回卸载函数
```

- **报什么**：`window` 的 `error` 和 `unhandledrejection`。每条 `{game, ver, msg, stack, path}`：msg 截 200 字，stack 截 1000 字，path 是 `location.pathname`（不带 query 和 hash，里面可能有房间码）。不带账号、昵称、cookie。
- **不报什么**：跨域脚本的 "Script error."；stack 里有 `chrome-extension://`、`moz-extension://` 的（浏览器扩展）；同签名（msg 前 80 字）的第二次；一页第 6 条起。
- **怎么发**：优先 `navigator.sendBeacon`（JSON Blob），没有就 `fetch`（POST、keepalive、同源凭证）；失败吞掉，不重试，不抛。没有 `window`（服务端渲染）时返回空函数。
- **平台接口约定**：`POST /api/client-error`（可用 `endpoint` 改），体 `{game, ver, msg, stack, path}`，平台自己限流和落库。

## 房间怎么守规矩

- **只用 `ctx.acceptWebSocket`、一个闹钟**：所有到期时间（房间寿命 3 小时、没人 10 分钟、这一手 30 秒、掉线宽限 60 秒、电脑没算完、停够了）取最早的；
  只有比现在设的更早才 `setAlarm`（它也算一行写入），期限往后推时不动，到点醒来没到期再改。心跳 `ping`/`pong` 由运行时自动应答。
  闹钟时间以 `getAlarm()` 读到的为准；写完状态后广播出错，算好的闹钟照样设；闹钟里游戏代码出错，60 秒后再醒来重试。
  `setAlarm` 自己出错不往外抛：内存里记的闹钟改回"不知道"，下一个入口重新 `getAlarm()`、照常重排；出错的是闹钟里那一次，同样 60 秒后再醒来。
- **每步最多写 2 行**：房间状态一行（到期时间、计数都在里面），外加需要时的 `setAlarm`。实测：
  - 开房 4 行：建表 2 行（SQLite 记建表也算写入，一个房间只这一次）+ 状态 1 行 + 闹钟 1 行；
  - 进房、出牌 1 行；到点醒来但还没到期只改闹钟 1 行；
  - **状态没变不写**：没入座的人进出、在线时又从别的设备连进来，都是 0 行、不广播。只连着没入座的人也算"没人"，他们不能让房间一直活着；
  - 探一个不存在的房间码：0 行，不建表，存储里什么都不留（构造函数和读路径都不碰存储）。
  测试里每个用例都断言 ≤ 2（开房除外，如实断言 4）。
- **服务端说了算**：开局的 256 位熵用 `crypto.getRandomValues` 在房间里生成、只交给 `begin` 这一次、房间不存，规则在房间里算，下发前按座位过滤；userId、房主是谁都不下发。
  不记回放（没有地方读它）；以后做终局导出时再加，带体积上限。
- **续局**：接受连接、发快照、记座位在同一段没有 `await` 的代码里；只向收到过快照的连接广播；广播在设闹钟之前。
  - 断线时座位留着；轮到他时 30 秒到了按 `timeout` 代出；掉线 60 秒后电脑托管；连回来交还。
  - 重连**不重置**这一手的 30 秒（不然隔 29 秒重连一次就能一直拖着）；只有托管被收回、又正好只轮到他一个人时才从头算（一组人时不改整组的期限）。
  - 超时代出：先用游戏的 `timeout`，被规则拒了改用 `ai`；还不行就记日志、这一手的期限推后 60 秒（不然闹钟会在当前时刻反复响、每次写一行）。
  - 同一个账号再连一次，旧连接 4001 让位。重连一律发全量快照，不补发漏掉的事件。
  - 客户端重发没确认的操作带原来的 `baseSeq`：牌局变过就回 `stale`，旧操作不会被套到新的一手上。有人进出不算牌局变了。
  - 重复的 moveId 每个座位记最近 8 个（和座位一起存在状态那一行里，不多写）：连发 A、B 时 A 的 ack 丢了，补发 A 仍然只回 ack，不轮流的操作不会做第二遍。
- **硬限制**（4.6）：
  - 单条入站消息 4 KB（1009）；每人每秒 5 条、最多攒 10 条（1008；按人记，断开重连、多开标签页都还是同一个桶）；房间一生 3,000 条入站消息；寿命 3 小时；没人 10 分钟——到了就关房间：
    断开所有人（4000）、删闹钟、删存储；
  - 没入座的最多 4 个账号（4003）；入座的人、房主、开打后绑过座位（离座去看）的人不占这个数，也不受它限，旁观的再多也挡不住座位的主人回来；
  - 每人一生最多 300 次"掉线后回来"（只数会写库的那种，4029）。按 userId 记，只管他自己，别人刷不光，离座再坐下也不清零；
    这些重连同时算进房间一生的 3,000 条入站额度，所以房间一生的写入总数有上限。没入座的人进出不写库，不受这个管；
  - 一个人最多用掉房间入站额度的 `maxInboundShare`（默认四成，1,200 条）：超了只断开他（4030），以后也进不来，房间和别人照常；
  - 入站额度用完关房时，日志里记下发得最多的那个 userId 和条数（不记消息内容），方便事后查；
  - 每个入口都包一层，游戏代码抛错只记日志；闹钟里不往外抛（会自动重试 6 次，每次都计费）。
  - 闹钟设不上：当场再试一次；还不行就按 `getAlarm()` 核对，存储里没有闹钟就补一个 60 秒后的（顶替没写成的那次，不多算一行）；
    补也补不上时，浏览器的 `RoomClient` 看门狗兜底：房间说的时限（按消息里房间给的 `now` 算，不看浏览器的钟）过了 `STALL_GRACE_MS`（20 秒）再加最多 `STALL_JITTER_MS`（10 秒）的抖动还没有新状态，就重连一次，
    进房这个入口会让房间重排闹钟、把过期的那一手照常处理；同一个 seq 只踢一次。
- **座位绑人**：开局时记下每个座位坐的是谁。开打后坐过某个座位的人只能回这个座位；没坐过的人只能接管没绑人的电脑座位，接管后绑给他；
  绑给别人的座位（主人离座了也算）谁也接管不了，电脑一直替主人打，主人回来照样能坐。一个 userId 一局只对应一个座位，所以离座、换到对手座位看牌、再回来这条路走不通；
  也不能由同伙先占掉你的原座位、把你变成"没绑座位"的人。
- **只有房主能开局**（9.1）：房主是开房的人，别人发 `start` 回 `not_host`。
- **认人**：不做 Ed25519 入场票。进房时游戏 Worker 经服务绑定问一次平台 `/api/me`（只转发 Cookie 和 cf-connecting-ip，3 秒超时），
  拿不到身份就拒绝。请求里根本没有平台的会话 cookie（`__Host-sid`，名字只在 `src/internal.ts` 定义一处）就直接 4401，不问平台。好友小范围开房，多问的这一次不贵，也不用管签名密钥；等开房要走平台登记和配额（5.3）再换入场票。
  - "没登录"（200 且 user 为 null）和"平台暂时不可用"（其他状态码、不是 JSON、缺字段、超时、没有绑定）分开：两种都拒绝（fail-closed），
    前者 4401 不重连，后者 1013 让客户端稍后重连，平台抖一下不会把正在打牌的人踢走；
  - 身份只经 `acceptJoin` 拼的内部请求（主机名 `KIT_HOST`）交给房间；房间不认别的地址，游戏把浏览器的原始请求转进来会被 400 拒掉，
    浏览器自己带的 `x-kit-user` 头不会被当真。开房走 RPC，身份是参数。
  - 每次进房（含被房间拒掉的）都要问平台一次：进房额度和连接上限管住了写库和广播，但管不住这次 `/api/me`，要靠平台自己的限流；换入场票后这次调用就没了。

## 每天的额度

免费版 Durable Object 每天整个账户 10 万行写入（docs/platform-backend.md 4.7），所有游戏共用，UTC 0 点重置。每个游戏 Worker 有一个计量 `RoomMeter`
（全局只有一个实例），房间自己数写了几行报给它，开房先向它占名额：

| 门槛（`KIT_QUOTA` 里的字段） | 默认 | 到了以后 |
|---|---|---|
| `roomsPerUser` | 1 | 这个人再开房回 409 `has_room`（带开着的那个房间的码） |
| `dailyRoomsPerUser` | 6 | 这个人今天再开房回 429 `daily_limit` |
| `dailyRooms` | 300 | 全站今天不再开房，503 `busy`（最后一道闸） |
| `busyWrites` | 60,000 | 不开新房（503 `busy`）、不进新人（4503）；在打的照常打完，房主、坐过的人、已经连着的人照常进 |
| `stopWrites` | 85,000 | 在打的房间走到 `breakPoint`（这一副打完）时收场：把这一步发给大家，再以 4000 + 原因 `quota` 关房；等人的、已经打完的马上关 |
| `joinMissesPerUser` | 20 | 这个人这一小时进房时"码不存在"到了这么多次：进任何房间都回 1013（房间在不在都一样），只有这个房间的自己人（房主、坐着的、开打后绑过座位的）照常进 |
| `joinMissesPerIp` | 60 | 同一个 IP 这一小时的"码不存在"次数，到了同上（一个 IP 后面可能是一家人、一个宿舍，放宽些） |
| `emoteMs`、`emoteBurst`（房间读） | 1000、3 | 快捷短语每个座位多少毫秒补 1 个令牌（0 不限速）、最多攒几个 |
| `chatMs`、`chatPerMin`（房间读） | 3000、10 | 聊天两条至少隔几毫秒（0 不限间隔）、一分钟最多几条（0 不限条数） |

- **改门槛**：在游戏的 `wrangler.jsonc` 里写 `"vars": { "KIT_QUOTA": { "busyWrites": 50000 } }`（对象或 JSON 字符串都行），只写要改的字段，部署后生效；
  不认识的字段、不是非负整数的值记日志后忽略，用默认值。门槛按每个游戏各算各的，有几个联机游戏就要分一分（见本文"多个游戏怎么分额度"）。
- **名额什么时候还**：整场打完（`over`）、房间关掉（没人、到寿命、消息总数到了、收场）时房间去还。还不上（计量连不上、房间被驱逐时出错）也不会一直卡住：
  每个名额记着"开房时间 + 房间寿命 + 1 分钟"，到点自动作废。房间打完了但还开着的时候还没还上的，下次有事件（重试间隔 60 秒）接着还。
- **怎么报写入**：房间每一步都数自己写了几行（`setAlarm`、关房也算），攒够 `RoomLimits.meterBatch`（默认 200）行报一次，打完、关房时把剩下的随还名额一起报。
  计量每报一次写 1 行，200 行一报摊下来多花 0.5%；开房（这个人一行、当天一行）、还名额（同样两行）另算，也都记进当天的数。
  没报的数随房间那一行一起存，被驱逐后接着数；被驱逐前刚报过、还没存下去的那一批会再报一次，偏保守。房间跨 UTC 0 点报上来的记在新的一天。
- **计量连不上**：不开新房（503 `unavailable`）、不进新人（1013，客户端过会儿自己重试）；在打的照常，报不上的攒着，60 秒后再试。
- **进房猜码**：房间码只有 6 位，不限的话能一个个试出谁开着房、进去旁观或坐空位。`acceptJoin` 按人、按 IP 数"码不存在"（计量类的小实例 `kit-miss:u:<userId>` / `kit-miss:ip:<地址>`，每次各写 1 行、再报进当天的数；没绑 `METER` 不管，没有 `cf-connecting-ip` 只按人）。超了门槛不直接拒，而是带一个内部头进房，由房间判断是不是自己人：自己人照常进，别人一律 1013，这样超限的人说不出房间在不在，在打的人断线重连也不受牵连。计量连不上时同样处理。每次进房多问一次小实例（只读）。
- **房间怎么知道门槛**：每次报数、还名额时计量顺便回现在的门槛；有新人来进房时房间也会问（记 30 秒，只读不写）。所以 stop 以后在打的房间最晚再写一批（≤ 200 行）加上这一副剩下的才收场，
  按同时最多二三十个房间算，8.5 万离 10 万还有余量。
- 名额只按游戏算：同一个人在两个游戏里可以各开一个房间。

### 多个游戏怎么分额度

各游戏的额度在自己的 `wrangler.jsonc` 的 `KIT_QUOTA` 里，总账见仓库根 [docs/platform-backend.md](https://github.com/gzyyyyyyu/arcade/blob/main/docs/platform-backend.md) 4.7。

## 还没做的（以后按需加）

- 人机验证；跨游戏的统一房间登记（5.3）。开房名额现在由每个游戏的计量各管各的（本文"每天的额度"），开放注册前看一眼门槛够不够紧；
- Ed25519 入场票；观战（没入座的人现在能连、只看公开信息，最多 4 条连接）；
- 回放记录、终局导出；
- 好友房聊天接平台的屏蔽名单；
- 用 `ctx.abort()` 强制正在打的房间换新代码；`cpu_ms` 要按各游戏的规则在房间里实测再定（4.4）。

## 目录结构

```
packages/arcade-kit/
├─ src/
│  ├─ room.ts        房间基类 GameRoom（Durable Object）
│  ├─ room-seats.ts  房间的座位和身份：座位初始形态、开房参数校验、随机排座（纯函数）
│  ├─ room-rate.ts   房间的限速：短语、聊天、入站令牌桶和每人份额（纯函数）
│  ├─ room-persist.ts 房间存储里那一行：结构、SQLite / PG 读写、旧房间补字段
│  ├─ worker.ts      开房 acceptCreate、进房 acceptJoin、匹配 acceptMatch、登录闸门 loginGate、json / readJson
│  ├─ auth.ts        经平台 /api/me 认人 whoIs、按部署方式认人 identify、同站校验 sameOrigin
│  ├─ guest.ts       独立模式：游客 cookie、游客身份、昵称清洗
│  ├─ match.ts       快速匹配的排队 MatchQueue（Durable Object）
│  ├─ meter.ts       每天的额度计量 RoomMeter
│  ├─ store.ts       可插拔存储：自托管 PG 模式的内存镜像 MirrorStore 和 KIT_STORE 的形状
│  ├─ together.ts    搭子战绩 reportTogether（纯函数加一次 RPC，由 room 转出）
│  ├─ game.ts        规则接口 RoomGame、snapshotBytes、matchConfigErrors
│  ├─ client.ts      浏览器连接器 RoomClient、MatchClient、createRoom、默认文案
│  ├─ protocol.ts    消息类型、关闭码、协议版本
│  ├─ rng.ts         ChaCha20 随机数
│  ├─ prng.ts        sfc32 伪随机（单机规则核心用，不保密）
│  ├─ viewport.ts    手机平板的可见区、放大、补算、安全区、渲染倍数、省内存、WebGL 丢失恢复（浏览器，纯函数可单测）
│  ├─ fun.ts、fun-art.ts  快捷短语、表情、道具的画面层
│  ├─ fun-logic.ts   牌桌互动的规则：冷却、护盾、连击、回敬、电脑反应、菜单位置（纯函数）
│  ├─ table-fun.ts   牌桌互动组件 TableFun（DOM：头像菜单、面板、提示、聊天页）
│  ├─ table-chat.ts  TableFun 里的聊天界面（电脑聊天框、手机输入条、弹幕、记录；不单独导出）
│  ├─ chat.ts、chat-words.ts  好友房聊天的过滤和打码词表（纯函数）
│  ├─ share.ts       分享卡（Canvas 画战绩图、系统分享或预览）
│  ├─ qr.ts          二维码编码器（字节模式、纠错 M、版本 1–10，纯函数，分享卡用）
│  ├─ social.ts      报位置、收邀请的横条、好友和邀请的接口小函数
│  ├─ theme.ts       DOM 组件的主题变量
│  ├─ report.ts      浏览器错误上报 reportErrors
│  ├─ testing.ts     假平台钱包（只给测试和本地开发）
│  └─ internal.ts    内部地址、身份头（不在 exports 里）
├─ scripts/manifest.mjs  打包时把 exports 换成 dist 版、换回来、检查 dist
├─ tsconfig.build.json   构建 dist 用
├─ docs/             各子模块的用法和房间规矩（见 README 的文档表）
├─ test/             vitest（workerd），测试用的游戏 Worker 和 wrangler 配置
└─ demo/             浏览器里的小例子
```
