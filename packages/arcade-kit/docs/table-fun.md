# 牌桌互动（table-fun、fun、fun-logic）

> 总览和子路径表见 [README](../README.md)。

## 好玩素材（fun）

- **好玩素材** `arcade-kit/fun`（浏览器用，纯 DOM + SVG + Web Animations，不依赖渲染库）：
- **图层**：`createFunLayer({ zIndex?, parent? })` 往 `document.body` 挂一个 `position: fixed; inset: 0; pointer-events: none` 的层（class `arcade-fun`，默认 z-index 50），
  点击全部穿透。要比牌桌高、比游戏的弹窗低：**游戏的弹窗、确认框的 z-index 要高于它**。界面在自己的层叠上下文里的（`position: fixed` 的容器、带 transform 缩放的舞台），
  光靠 z-index 夹不到中间，这时**打开弹窗前 `layer.hide()`、关掉后 `layer.show()`**（`visibility: hidden`，正在播的动画不中断）。离开牌桌 `layer.destroy()`；
- **坐标**：起点、终点都传**屏幕坐标的矩形**（`getBoundingClientRect()` 的 DOMRect，或任何有 `left/top/width/height` 的对象），kit 自己换算到图层里；
- **表情包** `showSticker(layer, rect, id)`：12 个（`STICKERS`：得意、狗头、大哭、流汗、震惊、坏笑、比心、生气、睡着、鼓掌、笑哭、墨镜），冒在头像右上方，
  弹出来做 1 秒内的小动作，共约 2 秒淡出；
- **互动道具** `throwAt(layer, from, to, prop, { sound?, onHit?, target? })`：8 种（`PROPS`：番茄、鸡蛋、臭鸡蛋、拖鞋、炸弹、玫瑰、点赞、干杯）。
  从 from 沿抛物线飞到 to，边飞边转，带两层残影，0.7 秒；命中：番茄爆开汁水四溅留果肉，鸡蛋蛋壳碎开、蛋清蛋黄糊上去往下流（臭鸡蛋再飘几缕绿色臭气），
  拖鞋拍扁弹开冒星星，炸弹引信闪三下再爆、冒烟、头像熏黑一下，玫瑰落下花瓣飘，点赞弹出带星星，干杯两杯碰一下冒泡沫。
  污渍在头像上留 3 秒再淡出，同一个人（`target`，游戏传座位号最稳）最多叠 `MAX_STAINS`（3）层；
- **头像的受击反应**由游戏做（头像在游戏的画布或 DOM 里）：命中时 kit 调 `onHit(prop)`，游戏让头像抖一下、缩一下；
- **音效**：`throwAt` 在起飞、炸弹引信、命中时调 `sound(prop, phase)`，游戏判断静音后用 `playFunSound(自己的 AudioContext, 输出节点, prop, phase)` 放（WebAudio 现场合成）；
- **性能**：只动 `transform`、`opacity`（合成层完成，不触发重排，不读布局），图层 `contain: strict`；同一个图层同时最多 `MAX_PLAYING`（4）个效果，多的直接丢掉（返回 false）；
- **素材**：全部是 kit 自己手写的 SVG（`src/fun-art.ts`，viewBox 0 0 100 100），不用 emoji 字体（有的设备显示成方框）、不引外部图片和字体，许可同 kit 本身；
- **演示页**：`demo/index.html`，在 kit 目录里用任意能跑 TS 的开发服务器打开（如 `npx vite`，再访问 `/demo/`），每种道具、每个表情都有按钮。
- **牌桌互动组件** `arcade-kit/table-fun`：头像菜单、互动面板、冷却护盾连击回敬、电脑反应整套，见本文"牌桌互动（table-fun）"一节。

## 牌桌互动（table-fun）

几个牌桌游戏共用的一整套互动：外观、位置规则、节奏、电脑怎么反应都在 kit 里，游戏只做接线。规范正本是仓库根的 `docs/table-fun.md`（第 0 节分工，第 2–4 节的数字）。

