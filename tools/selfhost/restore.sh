#!/usr/bin/env bash
# 恢复一个库：把 backup.sh 导出的 SQL 整库替换进去（一个事务，失败原样不动）。站点不用停，但恢复期间的写入会被覆盖，
# 正式恢复前先在 Caddy 上挂维护页，或者先停 Caddy。
# 用法：tools/selfhost/restore.sh <库名，比如 d1-arcade-DB> <导出的 .sql> [管理入口，默认 http://127.0.0.1:8788]
set -euo pipefail
db=${1:?用法：tools/selfhost/restore.sh <库名> <导出的 .sql> [管理入口]}
file=${2:?用法：tools/selfhost/restore.sh <库名> <导出的 .sql> [管理入口]}
admin=${3:-http://127.0.0.1:8788}
# curl 读不到文件只警告、照样发空请求：先在这里拦（容器里是 arcade 用户在跑，文件要对它可读）
[ -r "$file" ] || { echo "restore：读不到 $file（不存在或没有读权限；容器里要对 arcade 用户可读），没动库" >&2; exit 1; }
[ -s "$file" ] || { echo "restore：$file 是空的，没动库" >&2; exit 1; }
curl -fsS -X POST --data-binary "@$file" "$admin/d1/$db/import"
echo
