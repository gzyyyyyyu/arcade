# 代码结构

开盘各目录放什么、几个大文件怎么分工，以及冒烟截图为什么能复现。模块约定见 `../AGENTS.md`，各工具脚本的命令见 `../tools/README.md`。

## 目录和分工

### `src/core/`：规则核心（纯函数、确定性）

- `types.ts`、`queries.ts` 只是入口，实际按领域拆在 `types/`（base、state、report、run、action、event）和 `queries/`（themes、cards、chat、topbar、items、summary、history、board）。
- `content/` 是内容表：股票、道具、事件、群友、月度主题、故事模板等。
- `engine/` 是规则引擎，按职责分文件（每个 ≤ 800 行），`index.ts` 只列对外导出：
  - `run.ts`：`createRun` / `dispatch` / `replay`；
  - `open.ts`：一天的开盘结算，分步；`day.ts`：开月、盘前行情；
  - `month.ts`、`reward.ts`、`event.ts`：月底、三选一、事件；
  - `actions.ts`：买卖等操作；`validate.ts`：操作校验；
  - `calendar.ts`、`ext.ts`、`holdings.ts`、`gear.ts`：日程查询、仓位押跌抵押、持仓小件、实盘杠杆；
  - `shared.ts`：引擎共用的小件（事件收集器、对外的选项和结果类型）。

### `src/view/`：Phaser 画面层

目录：`scenes/`、`trade/`（交易界面）、`end/`（结束页）、`meta/`（图鉴、成就、开局等）、`ui/`、`fx/`、`audio/`。颜色、字号（`TYPE`）、间距和圆角（`SPACE` / `RADIUS`）在 `theme.ts`，新写和改动的布局从这里取；按钮的状态和键盘焦点见 `ui/button.ts`、`ui/focus.ts`。

- **交易场景** `scenes/TradeScene.ts` 只管搭画面和渲染，其余按职责拆在 `trade/` 的协作者里（拿场景引用 `s`，状态都留在场景）：
  `tradeActions`（玩家操作）、`tradeInput`（键盘、拖拽）、`dayPlayback`（一天的结算演出）、`monthFlow`（月底和新月份衔接）、`tradeFx`（短动画飘字）、
  `tradeHints`（教程和提示）、`tradeRegions`（`controls()` / `regions()` 给自动化的坐标）、`tradeConsts`（共用常量）。
- **群聊** `trade/chat.ts` 同样按职责拆出 `chatBubbles`（消息、吐槽）、`chatRec`（推荐卡）、`chatBanners`（横条、待揭晓）、`chatNews`（新闻）、`chatFluffView`（热闹元素）、`chatConsts`（尺寸常量）。
- **行情画面** `trade/marketScreen.ts`（开盘区的大盘屏）读 `tape.ts`（情绪 `sentimentOf`、风口领涨领跌 `sectorMoves`、跑马灯）；股票详情 `trade/detail.ts` 的 K 线页由 `trade/kline.ts` 生成：
  开高低、分时、买卖力量和量柱在画面层按「种子:股票:交易日」用 `ui/stable.ts` 稳定生成，收盘涨跌只用已发生的（`stockMoves`），不读 `real`。
- **群聊增量更新**：`ChatView3.render` 记下消息侧的输入（日期、阶段、提示、消息、横条、新闻、押跌开关、推荐条数，手机上加推荐买没买），同一天这些没变（买卖、加自选）就只重建推荐卡；
  收盘盖章、吐槽、系统提示等往群聊里加东西的方法把记录清掉，下一次整块重建。新加进群聊版面的输入要放进 `keyOf`。
- **持仓格** `trade/holdings.ts`（`HoldingsView`）+ `slotCard.ts`（单张卡）+ `holdingsShared.ts`（冻结格、选择模式等共用小件）。
- **结束页** `scenes/EndScene.ts` 保留生命周期、主结算页和对外方法，其余在 `end/`（拿场景引用 `s`）：`endGeo`（电脑 / 手机两套尺寸和分句换行）、
  `endFlash`（闪电盘 / 本周盘的结束页和滚数字演出）、`endRows`（右栏的挑战、排行榜、下次试试和「收获」一排）。

