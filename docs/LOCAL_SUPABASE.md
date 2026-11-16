# Local Supabase Development Stack

Finzy uses the local Supabase stack for development, authentication, and RLS enforcement.

## Port Map (Dedicated 5442x Range)

To prevent port conflicts or database collision with other projects running local Supabase on the same host (such as `money-planet` running on default ports `54321`–`54329`), Finzy is isolated to the **`5442x`** port range with `project_id = "finzy"` in `supabase/config.toml`:

| Service | Port | Local URL / Connection String | Purpose |
|---|---|---|---|
| **API Gateway (Kong)** | `54421` | `http://127.0.0.1:54421` | REST / Auth / Storage external gateway |
| **PostgreSQL (Direct)** | `54422` | `postgres://postgres:postgres@127.0.0.1:54422/postgres` | Direct connection for migrations (`DIRECT_URL`) |
| **Transaction Pooler** | `54429` | `postgres://postgres:postgres@127.0.0.1:54429/postgres` | Serverless runtime connection (`DATABASE_URL`) |
| **Supabase Studio** | `54423` | `http://127.0.0.1:54423` | Web UI database & table browser |
| **Inbucket (Email)** | `54424` | `http://127.0.0.1:54424` | Local email testing & magic link inspection |
| **Shadow Database** | `54420` | `postgres://postgres:postgres@127.0.0.1:54420/postgres` | Drizzle / DB diffing |
| **Analytics / Logflare** | `54427` | `http://127.0.0.1:54427` | Analytics backend |
| **Functions Inspector** | `8084` | `http://127.0.0.1:8084` | Edge runtime inspector |

## Production vs. Local Dev Separation

- **Local Development**:
  - Starts dedicated local Supabase containers via `pnpm db:start` (`supabase start`).
  - Containers are named `supabase_*_finzy`, ensuring complete Docker volume and namespace isolation from other projects.
  - Runtime and migration connections point to `127.0.0.1:54422`.
- **Production (Vercel + Supabase Cloud)**:
  - Deployed to Vercel with runtime `DATABASE_URL` pointing to Supabase Cloud transaction pooler (`port 6543`) with `sslmode=require`.
  - Migrations are never run during the Vercel build (`migrate.ts` aborts if `VERCEL=1`).
  - Production migrations are run out-of-band locally via `pnpm db:migrate --target live` with typed host verification against `DIRECT_URL`.

## CLI Scripts

- `pnpm db:start`: Starts local Finzy Supabase Docker containers (`supabase start`).
- `pnpm db:stop`: Stops local Finzy Supabase Docker containers (`supabase stop`).
- `pnpm db:status`: Displays current status, URLs, and keys (`supabase status`).
- `pnpm dev:user`: Reads the service key at runtime from `supabase status` (never written to disk) and creates a confirmed local dev user (`dev@finzy.local` / `password123`) via the Supabase Auth Admin API and provisions their profile and default categories.
- `pnpm db:check-rls`: Verifies all public tables have Row Level Security enabled.
