# check=skip=SecretsUsedInArgOrEnv
# (Parser directive; it must stay the first line.) The check flags any ARG/ENV whose name contains AUTH, so it
# misreads AUTH_TRUST_HOST=true below, a plain flag. Real secrets come from the environment at run time.
FROM node:22-alpine AS base
# Node crashes intermittently under QEMU, so npm and next build always run on the build machine's own platform;
# only the runner stage is assembled per target arch, and it runs no Node.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build-base

FROM build-base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM build-base AS builder
ARG TARGETARCH
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ is optional in the repo; ensure it exists so the runner COPY never breaks.
RUN mkdir -p public && npm run build
# The standalone output only traces what the app imports, so bundle the migrator and the two-factor reset tool
# (each with its deps) into single files.
RUN npx esbuild src/db/migrate-cli.ts --bundle --platform=node --format=esm --outfile=dist/migrate.mjs \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
RUN npx esbuild src/db/mfa-reset-cli.ts --bundle --platform=node --format=esm --outfile=dist/mfa-reset.mjs \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
# sharp is the standalone output's only native module, and the trace picked the build machine's binaries.
# Swap in the target arch's prebuilt packages, at the versions this sharp release pins.
RUN set -e; \
  arch=$(if [ "$TARGETARCH" = amd64 ]; then echo x64; else echo "$TARGETARCH"; fi); \
  rm -rf .next/standalone/node_modules/@img/sharp-*; \
  for pkg in "sharp-linuxmusl-$arch" "sharp-libvips-linuxmusl-$arch"; do \
    version=$(node -p "require('/app/node_modules/sharp/package.json').optionalDependencies['@img/$pkg']"); \
    npm pack "@img/$pkg@$version" --pack-destination /tmp; \
    tar -xzf "/tmp/img-$pkg-$version.tgz" -C /tmp; \
    mv /tmp/package ".next/standalone/node_modules/@img/$pkg"; \
  done

FROM base AS runner
WORKDIR /app
# tini reaps zombies and forwards signals; su-exec drops root to PUID:PGID after the entrypoint's setup.
RUN apk add --no-cache tini su-exec
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3550 \
  AUTH_TRUST_HOST=true \
  STORAGE_PROVIDER=local \
  STORAGE_LOCAL_ROOT_DIR=/app/storage \
  PUID=1000 \
  PGID=1000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/dist/migrate.mjs ./migrate.mjs
COPY --from=builder /app/dist/mfa-reset.mjs ./mfa-reset.mjs
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder --chmod=0755 /app/docker/entrypoint.sh ./docker/entrypoint.sh
# Next writes its image-optimization cache here at runtime, as whichever PUID the host picks.
RUN mkdir -p .next/cache && chmod 1777 .next/cache

EXPOSE 3550
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD wget -qO- http://127.0.0.1:3550/api/health | grep -q '"status":"ok"'
ENTRYPOINT ["/sbin/tini", "--", "/app/docker/entrypoint.sh"]
CMD ["node", "server.js"]