### 其他

- `src/platform/`：浏览器存档、档案、设置、错误兜底、云存档（`cloud.ts` 只管同步，不认识具体数据；同步哪些槽在 `view/cloudSync.ts`）。
- `src/debug/`：调试桥（截图脚本用 `window.__game`）。
- `tools/`：`sim.ts`（机器人模拟）；`bots.ts` 是机器人入口，实现在 `bots/`（common 公共小件、simple、normal、smart-belief + smart、variants、run 注册表和 `playRun`）；
  `shot.ts` 是无头冒烟与截图的入口，`shot/` 里 `harness.ts` 开页面和点按截图、`fakes.ts` 假档案假钱包、`modes/` 每种模式一个文件；`realness.ts` 真实度实测；`art/` 程序生成美术；`data/` 数据管线。
- `public/data/segments/`：135 段行情段，只存逐日涨跌基点，文件名是不透明 id。
- `tools/data/raw/years/`：年包，数据管线的产物和切段的默认输入，`tests/core/story.test.ts` 拿它核对化名；不在 `public/` 下，不进任何构建。
- `tools/data/story-aliases.json`：故事稿化名表（id、化名、改写代码、真实代码、可交易），`tests/core/story.test.ts` 和 `tools/data/check.ts` 读它。

## 浏览器存储 key（全部 `kaipan.` 前缀）

`kaipan.save`、`kaipan.save.corrupt`、`kaipan.profile`、`kaipan.settings`、`kaipan.view.prefs`、`kaipan.setup.last`、`kaipan.tutorial.v3`、
`kaipan.extTips.v1`、`kaipan.codex.viewed.v1`、`kaipan.soundboard`、`kaipan.errors`、`kaipan.run.unscored`、`kaipan.cloud`（云同步元数据）、`kaipan.homeTip.off`（关掉了「添加到主屏幕」提示）、`kaipan.live`（实盘这一局的筹码走到哪一步，见 `src/platform/live.ts`）、`kaipan.challenge`（这台设备接下的好友挑战，见 `src/platform/challenge.ts`）；
云同步备份类：`kaipan.<槽>.pre-sync`、`kaipan.<槽>.pre-switch.<userId>`、`kaipan.<槽>.pre-switch.<userId>.restored`（槽是 `profile`、`tutorial`；key 由 `src/platform/cloud.ts` 的 `preSwitchKey` 拼接、并回后在末尾加 `.restored`，不是固定常量）；
`kaipan.profile.corrupt`。
sessionStorage：`kaipan.relayout`（转屏提示点了「换成 X 屏版」，重新载入后直接回到没打完的那一局；读一次就删，见 `src/platform/orientation.ts`）。
只读不写的平台 key：`arcade.sound`（大厅的声音开关，经 kit `platformSoundOn()` 读）。启动读一次，是 `'off'` 就这一次先静音、设置里的开关显示关；在游戏里打开只管这一次，不写它，`kaipan.settings` 里存的静音偏好也不变（`src/platform/settings.ts`）。
启动时清掉（`src/platform/storage.ts` 的 `LEGACY_KEYS`）：`kaipan.records`（旧版本地纪录，档案取代了它）、`kaipan.save.v1`、`kaipan.save.v0.1/v0.2/v0.3/v0.3a/v0.4a/v0.3.restored`、
`kaipan.records.v0.2/v0.3/v0.4a/v0.3.restored`、`kaipan.terms.v04`。新增、删除 key 都改这张表。

## 冒烟截图怎么做到可复现

