# Self-hosting Packt

Packt runs as three containers from prebuilt images: PostgreSQL 17 (`db`), a one-shot schema push
(`migrate`), and the web app (`app`). Any Linux host with Docker Engine and Compose v2 works, on
amd64 or ARM64.

## Quick start

```sh
mkdir -p ~/packt && cd ~/packt
curl -fsSLO https://raw.githubusercontent.com/sdesmond/packt/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/sdesmond/packt/main/.env.docker.example -o .env
```

Edit `.env`: set `NEXTAUTH_SECRET` to the output of `openssl rand -base64 32`, and `NEXTAUTH_URL` to
the address you'll open in the browser, port included (e.g. `http://192.168.1.50:3000`). Then:

```sh
docker compose up -d
```

Open `NEXTAUTH_URL`, sign up, and once everyone has an account set `ALLOW_SIGNUP=false` and run
`docker compose up -d` again.

Using a stack-management tool instead of the terminal? Give it `docker-compose.yml` and enter the
`.env` variables in its environment settings — the file is the same either way.

## Configuration

Every setting is an environment variable. Changes take effect on `docker compose up -d`.

| Variable              | Default                 | Purpose                                                                                                    |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `NEXTAUTH_SECRET`     | —                       | **Required.** Signs sessions. Keep it private; changing it logs everyone out                               |
| `NEXTAUTH_URL`        | `http://localhost:3000` | Exact URL users open, port included. A mismatch causes sign-in loops or redirects to `localhost`           |
| `PACKT_PORT`          | `3000`                  | Host port. The container always listens on 3000; if you change this, change the port in `NEXTAUTH_URL` too |
| `PACKT_VERSION`       | `latest`                | Image release to run, e.g. `0.2.0`. Pinning means upgrades happen only when you change it                  |
| `PACKT_DATA_DIR`      | `./data`                | Host folder for `pgdata/` (database) and `storage/` (uploads). Relative to the compose file's folder       |
| `ALLOW_SIGNUP`        | `true`                  | Set `false` to close registration                                                                          |
| `MAPBOX_ACCESS_TOKEN` | —                       | [Mapbox token](https://account.mapbox.com/access-tokens/) for place search, routes, and map previews       |
| `MAPBOX_PUBLIC_TOKEN` | —                       | Public (`pk.`) Mapbox token sent to browsers for the Map tab; the same token as above works                |
| `UNSPLASH_ACCESS_KEY` | —                       | [Unsplash](https://unsplash.com/developers) access key for cover-image search                              |

Without the Mapbox and Unsplash keys Packt still runs; those features are just unavailable.

> On Docker Desktop for Windows or macOS, PostgreSQL can fail to start on a host-folder data
> directory. Use a Linux host, or on Windows point `PACKT_DATA_DIR` into the WSL 2 filesystem.

## HTTPS

Packt serves plain HTTP. For HTTPS or access from outside your network, put a reverse proxy in front
(Caddy, nginx, Traefik, a NAS's built-in proxy, Cloudflare Tunnel, …) that forwards the `Host` header
and sets `X-Forwarded-Proto`, then set `NEXTAUTH_URL` to the public URL. With Caddy:

```
packt.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

If the proxy runs on the same host, change the `ports` line to
`"127.0.0.1:${PACKT_PORT:-3000}:3000"` so the app isn't reachable around it.

## Updating

Set `PACKT_VERSION` to the new release if you pin one, then:

```sh
docker compose pull && docker compose up -d
```

The schema push runs again automatically; data in `PACKT_DATA_DIR` is untouched. In a
stack-management tool, use its pull-and-redeploy action — a plain redeploy keeps the old image.

## Backup and restore

Back up the database with `pg_dump`. **Never copy or archive `pgdata/` while it runs** — a mid-write
copy can be unrestorable. If a host backup job covers `PACKT_DATA_DIR`, run the dump before it.

```sh
docker compose exec -T db pg_dump -U packt -d packt -Fc > packt-db-$(date +%F).dump
tar czf packt-storage-$(date +%F).tgz -C data/storage .
```

Restore onto a running install:

```sh
docker compose stop app
docker compose exec -T db pg_restore -U packt -d packt --clean --if-exists < packt-db-YYYY-MM-DD.dump
rm -rf data/storage/* && tar xzf packt-storage-YYYY-MM-DD.tgz -C data/storage
docker compose start app
```

Substitute your `PACKT_DATA_DIR` for `data` if you changed it.

## Demo data

To explore with sample trips: `docker compose run --rm migrate npm run db:seed`, then sign in as
`demo@packt.local` / `demo1234` (see [dev-seed-data.md](./dev-seed-data.md)). The password is public,
so don't do this on a shared instance.

## Troubleshooting

Start with `docker compose ps -a` and `docker compose logs <app|db|migrate>`. A healthy stack shows
`db` healthy, `app` up, and `migrate` **Exited (0)** — it's a one-shot job.

| Symptom                                                | Fix                                                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `required variable NEXTAUTH_SECRET is missing a value` | `.env` is missing, not next to `docker-compose.yml`, or the secret is empty                     |
| `manifest unknown` when pulling                        | `PACKT_VERSION` names a release that doesn't exist                                              |
| `migrate` shows `Exited (1)`                           | A schema change needs confirmation: run `docker compose run --rm migrate` and answer the prompt |
| `port is already allocated`                            | Change `PACKT_PORT` and the port in `NEXTAUTH_URL`                                              |
| Sign-in loops or redirects to `localhost`              | `NEXTAUTH_URL` doesn't match the browser's address                                              |
| Map tab is empty                                       | `MAPBOX_PUBLIC_TOKEN` is blank or invalid                                                       |
| `EACCES` / `EPERM` when uploading                      | Only if you run the app as a non-root `user:` — see [Storage](../README.md#storage)             |

## Uninstalling

`docker compose down` removes the containers. Data stays in `PACKT_DATA_DIR` (even with `-v`); delete
that folder to remove it for good.

To run unreleased code, see [building-from-source.md](./building-from-source.md).
