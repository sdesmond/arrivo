# Self-hosting Packt with Docker

This guide takes you from an empty machine to a running Packt instance. It assumes you're comfortable
running commands in a terminal on the machine that will host Packt. Any host that runs Docker works —
a home server, a NAS, a VPS, or your own computer.

---

## 1. What you'll be running

`docker-compose.yml` defines three services:

| Service   | What it does                                                                  | Lifetime                          |
| --------- | ----------------------------------------------------------------------------- | --------------------------------- |
| `db`      | PostgreSQL 17 — stores users, trips, and itineraries                          | Always running                    |
| `migrate` | Pushes the database schema, then exits. Also used to load optional demo data. | Runs once per `docker compose up` |
| `app`     | The Packt web app (Next.js), listening on port 3000 inside the container      | Always running                    |

Data lives in two folders on the host, so it survives rebuilds and upgrades and is visible to
host-level backups. Both sit under `PACKT_DATA_DIR` (default `./data`, next to `docker-compose.yml`):

- `pgdata/` — the database files (back these up with `pg_dump`, not by copying — see step 9)
- `storage/` — uploaded documents and trip cover images

Docker creates both folders on first start.

> On Docker Desktop for Windows or macOS, PostgreSQL can fail to start on a host-folder data
> directory (file-permission and sync errors). Use a Linux host, or on Windows put `PACKT_DATA_DIR`
> inside the WSL 2 filesystem (e.g. `/home/<you>/packt-data`) rather than on a `C:\` path.

The same `docker-compose.yml` works whether you run `docker compose` yourself or use a tool that
manages Compose stacks for you. Every setting is an environment variable; only where you put them
differs (step 4).

---

## 2. Requirements

- **Docker Engine with Compose v2.** Check with `docker compose version` (note: `docker compose`, not
  `docker-compose`). Install from <https://docs.docker.com/engine/install/>.
- **git** and **openssl** (both preinstalled on most Linux distributions and macOS).
- **CPU:** x86_64 (amd64) or ARM64.
- **Memory:** about **4 GB free while building** the image — the Next.js production build is the heavy
  part. Once built, the running stack needs far less (a few hundred MB). If your host is short on
  memory, build elsewhere — see [Building on another machine](#10-building-on-another-machine).
- **Disk:** about 3 GB for images and build cache, plus whatever your data grows to.
- **Internet access while building** — the build downloads npm packages and the app's Google Fonts.
  The running app only needs internet for the optional Mapbox and Unsplash features.

---

## 3. Get the code

```sh
git clone https://github.com/sdesmond/packt.git
cd packt
```

All remaining commands run from this folder (the one containing `docker-compose.yml`).

---

## 4. Configure

When you run `docker compose` from the terminal, Compose reads its settings from a file named `.env` in
this folder. If you deploy through a stack-management tool instead, enter the same variables in its
environment settings (or replace the `${...}` references in your copy of the compose file with
values). Either way, `.env.docker.example` lists every variable. Keep whatever file holds the secrets
readable only by you (`chmod 600`).

For the terminal route, start from the Docker template:

```sh
cp .env.docker.example .env
```

> Use `.env.docker.example`, not `.env.example`. The latter is for local development and contains
> placeholder values that would be passed to the container as if they were real keys.

### 4a. Session secret (required)

Generate a random secret and write it into `.env`:

```sh
# Linux
sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -base64 32)|" .env

# macOS
sed -i '' "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -base64 32)|" .env
```

Or run `openssl rand -base64 32` and paste the output after `NEXTAUTH_SECRET=` with a text editor.
Keep it private — anyone with it can forge logins. Compose refuses to start if it's empty.

### 4b. Public URL (required unless you only use Packt on the host itself)

Open `.env` in an editor and set `NEXTAUTH_URL` to the **exact** address people will type into their
browser, including the port:

```sh
NEXTAUTH_URL=http://192.168.1.50:3000      # LAN IP of the host
NEXTAUTH_URL=http://homeserver.local:3000  # hostname on your network
NEXTAUTH_URL=https://packt.example.com     # behind a reverse proxy with HTTPS (see step 7)
```

Leaving it at `http://localhost:3000` only works from a browser on the host machine itself.

### 4c. Port (optional)

`PACKT_PORT` is the port on the host that maps to the app. Change it if 3000 is taken — and use the
same port in `NEXTAUTH_URL`. The app inside the container always listens on 3000; only the host side
changes:

```sh
PACKT_PORT=8460
NEXTAUTH_URL=http://192.168.1.50:8460
```

If you later put a reverse proxy in front (step 7), `NEXTAUTH_URL` becomes the proxy's URL and no
longer includes `PACKT_PORT`.

### 4d. Maps and cover images (optional)

Packt runs without these, with reduced features:

