# How to Install Packt on Your Synology NAS

This guide walks through self-hosting [Packt](../README.md) on a Synology NAS using **Container
Manager**. A prebuilt image publishes to GHCR on every release, so this only needs the
`docker-compose.yml` and `.env` files on the NAS — no repo clone, no local build.

**Prerequisites:**

- DSM 7.2 or later
- **Container Manager** installed (Package Center → search "Container Manager")
- SSH access to the NAS

---

## Step 1 — Enable SSH

**Control Panel → Terminal & SNMP → check "Enable SSH service" → Apply.**

Note the port (default `22`) — you'll need it to connect.

---

## Step 2 — Create the project folder and download the compose file

Connect over SSH from your computer's terminal:

```sh
ssh your-user@your-nas-ip
```

Create a folder under `docker` and download `docker-compose.yml` into it:

```sh
mkdir -p /volume1/docker/packt
cd /volume1/docker/packt
curl -O https://raw.githubusercontent.com/sdesmond/packt/main/docker-compose.yml
```

---

## Step 3 — Create the environment file and secret

Still in `/volume1/docker/packt`:

```sh
curl -o .env https://raw.githubusercontent.com/sdesmond/packt/main/.env.example
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env
```

This generates the session-signing secret Packt requires at startup. If you ever need to force
all users to sign back in, re-run the `openssl` command, replace the value in `.env`, and restart
the container.

---

## Step 4 — Open Container Manager and create the project

1. Open **Container Manager** from the DSM main menu.
2. Go to **Project** in the left sidebar → **Create**.
3. **Project name:** `packt`
4. **Path:** browse to the `docker/packt` folder you created in Step 2.
5. Container Manager detects `docker-compose.yml` automatically and shows **Source: Use existing
   docker-compose.yml**. Leave that selected.
6. Click **Next**.

---

## Step 5 — Pull and run

1. Review the compose file summary on the confirmation screen — you should see two services,
   `db` and `app`.
2. Click **Done** to start the project.

This pulls `ghcr.io/sdesmond/packt:latest` rather than building — it should finish in well under a
minute. Watch progress under **Project → packt → Container**.

> **Note:** the `app` container pushes the current Drizzle schema to `db` automatically on its
> first boot — this is an intentional pre-release workflow, not a bug.

> **If the pull fails with an authentication/permission error,** the GHCR image may not be public
> yet — check [ghcr.io/sdesmond/packt](https://github.com/sdesmond/packt/pkgs/container/packt) or
> ask the maintainer.

---

## Step 6 — Verify it's running

In **Container Manager → Container**, both `packt-db-1` and `packt-app-1` should show a green
**Running** status. If `packt-app-1` is restarting in a loop, check its logs for a "missing X env
var" error — that means a value in `.env` from Step 3 wasn't picked up; confirm `.env` sits next
to `docker-compose.yml` and re-create the project.

---

## Step 7 — Open Packt

Visit `http://your-nas-ip:3000`.

- Sign in with the demo account (`demo@packt.local` / `demo1234`) if you seeded demo data, or
- Sign up for your own account — `ALLOW_SIGNUP` defaults to `true` in `docker-compose.yml`. Set
  it to `false` and recreate the project once you've created your account if you don't want the
  sign-up page exposed publicly.

### (Optional) Seed demo data

```sh
cd /volume1/docker/packt
docker compose exec app npm run db:seed
```

---

## Where uploads are stored

Documents and cover images persist in the `packt-storage` Docker volume — see
[Storage](../README.md#storage) in the README for how the storage adapter works and how to switch
providers. To inspect the files directly, find the volume's path with:

```sh
docker volume inspect packt_packt-storage
```

---

## Updating Packt

Over SSH, in `/volume1/docker/packt`:

```sh
docker compose pull
docker compose up -d
```

This pulls the latest published image and recreates the `app` container. Your database and
uploaded files are untouched — they live in the `packt-pgdata` and `packt-storage` volumes, not in
the container.

---

## Troubleshooting

- **Port 3000 already in use** — edit the `ports` line under the `app` service in
  `docker-compose.yml` (e.g. `"3001:3000"`), then recreate the project.
- **Reverse proxy / HTTPS** — put Packt behind DSM's built-in reverse proxy (**Control Panel →
  Login Portal → Advanced → Reverse Proxy**) pointing at `localhost:3000`, and set `NEXTAUTH_URL`
  in `.env` to your public HTTPS URL before recreating.
- **Permission errors writing uploads** — see the PUID/GID note in
  [Storage](../README.md#storage); this only applies if you swap the named `packt-storage` volume
  for a host bind mount.
