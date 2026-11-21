# 牌馆画面层约定

> 本文件是模块 `AGENTS.md` 第 3 节的展开：画面层的实现约定。联机、实盘、云存档、部署见 `docs/net.md`。美术现状见 `docs/art.md`，牌馆分层见 `docs/doudizhu.md`。

## 1. 推进状态的路

- 推进状态只有一条路：`Session.apply(action)`（`TableSession` 接口，单机 `guandan/session.ts`、联机 `guandan/net.ts`）→ 核心 `dispatch` → `TableScene` 拿事件按顺序 `await` 播放（`act`、`playEvents`、`pumpNet` 在两个牌桌场景共用的 `scenes/shared/TableSceneBase.ts` 里，玩法的部分由子类的钩子给） → `sync()` 按 `viewFor` 刷新 → `pump()` 决定下一步
  （电脑"想一会儿"再出、等玩家、弹结算）。画面不自己判断牌型和大小：能否出牌用 `interpret` + `beats`，提示用 `hintList`（首条 null = 建议不要）；点了提示、没改选牌就出，按提示给的那一手出（`hintedPlay`），不弹"当作哪一手"，自己挑的牌有几种解释照旧弹；
  第一次玩、新手引导看完后的第一副，前 3 次轮到我时「提示」跳两下、状态行说"不会出？点「提示」，再点「出牌」"（`guandan/table-ui.ts` 的 `startHintGuide`，只加不拦），
- 一副结束时的"下副谁进贡"用 `dispatch(state, nextDeal)` 推演（纯函数，不改当前状态）。

## 2. 世界坐标和字号

- 横屏世界坐标高 720，宽 1280..1720 随窗口宽高比变（`worldWidthFor`）。手机竖屏（高大于宽、宽 ≤ 1024）的主页和主页上的弹窗换竖的世界：宽 720，高按宽高比在 1080..1600 之间（`theme.ts` 的 `worldSizeFor`）；
  牌桌永远是横屏世界（`main.ts` 的 `wantSize`，进牌桌前 `app.toTableWorld` 先换好），所以牌桌和只在牌桌用的部件直接用 `GAME_HEIGHT`，主页、弹窗、引导这类两边都会出现的按 `ui/kit.ts` 的 `worldW` / `worldH` 取当前世界的宽高。
  弹窗按 `worldW < 1100` 分宽窄两套排版（规则、战绩、选难度、选档位、残局闯关），横屏的位置不变。`minHit()` / `typeFloor` 按 CSS 像素每世界单位算，竖屏和手机横屏一样托底。
  画布按 `RENDER_SCALE`（1..3）倍像素绘制，相机同倍 zoom，
- Text 的 resolution 同倍，SVG 按目标像素栅格化（`textures.ts`）。新加文字一律走 `ui/kit.ts` 的 `text()`，最小字号 18；手机横屏 `text()` 按 `theme.ts` 的 `typeFloor` 托底到字 12、纯数字 14 CSS 像素，
- 放不下的地方按 `phoneType()` 删字（`fitWidth` 截断、少放一行），不缩字。改了画面跑 `npm run shot -- --gallery --audit --sizes 667x375,844x390` 看 `audit.md`。

## 3. 可见区和 viewport

- 尺寸一律按实际可见区域（`device.ts` 的 `appBox`：visualViewport 量出的区域扣掉安全区），不用 `screen` 和 `100vh`——iOS Safari 的这两个是
- 工具栏收起时的最大值，按它排顶栏会被地址栏盖住。`#app` 由 JS 钉成像素大小，CSS 里的 100vh/100dvh 只是 JS 跑之前的兜底。
  尺寸没变不写、双指放大中不跟。监听、补算、放大判定、安全区、渲染倍数、省内存三档、WebGL 丢失恢复都用 `arcade-kit/viewport`（各游戏共用一份，默认值是开盘的），`device.ts` 和 `main.ts` 只传牌馆原来的值：钉 `#app`（`pin`）、只认放大 `scale > 1.01`（`zoomedIn`）、补算 250 毫秒、不 `scrollTo`、听 visualViewport 的 scroll、渲染倍数取整前减 0.05、WebGL 丢了 2 秒提示 20 秒降档。改这些值前先看 kit README 的"手机和平板"表。重建画面（换世界宽度 + `scene.restart`）会丢选牌、
  动画、弹层：触屏设备只在转屏时重建，电脑上宽度差 40 以上才重建；场景的 `canRebuild()` 为假（牌桌忙、有弹层、选着牌）时推迟到空闲。

