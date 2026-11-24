# arcade-host · 自托管运行时

在自己的机器上跑整个 Arcade 站：一个 [workerd](https://github.com/cloudflare/workerd) 进程跑平台和所有游戏，模块代码和 `wrangler.jsonc` 一行不改。

[English](README.md) · **简体中文**

## 功能

- **D1 用 SQLite**：一个 Durable Object 一个库，workerd 自带的 D1 客户端原样用；启动时自动跑迁移（和 wrangler 同一张 `d1_migrations` 表）。
- **D1 用 PostgreSQL**：同一个 D1 协议，后端换成 PostgreSQL；SQL 机械翻译加站点给的覆盖表，报错还原成 SQLite 原文。
- **DO 状态进 PostgreSQL**：`KIT_STORE` 让 arcade-kit 把房间、计量、排队存进 PG；重启后按存着的闹钟唤醒对象。
- **静态资源**按 Cloudflare asset-worker 的规则逐条移植：`html_handling`、`not_found_handling`、`run_worker_first`、`_headers`、`_redirects`、ETag/304。
- **路由**按路径分给各 Worker（`/games/<id>` 给游戏，其余给平台），`/__health`，挡 `/cdn-cgi/*`。
- **定时任务**不用实验特性：包装入口加一个 DO 闹钟调 `scheduled`，停机错过的起来后补一次。
- **管理入口**只听回环地址：整库导出、导入恢复、手动投定时任务。
- **生成器**把站点描述变成发布目录（`config.capnp` + 运行时 + 各模块的包 + 静态资源）；服务器上只要 workerd 一个二进制，不装 Node。

## 快速开始

构建和测试要 Node 22（`.nvmrc`）；发布包只靠 workerd 跑。

```bash
npm ci
npm run lint    # Biome 静态检查
npm test        # 类型检查、打包运行时、起真的 workerd 跑测试（约 1 分钟）
npm run build   # 只打包运行时到 dist/runtime
```

生成并起一个站（这个包不发 npm，按本地路径装：`"arcade-host": "file:<路径>"`）：

```js
import { generate } from 'arcade-host/src/gen/generate.ts';
generate(site, { out: 'release', storage: 'sqlite' });
```

```sh
cd release
workerd serve config.capnp -I . --directory-path data=/var/lib/arcade
```

站点听 `127.0.0.1:8787`，管理入口听 `127.0.0.1:8788`。

## 目录结构

```
arcade-host/
├─ src/runtime/   跑在 workerd 里的代码：D1（SQLite、PG）、KitStore、静态资源、路由、定时任务、管理入口
├─ src/gen/       构建时用 Node 跑的生成器：站点描述 → config.capnp + 发布目录
├─ scripts/       build-runtime.mjs 打包运行时
├─ test/          起真的 workerd 的测试，含和 wrangler dev 的静态资源对照
└─ docs/          用法细节和与 Cloudflare 的对照
```

## 文档

- [docs/usage.md](docs/usage.md)：Cloudflare 上的每样能力在这里由谁补、两种存储、生成器和 workerd 参数、管理入口、PostgreSQL 模式、测试细节。
- [docs/verify.md](docs/verify.md)：和 Cloudflare 的实测对照：哪些一样、哪些有意不同、由哪些测试锁住。
- [CHANGELOG.md](CHANGELOG.md)：更新日志。

## 属于 Arcade

这是 Arcade 仓库的 `packages/arcade-host/` 模块，不读别的模块；仓库里由 `tools/selfhost/` 读各模块的 `wrangler.jsonc`、生成站点描述再调这里。自带 package 和测试，也能拆出去单独用。

## 许可证

MIT，见 [LICENSE](LICENSE)。
