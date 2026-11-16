import 'server-only';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { getDb, getPgliteInstance, isPglite } from './client';
import { assertTestIsolationGuard } from './guard';
import * as schema from './schema';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/lib/db/migrations');

/**
 * Apply all pending Drizzle migrations from src/lib/db/migrations/ to the active database.
 */
export async function runMigrations(): Promise<void> {
    assertTestIsolationGuard();

    const activeDb = getDb();
    if (isPglite()) {
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
                    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
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
        await migratePg(activeDb as NodePgDatabase<typeof schema>, { migrationsFolder: MIGRATIONS_DIR });
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
