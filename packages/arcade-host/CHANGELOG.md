# 更新日志

## 0.4.10 — 2026-11-23

### 整理
- 文档：README 改成英文 `README.md` 和中文 `README.zh-CN.md` 两份同构；对照表、两种存储、用法、管理入口、PostgreSQL 模式和测试细节挪进 `docs/usage.md`。代码不变。

## 0.4.9 — 2026-11-23

### 改动
- workerd 从 1.20261006.1 升到 1.20261023.1（和游戏里最新的同一版）；`docs/verify.md` 的实测环境跟着改。

## 0.4.8 — 2026-11-23

### 整理
- 文档按现状改：实测环境的 workerd 写「和平台同一版」（游戏的已经更新）；kit 要求写成「≥ 0.21.0（有 KitStore）」；实测记录去掉日期只留结论；单独用的示例写明先按本地路径装；包描述补上 PostgreSQL 后端和 KIT_STORE。
- 去掉只在本文件用的导出 `parseInsert`、`sqliteMessage`、`LOOPBACK`；注释去掉内部代号和「不再」这类过程话。
- 自托管说明里「结回」改成全站说法「带回」。

## 0.4.7 — 2026-11-01

### 改动
- `biome.jsonc` 模板：`tools/`、`scripts/` 下关掉 `useDomNodeTextContent`。那里是冒烟、截图脚本，它的自动修会把 Playwright 的 `locator.innerText()` 改成 `textContent()`，
  把隐藏文字也带进检查、让"界面上有没有这句话"变宽松。本模块的代码不变。

## 0.4.6 — 2026-10-31

### 改动
- `biome.jsonc` 改成能给所有模块原样复制的模板：只查 TS/JS（不扫 CSS 和 `public/`、`dist*/`、fixture），测试目录 `test/`、`tests/` 都算；
  另外关掉四条在各模块里大多是惯用写法的规则（`useIterableCallbackReturn`、`noVoidTypeReturn`、`noUnusedFunctionParameters`、`noDuplicateTestHooks`），
  `noFocusedTests` 只在测试文件里查（源码里叫 `fit` 的函数不再误报）。每条都在文件里写了理由。本模块的代码不变。

## 0.4.5 — 2026-10-31

### 新增
- `npm run lint`：用 Biome 做静态检查（`biome.jsonc`，规则取推荐集，关掉的几条写了理由），CI 里跑。这是全仓 lint 模板的试点，格式化还没开。
### 改动
- 按 lint 的结果清掉一个没用的类型导入、一个没用的参数名和测试里的逗号表达式，行为不变。

## 0.4.4 — 2026-10-28

- 入口在设了 `SITE_ORIGIN` 时把请求 url 的协议和主机名换成对外地址再分发（`src/runtime/origin.ts`）。反代用 http 连 workerd，模块看到的是 `http://…`，
  游戏拿 `url.origin` 对浏览器的 `Origin: https://…` 永远对不上：夜巡实盘、海岛异步攻防和悬赏出海的写接口在自托管上全部 403 csrf。平台按 `SITE_ORIGIN` 认，不受影响。

## 0.4.3 — 2026-10-27

- 静态资源：直接放在 `assets/` 下、文件名带 Vite 内容哈希（`名字-8 位哈希.扩展名`，哈希里至少有一个大写字母或数字）的文件发 `public, max-age=31536000, immutable`，别的照旧 `max-age=0, must-revalidate`。
  自托管前面是 Tunnel 加边缘缓存，原来这些文件每次都回源校验（线上体检 15 个）。这是和 Cloudflare 有意的差别，`docs/verify.md` 写明，`test/assets-parity.test.ts` 单独核对。

## 0.4.2 — 2026-10-26

- D1 导入拒绝空导入：请求体空的、切不出语句的（只有注释、空白）、导完一张表都没有的，回 400 并整体回滚，库原样不动。
  原来空 body（比如 `curl --data-binary @文件` 读不到文件，只警告、照样发空请求）会先删光所有表、返回 `ok:true tables:0`，等于一键清库。
  PG 模式同理：没有一行数据的导入回 400，不再先清空所有表。

## 0.4.1 — 2026-10-26

- D1 导入按语句切开逐条执行（`src/runtime/sql-split.ts`：字符串、引号标识符、注释、触发器体里的分号不算），仍是一个事务、失败整体回滚，出错报第几条语句。
  原来整份 dump 一次 `exec`，超过约 100KB 的库报 `SQLITE_TOOBIG`，`wrangler d1 export` 的导出还会报 "SQL code did not contain a statement."：自己的备份大了也恢复不回去。
  `wrangler d1 export` 的格式原样导入（`PRAGMA defer_foreign_keys`、`sqlite_sequence` 的 `DELETE`/`INSERT` 照执行，自增序号对得上）。

