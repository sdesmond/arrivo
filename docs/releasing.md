# Releasing Arrivo images

Self-hosted instances run the image that `.github/workflows/publish-images.yml` publishes to the
GitHub Container Registry: `ghcr.io/sdesmond/arrivo` (the `runner` target), built for `linux/amd64`
and `linux/arm64`. It applies database migrations itself on start.

## Cut a release

Bump the version on a branch and merge it through a PR, since `main` only accepts changes that passed
[CI](../.github/workflows/ci.yml), including the `docker-smoke` job that boots the image. Tag only
after the merge. The tag push starts the publish workflow, which does not wait for CI, and every
self-hosted database applies the new `drizzle/` migrations on its next update:

```sh
git switch -c release/X.Y.Z
npm version minor --no-git-tag-version   # or patch / major
git commit -am "X.Y.Z" && git push -u origin release/X.Y.Z   # open a PR and merge it
git switch main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z
```

The workflow publishes the image as `X.Y.Z`, `X.Y`, `latest` and `sha-<commit>`. The arm64 half
builds under emulation, so a release takes roughly 20–40 minutes; follow it under the repository's
**Actions** tab.

Hosts pinned to a release upgrade when they change the image tag; hosts on `latest` pick up the
release on their next pull (see [self-hosting.md](./self-hosting.md#updating)).

## Test an image before releasing

Run the workflow manually (**Actions → Publish images → Run workflow**) on any branch. A manual run
publishes only `sha-<commit>` tags, never `latest` or a version, so a host can try it with
`ghcr.io/sdesmond/arrivo:sha-<commit>` without affecting anyone on `latest`.

## Access

The package is public, so hosts pull it without logging in. It links to this repository through
the `org.opencontainers.image.source` label, which shows the source and README on the package page.
