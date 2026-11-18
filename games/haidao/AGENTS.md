# 《海岛》模块约定

> 总仓库规范见仓库根的 `AGENTS.md`，其中第 1、2 节的硬约束优先于本文件。本文件只写海岛特有的约定。设计正本是 [DESIGN.md](DESIGN.md)。

## 1. 这是什么

海盗题材的海岛攻防：建自己的岛（立即完成，不等时间），出海打电脑海盗岛的战役关卡（30 关战役、每日悬赏、掉宝收藏），登录后还能打别的玩家的岛（异步攻防，DESIGN.md 第 5 节）。还能带筹码玩四种实盘（悬赏出海、悬赏守岛、护航、寻宝航线）、把筹码单向换成金币木材（DESIGN.md 第 4 节）。

## 2. 目录

```
src/core/      规则核心：基地、战役结算、战斗（固定步长 20 拍/秒、确定性）、机器人、异步攻防结算（pvp.ts）、快照校验（validate.ts）、各种实盘的档位表、守岛塔防（td*.ts）、大潮无尽（tdtide.ts）、护航和寻宝航线（escort*.ts）；进攻战斗里按规则版本区间分几套防御函数（`battle.ts` 的 `stepDefenses*`）。每个文件的分工见 [docs/tools-haidao.md](docs/tools-haidao.md) 第一节
src/content/   内容表：建筑、兵、旗舰技能、主寨等级、战役关卡、塔的分叉（branches.ts）、收入倍率（income.ts）、守岛奖励表（tdreward.ts，从战役掠夺推出来）；守岛的数（td2units.ts：塔的三阶、统一敌人表、英雄技能、局内经济、难度预算、海盗来袭）、11 张关卡岛（td2maps.ts）、24 关的波次配方和旋钮（td2levels.ts，tdmaps.ts 是出口加单测用的样板关）、守岛里分叉的解释（tdbranches.ts）；护航的 3 张航线图（escortmaps.ts）和 9 关（escortlevels.ts）；改数值只改这里
src/view/      画面层：art/（SVG 程序画的素材）、iso.ts（等距投影）、depth.ts（`DEPTH`：所有 setDepth 层级的常量表，新加画面元素先在这里找层、别直接写数字）、Phaser 场景和 DOM 界面
src/platform/  本地存档（save.ts）、云存档（cloud.ts；同步流程——首次对齐、防抖上传、冲突合并、429 退避、换账号备份和并回、存储满了暂停——由 tests/cloud.test.ts 用内存存储和假平台锁住）
src/net/       异步攻防的接口调用、快照上传、待扣 / 待领（pvp.ts）；实盘和兑换（live.ts；本机进度的状态机——先写再发、断线和刷新后收尾、换账号不收尾——由 tests/live-client.test.ts 锁住）；大潮无尽往平台每周榜交分和浏览器本地最好（tide.ts）；寻宝航线的浏览器本地进度、最好和每日榜交分（mapscore.ts）；界面在 src/view/pvp.ts、src/view/live.ts
worker/        Worker（登录闸门、单独部署的根路径、巡检用的 health、/games/haidao/api/pvp/*、实盘钱包接口 live.ts 的 /games/haidao/api/{live,td,escort,map}/*），自己一份 tsconfig；
               pvp/ 是 Base、Harbor 的逻辑类（只依赖 kv.ts 的存储接口，测试用内存假存储），do.ts 是 DO 外壳（只由 index.ts 引用）
public/        封面、图标，weekly.json（平台每周榜的分数怎么显示：大潮 `tide` 子榜），daily.json（平台每日榜：寻宝航线 `map` 子榜）
tools/         模拟器、截图冒烟、帧率测量、界面拥挤度测量等脚本；每个的用途和参数见下面的命令表和 [docs/tools-haidao.md](docs/tools-haidao.md)
tests/         vitest
```

## 3. 规则核心的约束

- `src/core`、`src/content` 不依赖 DOM、Phaser、网络；画面层只读核心的状态和事件，不自己算规则。
- **确定性**（异步攻防在服务端重放进攻，结果要和浏览器逐位一致）：禁止 `Math.random`、`Date`、`performance`，以及 `Math.sin/cos/tan/atan2/sqrt/hypot/exp/log/pow/cbrt`；
  战斗坐标是整数（1 格 = 100 单位），开方用整数牛顿法；随机用自己的 sfc32，按用途分流。`tests/arch.test.ts` 扫源码锁住。
- `stepBattle` 原地修改它拥有的状态（每秒 20 拍，复制太慢），回放靠"布局 + 部队 + 种子 + 操作序列"重算，确定性由重放测试锁住。
- 规则一改，把 `RULES_VERSION`（`src/core/types.ts`）加一。

