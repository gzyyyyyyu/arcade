# tools：仓库级工具

都在仓库根目录运行。`deployer/` 和 `selfhost/` 要装依赖（各自的 README 里写了怎么装），`check-deploy-config.mjs` 用的是 `deployer/` 装好的依赖；其余的直接用 Node 22 或 bash 跑。
部署链路为什么这样设计见 [docs/deployment.md](../docs/deployment.md)。

| 工具 | 做什么 | 谁跑 | 命令 |
|---|---|---|---|
| `check-isolation.mjs` | 模块独立性检查：不引用模块外的文件（共用包除外）、`file:` 依赖只指向 `packages/`、不写死本机路径、必备文件齐全 | CI（`check.yml`）、每个贡献者提 PR 前 | `node tools/check-isolation.mjs` |
| `check-deploy-config.mjs` | 部署配置的快速检查：模块里不许有 `.env*`、`.npmrc`、多余的 wrangler 配置和隐藏文件；`wrangler.jsonc` 只部署自己的 Worker、只用白名单里的绑定和 `vars` | CI（`check.yml`）、改了 wrangler 配置的贡献者 | `npm ci --ignore-scripts --prefix tools/deployer && node tools/check-deploy-config.mjs` |
| `workers.json` | 允许部署的 Worker 名单，以及哪些游戏接平台（`ARCADE`、`WALLET`） | 只由维护者改 | — |
| `deploy-allowlist.json` | 每个模块放行的 `vars` 名和 `compatibility_flags` | 只由维护者改 | — |
| [`deployer/`](deployer/README.md) | 钉死版本的 wrangler 和部署程序 `deploy.mjs`：把构建产物当数据，检查、叠加平台绑定后部署到 Cloudflare | 各模块流程的 deploy 作业；`--dry-run` 也在 `check.yml` 里跑 | 见它的 README |
| [`selfhost/`](selfhost/README.md) | 自托管：把各模块打成一个发布包（workerd 二进制或 Docker 镜像），带安装、升级、回滚、备份、恢复脚本 | `selfhost.yml`（PR 上验证）；自己部署的人 | 见它的 README |
| `verify-main.sh` | 部署前核对：`main` 上从 `TRUSTED_BASE` 起的每个提交都是 GitHub 生成、由仓库所有者合并的 PR 合并提交 | 各模块的 deploy 作业（`TRUSTED_BASE` 留空时一律不通过） | `tools/verify-main.sh <sha>`（要 `GH_TOKEN`、`REPO`、`OWNER` 和完整历史） |
| `verify-latest.sh` | 部署前核对：这次要部署的提交之后，`main` 上没有再改过本模块、它的流程或 `tools/` 的提交（避免把线上退回旧版） | 各模块的 deploy 作业 | `tools/verify-latest.sh <sha> <路径前缀>...` |
| `split-module.sh` | 把一个模块连同完整历史拆成独立仓库的分支 `split/<id>`；拆出后要做的事写在脚本开头 | 想把某个游戏单独拿走的人 | `tools/split-module.sh games/<id>` |
| `git-hooks/pre-push` | 本地拦住直接推 `main` 和 force push | 每个克隆执行一次 `git config core.hooksPath tools/git-hooks` | — |

新增约束时同步加进对应的检查脚本，并在这张表里写一行。
