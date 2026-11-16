import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/lib/db/migrations');

describe('RLS Defense-in-Depth & Permissions (PGlite)', () => {
    it('enforces SELECT-own and denies cross-user read access via auth.uid()', async () => {
        const pglite = new PGlite();
        const db = drizzlePglite(pglite);

        // Apply migrations
        await pglite.exec(`
            CREATE SCHEMA IF NOT EXISTS auth;
            CREATE TABLE IF NOT EXISTS auth.users (
                id uuid PRIMARY KEY,
                email text
            );
            CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
                SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
            $$ LANGUAGE sql STABLE;
        `);

        await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });

        // Seed profiles and accounts directly as superuser/owner
        await pglite.exec(`
            INSERT INTO auth.users (id, email) VALUES
                ('${USER_A}', 'usera@example.com'),
                ('${USER_B}', 'userb@example.com');

            INSERT INTO public.profiles (id, display_name) VALUES
                ('${USER_A}', 'User A'),
                ('${USER_B}', 'User B');

            INSERT INTO public.fin_accounts (id, user_id, name, kind, class, currency) VALUES
                ('acc_a', '${USER_A}', 'User A Bank', 'bank', 'asset', 'INR'),
                ('acc_b', '${USER_B}', 'User B Bank', 'bank', 'asset', 'INR');
        `);

        // Test User A context (switch to non-owner authenticated role inside transaction)
        await pglite.transaction(async (tx) => {
            await tx.exec(`
                SET ROLE authenticated;
                SET LOCAL request.jwt.claims = '{"sub":"${USER_A}","role":"authenticated"}';
            `);
            const userAAccounts = await tx.query<{ id: string; name: string }>(`
                SELECT id, name FROM public.fin_accounts;
            `);
            expect(userAAccounts.rows.length).toBe(1);
            expect(userAAccounts.rows[0].id).toBe('acc_a');
            expect(userAAccounts.rows[0].name).toBe('User A Bank');
        });

        // Test User B context
        await pglite.transaction(async (tx) => {
            await tx.exec(`
                SET ROLE authenticated;
                SET LOCAL request.jwt.claims = '{"sub":"${USER_B}","role":"authenticated"}';
            `);
            const userBAccounts = await tx.query<{ id: string; name: string }>(`
                SELECT id, name FROM public.fin_accounts;
            `);
            expect(userBAccounts.rows.length).toBe(1);
            expect(userBAccounts.rows[0].id).toBe('acc_b');
            expect(userBAccounts.rows[0].name).toBe('User B Bank');
        });

        // Test Unauthenticated / Anon context
        await pglite.transaction(async (tx) => {
            await tx.exec(`
                SET ROLE anon;
                SET LOCAL request.jwt.claims = '{"role":"anon"}';
            `);
            // Anon has ALL privileges revoked on public tables
            await expect(
                tx.query('SELECT id FROM public.fin_accounts;')
            ).rejects.toThrow(/permission denied/);
        });

        // Authenticated role cannot mutate (REVOKE INSERT, UPDATE, DELETE)
        await pglite.transaction(async (tx) => {
            await tx.exec(`
                SET ROLE authenticated;
                SET LOCAL request.jwt.claims = '{"sub":"${USER_A}","role":"authenticated"}';
            `);
            await expect(
                tx.query(`
                    INSERT INTO public.fin_accounts (id, user_id, name, kind, class, currency)
                    VALUES ('acc_hack', '${USER_A}', 'Hacked', 'bank', 'asset', 'INR');
                `)
            ).rejects.toThrow(/permission denied/);
        });

        await pglite.close();
    });
});

const isIntegration = process.env.RUN_INTEGRATION === '1';
const describeIntegration = isIntegration ? describe : describe.skip;

describeIntegration('Supabase Local Stack RLS Integration Tests (RUN_INTEGRATION=1)', () => {
    const directUrl =
        process.env.DIRECT_URL ||
        process.env.DATABASE_URL ||
        'postgres://postgres:postgres@127.0.0.1:54322/postgres';

    let pool: pg.Pool;

    beforeAll(() => {
        pool = new pg.Pool({ connectionString: directUrl, max: 2 });
    });

    afterAll(async () => {
        if (pool) {
            await pool.end();
        }
    });

    it('authenticated role can only SELECT their own rows and cannot mutate tables', async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN;');

            // Seed users in auth.users and public.profiles
            await client.query(`
                INSERT INTO auth.users (id, email) VALUES
                    ('${USER_A}', 'usera@local.test'),
                    ('${USER_B}', 'userb@local.test')
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO public.profiles (id, display_name) VALUES
                    ('${USER_A}', 'User A Live'),
                    ('${USER_B}', 'User B Live')
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO public.fin_accounts (id, user_id, name, kind, class, currency) VALUES
                    ('acc_live_a', '${USER_A}', 'Live Account A', 'bank', 'asset', 'INR'),
                    ('acc_live_b', '${USER_B}', 'Live Account B', 'bank', 'asset', 'INR')
                ON CONFLICT (id) DO NOTHING;
            `);

            // Switch to 'authenticated' role as User A
            await client.query(`
                SET LOCAL ROLE authenticated;
                SET LOCAL request.jwt.claims = '{"sub":"${USER_A}","role":"authenticated"}';
            `);

            // SELECT should return ONLY User A's row
            const resA = await client.query('SELECT id, name FROM public.fin_accounts;');
            expect(resA.rows.some((r) => r.id === 'acc_live_a')).toBe(true);
            expect(resA.rows.some((r) => r.id === 'acc_live_b')).toBe(false);

            // Mutation attempts by authenticated role must fail (REVOKE INSERT/UPDATE/DELETE)
            await expect(
                client.query(`
                    INSERT INTO public.fin_accounts (id, user_id, name, kind, class, currency)
                    VALUES ('acc_live_hack', '${USER_A}', 'Hacked Account', 'bank', 'asset', 'INR');
                `)
            ).rejects.toThrow(/permission denied/);

            await client.query('ROLLBACK;');
        } catch (err) {
            await client.query('ROLLBACK;').catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    });

    it('anon role is completely denied access to all tables', async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN;');

            // Switch to 'anon' role
            await client.query(`
                SET LOCAL ROLE anon;
                SET LOCAL request.jwt.claims = '{"role":"anon"}';
            `);

            // Even SELECT must be denied with permission denied
            await expect(client.query('SELECT * FROM public.fin_accounts;')).rejects.toThrow(
                /permission denied/
            );

            await client.query('ROLLBACK;');
        } finally {
            client.release();
        }
    });
});
