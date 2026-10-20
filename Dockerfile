FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Full toolchain (drizzle-kit, tsx) for one-shot migrations and seeding — never serves traffic.
FROM node:22-alpine AS tools
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npx", "drizzle-kit", "migrate"]

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ is optional in the repo; ensure it exists so the runner COPY never breaks.
RUN mkdir -p public && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