## 4. 降帧和动画

- 闲着时降帧（`idle.ts`）：4 秒没有点按、按键，牌桌不忙（`isBusy`），也没有一次性补间在播，帧率上限降到 31；一秒看一次，不要改成每帧看（会拖住场景时钟）。
- `repeat: -1` 的装饰循环按 31 帧播，别在里面做重活。要 await 的动画一律走 `anim.ts` 的 `tweenP`、`wait`，或者自己包一层 `settle`：最多等"时长 + 500 毫秒"就当播完，动画出岔子也不卡牌局。
- 动画时长一律经 `anim.ts` 的 `dur()`（设置里的速度、URL `anim=0` 瞬间完成）；冒烟靠 `anim=0` 和 `autoplay=1` 快速推进。

## 5. 内存

- 内存（老 iPhone 只有 2GB，超了 WebKit 直接杀页面）：手机平板（iOS 或触屏）上 `RENDER_SCALE` 封顶 2（0.36.1 起安卓触屏也封），iOS 2 倍时关 WebGL 多重采样；背景大图按世界宽度烘焙，
- 换宽度后 `dropBackdrops` 删旧的；`guandan.boot` 记"前台开着"，被杀后下次自动降档（1 倍 → Canvas 渲染），换版本重置。
- 量内存用 `node tools/mem.ts`（模拟 iPhone 8 / 8 Plus 横屏）；新加大纹理先跑一遍它；冒烟 `viewport` 一段覆盖可见区、工具栏遮挡、降档和 Canvas 渲染。

## 6. 布局数字（layout.ts）

- 牌桌的布局数字（位置、尺寸、间距、偏移，以及没经过 `dur()` 的定时毫秒）集中在 `src/view/table/layout.ts`，按"两个玩法共用 / 掼蛋 / 斗地主"分三段（`TOPBAR`、`ACTION_ROW`、`COUNTER`、`STAKE_STRIP`、`DDZ_BUTTONS`、`HAND_LAYOUT`、`KING_BOMB`……），场景、`table-ui`、`play-fx`、`hand.ts` 从这里取，不再写裸数字；调布局改这里。弹窗内部的排版（`overlays.ts`）留在各自文件；降帧的 4 秒、31 帧在 `idle.ts` 顶上。没经过 `dur()` 的毫秒只是起了名，不跟设置里的速度走（套上会改行为）。

## 7. 牌局节奏（PACE）

- 牌局节奏（碎片化：实盘一场 3–6 分钟，斗地主一手 ≤ 2 分钟）：停顿和过场的时长常量集中在 `src/view/common/pace.ts` 的 `PACE`（大字、横幅、发牌批量、出牌飞行、不要、收墩、一副最后一手的停留、进贡、炸弹和春天的大字），
- 牌桌（`TableScene`、`DdzScene`、`table/*.ts`）和估时间的模拟器（`ai-sim length`、`ddz-stake-sim --time`）读同一份，改节奏只改这里。电脑想多久在 `personas.ts` 的 `thinkTime`
  （不要 0.18–0.28 秒、连着有人不要时再快四分之一；跟牌 0.32–0.55；领出 0.42–0.69；炸弹前约 1 秒的犹豫是戏，不动），`tests/view/venue.test.ts` 锁着默认速度下普通出牌 ≤ 900 毫秒。
