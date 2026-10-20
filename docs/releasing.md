# Releasing Arrivo images

Self-hosted instances run the images that `.github/workflows/publish-images.yml` publishes to the
GitHub Container Registry:

- `ghcr.io/sdesmond/arrivo` — the web app (`runner` target)
- `ghcr.io/sdesmond/arrivo-migrate` — the migration / seed tools (`tools` target)

Both are built for `linux/amd64` and `linux/arm64`.

## Cut a release

From an up-to-date `main` with a clean working tree and a green [CI](../.github/workflows/ci.yml) run on its latest commit. The publish workflow does not wait for CI, and the `arrivo-migrate` image applies the `drizzle/` migrations to every self-hosted database on its next update:

```sh
npm version minor   # or patch / major — bumps package.json and creates the vX.Y.Z tag
git push --follow-tags
```

The tag push starts the workflow. It publishes each image as `X.Y.Z`, `X.Y`, `latest`, and
`sha-<commit>`. The arm64 half builds under emulation, so a release takes roughly 20–40 minutes;
follow it under the repository's **Actions** tab.

Hosts pinned to a version upgrade when their `VERSION` changes; hosts on `latest` pick up the
release on their next `docker compose pull` (see [self-hosting.md](./self-hosting.md#updating)).

## Test an image before releasing

Run the workflow manually (**Actions → Publish images → Run workflow**) on any branch. A manual run
publishes only `sha-<commit>` tags — never `latest` or a version — so a host can try it with
`VERSION=sha-<commit>` without affecting anyone on `latest`.

## Access

The packages are public, so hosts pull them without logging in. They link to this repository through
the `org.opencontainers.image.source` label, which shows the source and README on each package page.
