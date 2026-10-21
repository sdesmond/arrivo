---
name: project-native-arm64-runners
description: Deferred change — when the repo goes public, switch publish-images.yml to native arm64 runners (per-arch jobs + manifest merge); full workflow included
metadata:
  type: project
---

When sdesmond/arrivo goes public, switch `.github/workflows/publish-images.yml` from one QEMU multi-arch job to a native job per arch plus a merge job. `ubuntu-24.04-arm` hosted runners are free only for public repos, which is why this waits.

**Why:** the v0.4.0 publish (run 39492276296, 2026-10-20) hung 90 min after Node crashed under QEMU (`qemu: uncaught target signal 4 (Illegal instruction)`) in the arm64 `npm ci`. The interim fix (branch `ci/cross-build-arm64`) runs `deps`/`builder` on `$BUILDPLATFORM` and swaps in the target arch's `@img/sharp-*`, so only the runner's `apk add`/`mkdir` still run under QEMU. Native runners remove QEMU entirely and keep the Dockerfile unchanged (`$BUILDPLATFORM` == target on each runner).

**How to apply:** replace the `publish` job with the jobs below (keep `on:`, `permissions:`, `concurrency:`), then update `scripts/docker-config.test.mjs` "builds the single app image for amd64 and arm64": drop the `platforms: linux/amd64,linux/arm64` count and assert the `ubuntu-24.04-arm` matrix entry and `imagetools create` instead. Verify with a manual `workflow_dispatch` run (pushes only `sha-<commit>`), then `docker buildx imagetools inspect ghcr.io/sdesmond/arrivo:sha-<commit>` shows both platforms.

```yaml
jobs:
  build:
    strategy:
      fail-fast: true
      matrix:
        include:
          - arch: amd64
            runner: ubuntu-24.04
          - arch: arm64
            runner: ubuntu-24.04-arm
    runs-on: ${{ matrix.runner }}
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Labels only; tags are applied once both digests exist, in the merge job.
      - id: app-meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/sdesmond/arrivo

      - id: build
        name: Build and push app image by digest
        uses: docker/build-push-action@v6
        with:
          context: .
          target: runner
          platforms: linux/${{ matrix.arch }}
          labels: ${{ steps.app-meta.outputs.labels }}
          outputs: type=image,name=ghcr.io/sdesmond/arrivo,push-by-digest=true,name-canonical=true,push=true
          cache-from: type=gha,scope=runner-${{ matrix.arch }}
          cache-to: type=gha,mode=max,scope=runner-${{ matrix.arch }}

      - name: Export digest
        run: |
          mkdir -p "$RUNNER_TEMP/digests"
          digest="${{ steps.build.outputs.digest }}"
          touch "$RUNNER_TEMP/digests/${digest#sha256:}"

      - uses: actions/upload-artifact@v4
        with:
          name: digests-${{ matrix.arch }}
          path: ${{ runner.temp }}/digests/*
          if-no-files-found: error
          retention-days: 1

  merge:
    needs: build
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: ${{ runner.temp }}/digests
          pattern: digests-*
          merge-multiple: true

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: app-meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/sdesmond/arrivo
          flavor: latest=false
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') && !contains(github.ref_name, '-') }}
            type=sha,prefix=sha-

      - name: Create multi-arch manifest
        working-directory: ${{ runner.temp }}/digests
        run: |
          docker buildx imagetools create \
            $(jq -cr '.tags | map("-t " + .) | join(" ")' <<< "$DOCKER_METADATA_OUTPUT_JSON") \
            $(printf 'ghcr.io/sdesmond/arrivo@sha256:%s ' *)

      - name: Inspect
        run: docker buildx imagetools inspect ghcr.io/sdesmond/arrivo:${{ steps.app-meta.outputs.version }}
```

Once this lands, the `--platform=$BUILDPLATFORM` cross-build and sharp swap in the Dockerfile become optional; keep them (harmless natively, and they still help local `docker buildx --platform` builds).