- 设置里的慢 / 中 / 快（`SPEED_FACTOR` 0.7 / 1 / 1.7）乘在这些数上，默认"中"就是 `PACE` 的数。结算页没有强制停留，"下一副""继续"随时能点。
- 单机"再来"都是一键直达：娱乐整局结束页的"再来一局"（控件 `again`）按这一局的难度、规则、局长直接开新局不回主页；实盘结算页的"再来一场"（控件 `again`）结回之后同档再带入一份，
- 带入没成就写出原因、回标题页并打开选档页（`table/again.ts` 的 `backToPicker`）；每日挑战的"再打一次"、残局的"下一关 / 重来"不变。

## 8. 手牌分列

- 手牌分列是纯函数 `table/columns.ts`（有单测）；一列最多 5 张，保证手机横屏每张牌露出的部分都点得中（冒烟里逐张点验证）。
- 斗地主手牌横排一行（`HandOrder.flat`，排法是 `table/hand-logic.ts` 的 `flatLayout`：20 张时每张露出 ≥ 32 世界坐标，按牌型理牌时组与组之间留空隙、挤了就让位），掼蛋的分列和 `columns.ts` 不动。

## 9. 电脑操作（非触屏）

- 电脑操作（非触屏）：`ui/shortcuts.ts` 把按键接到牌桌按钮的 `Button.press`（空格 / 回车出牌、B 不要、H 提示、S 理牌、Esc 有选牌时取消全部），同一条路，音效和禁用状态一致；弹窗开着（焦点层）、键盘在输入框或 DOM 面板、键盘焦点框亮着（回车空格归 `ui/focus.ts`）时不接，Tab、方向键、关弹窗的 Esc 仍归 focus.ts；手牌上滚轮不滚页面。
- `HandView`：鼠标停在可选的牌上上浮 8 并描边（触屏不悬停）；右键从不选牌，点牌取消这张、点空白取消全部（判断在 `hand-logic.ts` 的 `downAction`，有单测），画布上不弹浏览器菜单，`Button` 也忽略右键。规则页多一页"快捷键"（`SHORTCUT_HELP`，只在 `hasPointerKeys()` 的设备上）。
- `iconButton` 的 `label` 参数：鼠标停在圆图标上，下方冒名字小标签（触屏不冒），新加图标按钮都传一个。电脑版聊天按钮用 `chatDock` 钉在顶栏"大厅"右边（默认收起），不让 kit 自己挑角压到"大厅"。

## 10. 座位

- 座位：0 我（下）、1 老张（右，下家）、2 小美（上，对家）、3 阿强（左，上家）。性格只影响台词/表情（`personas.ts`）。
- 斗地主三人桌：0 我（下）、1 老周（右，下家）、2 王姐（左，上家），布局 `table/layout.ts` 的 `seatAnchors3`；`labels.ts` 的 `setTablePersons` 换成这两个人。

## 11. 斗地主和每日挑战的画面

- 斗地主（牌馆，`docs/doudizhu.md`）：主页标题"牌馆"，下面是"掼蛋 / 斗地主"切换（控件 `variant:guandan` / `variant:ddz`），上次选的记在 `guandan.variant`，面板、主页"规则"跟着切。
- 场景 `ddz`（`DdzScene`）复用掼蛋的手牌、出牌区、座位、按钮、弹窗、牌面、音效和 kit 的互动：手牌由玩法给"怎么理牌"（`HandOrder`，不给就是掼蛋原样），出牌区由玩法给"一手牌怎么写"（`DescribePlay`，必传）。
  推进同样只走 `DdzSession.apply` → `dispatchDdz`；电脑只拿 `viewDdz`，随机数按 `ddzSeeds` 派生。URL 带 `?ddz=1&seed=…` 直接开一局（调试，已有存档时不写）。单机娱乐开局带 `ddzFunOpts(设置的 ddzDeal)`（明牌开着：地主拿底牌后选"不明牌 / 明牌 ×2"，控件 `show:0` / `show:1`；选了不洗牌再叠 `DDZ_NOSHUFFLE`：成团发牌、炸弹多、每副封顶 48，选难度页的控件 `deal:0` / `deal:1`），每日不开；实盘的选档页另有发牌切换（`seg:deal`，经典 / 不洗牌，和娱乐共用 `ddzDeal`），不洗牌按规则版本 3 开局；好友房的娱乐房间（含快速匹配的娱乐桌）一律开明牌（`ddzBegin`），还能开不洗牌（开房请求体带 `noShuffle: true`，面板按钮 `ol-create-clump`，`docs/doudizhu.md` 第 3、5 节）。
