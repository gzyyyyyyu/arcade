# 工程质量标准

> 所有 PR 按这份标准写、按这份标准审。硬约束（模块独立、规则核心、房间、测试档位、Git）的正本在 [AGENTS.md](../AGENTS.md)，审阅规则在 [review-policy.md](review-policy.md)；本文件只管代码和 PR 写成什么样。

## 1. 目录约定

```
games/<id>/
├─ src/core/ 规则核心   src/ai/ 电脑玩家（只读核心给它看的状态）   src/view/ 画面   src/net/ 联机   src/platform/ 调平台
├─ worker/   Worker 入口和房间        test/  单测和 arch.test.ts       tools/  冒烟、截图、模拟器等开发工具（不进产物）
├─ docs/     模块设计细节（可选）     public/ 运行时静态资源（不放中间产物和原始数据）
└─ README.md AGENTS.md CLAUDE.md CHANGELOG.md DESIGN.md（可选）和 AGENTS.md 第 1 节要求的配置文件
```

- 新模块照这个建；老模块里 `tests/`、`scripts/`、`architecture.test.ts` 这类别名不单开 PR 改，大重构时顺手统一。
- 多个玩法变体放 `src/variants/<名>/`，共用的放 `src/common/` 或 `core/`、`view/`；变体之间互不 import，`arch.test.ts` 覆盖所有层。
- 文件名按内容取（`sprites-monsters.ts`），不按批次或版本编号（`sprites7.ts`）。

## 2. 代码

