# Self-hosting Packt with Docker

This guide takes you from an empty machine to a running Packt instance. It assumes you're comfortable
running commands in a terminal on the machine that will host Packt. Any host that runs Docker works —
a home server, a NAS, a VPS, or your own computer.

---

## 1. What you'll be running

`docker-compose.yml` defines three services:

| Service   | What it does                                                                  | Lifetime                          |
| --------- | ----------------------------------------------------------------------------- | --------------------------------- |
| `db`      | PostgreSQL 16 — stores users, trips, and itineraries                          | Always running                    |
| `migrate` | Pushes the database schema, then exits. Also used to load optional demo data. | Runs once per `docker compose up` |
| `app`     | The Packt web app (Next.js), listening on port 3000 inside the container      | Always running                    |

Data lives in two named Docker volumes, so it survives rebuilds and upgrades:

- `packt-pgdata` — the database
- `packt-storage` — uploaded documents and trip cover images

> Compose prefixes volume names with the project name, which defaults to the folder name. If you clone
> into `packt/`, the real names are `packt_packt-pgdata` and `packt_packt-storage`.

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

## 4. Configure `.env`

Compose reads its settings from a file named `.env` in this folder. Start from the Docker template:

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

`PACKT_PORT` is the port on the host that maps to the app. Change it if 3000 is taken — and update the
port in `NEXTAUTH_URL` to match.

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

### Finished `.env` example

```sh
NEXTAUTH_SECRET=3q2+7w8X...generated...==
NEXTAUTH_URL=http://192.168.1.50:3000
PACKT_PORT=3000
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

1. Docker builds two images from the `Dockerfile` — the app (`runner` target) and the one-shot tools
   image (`tools` target). The first build downloads dependencies and compiles the app; expect **5–15
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
docker compose up -d --build
```

The schema push runs again automatically. Your data and uploads are in volumes and aren't touched.
Back up first if the update is large (step 9).

---

## 9. Backup and restore

Run these from the `packt` folder.

**Back up the database:**

```sh
docker compose exec -T db pg_dump -U packt packt > packt-db-$(date +%F).sql
```

**Back up uploads:**

```sh
docker run --rm -v packt_packt-storage:/data -v "$PWD":/backup alpine \
  tar czf /backup/packt-storage-$(date +%F).tgz -C /data .
```

**Restore** (onto a fresh install, after step 5 has run once):

```sh
docker compose stop app
docker compose exec -T db psql -U packt -d postgres -c "DROP DATABASE packt;" -c "CREATE DATABASE packt OWNER packt;"
docker compose exec -T db psql -U packt packt < packt-db-YYYY-MM-DD.sql
docker run --rm -v packt_packt-storage:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/packt-storage-YYYY-MM-DD.tgz -C /data"
docker compose start app
```

Replace `packt_` in the volume name if your folder isn't called `packt` (see step 1).

---

## 10. Building on another machine

If the host can't build the image (not enough memory, or it's slow), build on another computer and
copy the images over. Use `--platform` to match the host's CPU (`linux/amd64` for Intel/AMD,
`linux/arm64` for ARM):

```sh
# On the build machine, in the packt folder with your .env in place
docker buildx build --platform linux/amd64 --target runner \
  --build-arg NEXT_PUBLIC_MAPBOX_TOKEN="$(grep ^NEXT_PUBLIC_MAPBOX_TOKEN= .env | cut -d= -f2-)" \
  -t packt-app --load .
docker buildx build --platform linux/amd64 --target tools -t packt-migrate --load .
docker save packt-app packt-migrate | gzip > packt-images.tgz
```

Copy `packt-images.tgz` to the host, then on the host (in the cloned `packt` folder with `.env`):

```sh
gunzip -c packt-images.tgz | docker load
docker compose up -d --no-build
```

The image names `packt-app` and `packt-migrate` match what Compose expects when the folder is named
`packt`. For a different folder name `<dir>`, tag them `<dir>-app` and `<dir>-migrate`.

---

## 11. Troubleshooting

| Symptom                                                            | Fix                                                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required variable NEXTAUTH_SECRET is missing a value`             | `.env` is missing, not in the same folder as `docker-compose.yml`, or the secret is empty. Redo step 4a.                                                                |
| `app` never starts; `migrate` shows `Exited (1)`                   | Run `docker compose logs migrate`. A schema change that could lose data needs confirmation — run `docker compose run --rm migrate` in a terminal and answer the prompt. |
| Build stops with `Killed` or exit code 137                         | Out of memory during the build. Free memory or build elsewhere (step 10).                                                                                               |
| `port is already allocated`                                        | Change `PACKT_PORT` (and the port in `NEXTAUTH_URL`), then `docker compose up -d`.                                                                                      |
| After signing in you're sent to `localhost`, or sign-in loops back | `NEXTAUTH_URL` doesn't match the address in your browser. Fix it (step 4b) and `docker compose up -d`.                                                                  |
| Map tab is empty                                                   | `NEXT_PUBLIC_MAPBOX_TOKEN` was blank at build time. Set it and rebuild: `docker compose up -d --build`.                                                                 |
| Cover-image search errors                                          | `UNSPLASH_ACCESS_KEY` is blank or invalid.                                                                                                                              |
| `EACCES` / `EPERM` errors when uploading                           | Only happens if you replaced the `packt-storage` volume with a host folder. See [Storage](../README.md#storage) in the README.                                          |
| Need to log everyone out                                           | Generate a new `NEXTAUTH_SECRET` (step 4a) and `docker compose up -d`.                                                                                                  |

Logs for any service: `docker compose logs <service>` (`app`, `db`, or `migrate`).

---

## 12. Stopping and uninstalling

```sh
docker compose stop        # stop, keep everything
docker compose down        # remove containers, keep data volumes
docker compose down -v     # remove containers AND delete all data — irreversible
```
