# 雀馆设计：引擎分层（一套引擎 + 多个玩法）

> 从 [DESIGN.md](../DESIGN.md) 拆出来的一部分，小节号和总纲一致（别处写"DESIGN.md 第 N 节"指的就是这里）。

## 3. 引擎分层（一套引擎 + 多个玩法）

```
src/core/
├─ tiles/        通用：牌的表示、牌集、牌墙和发牌（带种子）
├─ hand/         通用：手牌计数、拆解、向听数、有效牌、听牌、副露的形状
├─ puzzles/      练习玩法的出题和计分（听牌速判 ting.ts）：纯函数，吃 hand 的算法，随机只用带种子的 RNG
├─ table/        通用：座位、出牌和"别人打出后谁能动作"的收集与裁决、牌墙指针
├─ variants/
│  ├─ types.ts   玩法统一接口 Variant
│  ├─ index.ts   玩法登记表（id → Variant）
│  ├─ sichuan-xuezhan/   川麻·血战到底：流程、动作、和牌、番、刮风下雨、查叫、一场、电脑参数、称号
│  └─ riichi/            立直麻将（第 11 节）：役、符、点数、牌局流程
└─ match/        通用：筹码账（付钱、付不起按比例、封顶）、一场的统计、给钱包的小结
src/ai/          通用的电脑：牌效（向听 + 有效牌）、防守、性格；玩法给参数和专属决定（换三张、定缺）
src/room/        把任意 Variant 接到 kit 的 RoomGame（房间按开房选项里的 variant 选玩法）
src/view/        通用牌桌界面 + view/variants/<id>/ 按玩法挂载的组件（牌桌 VariantUi、页面层钩子 VariantPage）
src/app/         页面和流程（主页、选桌页、单机、好友房、结算、社交），不认识具体玩法，只经 pageOf(id) 取
```

### 3.1 牌的表示（`tiles`）

- **牌种** `Kind`：0–8 万（m）、9–17 筒（p）、18–26 条（s）、27–33 字牌（东南西北白发中）、34–41 花牌（春夏秋冬梅兰竹菊）。计数数组长 34（花牌不进手牌拆解，摸到就补，日麻、川麻都用不到，留位置）。
- **一张实物牌** `Tile = 牌种 × 4 + 第几张（0–3）`（花牌每种 1 张）。赤宝牌由玩法的牌集声明"哪几张是红的"（日麻：5m、5p、5s 的第 0 张），牌本身不带标记，所以同一套编码两种玩法都能用。
- **牌集** `TileSet`：玩法声明用哪几门、每种几张、有没有字牌花牌、哪几张是赤，`buildWall(set, rng)` 生成洗好的牌墙。川麻：只有 m、p、s。
- 万、筒、条的中文名和画法在界面层（`view/tiles.ts`），核心只用编号。

### 3.2 手牌（`hand`）

- `Counts`：34 位计数。副露 `Meld = { kind: 'chi' | 'pon' | 'kan', tiles, from, open }`，`kan` 再分直杠 / 补杠 / 暗杠。
- 一般型拆解：每一门单独用记忆化递归算"能凑几组 + 几个搭子 + 有没有将"，四门合起来，跟副露数一起算向听；字牌只能刻子。
- 向听数：`min(一般型, 七对, 国士)`，玩法声明开哪几种（川麻：一般型 + 七对；日麻再开国士）。
- 有效牌 `ukeire(counts, visible)`：打掉某张后哪些牌能让向听数减一，减去已经看得见的张数。
- 听牌 `waits(counts, melds)`：哪些牌能和；玩法再加限制（川麻：手里不能有缺门、胡的牌不是缺门）。
- 番型判断要用"所有拆法"：`decompose(counts, melds, winTile)` 列出全部一般型拆法（每门最多几十种），玩法的计番函数逐个算取最大。

### 3.3 牌桌（`table`）

- 座位状态：手牌（实物牌数组，有序）、副露、弃牌河（每张记是不是被人碰杠拿走）、是否已和、玩法私有的扩展字段。
- 牌墙：一个数组 + 头指针 + 尾指针（川麻杠后从尾补；日麻另有王牌区，由玩法自己切）。
- **声明窗口** `ClaimWindow`：某张牌打出（或补杠被抢）后，按玩法给的"谁能做什么"收集每个人的选择，全部到齐或超时后按优先级裁决：
  `胡 > 杠 / 碰 > 吃`，玩法声明"一炮多响"还是"头跳"（日麻按座位顺序只取第一个、或允许双响）。窗口只问真的有选择的人。
- 牌桌只管通用的事，不认识番、筹码、换三张。

### 3.4 玩法接口（`variants/types.ts`）