- 每日挑战（`doudizhu/daily.ts`）：种子只看北京时间的日期、两个普通难度电脑、6 副累计分交到平台 `daily-<日期>-ddz-v1`，不存档、不记战绩。冒烟 `npm run shot -- --only ddz`。
- 残局闯关（`doudizhu/puzzle.ts`，规则核心在 `src/variants/doudizhu/puzzles/`，现状见 `docs/doudizhu.md` 第 6 节）：主页斗地主面板战绩条右边的"残局"（控件 `puzzles`，选关格子 `puzzle:<id>`），`PuzzleSession` 继承 `DdzSession`、农民走 `bestReply`、不存档不计战绩，进度在 `guandan.ddz.puzzles`；牌桌里农民的牌摊开，不开牌桌互动。
- 每日残局（`puzzles/daily.ts` 生成，只看日期，求解器验过必胜；`DailyPuzzleSession` 继承 `PuzzleSession`，计时从第一手到出完，分数 `max(10, 600 − 秒 − 30×重来 − 60×提示)`，榜 `daily-<日期>-ddzpz`，入口是选关弹窗顶上的今日大卡 `puzzle:daily`；主页切到斗地主、牌桌素材烘完后先把今天的题算好）：详见 `docs/doudizhu.md` 第 6 节，记录在 `guandan.ddz.dailyPuzzle`。
- 单机实盘（`doudizhu/stake.ts`，数字见 `docs/stake.md` 第 10 节）：`DdzStakeSession` 是 `DdzSession` 加一场的账，一场 3 副（老存档按它存档里的版本打完），带入、结回、放弃走掼蛋同一套接口（请求体多 `variant: 'ddz'`），选档页是同一个（`ui/stake.ts` 的 `openTierPicker` 传 `DDZ_FLOW`），选档页里有"和电脑 / 快速匹配"（匹配排不到转同档单机）；
  ref `solo-ddz-…` 和掼蛋的互不匹配，"别的设备上开的那一份"各认各的（`strayStake` / `strayDdzStake`）。冒烟 `npm run stake-smoke -- --ddz-only`。
- 掼蛋每日挑战（`guandan/daily.ts`，主页战绩条右边的"每日挑战"，控件 `daily`，单独部署不摆）：`DailySession`（继承 `Session`，不存档、不计战绩）用只看北京时间日期的种子、三个普通难度电脑、默认地方规则，
- 打满 8 副或有一队先过 A 就结束，分数是我方每副 `dealPoints` 的累计（不封顶），交到平台 `daily-<日期>-gd`；牌桌顶上写"每日 · 第 n/8 副"，结算页写这一场的分和交分结果，"再打一次"同一个种子重开。
- 日期、榜名、交分、结果文字和斗地主共用 `daily.ts`；电脑照旧只读 `viewFor`、随机按用途从种子派生（`soloSeeds`）。不弹新手引导、不报好友动态。

## 12. 启动与烘焙

