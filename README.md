# FinZy

Personal finance, investments, and net worth tracking application built with Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL with Drizzle ORM, and Supabase Auth.

## Getting Started

### 1. Start Local Postgres / Supabase
```bash
docker compose -f docker-compose.dev.yml up -d
```
Or start the local Supabase stack:
```bash
pnpm db:start
```

### 2. Apply Migrations
```bash
pnpm db:migrate
```

### 3. Start Development Server
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality Gates

- `pnpm tsc --noEmit` — TypeScript typecheck
- `pnpm lint` — ESLint
- `pnpm test` — Vitest test suite
- `pnpm build` — Next.js production build