## 4. 画面

- 素材全部程序画（`src/view/art/`，SVG 字符串），开局烘焙成纹理；不放图片文件。改了素材用 `npm run art -- <输出目录>` 渲成 PNG 看。
- iOS：渲染倍数封顶 2、`--app-h` 按看得见的区域、双指放大时不改尺寸、WebGL 丢了 3 秒才提示、safe-area（仓库根 AGENTS.md 第 4 节）。
- **画面实现笔记**在 [docs/ui-haidao.md](docs/ui-haidao.md)，改对应代码时同步改它。分块摘要：
  - 场景分工：`BattleScene` / `TdScene` / `BaseScene` 只管生命周期，其余拆在 `battle*.ts`、`td*.ts`、`base*.ts` 等文件里；新逻辑进对应文件，不往场景里堆。
  - 打击感、动作、血条：`feel.ts`、`motion.ts`、`bars.ts`，纯函数、有单测锁住；震屏顿帧只给大事件。
  - 分件骨架：兵、英雄、守岛敌人由 `rig.ts`（纯函数）算姿态、`rigsprite.ts` 画，走路按走过的距离推进相位，`tests/rig.test.ts` 锁住。
  - 炮台：`turret.ts`、`aim.ts`、`shots.ts`，炮管有角速度上限，开火按规则的开火拍表演，不在每帧新建对象。
  - 镜头：`camfit.ts` 按岛适配，竖屏另有放大跟拍（`camguide.ts`），测试钩子 `api.home()`、`api.fitInfo()`。
  - 界面：三种屏幕排布在 `layout.ts`，字号只有 12 / 14 / 16 / 20，资源不够写"还差 N"；基地、升级、摆放、操作环、守岛、护航、选关页的交互细节都在笔记里。
  - 质感和皮肤：素材和纹理全部程序生成，`skin.ts` 的样式写成 `.hd-ui.hd-skin …`，`tests/look.test.ts`、`tests/skin.test.ts` 锁住。
  - 演出：收尾、结算、寻宝航线、音效、整屏后期、环境动画、海盗王阶，都只读核心状态，不碰结算数字和存档。
  - 性能：静态大块烘成一张图，飘字、粒子、火花走对象池，别一格一个对象。
- **一屏放下**（仓库根 docs/ui.md 第 11 节）：任何界面在五个尺寸（1280×720、1920×1080、844×390、390×844、360×640）不出滚动条、不截内容；放不下先缩间距和排布，长列表（建造列表、成就、收藏、图鉴、防守记录）用页内翻页（`.hd-pager`），不用滚动。出海海图是例外：拖动平移的地图（`.hd-map` 用 `overflow:clip` + transform，滚轮不响应，按钮和面板在地图外固定），「回到下一关」平移回下一关（第一座解锁了还没拿星的岛，岛上插「下一关」旗、旁边一颗「出发」）；侦察取景框同理。改界面后跑 `node tools/noscroll.ts --out <目录> [--group 流程名] [--only 界面名] [--view 尺寸]`，它同时查滚动 / 截断、触屏点按区 < 44、可点元素互相压住（同一层、交叠 > 2 像素）、字被裁（`scrollWidth > clientWidth`）和质量线四项（不达标的在终端列出，数字在 `noscroll.json` 的 `q`）。数字列用 `.hd-n`（等宽右对齐），带符号的增减用 `.hd-pos` / `.hd-neg`（`ui.ts`）。
- DOM 界面类名一律 `hd-` 前缀，限定在所属根节点下；可点的东西 ≥ 44×44 CSS 像素，字不小于 12 像素。
- 浏览器存储的 key 一律 `haidao.` 前缀：`haidao.save`（存档）、`haidao.cloud`（云存档元数据）及其备份 `haidao.profile.pre-sync`、`haidao.profile.pre-switch.<userId>`、
  `haidao.pvp`（异步攻防：已经加 / 扣进存档的 raidId、上次看过防守记录的时间）、`haidao.live`（悬赏出海实盘：这一份筹码走到哪一步）、`haidao.tdlive`（悬赏守岛实盘，同一套流程，断线 / 刷新后下次打开时结回或退回）、`haidao.escortlive`（护航实盘，同上）、`haidao.maplive`（寻宝航线实盘，同上；一趟跨好几站，进度另存 `haidao.maplive.run`，同一天刷新后接着跑，不碰娱乐的 `haidao.map`）、`haidao.tide`（大潮无尽的本周最好：`{ week, best }`，换周重新算）、`haidao.map`（寻宝航线：`{ day, best, state?, pending? }`，当天走到哪、今天最好；换天清掉，`pending` 还在说明战斗中途离开，下次打开按 0 宝分结那一站）、`haidao.hint.chest` / `haidao.hint.ally`（漂流宝箱、援军的首次提示看过没有）、`haidao.hint.defense`（JSON 数组：看过首次提示的防御种类；纯逻辑在 `battlehint.ts`，卡片在 `funui.ts` 的 `defenseHint`，首领关、?auto、回放、异步攻防、航线、悬赏不弹）、`haidao.hint.foe`（JSON 数组：守岛里看过首次提示的敌人种类；纯逻辑在 `tdhint.ts`，`tdhud.ts` 的 `foeHint` 在预告翻到新一波时弹，卡片和「见过」的记法与防御提示共用 `hintcard.ts`）、`haidao.hint.mech`（JSON 数组：看过首次提示的章末机制，开局和新敌人挤一张卡）、`haidao.feel`（"震屏和振动"开关，`'1'` / `'0'`；没存过就跟随系统的"减弱动态效果"：开了默认关）。