- 启动与烘焙（`src/view/common/textures.ts`、`BootScene`）：`BootScene` 只等主页要用的纹理（图标、logo、灯笼、四个人、火星粒子、各头像的开心脸、标题背景，`bakeHome`），进标题页后才在后台烘焙牌桌的素材（`startBackgroundBake`，每批之间让出页面线程），分两段：先烘一开局就要的（牌背、标记、牌面、当前宽度的牌桌背景，`jobsTableCore`），再烘头像表情、印章、粒子（`jobsTableExtra`）。进牌桌时后一段先停着，等牌桌播完第一批事件（发牌动画，`TableSceneBase.playEvents` 里调 `releaseExtraBake`，15 秒兜底）再接着烘，而且一次只在一段空闲里烘一张（`idleSlot`：有 `requestIdleCallback` 就等 ≥5 毫秒空闲，没有就等这一帧画完），不和出牌动画抢页面线程。用到后一段的纹理一律经 `texOr`：还没烘好就用替身（开心脸、火星、透明空图），不出缺纹理方块；新加这类纹理的用处也要走它。
- 进牌桌（`table`、`ddz`）一律走 `startWhenReady(scene, key)`（标题页的开局、`online.ts` 的 `enterTable`），一开局就要的那段没烘完就在原地显示"正在洗牌 n%"，烘完再进（URL 带 `bake=all` 时照旧等整套，冒烟的大屏段走这条）；URL 开局、邀请链接在 `BootScene` 里等 `ensureTextures` 烘完才进；载完、正切到标题页的那一帧里才接上的房间，`enterTable` 等标题页 create 后再在标题页上 `startWhenReady`（挂在 boot 上会随 boot 关掉而丢）。不要直接 `scene.start('table'|'ddz')` 从标题页进。
- 主页背景（整屏大图）分两档：首帧只烘 1 倍（`title:<宽>`，`titleJob`），标题页出来、牌桌素材烘完后再烘全倍数的 `title:<宽>:hi`，`upgradeTitleBackdrop` 直接换纹理（不闪）；场景重开时 `titleBackdrop` 优先取全倍数的。渲染倍数本来是 1 时只有前一档。
- Phaser 不用官方整块的 ESM 包（树摇摇不掉物理、Tilemap、Video 等），`vite.config.ts` 把 `phaser` 别名到 `src/phaser-lite.js`，从源码只引入用到的部分（入口是 ESM，开发服务器靠 `optimizeDeps` 预打包它引的 CommonJS 源码，所以 `npm run dev`、冒烟和线上是同一套 Phaser；`phaser-src/` 别名指向 `node_modules/phaser/src`，`typeof FEATURE_SOUND` 等开关在 `define` 和 `optimizeDeps` 里都要配（`PHASER_FLAGS`）；声音走自己的 `audio.ts`，关了 Phaser 的声音）。
- 代码里新用到别的游戏对象（`scene.add.xxx`）、加载文件类型，要先在 `phaser-lite.js` 里加上，否则运行时才发现没有；升级 Phaser 时对一遍这个文件。类型仍来自 phaser 自带的声明。
- 量启动用时看 `performance.mark` 的 `gd:*`（`gd:boot-create`、`gd:title-bg`、`gd:home-jobs`、`gd:bake`、`gd:font`、`gd:textures`；进牌桌 `gd:table-core`、`gd:table-bake`、`gd:enter`、`gd:enter-start`），`app.bootMs` 是 BootScene 总用时。字体在 `index.html` 里 preload。

## 13. 主页

- 主页（标题页，现状见 `docs/art.md` 第 4 节）：左边茶馆一角（背景 SVG + 单独烘焙的灯笼 `home:lantern`、四个人 `home:fig:<id>`），右边一块面板；排版是纯函数 `src/view/common/home-layout.ts`（`homeLayout(W, H)`），背景和场景共用，宽屏一起铺开。手机竖屏单列：上面是茶馆（人物放大到 1.3 倍、整体按面板上方的空当往下挪 `top`），下面是整宽的面板；背景纹理按 `title:<宽>x<高>` 分开烘焙。
- 面板从上到下：标题"牌馆"、"掼蛋 / 斗地主"切换、主按钮（有实盘存档 `resumeStake`，否则有存档 `continue`，否则 `quick` 快速开始娱乐）、三张卡 `fun` / `stake` / `online`、战绩条（点开战绩；还没有战绩时是"点这里去打一局"，控件 `statsEmpty`，和主按钮同一条路开局）；右上 `stats`、`settings`、`rules`、`cloud`。括号里是冒烟用的控件名。
- 灯笼晃、人物呼吸、火星只在 `LOW_MEMORY === 0` 且没关动画时开。

## 14. 回大厅