| Variable                   | Get it from                                                                           | Without it                                                |
| -------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `MAPBOX_ACCESS_TOKEN`      | <https://account.mapbox.com/access-tokens/> (free tier; default public token is fine) | No place search/geocoding, routes, or static map previews |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Same token as above                                                                   | Map tab shows no map                                      |
| `UNSPLASH_ACCESS_KEY`      | <https://unsplash.com/developers> → New Application → "Access Key"                    | Trip cover-image search returns an error                  |

`NEXT_PUBLIC_MAPBOX_TOKEN` is compiled into the web app **when the image is built**. If you add or
change it later, rebuild with `docker compose up -d --build`. The other keys only need a restart
(`docker compose up -d`).

### 4e. Data and source locations (optional)

| Variable         | Default  | Set it when                                                                                            |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `PACKT_DATA_DIR` | `./data` | You want the database and uploads somewhere else, e.g. `/srv/packt` on a disk your backups cover       |
| `PACKT_SRC_DIR`  | `.`      | Your `docker-compose.yml` lives outside the cloned repo — point it at the clone, e.g. `/srv/src/packt` |

Relative paths resolve against the folder containing `docker-compose.yml`, so use absolute paths
whenever the compose file isn't inside the clone.

### Finished `.env` example

```sh
NEXTAUTH_SECRET=3q2+7w8X...generated...==
NEXTAUTH_URL=http://192.168.1.50:3000
PACKT_PORT=3000
PACKT_DATA_DIR=./data
PACKT_SRC_DIR=.
ALLOW_SIGNUP=true
MAPBOX_ACCESS_TOKEN=pk.eyJ1Ijoi...
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ijoi...
UNSPLASH_ACCESS_KEY=
```

Sanity-check what Compose will use (prints the resolved config; errors here mean `.env` has a problem):

```sh
docker compose config
```

---

## 5. Build and start

```sh
docker compose up -d --build
```

What happens:

1. Docker builds two images from the `Dockerfile` — the app (`runner` target, tagged
   `packt-app:local`) and the one-shot tools image (`tools` target, tagged `packt-migrate:local`). The first build downloads dependencies and compiles the app; expect **5–15
   minutes** depending on the machine. Later builds reuse the cache and are faster.
2. `db` starts and waits until PostgreSQL accepts connections.
3. `migrate` pushes the database schema and exits.
4. `app` starts once `migrate` has succeeded.

Check status:

```sh
docker compose ps -a
```

Healthy output looks like this:

```
SERVICE   STATUS
app       Up 10 seconds
db        Up 30 seconds (healthy)
migrate   Exited (0) 12 seconds ago
```

`migrate` showing **Exited (0)** is correct — it's a one-shot job. Follow the app logs with
`docker compose logs -f app` (Ctrl+C to stop following); a line containing `Ready` means it's serving.

---

## 6. First login

1. Open your `NEXTAUTH_URL` in a browser. You'll land on the sign-in page.
2. Go to **Sign up** (`/sign-up`) and create your account (password: 8+ characters).
3. Create accounts for anyone else who'll use this instance.
4. Close registration so the sign-up form rejects new accounts: set `ALLOW_SIGNUP=false` in `.env`, then apply it:

   ```sh
   docker compose up -d
   ```

### Optional: demo data

To explore with sample trips instead of starting empty:

```sh
docker compose run --rm migrate npm run db:seed
```

Then sign in as `demo@packt.local` / `demo1234`. Two more accounts (`alex@packt.local`,
`sam@packt.local`, same password) are seeded alongside it — see [dev-seed-data.md](./dev-seed-data.md).
Skip this on an instance you share with others, or delete the demo accounts afterwards — the demo
password is public.

---

## 7. HTTPS and reverse proxies (optional)

