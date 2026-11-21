# 雀馆：设计正本

> 模块 `games/mahjong/`，Worker `mahjong`，路径 `/games/mahjong/`，浏览器存储前缀 `mahjong.`，开发 5176 / 预览 4176。
> 本模块是**一套麻将引擎 + 多个玩法**：川麻·血战到底（`sichuan-xuezhan`，上线）、立直麻将（`riichi`，上线，见 [docs/riichi.md](docs/riichi.md)）。
> 游戏名不叫"四川麻将"，起一个通用的名字，玩法分开（第 3 节）。
> 跨模块的规范以仓库根 `AGENTS.md`、`docs/economy.md`、`docs/platform-backend.md` 为准；本文只写麻将自己的事。版本历史在 [CHANGELOG.md](CHANGELOG.md)。

## 目录

各节全文在 `docs/design-*.md`，小节号不变；别处写"DESIGN.md 第 N 节 / N.M"按下表找。

- **0. 名字**（本文下面）
- **1. 术语**（本文下面）
- **2. 规则：川麻·血战到底（`sichuan-xuezhan`，标准成都规则）** → [docs/design-rules.md](docs/design-rules.md)
- **3. 引擎分层（一套引擎 + 多个玩法）** → [docs/design-engine.md](docs/design-engine.md)
- **4. 筹码（`docs/economy.md`）** → [docs/design-chips.md](docs/design-chips.md)
- **5. 电脑（`src/ai/`）** → [docs/design-ai.md](docs/design-ai.md)
- **6. 联机和互动** → [docs/design-online.md](docs/design-online.md)
- **7. 画面** → [docs/design-ui.md](docs/design-ui.md)
- **8. 浏览器存储和安全响应头** → [docs/design-online.md](docs/design-online.md)
- **9. 写入和请求估算（好友房）** → [docs/design-online.md](docs/design-online.md)
- **10. 测试**（本文下面）
- **11. 立直麻将**（本文下面）
- **12. 跨模块登记**（本文下面）
- **13. 以后做**（本文下面）

## 0. 名字

"雀馆"是"麻将馆"的雅称：一个地方、里面摆几张不同玩法的桌（雀馆·血战到底、雀馆·立直），加玩法顺理成章；两个字、好记。"雀"字少数人会念成 qiǎo，封面上配麻将牌的图就不会认错。

界面上：大厅卡片写"雀馆"，副标题写当前玩法"川麻·血战到底"；页面标题"雀馆 · 血战到底"；不在牌桌时顶栏和选桌页写"雀馆 川麻·血战到底"（"·"只用在玩法名里面），等人页顶栏只写"好友房"或"快速匹配"。要换名字只改 `src/view/text.ts` 的 `GAME_NAME` 和平台登记（模块 id、路径、存储前缀都叫 `mahjong`，不跟名字走）。

## 1. 术语

- **一局**：发一次牌到这一局结束（血战：三家胡了，或者牌墙摸完；血流成河只有牌墙摸完）。
- **一场**：坐下到散场，打固定局数或有人筹码打光。川麻实盘一场就是一局（一局一结），娱乐和好友房可选 1 / 4 / 8 / 16 局（默认 8）。实盘按"一场"带入和结回。
- **一份**：实盘带进场的筹码，等于档位表的一份（`docs/economy.md` 第 2 节）。
- **底分**：番数换算成筹码的单位，`一把 = 底分 × 2^番`。
- **玩法**（variant）：一套完整的规则：牌集、流程、动作、和牌、计分、一场怎么结束、电脑参数。

## 10. 测试

- 规则核心 vitest：牌集和发牌、向听数（和暴力枚举对比）、有效牌、听牌、番型逐条（含七对、龙七对、根的数法、将对、带幺九、金钩钓、杠上花、抢杠胡、海底）、
  一炮多响、呼叫转移、查花猪、查大叫、退税、付不起按比例、封顶、一场结束、确定性（同种子同操作同结果）。