- 回大厅（`src/view/common/lobby.ts`，所有游戏统一）：左上角"大厅"（小房子）指向平台首页 `/`；单独部署叫"首页"、指向 `./`，标题页本身就是首页，不摆。标题页直接走；牌桌上打到一半先弹确认（这局会存着 / 调试开局不保存 / 好友房：头 60 秒轮到你时等 30 秒按"能不出就不出"代出，之后电脑替你打，回来接着打——回大厅不调 `leave()`，座位和 `guandan.room` 都留着）；
- 手机竖屏时只有牌桌被"请横过来"盖住（牌桌场景开着时 `html.gd-at-table`，`orientation.ts` 的 `setAtTable`），主页和它的弹窗竖着能用；提示层左上角也有一个（打到一半用浏览器自带的确认框）。电脑（非触屏）上 `mountLobbyOverlay` 在画布按钮正上方叠一个透明的 DOM 按钮（`aria-label="回大厅"`，id `gd-lobby-dom`），每帧渲染完按按钮的位置、大小对一次，点了调画布按钮自己的 `onClick`（对局中先确认也在里面）；有弹层时不叠。离开前调一次 `cloud.flushOnHide()`（pagehide 时也会触发，同槽在途不重发）。
- 小房子图标只用来表示"回大厅"；回掼蛋自己的首页用箭头。冒烟只断言跳到 `/`，不加载平台页面。

## 15. 界面的刻度和按钮

- 标题字体是内嵌的宋体子集（`fonts.ts`，README 素材一节）：新加的大字、横幅、弹窗标题如果用了字表里没有的字，`tests/view/view.test.ts` 会报缺字。
- 界面的刻度和按钮：间距、圆角、投影、按钮配色和光影只从 `theme.ts` 取（`SPACE`、`RADIUS`、`SHADOW`、`BUTTON`、`LIGHT`、`TIER`），
- 按钮分三档：主（`red`，一屏一个）、次（金绿蓝木）、弱（`quiet`：不要、重选、理牌），调用处只传颜色名、档位由 `BUTTON_TIER` 推出，不自己画高光阴影（`docs/art.md` 第 9 节），DOM 用 `THEME_CSS` 的 `--gd-` 变量和 `.gd-btn`（`tests/view/ui-theme.test.ts` 查 DOM 按钮）。
- 牌桌操作区同一时间只有一个红色主按钮（出牌；斗地主叫分是"3 分"、明牌是"明牌 ×2"），"提示"用木色，"我回来了"绿、"重新带入"金；手机上按钮画出来的高度不低于 36 CSS 像素（`theme.ts` 的 `minDrawH`）。
- 牌桌顶栏不随每一手重建：每一步走 `refreshTopBar`，按 `topBarKey`（级数、副数、倍数、实盘条的字……）没变就只重画记牌器（`counterBox`）——整条重建会让按下和松手落在新旧两个按钮上、点击丢掉（online-smoke 查一副里的 `topBuilds()` 次数）；顶栏要显示新东西时把它加进 `topBarKey`。牌桌顶栏的图标两个玩法共用 `TableSceneBase.buildTopIcons`：从右往左回首页、设置、规则（控件 `top0`–`top2`，斗地主叫 `home` / `settings` / `rules`），最左云存档；静音不单放，在设置里。手机上聊天按钮由 `chatTopStyle` 画成顶栏高度内的圆钮（kit 的按钮透明、只留点按区）。
- 弹窗：设置、规则、战绩点弹窗外即关（`modal()` 的 `dismissOnOutside`，和 ✕、Esc 同一条关闭路径），这类弹窗同时只留一个；确认框点外不关。设置分"声音 / 对局 / 地方规则"三个页签，底下有"恢复默认"（`store.ts` 的 `resetSettings`，只动设置）。
- 断网统一说 `stake-text.ts` 的 `NET_DOWN`（"网络不通，检查后重试"）配"重试"按钮：好友房面板（`#ol-retry`）、实盘选档页钱包连不上（钱包那行右边，控件 `tierRetry`）、实盘带入结回、出错面板。筹码的事只说"带入 / 结回"。
- 画布里能点的一律用 `ui/kit.ts` 的 `Button`、`iconButton`、`segmented`（自带悬停、按下、禁用、加载中，登记进 `ui/focus.ts` 的键盘焦点；弹窗用 `modal()`，自带焦点层和 Esc）。
- 点按区域至少 44 CSS 像素：`minHit()` 是按当前缩放换算的世界坐标（电脑 44、手机横屏约 82–100），按钮默认就扩到这么大；挨得近的用 `setHit` 收到间距或用它的 `dy` 挪到空着的一边（`segmented` 的 `hitDy` 同理），不许互相压着；贴着屏幕上沿的顶栏按钮用 `setTopHit`（从上沿往下算，不伸出屏幕），最右一个往里放半个点按区。弹窗（`modal()`）右上角的关闭键自己避开屏幕上沿和右沿；行数多的弹窗（选难度、选档位）按行距 `minHit()` + 2 排，多出来的高度加在弹窗上。
- 输赢的分和筹码一律正绿负红（`theme.ts` 的 `signColor`；深色底上用 `signColorOnDark`，亮一档）：整行都是一个数的就整行着色；数字夹在一句话里的用 `ui/kit.ts` 的 `signedLine`（模板里写 `{0}`、`{1}`，只把数字那几段换颜色，不换行、不重排整句；`stake-text.ts` 的 `fillSigned` 用同一份模板拼整句，顶栏的 `topBarKey` 靠它判断要不要重画）。放不下一行的长句拆成几行（`SignedRow[]`，`fillRows` 拼回整句），确认框 `ui/panels.ts` 的 `confirm` 收这种行数组、每行一个 `signedLine`（好友房"离开房间？"就是这样）。分享卡同样：实盘那张的筹码大字带 kit 的 `sign`（`guandan/share-card.ts`），正绿负红，不输不赢是白字。
- 调试桥 `hits()` 列出现在点得到的矩形，冒烟的 `checkHits` 用它查；新加能点的东西后跑一遍 `npm run shot`。画面上的人名用 `seatName`（最多 `NAME_MAX` 个字），认人用 `fullSeatName`。