Packt serves plain HTTP. To reach it over HTTPS or from outside your network, put any reverse proxy in
front of it (Caddy, nginx, Traefik, your router or NAS's built-in proxy, Cloudflare Tunnel, …):

1. Point the proxy at `http://<host-ip>:<PACKT_PORT>`.
2. Make sure it forwards the original `Host` header and sets `X-Forwarded-Proto` (most proxies do by
   default).
3. Set `NEXTAUTH_URL` in `.env` to the public URL, e.g. `https://packt.example.com`.
4. Apply: `docker compose up -d`.

If the proxy runs on the same host, you can stop publishing the port to the rest of the network by
changing the `ports` line in `docker-compose.yml` to `"127.0.0.1:${PACKT_PORT:-3000}:3000"`.

Example with Caddy (automatic HTTPS):

```
packt.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

---

## 8. Updating

```sh
cd packt
git pull
docker compose build
docker compose up -d
```

The schema push runs again automatically. Your data and uploads live in `PACKT_DATA_DIR` and aren't
touched. Back up first if the update is large (step 9).

Build before redeploying: the images are built locally, so a tool that only redeploys the stack
(without a build step) keeps running the old images.

---

## 9. Backup and restore

Run these from the folder containing `docker-compose.yml`. The examples assume the default
`PACKT_DATA_DIR=./data`; substitute your path if you changed it.

> **Don't back up the database by copying or archiving `pgdata/` while it runs.** PostgreSQL writes
> to those files continuously, so a copy taken mid-write can be corrupt and unrestorable. Back up the
> database with `pg_dump` as below, and keep that dump. If your host backup job archives
> `PACKT_DATA_DIR`, schedule the dump before it and treat the dump as the real database backup.

**Back up the database** (compressed custom-format dump):

```sh
docker compose exec -T db pg_dump -U packt -d packt -Fc > packt-db-$(date +%F).dump
```

**Back up uploads** (plain files; safe to archive while running):

```sh
tar czf packt-storage-$(date +%F).tgz -C data/storage .
```

**Restore** (onto a fresh install, after step 5 has run once):

```sh
docker compose stop app
docker compose exec -T db pg_restore -U packt -d packt --clean --if-exists < packt-db-YYYY-MM-DD.dump
rm -rf data/storage/* && tar xzf packt-storage-YYYY-MM-DD.tgz -C data/storage
docker compose start app
```

`--clean --if-exists` drops and recreates each object from the dump, so the restore works on a
database the schema push has already populated.

---

## 10. Building on another machine

If the host can't build the image (not enough memory, or it's slow), build on another computer and
copy the images over. Use `--platform` to match the host's CPU (`linux/amd64` for Intel/AMD,
`linux/arm64` for ARM):

```sh
# On the build machine, in the packt folder with your .env in place
docker buildx build --platform linux/amd64 --target runner \
  --build-arg NEXT_PUBLIC_MAPBOX_TOKEN="$(grep ^NEXT_PUBLIC_MAPBOX_TOKEN= .env | cut -d= -f2-)" \
  -t packt-app:local --load .
docker buildx build --platform linux/amd64 --target tools -t packt-migrate:local --load .
docker save packt-app:local packt-migrate:local | gzip > packt-images.tgz
```

Copy `packt-images.tgz` to the host, then on the host (next to `docker-compose.yml`, with your
configuration in place):

```sh
gunzip -c packt-images.tgz | docker load
docker compose up -d --no-build
```

The tags `packt-app:local` and `packt-migrate:local` are the image names `docker-compose.yml` uses.

---

## 11. Troubleshooting

| Symptom                                                            | Fix                                                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required variable NEXTAUTH_SECRET is missing a value`             | `.env` is missing, not in the same folder as `docker-compose.yml`, or the secret is empty (or not set in your stack tool's environment). Redo step 4a.                  |
| Build fails with `unable to prepare context` / path not found      | `docker-compose.yml` lives outside the clone. Set `PACKT_SRC_DIR` to the clone's absolute path (step 4e).                                                               |
| `app` never starts; `migrate` shows `Exited (1)`                   | Run `docker compose logs migrate`. A schema change that could lose data needs confirmation — run `docker compose run --rm migrate` in a terminal and answer the prompt. |
| Build stops with `Killed` or exit code 137                         | Out of memory during the build. Free memory or build elsewhere (step 10).                                                                                               |
| `port is already allocated`                                        | Change `PACKT_PORT` (and the port in `NEXTAUTH_URL`), then `docker compose up -d`.                                                                                      |
| After signing in you're sent to `localhost`, or sign-in loops back | `NEXTAUTH_URL` doesn't match the address in your browser. Fix it (step 4b) and `docker compose up -d`.                                                                  |
| Map tab is empty                                                   | `NEXT_PUBLIC_MAPBOX_TOKEN` was blank at build time. Set it and rebuild: `docker compose up -d --build`.                                                                 |
| Cover-image search errors                                          | `UNSPLASH_ACCESS_KEY` is blank or invalid.                                                                                                                              |
| `EACCES` / `EPERM` errors when uploading                           | The app can't write to `PACKT_DATA_DIR/storage`. Only happens if you run the app as a non-root `user:`. See [Storage](../README.md#storage) in the README.              |
| Need to log everyone out                                           | Generate a new `NEXTAUTH_SECRET` (step 4a) and `docker compose up -d`.                                                                                                  |

Logs for any service: `docker compose logs <service>` (`app`, `db`, or `migrate`).

---

## 12. Stopping and uninstalling

```sh
docker compose stop        # stop, keep everything
docker compose down        # remove containers, keep data
```

Data lives in `PACKT_DATA_DIR` on the host, so `docker compose down -v` doesn't delete it. To remove
everything, run `docker compose down` and then delete that folder — irreversible.
