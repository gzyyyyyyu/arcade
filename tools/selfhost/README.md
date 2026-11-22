# tools/selfhost：自托管（不用 Cloudflare，自己的机器上跑全站）

运行时和生成器在 [`packages/arcade-host`](../../packages/arcade-host/README.md)（和 Cloudflare 的对照见它的 `docs/verify.md`）。
这里是仓库里的用法：读各模块的 `wrangler.jsonc`，按部署工具同一套规则叠加平台绑定，打成发布包，再加上运维脚本和模板。
这里不改任何模块，也不碰 `tools/deployer` 的 Cloudflare 部署流程。

这里写部署步骤（docker run、compose、二进制 + systemd、备份恢复、升级回滚），以及打包、各个脚本和验证的细节；英文版的部署步骤见 [docs/self-hosting.md](../../docs/self-hosting.md)。
服务器上只要 workerd 一个二进制（发布包和镜像里带着）和 bash、curl、tar，不装 Node；Node 只在打包的机器上用。

## 部署步骤

仓库不发布现成的镜像，从源码打：先打发布包，再用它做 Docker 镜像（或者直接装发布包，见下面「不用 Docker」）。
发布包和镜像里没有任何 Secret、主机名、数据库 id，全部从环境变量来。

### 打发布包和镜像

要 Node 22 和 Docker：

```sh
git clone https://github.com/gzyyyyyyu/arcade.git && cd arcade
npm ci --ignore-scripts --prefix tools/deployer
(cd packages/arcade-host && npm ci && npm run build)
v=$(git rev-parse --short HEAD)
tools/selfhost/pack-all.sh build/art && ARCADE_VERSION=$v tools/selfhost/release.sh build/art build/out --with-pg
docker build -f tools/selfhost/docker/Dockerfile -t arcade:local build/out/arcade-$v
```

镜像名 `arcade:local` 是 [`compose.yaml`](docker/compose.yaml) 的默认值（`ARCADE_IMAGE` 可换）。下面的命令都在 `tools/selfhost/docker/` 里跑，
那里有 `compose.yaml` 和 `Caddyfile`；`secrets.env`、`pg_password.txt`、`.env` 在 `docker/.gitignore` 里，不会进 Git。

### 设置

环境变量，写在 `secrets.env` 里：