## 0.4.0 — 2026-10-26

- 站点描述 `runtime_vars?: string[]`：列在里面的 vars 不固化进 config，默认值写到 `<out>/vars/<Worker 名>/<名>.json|txt`，绑定用以 `/` 开头的 embed，
  由 workerd 的 `-I <目录>` 解析；起服务时 `-I` 指到发布目录读默认值，指到改过 `vars/` 的副本就是覆盖（坏 JSON 时 workerd 启动即退出）。
  生成时检查：名字要在 vars 里；Worker 名 `[a-z0-9]+`、变量名 `[A-Z][A-Z0-9_]*`（运行时环境变量名 `ARCADE_VARS_<Worker>_<名>` 按第一个下划线切）。不在列表里的 vars 行为不变。
  **起 workerd 必须带 `-I <发布目录>`**（站点有 runtime_vars 时，不带起不来）。

## 0.3.1 — 2026-10-20

- 机械翻译加一条：带 ON 的 `CROSS JOIN` 改成 `JOIN`。SQLite 里这就是内连接（CROSS 只是固定连接顺序），PG 不许 CROSS JOIN 带 ON；
  平台的好友榜、动态、好友周榜三处这样写，其中好友周榜的 SQL 按游戏数拼占位符，覆盖表按原文匹配接不住，只能在翻译里做（tools/selfhost 的语句覆盖检查发现）。

## 0.3.0 — 2026-10-20

PostgreSQL 模式（阶段 5 的宿主侧，v2.1：和 SQLite 二选一）：
- `db: 'pg'`：D1 后端换成 PostgreSQL（`runtime/d1pg.ts`，postgres.js，连接池在 DO 里）；SQLite 方言机械翻译（`sql-translate.ts`）+ 站点给的覆盖表，翻不了又没覆盖的报错不猜；报错还原成 SQLite 原文；
  PG 版迁移和 SQLite 版一一对应（生成时检查）；`/d1/<库>/import` 收 SQLite 导出做数据迁移（核对行数和数字列总和）；
- `db: 'pg'` + `storage: 'memory'`：给有 DO 的 Worker 注入 `KIT_STORE`（`runtime/kitstore.ts`，按 props.game 隔开游戏，接口和 kit 持有者定的一样），重启后唤醒存了闹钟的对象；
- 只给连 PG 的 Worker 放开内网出站（`pg-network`）；`storage: 'memory'` 配 SQLite 版 D1 时生成器报错（平台库会丢）；
- 测试：本地用 PGlite，CI 新增 test-pg 作业连真的 postgres:17。

## 0.2.1 — 2026-10-20

- **恢复（`/d1/<库>/import`）修好跨行的建表语句**：0.1.0 起按"一行一条语句"执行导出文件，可建表语句是 `sqlite_schema` 里的原文，平台的迁移跨行、带注释，
  真站的备份导入直接报 `incomplete input`（tools/selfhost 的恢复演练发现）。现在整个文件交给 SQLite 执行（同一个事务，失败原样不动）；测试的迁移也改成跨行带注释的。

## 0.2.0 — 2026-10-20

- **定时任务不再要 `workerd --experimental`**：去掉单独的 cron Worker 和实验开关 `service_binding_extra_handlers`；有 crons 的 Worker 的主模块换成包装入口 `cron-entry`（原样转出模块的全部导出），
  多一个 DO 类 `ArcadeHostCron`，闹钟到点在同一个 Worker 里实例化默认入口调 `scheduled`（类写法、对象写法都支持，`ctx.waitUntil` 等完）。服务绑定照旧 RPC 调不到 `scheduled`（测试锁住）。
  存储键从 `arcade-host-cron` 换成 `<Worker 名>-ArcadeHostCron`（还没有正式部署，不用搬数据）。
- **管理入口只许回环地址**：生成器的 `adminListen` 不是 127.x / localhost / [::1] 直接报错。

## 0.1.0 — 2026-10-20

第一版（自托管阶段 0、1 的运行时和生成器）：
- 运行时：D1 的 SQLite 后端（DO + `ctx.storage.sql`，事务、迁移、导出导入）、静态资源（照 Cloudflare 的规则，和 wrangler dev 逐条对照）、路由、定时任务（DO 闹钟）、内部管理入口；
- 生成器：站点描述 → workerd 配置和发布目录，存储可选 sqlite（落盘）或 memory；
- 阶段 0 实测结论 `docs/verify.md`：平台 + 德州原样跑通；cron 要 `--experimental`；内存存储没有 SQL，PostgreSQL 模式的房间存储要 kit 的持久化接口整个包住 sql。
