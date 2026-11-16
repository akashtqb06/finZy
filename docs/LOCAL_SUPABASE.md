# Local Supabase Development Stack

Finzy uses the local Supabase stack for development, authentication, and RLS enforcement.

## Port Map

| Service | Port | Local URL / Connection String | Purpose |
|---|---|---|---|
| **API Gateway (Kong)** | `54321` | `http://127.0.0.1:54321` | REST / Auth / Storage external gateway |
| **PostgreSQL (Direct)** | `54322` | `postgres://postgres:postgres@127.0.0.1:54322/postgres` | Direct connection for migrations (`DIRECT_URL`) |
| **Transaction Pooler** | `54329` | `postgres://postgres:postgres@127.0.0.1:54329/postgres` | Serverless runtime connection (`DATABASE_URL`) |
| **Supabase Studio** | `54323` | `http://127.0.0.1:54323` | Web UI database & table browser |
| **Inbucket (Email)** | `54324` | `http://127.0.0.1:54324` | Local email testing & magic link inspection |
| **Shadow Database** | `54320` | `postgres://postgres:postgres@127.0.0.1:54320/postgres` | Drizzle / DB diffing |

## CLI Scripts

- `pnpm db:start`: Starts local Supabase Docker containers (`supabase start`).
- `pnpm db:stop`: Stops local Supabase Docker containers (`supabase stop`).
- `pnpm db:status`: Displays current status, URLs, and keys (`supabase status`).
- `pnpm dev:user`: Reads the service key at runtime from `supabase status` (never written to disk) and creates a confirmed local dev user (`dev@finzy.local` / `password123`) via the Supabase Auth Admin API and provisions their profile and default categories.
- `pnpm db:check-rls`: Verifies all public tables have Row Level Security enabled.