| 变量 | 必填 | 是什么 |
|---|---|---|
| `PEPPER_PW`、`PEPPER_RC`、`PEPPER_SID`、`PEPPER_IP` | 是 | 哈希用的 pepper，格式 `k1:<随机串>`；用上之后不能改、不能丢 |
| `ADMIN_TOKEN` | 建第一个管理员时要 | 格式同上 |
| `SITE_ORIGIN` | 前面有 HTTPS（compose、Caddy）时要 | 站点地址，比如 `https://game.example.com`；不设的话经 HTTPS 反代登录会被拒（"请求来源不对"） |
| `ARCADE_DB` | 否 | `sqlite`（默认）或 `pg` |
| `ARCADE_PG_URL` | `ARCADE_DB=pg` 时 | PostgreSQL 连接串 |
| `ARCADE_VARS_<Worker>_<名>` | 否 | 运行时改模块的设置，比如 `ARCADE_VARS_arcade_LIMITS`（平台的限流和每日预算）、`ARCADE_VARS_texas_KIT_QUOTA`（房间配额）。默认值照 Cloudflare 免费版定，200 人在线约 1 小时就会切成只读：照 [tools/selfhost/README.md](#自托管推荐值) 的推荐值写。一行，不加引号、不留空格 |

先生成一次 Secret（这个文件另存一份，和备份分开放）：

```sh
cd tools/selfhost/docker
for k in PEPPER_PW PEPPER_RC PEPPER_SID PEPPER_IP ADMIN_TOKEN; do echo "$k=k1:$(openssl rand -hex 24)"; done > secrets.env
chmod 600 secrets.env
```

### 先试试：一个容器、SQLite、数据在卷里

```sh
docker run -d --name arcade --restart unless-stopped -p 127.0.0.1:8787:8787 -v arcade-data:/data --env-file secrets.env arcade:local
docker exec arcade /app/ops/create-admin.sh zhanzhang 站长   # 打印第一个管理员的密码和恢复码，只打印这一次
```

打开 <http://localhost:8787> 登录；注册默认关着，在 `/admin` 里建号或打开注册。对外开站要在前面加 HTTPS，用下面的 compose。

### 正式站：docker compose，自动 HTTPS（Caddy）

[`compose.yaml`](docker/compose.yaml) 起 `arcade`（不发布到宿主）、
`caddy`（80/443 端口，给 `SITE_HOST` 自动申请、续期证书，传真实 IP），加 `pg` profile 时再起 `postgres`。先把域名解析到这台服务器，然后在 `tools/selfhost/docker/` 里：

```sh
echo "SITE_ORIGIN=https://game.example.com" >> secrets.env
echo "SITE_HOST=game.example.com" > .env
docker compose up -d
docker compose exec arcade /app/ops/create-admin.sh zhanzhang 站长
```

用 PostgreSQL 代替 SQLite（平台库放进同一套 compose 里的 `postgres`，游戏房间仍在 `arcade-data` 卷里），第一次启动前做：

```sh
openssl rand -hex 24 > pg_password.txt
echo "ARCADE_PG_URL=postgres://arcade:$(cat pg_password.txt)@postgres:5432/arcade" >> secrets.env
printf 'ARCADE_DB=pg\nCOMPOSE_PROFILES=pg\n' >> .env
docker compose up -d
```

### 备份和恢复

SQLite 经内部管理入口逻辑导出，管理入口只在容器里：

```sh
docker compose exec arcade /app/ops/backup.sh /data/backups
docker compose cp arcade:/data/backups ./backups                      # 从这里拷到别的机器
docker compose exec arcade sh -c '/app/ops/restore.sh d1-arcade-DB "$(ls -d /data/backups/*/ | tail -1)d1-arcade-DB.sql"'   # 恢复最近一份
```

从别处拷进容器的备份（`docker compose cp`）要对容器里的 `arcade` 用户可读（比如 `docker compose exec -u root arcade chmod 644 <文件>`）；读不到或是空文件，`restore.sh` 直接拒绝，不动库。

PostgreSQL：`docker compose exec postgres pg_dump -U arcade --clean --if-exists arcade > arcade.sql` 备份，
`docker compose exec -T postgres psql -U arcade -d arcade < arcade.sql` 恢复。

### 升级和回滚

迁移只加不删，旧镜像也认新的库。升级就是拉新代码、重新打镜像：

```sh
docker tag arcade:local arcade:previous      # 先留住正在跑的版本
git pull                                     # 然后按「打发布包和镜像」重新打 arcade:local
docker compose up -d                         # 换成新镜像
echo "ARCADE_IMAGE=arcade:previous" >> .env && docker compose up -d   # 回滚（删掉这一行就回到 arcade:local）
```

### 不用 Docker：二进制 + systemd

Debian/Ubuntu；Node 22 只在打包时用。按「打发布包和镜像」打出发布包（不用最后一行 `docker build`），在仓库根安装，前面放 Caddy：

```sh
sudo build/out/arcade-$v/ops/install.sh build/out/arcade-$v.tar.gz game.example.com   # 建用户和目录、生成 /etc/arcade/secrets.env、装 systemd 单元
sudo /opt/arcade/current/ops/create-admin.sh zhanzhang 站长
sudo apt install caddy && sudo cp /opt/arcade/current/ops/Caddyfile /etc/caddy/Caddyfile
echo "SITE_HOST=game.example.com" | sudo tee /etc/default/caddy && sudo systemctl restart caddy
```

备份：`sudo /opt/arcade/current/ops/backup.sh /var/lib/arcade/backups`（每晚用 cron 或 systemd timer 跑）。升级：拉代码、按上面重新打包，再
`sudo /opt/arcade/current/ops/upgrade.sh build/out/arcade-$v.tar.gz`（先备份，新版起不来自动切回）；回滚：`sudo /opt/arcade/current/ops/rollback.sh`。
用 PostgreSQL：在 `/etc/arcade/secrets.env` 里加 `ARCADE_DB=pg` 和 `ARCADE_PG_URL` 两行。

### 验证到什么程度

- 项目自己的站点在正式环境里跑过这样打出来的 Docker 镜像，前面是反向隧道。
- CI（`selfhost.yml`）用平台和德州打的包测二进制、镜像（SQLite）、PostgreSQL 的三种档，以及 `compose --profile pg`（arcade + postgres，不起 caddy）。
- 还没自动测的：经 Caddy 的整套 compose；还没在真机上走过的：Caddy 给公网域名申请真证书，systemd 单元和 `install.sh`、`upgrade.sh`、`rollback.sh`。
- 游戏房间也放进 PostgreSQL（什么都不落盘）要有房间的游戏都用 arcade-kit ≥ 0.21.0，现在只差飞驰，见下面「现状」；没走过的细节也在那里。

## 现状

- 存储部署时三选一（`build.mjs` 的 `--db`、`--storage`），之间不能混用：

  | 档 | 参数 | 平台库 | 房间 | 数据目录 |
  |---|---|---|---|---|
  | SQLite | 默认 | SQLite | SQLite | 要 |
  | PG | `--db pg` | PostgreSQL | SQLite | 要 |
  | PG 不落盘 | `--db pg --storage memory` | PostgreSQL | PostgreSQL | 不要 |

- **PG 不落盘要有房间的游戏都用 arcade-kit ≥ 0.21.0**（KIT_STORE），不够 `build.mjs` 直接报错，不生成。现在只有飞驰（racing）的 kit 低于 0.21.0：整站打 PG 不落盘要先用 `--only` 去掉它，等它升了 kit 再全打。哪个游戏够不够以各自 `package-lock.json` 里的 kit 版本为准，`build.mjs` 会逐个检查。
- **没在真机上走过的**：Caddy 给公网域名申请真证书、在别的反代或 CDN 后面时的真实 IP，systemd 单元、`install.sh`/`upgrade.sh`/`rollback.sh`。
  CI 里 Caddy 只用 `localhost`（Caddy 的内部证书）起过整套 compose；安装、升级、回滚只在打包机上用模拟的 `systemctl` 跑过。第一次上真机时要逐项验。

## 运行时调参数（vars）

各模块 `wrangler.jsonc` 的 vars 打包时成了默认值。其中**部署白名单（`tools/deploy-allowlist.json` 的 `vars`）里、模块本来就写了的**那些，
自托管时可以用环境变量覆盖，写在 `secrets.env` 里，重启生效，不用重新打包：

```
ARCADE_VARS_<Worker 名>_<变量名>=<值>
```

| 能覆盖的 | 是什么 | 值 |
|---|---|---|
| `ARCADE_VARS_arcade_LIMITS` | 平台的限流、写入预算、熔断阈值（`platform/worker/api/lib/config.ts` 的 `DEFAULT_LIMITS`） | JSON，只写要改的项，嵌套的 `budget`、`readonly`、`off` 按项合并；不合格的项平台回退默认值并记日志 |
| `ARCADE_VARS_arcade_REGISTRATION` | 注册总闸：`switch` 听管理后台的开关，别的值一律关 | 文本 |
| `ARCADE_VARS_guandan_ONLINE` | 牌馆好友房总开关：`on` 开 | 文本 |
| `ARCADE_VARS_<游戏>_KIT_QUOTA`（guandan、texas、mahjong、racing、danli） | 房间的配额：每人同时几间、每天几间，全站每天几间，房间存储每天写多少行后变忙、停开新房（`arcade-kit` 的 `DEFAULT_QUOTA`） | JSON |

- **覆盖是整个换掉**：`KIT_QUOTA` 没写的字段回到 kit 的默认值（不是 `wrangler.jsonc` 里的值），所以要写全；`LIMITS` 在 `wrangler.jsonc` 里本来就是 `{}`，只写要改的项即可。
- **写法**：一行，**不加引号、不留空格**。docker run 的 `--env-file` 不处理引号，compose 的 `env_file` 和 systemd 的 `EnvironmentFile` 原样保留不加引号的值，这样写三处都一样。
- 别的名字（拼错的、白名单外的、`GATE`、Secret 名）一律拒绝启动，并列出能覆盖的名字；值写错（比如 JSON 少个括号），workerd 起不来，日志里有出错位置。
  `GATE` 不开放：它是部署工具按平台关系盖上的 `login`，改了游戏就不认人。新绑定、Secret 不能借这个口子加：能覆盖的文件在打包时就定了（`runtime-vars.mjs`），启动脚本只改写它们。
- 原理：打包时这些 vars 不写死进 `config.capnp`，默认值放在发布包的 `vars/<Worker>/` 下，由 workerd 的 `-I` 导入路径读；
  `bin/arcade` 看到 `ARCADE_VARS_*` 就把 `vars/` 复制到 `$RUNTIME_DIRECTORY`（systemd 单元给的 `/run/arcade`，没有就 `$TMPDIR` 或 `/tmp`）下改写，`-I` 指那份。值不打印。
- **Cloudflare 上的部署不受影响**：这套只在自托管的打包（`build.mjs`）和启动脚本里，正式站仍由 `tools/deployer` 按各模块的 `wrangler.jsonc` 部署，那里的 vars 照旧。

### 自托管推荐值

默认值是照 Cloudflare 免费版的每日额度定的，**自托管直接用会撞上**：熔断按天算，`readonly` 档一天 4 万次请求，200 人同时在线约 1 小时就把站点切成只读；
房间每个游戏全站一天 300 间。下面是按一次压测（单进程 1000 人同时在线：约 52 次接口请求/秒，房间每步最多写 2 行）
放大到"1000 人整天在线"再留几倍余量的值，2 核 4GB 的机器够用。磁盘紧的改小 `dbBytes`、`noGrowthDbBytes`（字节）：

```
ARCADE_VARS_arcade_LIMITS={"readonly":{"calls":20000000,"rowsWritten":10000000,"rowsRead":300000000,"dbBytes":20000000000},"off":{"calls":30000000,"rowsWritten":15000000,"rowsRead":450000000},"noGrowthDbBytes":15000000000,"budget":{"reg":50000,"auth":300000,"save":1000000,"social":500000,"acct":50000,"board":300000,"wallet":1000000,"live":3000000,"mon":50000,"sys":300000},"loginAllHour":5000,"regAllDay":3000,"recoverAllHour":1000}
ARCADE_VARS_guandan_KIT_QUOTA={"roomsPerUser":1,"dailyRoomsPerUser":100,"dailyRooms":20000,"busyWrites":20000000,"stopWrites":30000000}
ARCADE_VARS_texas_KIT_QUOTA={"roomsPerUser":1,"dailyRoomsPerUser":30,"dailyRooms":20000,"busyWrites":20000000,"stopWrites":30000000,"emoteMs":1000,"emoteBurst":3}
ARCADE_VARS_mahjong_KIT_QUOTA={"roomsPerUser":1,"dailyRoomsPerUser":30,"dailyRooms":20000,"busyWrites":20000000,"stopWrites":30000000}
ARCADE_VARS_racing_KIT_QUOTA={"roomsPerUser":5,"dailyRoomsPerUser":100,"dailyRooms":20000,"busyWrites":20000000,"stopWrites":30000000}
ARCADE_VARS_danli_KIT_QUOTA={"roomsPerUser":5,"dailyRoomsPerUser":30,"dailyRooms":20000,"busyWrites":20000000,"stopWrites":30000000}
```

- 只放宽全站总量（请求、行数、预算、每天房间数、全站每小时登录和注册）；**每人、每 IP 的限流不动**（防刷、防撞库靠它们），覆盖是整份替换、不和 `wrangler.jsonc` 合并，所以每人同时开几个房间、每天开房数照抄各游戏 `wrangler.jsonc` 的值（改了游戏的值要同步改这里和线上）。
- 熔断是给"有人刷爆"留的最后一道闸：调大以后要盯磁盘和 CPU（`/__health`、`ops/backup.sh` 的大小），真有人刷，先在管理后台关注册、封号。

## 打包

```sh
npm ci --ignore-scripts --prefix tools/deployer          # 钉死的 wrangler（读配置、白名单检查）
(cd packages/arcade-host && npm ci && npm run build)     # 运行时
tools/selfhost/pack-all.sh build/art                     # 各模块 npm ci、构建、wrangler --dry-run 打包（后面写 Worker 名只打那几个，不写就是 tools/workers.json 里全部）
v=$(git rev-parse --short HEAD)
ARCADE_VERSION=$v tools/selfhost/release.sh build/art build/out --with-pg   # → build/out/arcade-$v/ 和 build/out/arcade-$v.tar.gz
```

不设 `ARCADE_VERSION` 时版本是 `git describe` 加时间。`release.sh` 后面可以接 `--with-pg`（同一个包再带一份 PG 档，`ARCADE_DB=pg` 时用；上面的部署步骤就是这样打的）和 `build.mjs` 的参数：
`--only arcade,texas`（只要这几个，必须带平台）、`--db pg`、`--storage memory`（见上面的表）。

| 文件 | 做什么 |
|---|---|
| `build.mjs` | 站点描述 → 发布目录。规则和 `tools/deployer/deploy.mjs` 一样：`checkSourceConfig` 白名单检查、`platformOverlay` 叠加 `ARCADE`/`WALLET` 和 `GATE=login`、游戏路由 `/games/<id>` 和 `/games/<id>/*`；`SITE_ORIGIN` 和平台的 Secret 运行时从环境变量取 |
| `pack-all.sh` | 各模块打成部署作业收的那种产物 |
| `release.sh` | 发布目录 + `bin/workerd`（`packages/arcade-host` 钉死的版本）+ `bin/arcade` 启动脚本 + `ops/` 运维脚本 → tar.gz |
| `arcade.sh` | 发布包里的 `bin/arcade`：在发布目录里起 workerd，按 `ARCADE_DB` 选 SQLite 档或 PG 档；管理入口不是回环地址、PG 档没设 `ARCADE_PG_URL` 都拒绝启动 |
| `create-admin.sh` | 建第一个管理员（`ops/create-admin.sh <用户名> <昵称>`）：用 `ADMIN_TOKEN` 调平台，令牌从环境变量或 `/etc/arcade/secrets.env` 读，不上命令行；用户名不能是 `admin` 这类保留名 |
| `smoke.mjs` | 全站冒烟（不用浏览器）：静态和路由、建号登录、德州单机带入结回、好友房 WebSocket、定时任务、导出；`--save`/`--rejoin` 测重启后回到同一个房间 |
| `backup.sh`、`restore.sh`、`restore-drill.sh` | 逻辑备份（每个 SQLite 库导出 SQL + 房间目录快照；PG 的库跳过）、恢复（文件读不到、是空的直接拒绝；容器里跑的是 `arcade` 用户，文件要对它可读）、恢复演练（临时端口起同一个发布包，导入再导出必须逐字节一样） |
| `install.sh`、`upgrade.sh`、`rollback.sh` | 第一次安装、升级（先备份、换软链接、等健康检查，起不来自动切回）、回滚 |
| `systemd/arcade.service` | systemd 单元（只听 127.0.0.1、只能写数据目录） |
| `docker/Caddyfile` | HTTPS、用真实地址覆盖 `cf-connecting-ip`、挡 `/cdn-cgi`（compose 挂它；发布包里在 `ops/Caddyfile`，二进制部署用） |
| `docker/Dockerfile` | 镜像（上下文是发布目录）；上下文里有 `bin/workerd-<架构>` 就按目标架构取，带了 `pg/` 就一起装 |
| `docker/compose.yaml` | arcade（默认 `arcade:local`，`ARCADE_IMAGE` 可换）+ caddy，postgres 在 profile pg 里；`ARCADE_DB` 从 `.env` 或环境变量来 |
| `docker/scan-image.sh` | 扫导出的镜像：凭证、Secret 文件、配置里的主机名和 D1 id、多余的环境变量（把自己打的镜像给别人之前跑一遍） |
| `pg/migrations/` | 平台迁移的 PG 版（文件名一一对应；文本列一律 `COLLATE "C"`，和 SQLite 一样按字节比较、排序） |
| `pg/overrides.json` | 覆盖表：机械翻译翻不了的平台语句的 PG 版，每条带为什么和对照参数 |
| `pg/check-sql.mjs` | 语句覆盖检查：平台每条 SQL 都在 PG 上 PREPARE，覆盖表和 SQLite 灌同样的数据（`pg/fixture.sql`）对照结果 |
| `pg/verify-import.mjs` | SQLite → PG 迁移后逐表逐行核对，外加钱包筹码合计 |

## 二进制部署（systemd）

安装、建管理员、Caddy、升级回滚的命令见上面「不用 Docker：二进制 + systemd」。细节：

- `install.sh`：建 `arcade` 用户和目录，第一次生成 `/etc/arcade/secrets.env`（root:arcade 640；`SITE_ORIGIN` 和 pepper、`ADMIN_TOKEN`，格式 `k1:<随机串>`，只写文件不打印），装 systemd 单元，再按升级的流程装上发布包。
  pepper 用上之后不能丢（库里的哈希靠它），和备份分开另存一份。PG 档往这个文件里加 `ARCADE_DB=pg` 和 `ARCADE_PG_URL`。
- 目录：`/opt/arcade/releases/<版本>/` + `/opt/arcade/current` 软链接；数据 `/var/lib/arcade/data`；日志 `journalctl -u arcade`（一行一个 JSON）。
- `upgrade.sh`：先备份到 `/var/lib/arcade/backups`，换软链接，等健康检查，起不来自动切回；`rollback.sh` 切回上一版。
  迁移只加不删，旧版本代码认新的库；要连数据一起回到某个时间点，用 `restore.sh` 导入那时的备份。
- 备份每晚跑一次（cron 或 systemd timer），再传到异地；隔一段时间跑一次恢复演练：
  `sudo /opt/arcade/current/ops/restore-drill.sh /opt/arcade/current "$(ls -d /var/lib/arcade/backups/*/ | tail -1)"`（临时端口起同一个发布包，导入再导出必须逐字节一样）。

管理入口（备份、恢复、手动跑定时任务）只听 `127.0.0.1:8788`，没有认证：生成器和启动脚本都不许它听别的地址。

## Docker

打镜像、起容器的步骤见上面「部署步骤」。镜像的上下文是发布目录；上下文里有 `bin/workerd-<架构>`（amd64、arm64）就按目标架构取，没有就用 `release.sh` 放的本机那一份 `bin/workerd`。

站点只给 caddy 经内部网络连（不发布到宿主）；管理入口只听容器内的 127.0.0.1，备份、恢复、建管理员都用 `docker compose exec arcade /app/ops/…`。
`secrets.env`、`pg_password.txt`、`.env` 都在 `docker/.gitignore` 里。

## PostgreSQL 模式

平台库（账号、钱包、榜单……）放进 PostgreSQL，平台代码一条 SQL 都不改：`packages/arcade-host` 的 D1 后端把 SQLite 方言机械翻译成 PG 的，
翻不了的走 `pg/overrides.json`。房间放哪见上面的表；PG 不落盘时，进程重启后第一次请求宿主按存着的闹钟把房间叫醒，打到一半的牌局接着打。

```sh
ARCADE_VERSION=$v tools/selfhost/release.sh build/art build/out --with-pg   # 一个包两档都带，ARCADE_DB 选
ARCADE_VERSION=$v-pgmem tools/selfhost/release.sh build/art build/out --db pg --storage memory   # PG 不落盘（各游戏 kit 够了才打得出）
```

- 第一次起站自动建表（`pg/migrations/`，记在 PG 的 `d1_migrations` 表里）；房间的表（`arcade_kit_rows`、`arcade_kit_alarms`）也是自动建的。
  建库用什么区域设置都行：文本列都带了 `COLLATE "C"`。
- **从 SQLite 档迁过来**：旧站 `ops/backup.sh` 导出平台库 → 停旧站 → PG 档起站 → `ops/restore.sh d1-arcade-DB` 加上备份里的 `d1-arcade-DB.sql`
  （整库替换，一个事务，回的 JSON 里有每张表的行数和数字列总和）→ 在打包的机器上 `node tools/selfhost/pg/verify-import.mjs`，参数是同一个 `.sql` 和 `--pg` 连接串，逐行核对 → 开站。
  房间（打到一半的牌局）不迁。
- **备份**：平台库（和不落盘时的房间）用 `pg_dump`，比如 Docker 里 `docker compose exec postgres pg_dump -U arcade --clean --if-exists arcade > arcade.sql`；`backup.sh` 遇到 PG 的库会跳过。
- **平台改了 SQL**：`selfhost.yml` 的 pg 作业会跑 `pg/check-sql.mjs`（它只报警，不挡平台部署）。新语句机械翻译不了（json 函数、`SUM(布尔)`、
  `ON CONFLICT DO UPDATE` 里不带表名的列、推不出类型的参数……），就在 `overrides.json` 加一条 PG 版和对照参数（写语句再加 `after`：跑完查哪张表），
  本地 `node tools/selfhost/pg/check-sql.mjs`（PGlite）或 `--pg <测试库>` 跑通。收 JSON 字符串的参数写 `$N::text::json`（postgres.js 的坑，只有 `--pg` 走真连接才查得出）。
  平台加了迁移，`pg/migrations/` 跟着加同名的 PG 版。

## 验证（CI：`.github/workflows/selfhost.yml`）

只测不部署，不碰线上，Secret 和数据库密码都是这次运行临时生成的。只在 PR 改了本目录、`tools/deployer/`、`tools/workers.json`、`tools/deploy-allowlist.json`、`packages/arcade-host/` 或这个流程文件时跑，也能在 Actions 里手动运行。

| 作业 | 做什么 |
|---|---|
| binary | 打平台和德州 → SQLite 档发布包 → 二进制起站：冒烟、备份、恢复演练；管理入口听 0.0.0.0 时必须起不来 |
| docker | 同一个包做成镜像起容器：冒烟、容器里跑定时任务和备份、重启容器后数据还在；compose 文件能解析 |
| pg | postgres:17（en_US 排序，故意不用 C）：语句覆盖检查 → SQLite 档冒烟、备份 → PG 档冒烟 → 备份迁进 PG、逐行核对 → 再冒烟 → PG 不落盘档冒烟、重启、两人回到同一个房间 |
| docker-pg | PG 不落盘包做成镜像，`compose --profile pg` 起 arcade + postgres：冒烟 → 重启 arcade 容器后回到同一个房间 → 容器里跑定时任务和备份 |

