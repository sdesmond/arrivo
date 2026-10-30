# Self-hosting Arrivo

Arrivo runs as two containers: the app (`ghcr.io/sdesmond/arrivo`) and PostgreSQL 17. The app
prepares its own database on every start, so there is nothing else to run. Any host with Docker
Engine and Compose v2 works, on amd64 or ARM64: a Linux server or VM, a NAS, a Raspberry Pi.

Everything is in one file, [`docker-compose.yml`](../docker-compose.yml). There is no `.env` file
and no secret to generate.

## Quick start (command line)

```sh
mkdir -p ~/arrivo && cd ~/arrivo
curl -fsSLO https://raw.githubusercontent.com/sdesmond/arrivo/main/docker-compose.yml
docker compose up -d
```

Open `http://<your-server>:4850`. Fresh installs show **Welcome to Arrivo!** and guide you through creating an admin account with a username, name, password, and password confirmation. After creation, Arrivo signs you in and permanently closes first-run setup. Later visits show sign-in without a signup link.

Before starting, check `PUID` and `PGID` in the file match your user (`id` prints them). They decide
who owns uploaded files in `./data/storage`.

## Container manager UIs (Portainer, Dockge, NAS apps)

Any tool that deploys a compose file works the same way, whether that's Portainer, Dockge or the
container app built into a NAS.

1. On the host, create a folder for Arrivo, e.g. `/srv/arrivo`, with `pgdata` and `storage`
   folders inside it.
2. Find the IDs of the user that should own uploaded files: run `id` on the host, and note `uid`
   and `gid`. Many NAS systems use IDs other than `1000`.
3. Create a new stack or project and paste [`docker-compose.yml`](../docker-compose.yml) into it.
4. Change:
   - `./data/pgdata` and `./data/storage` to the absolute paths from step 1, e.g.
     `/srv/arrivo/pgdata` and `/srv/arrivo/storage`. Many of these tools don't resolve relative
     paths against your folder.
   - `PUID` and `PGID` to the values from step 2.
5. Deploy it. The images download and both containers start.
6. Open `http://<your-server>:4850` and create your account.

## Configuration

All settings are environment variables on the `app` service. After you change one, run
`docker compose up -d`, or redeploy the stack in your container manager.

