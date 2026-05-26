# Packt

A travel itinerary planning app built with Next.js (App Router), TypeScript, Tailwind CSS v4, PostgreSQL, and Drizzle ORM.

## Quick start

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and NEXTAUTH_SECRET
npm run db:push        # apply schema
npm run db:seed        # load demo data
npm run dev
```

Sign in at [http://localhost:3000](http://localhost:3000) with `demo@packt.local` / `demo1234`.

For full setup instructions (database creation, environment variables, and reset steps) see **[SETUP.md](./SETUP.md)**.
For the current Drizzle schema workflow and the planned migration cutover, see **[docs/drizzle-workflow.md](./docs/drizzle-workflow.md)**.

## AI Skills & Agents Setup

AI skills are at `.agents/skills`. See [ai-tools-setup.md](./ai-tools-setup/ai-tools-setup.md) for instructions on ensuring Claude Code can see the provided skills without duplicating them.

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
