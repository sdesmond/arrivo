# Building Arrivo from source

Use this to run unreleased code or your own changes instead of the published image. Configuration,
updates and backups work as in [self-hosting.md](./self-hosting.md).

Needs **git**, about **4 GB free memory** during the build, about 3 GB of disk for build cache, and
internet access while building (npm packages, Alpine packages and Google Fonts). The first build takes 5–15 minutes.

```sh
git clone https://github.com/sdesmond/arrivo.git && cd arrivo
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Edit `docker-compose.yml` first if you need different settings (see self-hosting.md).
`docker-compose.build.yml` adds the build settings and tags the image `arrivo-app:local`, so it never
overwrites the published one. Pass the same `-f` pair to every `docker compose` command on this
stack. To update, run `git pull` and then the `up -d --build` command again.

A build that stops with `Killed` or exit code 137 ran out of memory.

Demo data (`npm run db:seed`) is a development tool and isn't in the image; see
[dev-seed-data.md](./dev-seed-data.md) for running it from a dev setup.

Publishing releases: see [releasing.md](./releasing.md).