| kit 管 | 游戏管 |
|---|---|
| 点头像菜单、互动面板（短语 / 表情 / 道具）、自己的表情菜单、首次提示 | 每个座位头像的**屏幕矩形**、名字、是不是自己、是不是电脑、互动性格 |
| 冷却（道具 1.5 秒、表情和短语 1 秒）、护盾（同一人 10 秒最多被扔 6 次）、连击 ×N、回敬 | 菜单不能盖的地方（手牌、操作按钮）的屏幕矩形 |
| 长按 0.4 秒连扔、菜单第一格是上次扔的道具、污渍 3 秒淡出 | 发送通道（好友房走 kit 的 emote，单机直接回给组件） |
| 电脑的反应 `botReact`（一定是表情 + 一句话，回扔时再带道具）、名场面横幅 | 把自己的公开事件映射成名场面（`bomb`、`first-out`、`big-win`、`kong`、`self-draw`……）、短语表 |

数字都在 `fun-logic.ts` 的 `FUN_TIMING`。

### 页面里接上

```ts
import { TableFun, funIdCount, type FunSeat } from 'arcade-kit/table-fun';

const fun = new TableFun({
  storageKey: 'mygame',                          // 存储前缀：mygame.hint.fun（localStorage）、mygame.fun.blocked（sessionStorage）；只认游戏 id 的写法，不合格构造时抛错
  phrases: PHRASES,                              // 本游戏的短语表；编号 0..P-1 是短语，P..P+11 表情，P+12..P+19 道具
  named: [3, 4, 2],                              // 头像菜单里的 3 句点名短语（短语表下标）
  seats: (): (FunSeat | null)[] => view.seats.map((s, i) => s && ({
    rect: avatarRect(i),                         // 屏幕矩形（CSS 像素）；DOM 头像直接 getBoundingClientRect()
    name: s.name, me: i === 0, bot: s.bot, temper: s.temper,   // temper：'rowdy' | 'normal' | 'cool'
    plate: plateRect(i),                         // 可选：名字和筹码那一块，气泡不盖它
    marks: tagRects(i),                          // 可选：头像旁的小标签（缺门、庄家……），气泡和首次提示不盖
  })),
  avoid: () => [handRect(), actionBarRect()],    // 菜单、面板尽量不盖；放不下时选盖得最少的位置
  button: () => funButtonRect(),                 // "互动"按钮放哪；null 不画（没坐下）
  buttonStyle: () => ({ scale: stageScale, row: true }),  // 可选：按钮字和图标跟着牌桌放大（≥ 1），row = 图标和字横排；也可直接给 fontSize、icon（像素，优先于 scale）；别再覆盖 .atf-btn
  send: (id, to) => (online ? client.emote(id, to) : fun.receive(0, id, to)),
  canSend: () => seated,
  hintSeat: () => (trickEmpty(1) ? 1 : null),     // 首次提示冒在哪家头像旁；null = 现在会挡住出牌，过 2 秒再问（不给就挑第一个电脑）。提示只出一次，3 秒自己收，点屏幕任何地方立刻收（那一下照常生效）
  enabled: () => settings.fun,                   // 设置里关掉：别人的一律不播，单机电脑也不反应
  scope: () => roomCode ?? 'solo',               // "屏蔽他""全部屏蔽"按房间分开
  localBots: !online,                            // 单机：电脑的反应由组件算、在本地播
  sound: (prop, phase) => muted || playFunSound(ac, sfxBus, prop, phase),
  onHit: (seat) => shakeAvatar(seat),
});
client.onEmote = (m) => fun.receive(m.from, m.id, m.to);   // 好友房收到的（自己发的也是从这里回来）
```

- **画布游戏**（Phaser 等）：`rect` 传头像换算到屏幕后的矩形，算法是 `canvas.getBoundingClientRect()` 的左上角加上"世界坐标 × 画布在屏幕上的缩放"。
  组件每次用到时现问，座位挪了、窗口变了都跟得上；窗口尺寸变了它自己 `refresh()`，游戏重排头像后也调一次。
- **气泡位置**：先朝牌桌中间那侧放，再试另一侧、上、下，挑和"互动"按钮、各家名牌（`plate`）、别家头像、`avoid` 盖得最少的一个；
  纯函数 `placeBubble(anchor, w, h, view, avoid)` 在 `fun-logic` 里；聊天的版式（`chatMode`、`chatFont`、`danmakuLanes`、`pickLane`、`placeDock`、`barBottom`、`placeBeside`、`seatColor`）也在那里。
