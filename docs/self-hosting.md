# Self-hosting Arrivo

Arrivo runs as two containers: the app (`ghcr.io/sdesmond/arrivo`) and PostgreSQL 17. The app
prepares its own database on every start, so there is nothing else to run. Any host with Docker
Engine and Compose v2 works, on amd64 or ARM64: a Linux server, a Synology or other NAS, a Raspberry Pi.

Everything is in one file, [`docker-compose.yml`](../docker-compose.yml). There is no `.env` file
and no secret to generate.

## Quick start (command line)

```sh
mkdir -p ~/arrivo && cd ~/arrivo
curl -fsSLO https://raw.githubusercontent.com/sdesmond/arrivo/main/docker-compose.yml
docker compose up -d
```

Open `http://<your-server>:3550`, create your account, and you're done. When everyone has an account,
set `ALLOW_SIGNUP: "false"` in the file and run `docker compose up -d` again.

Before starting, check `PUID` and `PGID` in the file match your user (`id` prints them). They decide
who owns uploaded files in `./data/storage`.

## Synology NAS (Container Manager)

1. Install **Container Manager** from Package Center.
2. In **File Station**, open the `docker` shared folder and create a folder `arrivo`. Inside it,
   create `pgdata` and `storage`.
3. Find your user's IDs: in **Control Panel → Terminal & SNMP**, enable SSH, connect, and run `id`.
   Note `uid` (often `1026`) and `gid` (often `100`).
4. In Container Manager, open **Project → Create**. Name it `arrivo`, set the path to
   `/docker/arrivo`, and choose **Create docker-compose.yml**.
5. Paste [`docker-compose.yml`](../docker-compose.yml), then change:
   - `./data/pgdata` to `/volume1/docker/arrivo/pgdata`
   - `./data/storage` to `/volume1/docker/arrivo/storage`
   - `PUID` and `PGID` to the values from step 3
6. Click **Next**, skip the web portal settings, then **Done**. The images download and both
   containers start.
7. Open `http://<your-NAS-IP>:3550` and create your account.

Portainer and Dockge work the same way: create a stack, paste the file, and adjust the paths and
`PUID`/`PGID`.

## Configuration

All settings are environment variables on the `app` service. After you change one, run
`docker compose up -d`, or use **Build** in Container Manager.

| Variable              | Default          | Purpose                                                                                                                         |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | the bundled `db` | Postgres connection. If you change `POSTGRES_PASSWORD` on `db`, change it here too                                              |
| `PUID` / `PGID`       | `1000` / `1000`  | Owner of `./data/storage` on the host. The app re-owns that folder to these IDs on start                                        |
| `ALLOW_SIGNUP`        | `true`           | Set `"false"` to close registration                                                                                             |
| `MAPBOX_ACCESS_TOKEN` | —                | Public (`pk.`) [Mapbox token](https://account.mapbox.com/access-tokens/) for place search, routes, map previews and the Map tab |
| `MAPBOX_PUBLIC_TOKEN` | the token above  | Optional separate token for browsers only, so you can URL-restrict it (a restricted token breaks server-side calls)             |
| `UNSPLASH_ACCESS_KEY` | —                | [Unsplash](https://unsplash.com/developers) access key for cover-image search                                                   |
| `NEXTAUTH_SECRET`     | generated        | Signs sign-in sessions. Leave it unset: one is generated on first start and kept in `storage/.arrivo/auth-secret`               |
| `NEXTAUTH_URL`        | from the request | Only needed if sign-in redirects go to the wrong address, e.g. behind a proxy that rewrites `Host`                              |

Without the Mapbox and Unsplash keys Arrivo still runs; those features are just unavailable.
Browsers receive the Mapbox token, so never use a secret (`sk.`) token.

To use a different host port, change the left number in `"3550:3550"`, e.g. `"8080:3550"`. To run a
fixed release instead of the newest, change the image tag, e.g. `ghcr.io/sdesmond/arrivo:0.4.0`. Then
upgrades happen only when you change it.

> On Docker Desktop for Windows or macOS, PostgreSQL can fail to start on a host-folder data
> directory. Use a Linux host or NAS, or on Windows keep the folder inside the WSL 2 filesystem.

## HTTPS

Arrivo serves plain HTTP. For HTTPS or access from outside your network, put a reverse proxy in front.
That can be Synology's **Login Portal → Reverse Proxy**, Caddy, nginx, Traefik, Nginx Proxy Manager
or Cloudflare Tunnel. Forward to port 3550 and pass the `Host` header and `X-Forwarded-Proto`. With
Caddy:

```
arrivo.example.com {
    reverse_proxy 127.0.0.1:3550
}
```

If the proxy runs on the same host, change the port line to `"127.0.0.1:3550:3550"` so the app
isn't reachable around it.

## Updating

```sh
docker compose pull && docker compose up -d
```

In Container Manager: **Project → arrivo → Action → Stop**, then **Image → Update** (or **Clean**)
for `ghcr.io/sdesmond/arrivo`, then start the project. In Portainer or Dockge, use the
pull-and-redeploy action; a plain redeploy keeps the old image.

The app applies any database changes as it starts. Take a backup first when upgrading across
releases (see below).

## Backup and restore

Back up the database with `pg_dump`, and the `storage` folder as files. **Never copy `pgdata` while
it runs**, because a mid-write copy can be unrestorable. If a host backup job (e.g. Hyper Backup)
covers the folder, run the dump before it.

```sh
docker exec arrivo-db pg_dump -U arrivo -d arrivo -Fc > arrivo-db-$(date +%F).dump
tar czf arrivo-storage-$(date +%F).tgz -C data/storage .
```

The `storage` backup includes `.arrivo/auth-secret`. Without it, a restored install signs everyone
out, but no data is lost.

Restore onto a running install:

```sh
docker stop arrivo
docker exec -i arrivo-db pg_restore -U arrivo -d arrivo --clean --if-exists < arrivo-db-YYYY-MM-DD.dump
rm -rf data/storage/* data/storage/.arrivo && tar xzf arrivo-storage-YYYY-MM-DD.tgz -C data/storage
docker start arrivo
```

Use your own folder paths in place of `data/...` if you changed them.

## Troubleshooting

Start with `docker ps -a` and `docker logs arrivo`. A healthy install shows `arrivo` as
**Up (healthy)** and `arrivo-db` as **Up (healthy)**.

| Symptom                                       | Fix                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `arrivo` keeps restarting                     | Read `docker logs arrivo`. A failed database update or wrong `DATABASE_URL` stops it before it serves pages |
| `manifest unknown` when pulling               | The image tag names a release that doesn't exist                                                            |
| `port is already allocated`                   | Change the left number in the `ports` line                                                                  |
| Sign-in redirects to `localhost` or loops     | Set `NEXTAUTH_URL` to the exact address you open, port included                                             |
| Everyone was signed out after a restore/move  | `storage/.arrivo/auth-secret` wasn't carried over; sign in again                                            |
| Map tab is empty                              | `MAPBOX_ACCESS_TOKEN` (or `MAPBOX_PUBLIC_TOKEN`, if set) is blank or invalid                                |
| `EACCES` / `permission denied` when uploading | `PUID`/`PGID` don't match a user that can write the `storage` folder                                        |

## Uninstalling

`docker compose down` removes the containers. Data stays in `./data` (even with `-v`); delete that
folder to remove it for good.

To run unreleased code, see [building-from-source.md](./building-from-source.md).
