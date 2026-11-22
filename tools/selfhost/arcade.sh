#!/bin/sh
# 发布包里的启动脚本（bin/arcade）：在发布目录里起 workerd。systemd 单元和 Docker 都用它，参数都从环境变量来：
#   ARCADE_DATA          数据目录（sqlite 存储时必填，要先建好）；memory 存储不用
#   ARCADE_LISTEN        站点监听，默认 127.0.0.1:8787（前面是 Caddy）
#   ARCADE_DB            sqlite（默认）或 pg：发布包带了 pg/（release.sh --with-pg，Docker 镜像都带）时，pg 用那一份 PG 档的配置
#   ARCADE_PG_URL        PG 模式（release.json 里 "db": "pg"）必填：平台库的 PostgreSQL 连接串
#   ARCADE_ADMIN_LISTEN  管理入口监听，默认 127.0.0.1:8788（没有认证，只许回环地址；容器里也只听容器内的 127.0.0.1，用 docker exec 进去调）
#   ARCADE_VARS_<Worker>_<名>  覆盖某个 Worker 的某个 var 的默认值（比如 ARCADE_VARS_arcade_LIMITS='{"anonPerIpPerMinute":30}'）。
#                        Worker 名到第一个下划线为止，剩下的是变量名；值原样写进文件（字符串的 var 就是文本，别的是 JSON，JSON 写错 workerd 起不来并报位置）。
#                        只有发布包的 vars/<Worker>/ 下有的才能覆盖（打包时按部署白名单列的，GATE 和 Secret 不在内），别的名字一律拒绝启动并列出能覆盖的；
#                        覆盖文件放在 ${RUNTIME_DIRECTORY:-${TMPDIR:-/tmp}} 下新建的目录里（systemd 单元设了 RuntimeDirectory，停服务自动清）。值不会打印。
# Secret（PEPPER_*、ADMIN_TOKEN、SITE_ORIGIN……）也是环境变量，由 systemd 的 EnvironmentFile 或 docker 的 env_file 给。
set -eu
cd "$(dirname "$0")/.."
workerd=$PWD/bin/workerd
case "${ARCADE_DB:-sqlite}" in
  sqlite) ;;
  pg)
    # 整包本身就是 PG 档（release.sh --db pg）的话直接用；带了 pg/ 子目录的进去用那一份
    if ! grep -q '"db": "pg"' release.json; then
      [ -d pg ] || { echo "arcade：ARCADE_DB=pg，可这个发布包没有 PG 档（打包时加 --with-pg 或 --db pg）" >&2; exit 1; }
      cd pg
    fi
    ;;
  *) echo "arcade：ARCADE_DB 只许 sqlite 或 pg，不认 ${ARCADE_DB}" >&2; exit 1 ;;
esac
admin=${ARCADE_ADMIN_LISTEN:-127.0.0.1:8788}
case "$admin" in
  127.*:* | localhost:* | '[::1]':*) ;;
  *) echo "arcade：管理入口没有认证，只许听回环地址，ARCADE_ADMIN_LISTEN=$admin 不行" >&2; exit 1 ;;
esac
# 运行时可改的 vars：默认值在当前目录（PG 档是 pg/）的 vars/ 下，-I 指到它；有覆盖就复制一份改写，-I 指副本
inc=$PWD
# 只从环境变量里抽名字，值不经过任何会打印的地方
names=$(env | sed -n 's/^\(ARCADE_VARS_[A-Za-z0-9_]*\)=.*/\1/p')
if [ -n "$names" ]; then
  allowed() {
    for f in vars/*/*; do
      [ -f "$f" ] || continue
      w=${f#vars/}; w=${w%%/*}; k=${f##*/}; k=${k%.*}
      echo "  ARCADE_VARS_${w}_${k}" >&2
    done
  }
  # 先全部检查完再动文件
  for n in $names; do
    rest=${n#ARCADE_VARS_}
    case "$rest" in
      *_?*) w=${rest%%_*}; k=${rest#*_} ;;
      *) w=; k= ;;
    esac
    if [ -z "$w" ] || { [ ! -f "vars/$w/$k.json" ] && [ ! -f "vars/$w/$k.txt" ]; }; then
      echo "arcade：$n 不是这个发布包里能覆盖的 var（格式 ARCADE_VARS_<Worker>_<名>）。能覆盖的：" >&2
      allowed
      exit 1
    fi
  done
  inc=$(mktemp -d "${RUNTIME_DIRECTORY:-${TMPDIR:-/tmp}}/arcade-vars.XXXXXX")
  cp -R vars "$inc/vars"
  for n in $names; do
    rest=${n#ARCADE_VARS_}; w=${rest%%_*}; k=${rest#*_}
    f=vars/$w/$k.json; [ -f "$f" ] || f=vars/$w/$k.txt
    eval "printf '%s' \"\${$n}\"" > "$inc/$f"
  done
fi
set -- serve config.capnp -I "$inc" \
  --socket-addr "http=${ARCADE_LISTEN:-127.0.0.1:8787}" \
  --socket-addr "admin=$admin"
if grep -q '"storage": "sqlite"' release.json; then
  : "${ARCADE_DATA:?sqlite 存储要设 ARCADE_DATA（数据目录）}"
  mkdir -p "$ARCADE_DATA"
  set -- "$@" --directory-path "data=$ARCADE_DATA"
fi
if grep -q '"db": "pg"' release.json; then
  : "${ARCADE_PG_URL:?PG 模式要设 ARCADE_PG_URL（平台库的 PostgreSQL 连接串）}"
fi
exec "$workerd" "$@"
