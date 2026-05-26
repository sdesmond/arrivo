# Packt

A travel itinerary planning app built with Next.js (App Router), TypeScript, Tailwind CSS v4, PostgreSQL, and Drizzle ORM.

## Quick start

```bash
npm run setup:dev
npm run dev
```

Sign in at [http://localhost:3000](http://localhost:3000) with `demo@packt.local` / `demo1234`.

`npm run setup:dev` installs dependencies, restores the repo's BMad install from `_bmad/_config/manifest.yaml`, configures `.env`, links the shared AI tools folders, prepares the dev and E2E databases, applies the schema, seeds demo data, and installs the Playwright Chromium browser.

To force a database mode:

```bash
npm run setup:dev -- --db=docker
npm run setup:dev -- --db=local
```

Native wrappers are also available as `./setup-dev.sh [auto|docker|local]` and `./setup-dev.ps1 -Db auto|docker|local`.

For prerequisites, manual fallback steps, and reset instructions see **[SETUP.md](./SETUP.md)**.
For the current Drizzle schema workflow and the planned migration cutover, see **[docs/drizzle-workflow.md](./docs/drizzle-workflow.md)**.

## AI Skills & Agents Setup

AI skills are at `.agents/skills`. `npm run setup:dev` also configures the `.claude/skills` and `.claude/agents` links described in [ai-tools-setup.md](./ai-tools-setup/ai-tools-setup.md) without duplicating files.

## Self-hosting

**Prerequisites:** Docker, Docker Compose, `openssl`

1. Copy the env file and fill in a secret:

   ```sh
   cp .env.example .env
   echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)" >> .env
   ```

2. Build and start:

   ```sh
   docker compose up -d --build
   ```

   The app pushes the current Drizzle schema automatically at boot.
   This is an intentional pre-release workflow and will switch to explicit tracked migrations before general production rollout.

3. (Optional) Seed demo data:

   ```sh
   docker compose exec app npm run db:seed
   ```

   Signs in as `demo@packt.local` / `demo1234`.

4. Open [http://localhost:3000](http://localhost:3000).

**Session revocation:** this app uses JWT sessions. To invalidate all active sessions, rotate `NEXTAUTH_SECRET` and restart the container.

## Tech stack

- [Next.js 16](https://nextjs.org/docs) — App Router, Server Components, Server Actions
- [NextAuth v5](https://authjs.dev) — Credentials provider, session management
- [Drizzle ORM](https://orm.drizzle.team) — schema management and type-safe queries
- [PostgreSQL](https://www.postgresql.org) — primary database
- [Tailwind CSS v4](https://tailwindcss.com) — utility-first styling
- [Base UI](https://base-ui.com) / [shadcn](https://ui.shadcn.com) — unstyled UI primitives
