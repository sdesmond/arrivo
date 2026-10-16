# Building Arrivo from source

Use this to run unreleased code or your own changes instead of the published images. Configuration,
updates, and backups work as in [self-hosting.md](./self-hosting.md).

Needs **git**, about **4 GB free memory** during the build, about 3 GB of disk for build cache, and
internet access while building (npm packages and Google Fonts). The first build takes 5–15 minutes.

```sh
git clone https://github.com/sdesmond/arrivo.git && cd arrivo
cp .env.docker.example .env   # then set the variables, see self-hosting.md
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

`docker-compose.build.yml` adds the build settings and tags the images `arrivo-app:local` and
`arrivo-migrate:local`, so they never overwrite published ones. Pass the same `-f` pair to every
`docker compose` command on this stack. To update: `git pull`, then rerun the `up -d --build` command.

A build that stops with `Killed` or exit code 137 ran out of memory.

Publishing releases: see [releasing.md](./releasing.md).
