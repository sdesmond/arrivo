FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy drizzle migrations so entrypoint can run them
COPY --from=builder /app/drizzle ./drizzle

# Copy the node_modules drizzle-kit and postgres need at runtime
COPY --from=builder /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder /app/node_modules/postgres ./node_modules/postgres

# Copy drizzle config (needed by drizzle-kit migrate)
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