- **房间的编号数**：`RoomGame.emotes` 填 `funIdCount(PHRASES.length)`（短语 + 12 表情 + 8 道具）。
- **名场面**：游戏从**公开事件**里认出来，调 `fun.moment({ kind: 'moment', moment: 'bomb', winners: [0], losers: [1, 3], hand: 第几手 })`，
  单机时电脑按性格冲赢家撇嘴、或得意一下；要横幅就 `fun.banner('炸弹！', '小王 炸了 老李')`。
- **游戏自己的弹窗**：打开前 `fun.hide()`，关掉后 `fun.show()`（正在播的不中断）；离开牌桌 `fun.destroy()`。
- **冒烟**：`fun.controls()` 给每个能点的东西的屏幕中心和大小（`fun:button`、`fun:seat<i>`、菜单里的 `fun:prop<k>`、`fun:named<k>`、`fun:block`、
  表情菜单 `fun:sticker<k>`、面板 `fun:tab:phrase|sticker|prop`、`fun:phrase<i>`（短语多、屏幕矮时分页，翻页 `fun:phrases-prev` / `fun:phrases-next`，不在页上的短语按钮隐藏）、`fun:psticker<k>`、`fun:pprop<k>`、`fun:target<i>`、`fun:blockAll`）；
  `log` 选项给一行行流水（`道具 0>1:tomato ×2 回敬`、`电脑 1:angry`、`护盾 1`、`提示 头像`），断言用它。
- 演示页 `demo/table-fun.html`（`npx vite` 后打开 `/demo/table-fun.html`）：我加三个不同性格的电脑，单机接法。

### 房间里的电脑（好友房）

纯逻辑在 `arcade-kit/fun-logic`（不碰 DOM，房间、测试都能 import；`table-fun` 也把它全部转出）：

```ts
import { botReact, botEmoteIds, hitEvent, newBotState, type BotState } from 'arcade-kit/fun-logic';

private bots = newBotState();                    // 只在内存里，不写存储；房间重启丢了没关系
protected override onEmote(from: number, id: number, to?: number): void {
  const ev = hitEvent(id, PHRASES.length, from, to);            // 冲人来的道具、点名短语才算
  if (!ev || !this.isBot(ev.to)) return;                       // isBot、temperOf：游戏自己的（哪个座位是电脑、什么性格）
  const a = botReact(ev, { seat: ev.to, temper: temperOf(ev.to) }, this.bots, Date.now(), Math.random);
  if (a) for (const e of botEmoteIds(a, PHRASES.length)) this.botEmote(a.from, e.id, e.to);
}
```

- 房间只有一个闹钟，`a.delay` 不用等，立刻发；页面上的 `TableFun` 收到电脑座位（`bot: true`）发来的东西会晚 0.9 秒（`botLagMs`）再播，
  表情自动配一句话（`moodLines` 或 kit 默认），看起来和单机的电脑一样。名场面同理：在 `onStep` 里从公开事件认出来，每个电脑座位问一次 `botReact`。
- `botReact(事件, 电脑, 状态, 现在, 随机数, 参数?)` 返回 `null`（不理）或 `{ from, to?, delay, sticker, mood, prop? }`：被扔后 60% 回应（乘性格：爱闹 ×1.5、普通 ×1、高冷 ×0.3），
  其中四分之一同类回扔（鸡蛋回拖鞋；同一个电脑 20 秒最多回扔 2 次）；名场面输的一方 40% 冲赢家、赢的一方 30% 得意；每手最多主动 2 次；两次反应至少隔 1 秒。
  数字都在 `BOT_REACT`，第六个参数能整个换掉。
- 电脑的反应只是画面，**出牌决策绝不读它**；真人的短语、道具不记进牌局状态（见 [room-options.md](room-options.md) 里 `onEmote` 的规矩）。
- 其他纯函数：`stickerMood`（表情对应的情绪）、`FunCooldown`（冷却）、`FunTally`（护盾、连击、回敬）、`placeMenu`（菜单放哪，避开禁区；窄屏按 `fitMenuWidth` 收窄到屏幕宽减 16px）、`hotBox`（头像点按热区：至少 44 见方、夹在可见区里）、`funItem`/`stickerId`/`propId`（编号换算），测试在 `test/fun-logic.test.ts`。