## 16. 一屏放下

- 改了画面后跑 `npm run shot`，并亲自看 `shots/` 里 1280×720、844×390、1920×1080 的截图。
- 一屏放下（仓库 `docs/ui.md` 第 11 节）：任何界面都不许要滚动才能看全。`tools/no-scroll.ts` 在 `shot`（`--gallery` 是 1280、1920、844 三个横屏加 360×640、390×844 竖屏）、`online-smoke`（房主 1920×1080，另有 1280、667×331、915×412、1180×820、844×390）和 `stake-smoke`（1280、1920；`--sizes 844x390,640x360` 只走带输赢数字的四屏）每截一张图时量页面和每个能滚的 DOM 元素，
  `scrollHeight` 超过 `clientHeight` 就记成失败。画布里的画面本来就不滚；新加 DOM 面板（`online.ts` 的 `.ol-card` 这类 `overflow: auto` 的）放不下时先缩间距、并排，不靠滚动。
- 同一处还量两样（`layoutIssuesOf`）：看得见、点得到的控件两两不许相交（DOM 的 button、a、`[role=button]`、输入框，被弹层盖住的不算；画布的读调试桥 `hits()`），
- DOM 里带字的元素不许被裁（`scrollWidth`/`scrollHeight` 超出 1 像素以上）。有意截断的字登记在 `no-scroll.ts` 的 `CLIP_OK` 并写理由。画布里的 Phaser 文字不会被裁，只会画出框外，这项量不到，靠看截图。

## 17. 截图里精灵缺块

- 截图里精灵随机缺一块方的（沿精灵中线整块透明，每次位置不同）：是无头 Chrome 软件渲染（SwiftShader）下 Phaser 多纹理合批取错了纹理单元，不是素材或烘焙的问题。
- `src/main.ts` 在自动化浏览器（`navigator.webdriver`）里设 `render.maxTextures: 1` 绕开，真机照常合批。别的 Phaser 游戏碰到同样的现象，照这个改。