- 架构：`src/core/`、`src/ai/` 不出现 `Math.random`、`Date.now`、`new Date`、`Math.exp/log/sin/...`；玩法之间不互相 import；`src/ai/` 不 import `rules.ts`（只用类型和纯函数）。
- 电脑：模拟器（`npm run sim`）对打，结果写 4.1；性格强弱用 `scripts/strength.ts`（固定三家、轮换座位）。
- 房间规则（`test/room.test.ts`）：带入、少带、被拒、离座结回、打完和关房结回、声明窗口不露人、再来一场；听牌提示（`test/ting.test.ts`）只按看得见的算。
- Worker 和房间（workerd）：每步写入 ≤ 2、视图里没有别人的手牌和牌墙、钱包带入结回（假钱包）、stats 原样转发、开房请求体解析不了回 400。
- 冒烟（无头浏览器，控制台零报错）：
  - `npm run smoke`：`?online=1` 入口；横屏、竖屏各打一场单机（加速），回大厅确认、听牌提示、往上拖出牌、胡牌亮牌、结算页"分享"出预览、规则表；
  - `npm run build:cf && npm run smoke:room`：本地 wrangler dev + 假平台，两个浏览器开娱乐房（叫朋友来面板、报位置、互动、第三个人中途旁观和坐下、离座）、实盘小档房（带入、离座结回）、打完一整场"再来一场"跟进新房间；
  - `npm run build:cf && npm run smoke:match`：两个浏览器排娱乐到同一张匹配桌（不摆房间号、叫朋友；选"不和陌生人"的连接不带 chat=1，自己的气泡不压手牌）、实盘小档各带一份、取消留在选桌页、一个人 15 秒转单机；
  - `npm run build:cf && npm run smoke:standalone`：模块的 `wrangler.jsonc` 原样起（没有平台），两个游客：选桌页只有娱乐、单机一局、好友房开打和扔道具；
  - 画面自查：`node scripts/capture.ts land|port|se-land|se-port` 截图并报互相压住的元素（含 iPhone SE 尺寸）。
  - 冒烟里还没有：双指放大、省内存设备（DOM 牌桌没有画布，后者影响小）。

## 11. 立直麻将

已上线：规则核心在 `src/core/variants/riichi/`（流程按职责分在 `state.ts` 类型常量、`helpers.ts`、`deal.ts` 发牌摸牌、`claims.ts` 声明窗口、`settle.ts` 收点流局和一场结束、`actions.ts` 每步动作，`rules.ts` 统一转出；役符点数在 `score.ts`，`index.ts` 接 Variant 接口），已登记进 `src/core/variants/index.ts`；单机、好友房、快速匹配、擂台都能选立直。
规则、计分、分工和进度都在 [docs/riichi.md](docs/riichi.md)，这里不展开。

安全牌提示（别家立直后手牌上的“安”“较”角标，设置里能关）见 docs/riichi.md 第 4 节：判定 `src/ai/riichi-danger.ts` 的 `safetyOf` 是纯函数，只用河、副露、立直宣告、宝牌指示牌和自己的手牌（不碰别人的手牌和牌墙），危险度和电脑押引共用同一份；画面层只读结果（`VariantUi.mark`）。

无役提醒（听牌但每张和牌张都没有役时，听牌提示旁写“只能自摸，或者立直”或“没有役，和不了”）见 docs/riichi.md 第 4 节：判定 `src/game/riichi/noyaku.ts` 的 `noYakuOf` 是纯函数，只用自己的牌和公开信息，役问 `scoreWin`，不改算分；测试 `test/riichi-noyaku.test.ts`。

分层沿用第 3 节：立直只写在 `variants/riichi/`、电脑 `src/ai/` 和 `view/variants/riichi/`，通用层（`tiles`、`hand`、`table`、`match`）只做加法。
房间（按选项里的 `variant` 选玩法）、钱包（游戏 id 一个 `mahjong`）、单机框架、互动、回大厅、存储 key 都不用改；称号和自定义数带玩法前缀（川麻 `xz_`，立直 `rc_`）。

## 12. 跨模块登记

- `.github/workflows/game-mahjong.yml`：本模块的测试和部署流程；`tools/workers.json` 声明平台绑定 `ARCADE`、`WALLET`；
- 页面认 `?online=1`（平台大厅"好友房"按钮的约定，同德州、掼蛋），直达开房、进房；
- 根 `AGENTS.md` 的端口表和仓库结构登记了 `games/mahjong`（5176 / 4176）；
- 平台 `platform/shared/games.ts` 登记"雀馆"和封面，钱包游戏表从登记派生；电脑名字进平台 `worker/api/validate.ts` 的保留昵称；
- kit 每日写入分额：`busyWrites` 8,000 / `stopWrites` 10,000（第 9 节），配在本模块 `wrangler.jsonc`。

## 13. 以后做

现在没有排好方案的事。还没做的：三人两房的每日挑战（要平台登记新的子榜）。