```ts
interface Variant<S, A, V, O> {
  id: string; name: string;                     // 'sichuan-xuezhan'、'川麻·血战到底'
  tileSet: TileSet; rulesVersion: number; seats: number;
  defaults: O; options(raw: unknown): O | null; // 房间选项校验（局数、封顶、换三张、自摸加底/加番、呼叫转移）
  begin(key: Entropy, opts: O, seats: SeatKind[], setup: MatchSetup): S;  // 一场开始；key 只在状态里
  actors(s: S): { seats: number[]; group: string } | null;  // 这一刻谁能出手（换三张、定缺四家同时；声明窗口是所有没胡的别家）
  apply(s: S, seat: number, a: A): S | { error: string };
  parse(raw: unknown): A | null;                // 房间收到的不可信 JSON：只收真人能发的
  free(a: A): boolean;                          // kit 的不轮流操作（声明窗口里真人的回答）
  pause(s: S): number | null; resume(s: S): S;  // 局间停顿
  turnMs(s: S): number;                         // 这一手的时限（2.9）
  view(s: S, seat: number | null): V;           // 只放这个座位能看到的，含"我现在能做什么"（prompt）
  timeout(s: S, seat: number, ai): A;           // 超时代出
  auto(s: S, seat: number, ai): A;              // 电脑、托管出手：把视图交给 ai，包成动作（声明窗口的回答带 bot）
  over(s: S): boolean; breakPoint(s: S): boolean;  // 打完；一局打完停在结算（适合收场）
  result(s: S): MatchResult;                    // 每个座位的筹码、净输赢、小结（结算页和钱包的 stats）
  seated(s: S, seat: number, kind: SeatKind): S;   // 开打后座位换人
  restake(s: S, seat: number, chips: number): S;   // 好友房带入到账：这个座位从 chips 重新算
  finish(s: S): S;                              // 当场结束这一场（实盘桌只剩一个真人），筹码按此刻的数算
}
```

- 电脑不在玩法对象里：`src/ai/index.ts` 按玩法 id 登记 `VariantAi`（只拿视图，第 5 节）；界面在 `src/view/variants/<id>/` 按 `VariantUi` 挂进牌桌。
- 状态、视图都带 `variant` 字段；房间和界面拿到先看它，再交给对应的玩法。
- **玩法之间不互相 import**，只依赖 `tiles`、`hand`、`table`、`match`（`test/arch.test.ts` 检查）。

### 3.5 视图的公共部分

牌桌界面（`src/view/table.ts`）是通用的，只要视图里有这些字段（`TableView`，川麻的 `XzView` 满足它）：

```ts
interface TableView {
  phase: string; round: number; dealer: number; turn: number; wall: number;  // 剩几张
  opts: { rounds: number }; base: number;
  seats: { chips; melds; river; count; won: { fan; from; tile; order } | null; hand: Tile[] | null }[];  // hand 只在胡了、一局完了时亮
  me: { seat: number; hand: Tile[]; drawn: Tile | null } | null;
  prompt: { discard?; zimo?; kan?; claim?: { w; opts } } | null;   // 我现在能做什么
  claim: { id; tile; from; answered } | null;                      // 正在被声明的那张牌（公开）
}
```

玩法私有的部分（川麻：每家的缺、换三张进度和方向、这一局的事件、钱的流水、历史）在玩法自己的视图里，由 `VariantUi`
（缺门标记、换三张和定缺的操作条、动作字和特效、听牌提示）读。

### 3.6 页面层钩子（`view/variants/page.ts`）

核心层有 `Variant`，牌桌层有 `VariantUi`，页面和流程层（主页、选桌页、单机和好友房的结算、分享、颁奖、每日挑战、规则小册子）按玩法不同的东西收在 `VariantPage`：
`src/view/variants/<id>/page.ts` 各实现一份，在 `src/view/variants/pages.ts` 登记，页面代码只调 `pageOf(玩法id).xxx`，不写 `variant === ...` 或 `rc ? a : b`。

- 名字和入口：`name(opts)`、主页和选桌页玩法行共用的切换项 `homeChoices` / `homeId` / `homePick`、选桌页 `rules`（规则表，见 [design-ui.md](design-ui.md)「规则设置默认收起」）、`rulesLink`。
- 规则设置：`loadRules` / `rulesOf` / `setRules`（偏好里 `mahjong.prefs` 的 `opts`、`rc`，存储格式不变）、`realOpts`（实盘一局一结）、`quick`（主页快速一局）、`daily`（每日挑战的规则和文字）、`lengthText` / `progress`（局数文字、续局进度；房间规则一行由 `rules` 表生成）。
- 牌桌和结算：`mountTable`、`tableView`、`roundSummary` / `matchSummary`、`soloEndMs` / `roomEndMs`（一局打完先摆多久和牌亮牌）、`tally`（颁奖的公开小计）、`shareCard`、`moments`（名场面）、`feedMoments`（好友动态）。
- 引导：`guide`（新手引导、规则页签、图鉴和成就按哪一边算，外壳在 `view/guide.ts`）。

加新玩法要实现这些；页面钩子可以 import 本玩法的 view 文件和 core，玩法之间不互相 import，页面代码不直接 import 某个玩法的 `page.ts`（`test/arch.test.ts` 检查，
并有一条棘轮：玩法目录以外 `RC_ID` / `'riichi'` 当玩法判断的地方不许增加，现在只剩 Worker 与页面共用的 `game/match.ts`、`game/daily.ts` 和房间里的 `room/talk.ts` 三处）。
页面层的会话状态（单机、好友房、牌桌、互动、钱包）在 `src/app/session.ts`，离开时由 `app/lifecycle.ts` 的 `dispose` 一处放掉。