自动化（`navigator.webdriver`）下，同一份代码、同样的参数跑两次，除动画中途截的几张外逐像素一致。真人玩时行为不变。新加画面层的随机或待机循环动画要照下面做，否则截图又会每次不同。

- **随机**：做法集中在 `src/view/ui/stable.ts`。画面层的随机一律走 `viewRandom()` / `viewBetween()`（真人是 `Math.random`，自动化是固定种子），不直接用 `Math.random`、`Phaser.Math.Between`。
  Phaser 自带的随机（相机抖动、粒子发射器）直接调 `Math.random`，所以自动化下 `stable.ts` 把 `Math.random` 整个换成同一个固定种子的。
- **待机动画**：按真实时间一直循环的待机动画（呼吸、眨眼、浮动、气泡、环境动画）在自动化下不播，由 `BaseScene.lively` 和 `StockGuy` 判断；专门测待机动画的冒烟（眨眼）在地址里加 `idle=1` 打开。竖屏提示层这类 DOM 的 CSS 无限动画自动化下也停。
- **时间**：游戏时间按真实时间走，不用固定步长：无头浏览器出帧很不均匀，每帧固定 1/60 秒时游戏时间会停住好几秒，长按、开新局都跟着卡。
  调试桥 `freezeAfterCue` 按游戏循环时间（`session.loopTime`）冻结，不用 `setTimeout`。画面代码里的 `performance.now` / `setTimeout`（点击防抖、右键认领、加载超时等）仍按真实时间，别拿它们决定截图里画什么。
- **什么时候截**：截「播完」的画面不要 `waitForTimeout` 后直接截（同样的真实时间跑出的帧数不同），用 `tools/shot/harness.ts` 的 `quietShot`（调试桥 `freezeWhenQuiet`：补间、计时器、粒子、相机效果都播完才冻结再截）。
  截动画中途用 `cueShot`：冻结点落在动画的哪一帧随机器快慢变，这些图（结算、涨跌停、账单等）不做逐像素比对，文件名记在输出目录的 `midway.txt`。
- **长按和等待**：冒烟的长按（`longPress`）不按固定时长，等游戏认了长按（调试桥 `longPresses` 加一）再松手，30 秒不生效才算失败（机器满载时要 5–10 秒）；
  按住时整个场景重建的那一步按满两倍长按时长再松手。等「空闲」（`waitIdle`）的上限按游戏时间算。

## 性能：文字和纹理

画面全是 Phaser 的文字和图集。量下来最贵的是**文字对象**：每建一个、每重画一次，都要在 2D 画布上画一遍、再整张传成 GPU 纹理（新建的要传两次）。规矩：

- 改颜色、描边用 `ui/text.ts` 的 `setColor` / `setStroke`：Phaser 自带的不管变没变都重画，这两个没变就不动。`setText` 同样的字 Phaser 自己会跳过。
- 只为量高度别新建文字对象再销毁：按（字号、文字）缓存高度（`trade/chat.ts` 的 `bubbleTextH`）。
- 断行 `cjkWrap` 按「字体 + 原子」缓存宽度，离换行宽度很近才整行真量，断行结果不变。
- 组件构造时不先画，场景 `create` 马上整页 `render` 一遍。
- 图集页先 `img.decode()` 再交给 Phaser：不然上传时才在主线程同步解码 2048² 的 webp。

量法：`tools/perf.ts`（正式构建、固定种子、电脑和竖屏两种口径）。纹理上传、量字次数和机器快慢无关，改前改后先比这两个；时间类在本机软件渲染、负载高时只作参考。

## 待重构

- 群友性格校正用了整段数据；若要只按开局前表现判定，需要更长的开局前历史。
- 可变的全局开关 `swanSwitch`（`src/core/swan.ts`）、`ipoSwitch`（`src/core/ipo.ts`）改成参数传入：放进 `createRun` 的选项、记在 state 里（回放、存档带着走），模拟器的 `--no-swan` / `--no-ipo` 和测试改传参数，不再改全局变量。
