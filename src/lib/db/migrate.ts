import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { getDb, getPgliteInstance, isPglite, isLocalDatabaseUrl, getSslConfig } from './client';
import { assertTestIsolationGuard } from './guard';
import * as schema from './schema';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/lib/db/migrations');

// Auto-load .env.local if running as CLI and env vars are not set
function loadEnvLocalIfAvailable(): void {
    if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
        return;
    }
    if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
        const envLocalPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envLocalPath)) {
            const content = fs.readFileSync(envLocalPath, 'utf-8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const [key, ...rest] = trimmed.split('=');
                    const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
                    if (key && !process.env[key.trim()]) {
                        process.env[key.trim()] = val;
                    }
                }
            }
        }
    }
}

async function confirmRemoteHost(hostname: string): Promise<boolean> {
    if (process.env.CONFIRM_REMOTE_HOST === hostname) {
        return true;
    }
    if (process.stdin.isTTY) {
        const readline = await import('node:readline/promises');
        const { stdin: input, stdout: output } = await import('node:process');
        const rl = readline.createInterface({ input, output });
        try {
            const answer = await rl.question(
                `CAUTION: You are about to run database migrations against remote host: ${hostname}\nType the hostname '${hostname}' to confirm: `
            );
            return answer.trim() === hostname;
        } finally {
            rl.close();
        }
    }
    throw new Error(
        `Non-interactive terminal: migration of remote host '${hostname}' requires setting CONFIRM_REMOTE_HOST='${hostname}'.`
    );
}

/**
 * Apply all pending Drizzle migrations from src/lib/db/migrations/ to the active database.
 * - In test environments, applies against PGlite with auth stubs.
 * - In production and local environments, applies against DIRECT_URL using a dedicated connection.
 * - Refuses to run in Vercel build.
 * - Refuses remote hosts unless passed '--target live' and typed host confirmation.
 */
export async function runMigrations(): Promise<void> {
    if (process.env.VERCEL || process.env.NEXT_PHASE === 'phase-production-build') {
        throw new Error('Migrations must NEVER run in the Vercel build. Run them out-of-band using DIRECT_URL.');
    }

    loadEnvLocalIfAvailable();
    assertTestIsolationGuard();

    const targetIndex = process.argv.indexOf('--target');
    const target = targetIndex !== -1 ? process.argv[targetIndex + 1] : undefined;

    if (isPglite() && !target) {
        const activeDb = getDb();
        const pglite = getPgliteInstance();
        if (pglite) {
            await pglite.exec(`
                CREATE SCHEMA IF NOT EXISTS auth;
                CREATE TABLE IF NOT EXISTS auth.users (
                    id uuid PRIMARY KEY,
                    email text,
                    raw_user_meta_data jsonb,
                    created_at timestamptz DEFAULT now()
                );
                CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
                    SELECT COALESCE(
                        NULLIF(current_setting('request.jwt.claim.sub', true), ''),
                        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
                    )::uuid;
                $$ LANGUAGE sql STABLE;
            `);
        }
        await migratePglite(activeDb as PgliteDatabase<typeof schema>, { migrationsFolder: MIGRATIONS_DIR });

        // Auto-populate auth.users stub on profile insert in PGlite test environments
        if (pglite) {
            await pglite.exec(`
                CREATE OR REPLACE FUNCTION auth.sync_stub_user() RETURNS trigger AS $$
                BEGIN
                    INSERT INTO auth.users (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                DROP TRIGGER IF EXISTS tr_profiles_sync_stub_user ON public.profiles;
                CREATE TRIGGER tr_profiles_sync_stub_user
                BEFORE INSERT ON public.profiles
                FOR EACH ROW EXECUTE FUNCTION auth.sync_stub_user();
            `);
        }
    } else {
        let directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
        if (!directUrl) {
            if (target === 'local') {
                directUrl = 'postgres://postgres:postgres@127.0.0.1:54422/postgres';
            } else {
                throw new Error('DIRECT_URL (or DATABASE_URL) must be configured to run migrations.');
            }
        }

        const isLocal = isLocalDatabaseUrl(directUrl);
        const parsed = new URL(directUrl);

        if (target === 'live') {
            if (isLocal) {
                throw new Error(
                    `Target database host '${parsed.hostname}' is a local database, not a live remote database. Use '--target local'.`
                );
            }
            const confirmed = await confirmRemoteHost(parsed.hostname);
            if (!confirmed) {
                throw new Error(`Migration cancelled: confirmation did not match remote host '${parsed.hostname}'.`);
            }
        } else if (target === 'local') {
            if (!isLocal) {
                throw new Error(
                    `Refusing to migrate remote host '${parsed.hostname}' with '--target local'. Use '--target live' and typed host confirmation.`
                );
            }
        } else if (!isLocal) {
            throw new Error(
                `Refusing to migrate remote host '${parsed.hostname}'. Migrating a remote database requires '--target live' and typed host confirmation.`
            );
        }

        const pool = new pg.Pool({
            connectionString: directUrl,
            max: 1,
            connectionTimeoutMillis: 10000,
            ssl: getSslConfig(directUrl),
        });

        try {
            const migratorDb = drizzlePg(pool, { schema });
            await migratePg(migratorDb, { migrationsFolder: MIGRATIONS_DIR });
        } finally {
            await pool.end();
        }
    }
}

// Allow running as a standalone script: tsx src/lib/db/migrate.ts
const isMainModule =
    typeof process.argv[1] === 'string' &&
    (process.argv[1].endsWith('migrate.ts') ||
        (import.meta.url && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])));

if (isMainModule) {
    runMigrations()
        .then(() => {
            console.log('Migrations successfully applied.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}
