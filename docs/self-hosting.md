# Self-hosting

Run the whole site — platform and every game — on your own machine as **one process**, without a Cloudflare account.
[`packages/arcade-host`](../packages/arcade-host/README.md) runs the unmodified modules in [workerd](https://github.com/cloudflare/workerd)
and supplies what Cloudflare normally provides (D1 on SQLite or PostgreSQL, static assets, routing, cron triggers).
The module code is the same as on Cloudflare. Packaging details, every script and the CI coverage are in
[tools/selfhost/README.md](../tools/selfhost/README.md) (in Chinese).

No ready-made image is published: you build a release from source, then either turn it into a Docker image or install it directly
([without Docker](#without-docker-binary--systemd)). Releases and images contain no secrets, hostnames or database IDs — everything comes from environment variables.

## Build the release and the image

Needs Node 22 and Docker:

```sh
git clone https://github.com/gzyyyyyyu/arcade.git && cd arcade
npm ci --ignore-scripts --prefix tools/deployer
(cd packages/arcade-host && npm ci && npm run build)
v=$(git rev-parse --short HEAD)
tools/selfhost/pack-all.sh build/art && ARCADE_VERSION=$v tools/selfhost/release.sh build/art build/out --with-pg
docker build -f tools/selfhost/docker/Dockerfile -t arcade:local build/out/arcade-$v
```

`arcade:local` is the default image name in [`compose.yaml`](../tools/selfhost/docker/compose.yaml) (override with `ARCADE_IMAGE`). Run the commands below
in `tools/selfhost/docker/`, next to `compose.yaml` and `Caddyfile`; `secrets.env`, `pg_password.txt` and `.env` are git-ignored there.

## Settings

Environment variables; put them in a `secrets.env` file:

| Variable | Required | What |
|---|---|---|
| `PEPPER_PW`, `PEPPER_RC`, `PEPPER_SID`, `PEPPER_IP` | yes | hashing peppers, format `k1:<random>`; never change or lose them once in use |
| `ADMIN_TOKEN` | to create the first admin | same format |
| `SITE_ORIGIN` | behind HTTPS (compose, Caddy) | the public origin, e.g. `https://game.example.com`; without it logins fail behind a TLS proxy |
| `ARCADE_DB` | no | `sqlite` (default) or `pg` |
| `ARCADE_PG_URL` | with `ARCADE_DB=pg` | PostgreSQL connection string |
| `ARCADE_VARS_<worker>_<NAME>` | no | override a module setting at runtime, e.g. `ARCADE_VARS_arcade_LIMITS` (platform rate limits and daily budgets) or `ARCADE_VARS_texas_KIT_QUOTA` (room quotas). The defaults are sized for the Cloudflare free tier and turn the site read-only within about an hour at 200 players: use the recommended values in [tools/selfhost/README.md](../tools/selfhost/README.md#自托管推荐值). One line, no quotes, no spaces |

Generate the secrets once (keep a copy of the file somewhere safe, apart from backups):

```sh
cd tools/selfhost/docker
for k in PEPPER_PW PEPPER_RC PEPPER_SID PEPPER_IP ADMIN_TOKEN; do echo "$k=k1:$(openssl rand -hex 24)"; done > secrets.env
chmod 600 secrets.env
```

## Try it: one container, SQLite, data in a volume

```sh
docker run -d --name arcade --restart unless-stopped -p 127.0.0.1:8787:8787 -v arcade-data:/data --env-file secrets.env arcade:local
docker exec arcade /app/ops/create-admin.sh zhanzhang 站长   # prints the first admin's password and recovery code once
```

Open <http://localhost:8787> and log in; registration is closed until you open it (or create accounts) in `/admin`.
For a public site put HTTPS in front — the compose setup below does that.

## Production: docker compose with automatic HTTPS (Caddy)

[`compose.yaml`](../tools/selfhost/docker/compose.yaml) runs `arcade` (not published to the host),
`caddy` (ports 80/443, gets and renews the certificate for `SITE_HOST`, passes the real client IP) and, with the `pg` profile, `postgres`.
Point the domain's DNS at the server first. In `tools/selfhost/docker/`:

```sh
echo "SITE_ORIGIN=https://game.example.com" >> secrets.env
echo "SITE_HOST=game.example.com" > .env
docker compose up -d
docker compose exec arcade /app/ops/create-admin.sh zhanzhang 站长
```

PostgreSQL instead of SQLite (the platform database goes into the bundled `postgres` service; game rooms stay in the `arcade-data` volume) — do this before the first start:

```sh
openssl rand -hex 24 > pg_password.txt
echo "ARCADE_PG_URL=postgres://arcade:$(cat pg_password.txt)@postgres:5432/arcade" >> secrets.env
printf 'ARCADE_DB=pg\nCOMPOSE_PROFILES=pg\n' >> .env
docker compose up -d
```

## Backup and restore

SQLite: logical export through the internal admin endpoint, which only listens inside the container:

```sh
docker compose exec arcade /app/ops/backup.sh /data/backups
docker compose cp arcade:/data/backups ./backups                      # copy off the server from here
docker compose exec arcade sh -c '/app/ops/restore.sh d1-arcade-DB "$(ls -d /data/backups/*/ | tail -1)d1-arcade-DB.sql"'   # restore the latest
```

A backup copied into the container (`docker compose cp`) must be readable by the container's `arcade` user (e.g. `docker compose exec -u root arcade chmod 644 <file>`); `restore.sh` refuses unreadable or empty files and leaves the database alone.

With PostgreSQL: `docker compose exec postgres pg_dump -U arcade --clean --if-exists arcade > arcade.sql` and
`docker compose exec -T postgres psql -U arcade -d arcade < arcade.sql`.

## Upgrade and roll back

Migrations only add, so an older image still works with the newer database. Upgrading means pulling the new code and rebuilding the image:

```sh
docker tag arcade:local arcade:previous      # keep the running version
git pull                                     # then rebuild arcade:local as in "Build the release and the image"
docker compose up -d                         # switch to the new image
echo "ARCADE_IMAGE=arcade:previous" >> .env && docker compose up -d   # roll back (remove the line again to return to arcade:local)
```

## Without Docker: binary + systemd

Debian/Ubuntu; Node 22 is needed only to build. Build the release as in [Build the release and the image](#build-the-release-and-the-image)
(skip the final `docker build`), install it from the repository root, and put Caddy in front:

```sh
sudo build/out/arcade-$v/ops/install.sh build/out/arcade-$v.tar.gz game.example.com   # user, dirs, secrets in /etc/arcade/secrets.env, systemd unit
sudo /opt/arcade/current/ops/create-admin.sh zhanzhang 站长
sudo apt install caddy && sudo cp /opt/arcade/current/ops/Caddyfile /etc/caddy/Caddyfile
echo "SITE_HOST=game.example.com" | sudo tee /etc/default/caddy && sudo systemctl restart caddy
```

Backup: `sudo /opt/arcade/current/ops/backup.sh /var/lib/arcade/backups` (nightly via cron or a systemd timer). Upgrade: pull, rebuild as above, then
`sudo /opt/arcade/current/ops/upgrade.sh build/out/arcade-$v.tar.gz` (backs up first, switches back automatically if the new version does not come up);
roll back: `sudo /opt/arcade/current/ops/rollback.sh`. PostgreSQL: add the two lines `ARCADE_DB=pg` and `ARCADE_PG_URL` (your connection string) to `/etc/arcade/secrets.env`.

## What has been tested

- The project's own site has run in production on a Docker image built this way, behind a reverse tunnel.
- CI (`selfhost.yml`) builds a release with the platform and the Texas game and tests the binary, the Docker image (SQLite), all three PostgreSQL modes, and `compose --profile pg` (arcade + postgres, without caddy).
- Not tested automatically: the full compose setup through Caddy. Not yet exercised on a real server: Caddy obtaining a certificate for a public domain, and the systemd unit with the install, upgrade and rollback scripts.
- Keeping game rooms in PostgreSQL too (nothing on disk) needs every game with rooms on arcade-kit ≥ 0.21.0; today only the racing game is still below that, so leave it out with `--only` for now.

Details, all options and the CI coverage: [tools/selfhost/README.md](../tools/selfhost/README.md).