- **类型**：`strict`；不新增 `any`、`@ts-ignore`、`as unknown as`，确实要用的同一行写为什么。
- **大小**：单个文件超 800 行或函数超 150 行，PR 说明写为什么不拆；不往超过 1,500 行的文件里堆，先拆再加。入口文件只做组装，不放业务逻辑和模块级可变状态。
- **不重复**：两个模块要同一样东西，第二份出现时提议收进 `arcade-kit`；kit 已有的（`arcade-kit/viewport`、`arcade-kit/prng`）直接用；模块内两处平行实现抽成共用的。
- **规则版本**：改规则直接改，不按规则版本留分叉、不为老录像留开关；碰到现有的按版本分叉代码就删（理由见 AGENTS.md 第 4 节"确定性"）。
- **错误处理**：不写空 `catch`，吞掉错误的地方写明为什么；用户能遇到的出错（断网、401、`busy`、超时）给看得懂的提示。
- **常量**：配平参数、时长、阈值放有名字的常量或配置表，写单位和依据，不散落裸数字。
- **不留残余**：没有 `console.log`、注释掉的代码、没人引用的导出、没对应 issue 的 `TODO`。
- **注释**：中文，写"为什么"；不写过程（"10-18 改的"）和内部称呼，这些留给提交信息。
- **格式**：遵守根 `.editorconfig`（UTF-8、LF、两格缩进、末尾换行），按所在文件已有风格写。
- **lint**：用 [Biome](https://biomejs.dev/)，模板 `packages/arcade-host/biome.jsonc`（推荐集，只关 `noNonNullAssertion`、`noAssignInExpressions`、`useTemplate`，测试里放行 `any`）。
  接入：复制模板，`@biomejs/biome` 精确版本装成 devDependency（`--ignore-scripts`），加脚本 `"lint": "biome lint ."` 并在 CI 测试前跑；第一次接入只修报出的问题、行为不变、照常升版本。
  单处放行写 `// biome-ignore <规则>: <理由>`；不在模块里改全局规则，要改先改模板。

## 3. 测试

测什么和跑多少（日常 / 交审前两档）见 AGENTS.md 第 4 节，这里补具体要求：

- 规则核心、电脑策略、结算、钱包和存档读写有 vitest 单测；修 bug 先写一个会失败的测试。
- 每个游戏有 `arch.test.ts`：核心不准用 `Math.random` / `Date` / DOM / 网络，层之间不准反向依赖。
- 有房间的模块有房间测试（`npm run test:worker`），在 `npm test` 里或模块 CI 里跑。
- 冒烟 `npm run smoke` 按流程拆文件，不写成一个几千行的文件。
- golden 只当当前版本的回归基准：规则改了就重新生成，PR 里说明为什么变；不加"逐局不变"的跨版本 golden。
- 改数值、改电脑的附模拟结果（局数、指标、和 [balance.md](balance.md) 目标的对照）；改到实盘期望的，附改前改后的实盘模拟数。

## 4. 统一的脚本名

`dev`（端口见 AGENTS.md 第 3 节）、`build`、`build:cf`（构建并 `wrangler deploy --dry-run` 打包，CI 用）、`typecheck`（`tsc --noEmit`，所有 tsconfig 都过）、
`test`（全部单测，不要浏览器和 Cloudflare 账号）、`test:worker`（房间和 Worker 测试，没并进 `test` 时）、`lint`、`smoke`（无头冒烟；老的 `shot`、`shots` 过渡期留作别名）。

## 5. 文档

- **只写现状**：描述代码现在什么样、为什么；过程、版本流水、实验记录留给 CHANGELOG 和 git。过时的段落直接改或删，不追加"更正"。
- **只改真受影响的那一份**：一个 PR 写一段 CHANGELOG，再改行为变了的那份文档；同一件事只在一处写，别处一句话加链接。
- 需求清楚的直接做，不写方案文件；大改动或动实盘的，方案最多半页。
- 不写正式站域名（示例用 `game.example.com`）、本机路径、个人信息、凭证；Markdown 里不写会被自动链接的 `#数字`。
- 各类文档的上限和内容：

| 文档 | 上限 | 写什么（超出的挪去哪） |
|---|---|---|
| README.md | 约 200 行 | 是什么、怎么跑和测（命令与 `package.json` 一致）、目录、单独部署、去哪看设计 |
| AGENTS.md | 120 行 | 模块特有的硬规矩和理由；调参、性能对比挪 DESIGN 或 `docs/`，待办开 issue |
| DESIGN.md | 单个约 600 行 | 规则、系统、配平目标和结论；写长了按玩法拆成 `docs/<主题>.md` |
| CHANGELOG.md | 不限 | 只留结果，不写过程（第 6 节） |

拆分被别处按节号引用的文档时节号不变，原位置留一句指向新文件。

## 6. 版本和更新日志

- 每个要上线的 PR 升一次版本（[语义化版本](https://semver.org/lang/zh-CN/)；0.x 新功能升次版本、修复升修订号），`package.json` 和 lockfile 一起改。
- `CHANGELOG.md` 最新在上，`## 0.21.0 — 2026-10-30` 下按「新增 / 改动 / 修复 / 移除」分类，只写有的；每条一句，写给玩家或接入的开发者看。
  破坏兼容的（存档格式、协议、kit 公开接口）标 **不兼容**。旧条目不回头改格式。

## 7. PR

- **粒度和并发**见 AGENTS.md 第 5 节。一个 PR 里有几件事的，说明为什么属于同一个改动，标题写总名字（`haidao: 0.21.0 炮台转向开火和弹道`），细节列在描述里。
- **描述**按 [PR 模板](../.github/pull_request_template.md)：改了什么、为什么、怎么验证的（命令和结果）、审阅人要特别看哪里。
- **截图**：只有改界面的放（看哪些尺寸见 [ui.md](ui.md) 第 0 节），最多 3 张 webp、每张 ≤ 300 KB，拖进 PR 描述，不提交进分支；维护者的做法见 [deployment.md](deployment.md#pull-request-screenshots)。
- **依赖**：新增依赖写明用途和为什么不用已有的；`arcade-kit` 落后最新版不超过两个次版本。

## 8. 审阅顺序

审阅清单和顺序见 [review-policy.md](review-policy.md) 第 4 节。