## 4.1 后端（异步攻防）

后端实现笔记（分档匹配、攻防汇总、实盘接口、钱包绑定）在 [docs/backend-haidao.md](docs/backend-haidao.md)。硬规矩：

- 每个方法最多写 2 行、不用闹钟和 `setTimeout`；结算一律服务端用 `src/core/pvp.ts` 重放，浏览器报的结果不看。改 Base / Harbor 的方法要同步 `worker/pvp/api.ts` 的 `BASE_METHODS` / `HARBOR_METHODS`（DO 只放行名单里的方法）。
- Worker 入口只导出 default 和 DO 类（`Base`、`Harbor`、`RoomMeter`）。
- 规则版本闸门：pvp `find` / `revenge`、live `buyin`、td `buyin` 的请求体必须带 `rules`（`RULES_VERSION`），没带、不是整数或低于当前版本回 409 `need_reload`（`worker/live.ts` 的 `checkRules`，在钱包和存储之前判）；页面弹「游戏更新了」带刷新按钮。

## 5. 常用命令（都在本目录运行）

| 命令 | 用途 |
|---|---|
| `npm ci` | 安装依赖 |
| `npm run dev` / `npm run preview` | 开发 0.0.0.0:5170 / 预览 0.0.0.0:4170 |
| `npm test` | 类型检查（页面 + Worker）+ vitest（异步攻防的服务端在 `tests/pvp-*.test.ts`，用内存假存储测 Base、Harbor 和接口） |
| `npm run lint` | Biome 检查（`biome.jsonc` 是全仓统一模板，规则不在模块里改；放行写 `// biome-ignore lint/<组>/<规则>: <理由>`）；提交前要零报告 |
| `npm run build:cf` | 部署用构建到 `dist-cf/games/haidao/` |
| `npm run sim -- --n 50` | 机器人（小白、普通）打每一关：星数、胜率、时长、掠夺 |
| `node tools/live-sim.ts` / `td-live-sim.ts` / `escort-live-sim.ts` | 悬赏出海、悬赏守岛、护航实盘的配平模拟（`--n 2000`，改对应表或内容后要重跑） |
| `node tools/td-sim.ts` / `escort-sim.ts` / `td-tide-sim.ts` / `raid-sim.ts` | 守岛战役、护航、大潮无尽、攻防的小样本配平（用 `nice`，大批量放 CI） |
| `npm run art -- <目录>` | 素材图鉴、基地全景、战斗定格渲成 PNG |
| `npm run shot -- --out <目录>` | 无头浏览器冒烟截图（临时端口），检查控制台零报错和按钮 ≥ 44 像素；`--flow`、`--td`、`--home`、`--cam`、`--pvp`、`--tide`、`--map`、`--tdlive`、`--escort`、`--record` 分别走各条主流程或录像，参数见 docs/tools-haidao.md |
| `node tools/noscroll.ts --out <目录>` | 量五个尺寸是否滚动、重叠、裁字和质量线；改界面后跑 |
| `node tools/perf.ts --out <目录>` | 帧率和卡顿测量（手机降速、桌面两种视口），只看前后对比 |
| `node tools/cover.ts [输出]` | 生成大厅封面 `public/cover.webp`（800×450，无头浏览器） |

`tests/td-golden.test.ts` 锁守岛的指纹，改守岛数值后要重生成：`GOLDEN_UPDATE=1 npx vitest run --testTimeout=3000000 tests/td-golden.test.ts`；生成后 `git diff tests/td-golden.json` 只许出现预期的键变化，其余键变了就是改坏了。