| Variable              | Default          | Purpose                                                                                                                                  |
| --------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | the bundled `db` | Postgres connection. If you change `POSTGRES_PASSWORD` on `db`, change it here too                                                       |
| `PUID` / `PGID`       | `1000` / `1000`  | Owner of `./data/storage` on the host. The app re-owns that folder to these IDs on start                                                 |
| `MAPBOX_ACCESS_TOKEN` | —                | Public (`pk.`) [Mapbox token](https://account.mapbox.com/access-tokens/) for place search, routes, map previews and the Map tab          |
| `MAPBOX_PUBLIC_TOKEN` | the token above  | Optional separate token for browsers only, so you can URL-restrict it (a restricted token breaks server-side calls)                      |
| `UNSPLASH_ACCESS_KEY` | —                | [Unsplash](https://unsplash.com/developers) access key for cover-image search                                                            |
| `NEXTAUTH_SECRET`     | generated        | Signs sign-in sessions. Leave it unset: one is generated on first start and kept in `storage/.arrivo/auth-secret`                        |
| `DATA_ENCRYPTION_KEY` | generated        | Encrypts passport numbers, Known Traveler Numbers and two-factor secrets. Leave it unset: one is generated in `storage/.arrivo/data-key` |
| `NEXTAUTH_URL`        | from the request | Only needed if sign-in redirects go to the wrong address, e.g. behind a proxy that rewrites `Host`                                       |

Without the Mapbox and Unsplash keys Arrivo still runs; those features are just unavailable.
Browsers receive the Mapbox token, so never use a secret (`sk.`) token.

To use a different host port, change the left number in `"4850:4850"`, e.g. `"8080:4850"`. To run a
fixed release instead of the newest, change the image tag, e.g. `ghcr.io/sdesmond/arrivo:0.4.1`. Then
upgrades happen only when you change it.

> On Docker Desktop for Windows or macOS, PostgreSQL can fail to start on a host-folder data
> directory. Use a Linux host or NAS, or on Windows keep the folder inside the WSL 2 filesystem.

## HTTPS

Arrivo serves plain HTTP. For HTTPS or access from outside your network, put a reverse proxy in front.
That can be Caddy, nginx, Traefik, Nginx Proxy Manager, Cloudflare Tunnel or a reverse proxy built
into your NAS. Forward to port 4850 and pass the `Host` header and `X-Forwarded-Proto`. With
Caddy:

```
arrivo.example.com {
    reverse_proxy 127.0.0.1:4850
}
```

If the proxy runs on the same host, change the port line to `"127.0.0.1:4850:4850"` so the app
isn't reachable around it.

## Account security

- **Failed sign-ins**: five wrong passwords for one username within 15 minutes lock that username for 15 minutes
  on browsers it hasn't signed in from before; each repeat lockout doubles, up to an hour. One address is
  also limited to 30 failures per 15 minutes across all accounts. That per-address limit needs the reverse
  proxy to send `X-Forwarded-For` (Caddy and most proxies do); without a proxy only the per-username limit
  applies. Set `AUTH_MAX_FAILURES` or `AUTH_IP_MAX_FAILURES` to change the thresholds.
- **Your browsers**: every browser that signs in successfully is recognized, and failed sign-ins from
  anywhere else never lock its owner out there (it gets its own five-guess limit instead). Users see these
  under **Profile → Security** and can remove any they don't recognize, which also signs that browser out.
- **Keep me signed in**: ticked at sign-in, a session lasts 30 days from the last visit; unticked, it ends
  12 hours after signing in.
- **Two-factor authentication**: each user can turn it on under **Profile → Security** with any
  authenticator app, and gets ten one-time recovery codes. Ticking **Don't ask for a code on this browser
  for 30 days** at the code prompt skips the code there; anyone with that browser and the password can then
  sign in without a code until the browser is removed or the user signs out all devices. If someone loses
  both their phone and their codes, see [Recovering an account](#recovering-an-account).
- **Signing out other devices**: changing a password, turning two-factor on or off, or choosing **Sign out
  all devices** under **Profile → Security** ends that user's sessions everywhere and forgets their
  browsers.

### Recovering an account

How to get back in depends on who lost access.

#### A regular user forgot their password

An admin opens **Admin → Users**, chooses **Reset password** on that user, and sends them the one-hour link it
shows. Nothing changes until the user opens the link and picks a new password. Finishing signs them out
everywhere and forgets their trusted browsers. Their two-factor setup stays as it was, so they still need
their authenticator app or a recovery code to sign in afterwards.

#### A regular user lost both their phone and their recovery codes

Arrivo has no recovery path for this yet: the password reset above keeps two-factor on, and the server command
below only recovers admin accounts.

#### An admin lost their password, phone or recovery codes

An admin can't use **Reset password** on themselves, so recover them from the server. Run this as whoever
operates the container (anyone who can `docker exec` into it):

```
docker exec arrivo node /app/admin-recovery.mjs their-username https://arrivo.example.com
```

Use the address people open Arrivo at as the second argument. The command needs only `DATABASE_URL`, which the
container already has. It prints a one-hour link and changes nothing until that admin opens it, picks a new
password, scans a new authenticator code and saves the new recovery codes. Finishing signs the account out
everywhere and invalidates any other open reset or recovery link for it. The command refuses anything that is
not a completed admin account, and Activity records the recovery.

The command has no sign-in of its own. Access to the server and its database is the authority, so keep
`docker exec` access to people you would trust with the database.

## Updating

```sh
docker compose pull && docker compose up -d
```

In a container manager, use its action that pulls the latest image and redeploys (in Portainer,
**Update the stack** with **Re-pull image** enabled). A plain restart or redeploy keeps the old image.

The app applies any database changes as it starts. Take a backup first when upgrading across
releases (see below).

Accounts sign in with a username. If you're updating from a release where they signed in with an email,
each account's username is the part of its email before the `@` (with `-2`, `-3`… added where two
collide), and people find each other to share trips by username. Let your users know; anyone can change
their username under **Profile → Identity**.

## Backup and restore

Back up the database with `pg_dump`, and the `storage` folder as files. **Never copy `pgdata` while
it runs**, because a mid-write copy can be unrestorable. If a scheduled host or NAS backup job
covers the folder, run the dump before it.

```sh
docker exec arrivo-db pg_dump -U arrivo -d arrivo -Fc > arrivo-db-$(date +%F).dump
tar czf arrivo-storage-$(date +%F).tgz -C data/storage .
```

The `storage` backup includes `.arrivo/auth-secret` and `.arrivo/data-key`. Without the auth secret, a
restored install signs everyone out, but no data is lost. Without the data key, saved passport and Known
Traveler Numbers can't be read and two-factor sign-in stops working, so always back the two up together.

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

| Symptom                                       | Fix                                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arrivo` keeps restarting                     | Read `docker logs arrivo`. A failed database update or wrong `DATABASE_URL` stops it before it serves pages                                                       |
| `manifest unknown` when pulling               | The image tag names a release that doesn't exist                                                                                                                  |
| `port is already allocated`                   | Change the left number in the `ports` line                                                                                                                        |
| Sign-in redirects to `localhost` or loops     | Set `NEXTAUTH_URL` to the exact address you open, port included                                                                                                   |
| Everyone was signed out after a restore/move  | `storage/.arrivo/auth-secret` wasn't carried over; sign in again                                                                                                  |
| An admin is locked out of two-factor sign-in  | See [Recovering an account](#recovering-an-account); `docker exec arrivo node /app/admin-recovery.mjs their-username https://your-address` prints a recovery link |
| Someone doesn't know their username           | `docker exec arrivo-db psql -U arrivo -d arrivo -c "select name, username from users"` lists every account                                                        |
| Map tab is empty                              | `MAPBOX_ACCESS_TOKEN` (or `MAPBOX_PUBLIC_TOKEN`, if set) is blank or invalid                                                                                      |
| `EACCES` / `permission denied` when uploading | `PUID`/`PGID` don't match a user that can write the `storage` folder                                                                                              |

## Uninstalling

`docker compose down` removes the containers. Data stays in `./data` (even with `-v`); delete that
folder to remove it for good.

To run unreleased code, see [building-from-source.md](./building-from-source.md).
