# How to Install Packt on Your Synology NAS

This guide walks through self-hosting [Packt](../README.md) on a Synology NAS using **Container
Manager**. Packt has no published container image — Container Manager builds it from source on
the NAS, so the guide starts by getting the repository onto the NAS over SSH.

**Prerequisites:**

- DSM 7.2 or later
- **Container Manager** installed (Package Center → search "Container Manager")
- **Git Server** installed (Package Center → search "Git Server") — provides the `git` command
  used in Step 2
- SSH access to the NAS

---

## Step 1 — Enable SSH

**Control Panel → Terminal & SNMP → check "Enable SSH service" → Apply.**

Note the port (default `22`) — you'll need it to connect.

---

## Step 2 — Create the project folder and clone Packt

Connect over SSH from your computer's terminal:

```sh
ssh your-user@your-nas-ip
```

Create a folder under `docker` and clone the repository into it:

```sh
mkdir -p /volume1/docker/packt
cd /volume1/docker/packt
git clone https://github.com/sdesmond/packt.git .
```

> **Note:** the trailing `.` clones directly into `packt/` instead of creating a nested
> `packt/packt/` folder — Container Manager needs `docker-compose.yml` at the folder's top level.

---

## Step 3 — Create the environment file and secret

Still in `/volume1/docker/packt`:

```sh
cp .env.example .env
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

## Step 5 — Build and run

1. Review the compose file summary on the confirmation screen — you should see two services,
   `db` and `app`.
2. Click **Done** to build and start the project.

The first build takes a few minutes (Container Manager runs `npm run build` inside the image).
Watch progress under **Project → packt → Build Logs**.

> **Note:** the `app` container pushes the current Drizzle schema to `db` automatically on its
> first boot — this is an intentional pre-release workflow, not a bug.

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
  it to `false` and rebuild once you've created your account if you don't want the sign-up page
  exposed publicly.

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

```sh
cd /volume1/docker/packt
git pull
```

Then in Container Manager: **Project → packt → Action → Build** to rebuild the image with the new
source, followed by **Action → Start**. Your database and uploaded files are untouched — they live
in the `packt-pgdata` and `packt-storage` volumes, not in the container.

---

## Troubleshooting

- **Port 3000 already in use** — edit the `ports` line under the `app` service in
  `docker-compose.yml` (e.g. `"3001:3000"`), then rebuild the project.
- **Reverse proxy / HTTPS** — put Packt behind DSM's built-in reverse proxy (**Control Panel →
  Login Portal → Advanced → Reverse Proxy**) pointing at `localhost:3000`, and set `NEXTAUTH_URL`
  in `.env` to your public HTTPS URL before rebuilding.
- **Permission errors writing uploads** — see the PUID/GID note in
  [Storage](../README.md#storage); this only applies if you swap the named `packt-storage` volume
  for a host bind mount.
