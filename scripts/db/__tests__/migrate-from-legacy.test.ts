import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { runEtlMigration } from '../migrate-from-legacy';

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'src/lib/db/migrations');

// Helper to setup legacy source schema and seed data
async function setupLegacySourceDb(pglite: PGlite) {
    await pglite.exec(`
        -- Legacy custom auth & user tables
        CREATE TABLE users (
            id text PRIMARY KEY,
            email text UNIQUE NOT NULL,
            name text,
            password_hash text,
            role text DEFAULT 'user',
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        CREATE TABLE sessions (
            id text PRIMARY KEY,
            user_id text REFERENCES users(id),
            token text,
            expires_at timestamptz
        );

        CREATE TABLE login_attempts (
            id text PRIMARY KEY,
            ip text,
            attempted_at timestamptz
        );

        -- Legacy BI tables
        CREATE TABLE dashboards (
            id text PRIMARY KEY,
            title text
        );
        CREATE TABLE charts (
            id text PRIMARY KEY,
            dashboard_id text REFERENCES dashboards(id)
        );

        -- Legacy finance tables
        CREATE TABLE fin_user_settings (
            user_id text PRIMARY KEY REFERENCES users(id),
            base_currency text DEFAULT 'INR',
            timezone text DEFAULT 'Asia/Kolkata',
            week_starts_on integer DEFAULT 1,
            tracking_start_date date,
            include_eps_in_net_worth boolean DEFAULT false,
            include_accrued_interest_in_net_worth boolean DEFAULT false,
            setup_step integer DEFAULT 1,
            setup_completed_at timestamptz,
            setup_skipped_at timestamptz,
            draft jsonb,
            data_version bigint DEFAULT 5,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        CREATE TABLE fin_categories (
            id text PRIMARY KEY,
            user_id text REFERENCES users(id),
            name text NOT NULL,
            type text NOT NULL,
            parent_id text REFERENCES fin_categories(id),
            icon text,
            color text,
            is_system boolean DEFAULT false,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        CREATE TABLE fin_accounts (
            id text PRIMARY KEY,
            user_id text NOT NULL REFERENCES users(id),
            name text NOT NULL,
            kind text NOT NULL,
            class text NOT NULL,
            currency text DEFAULT 'INR',
            credit_limit bigint,
            is_active boolean DEFAULT true,
            metadata jsonb DEFAULT '{}'::jsonb,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        -- Legacy fin_valuations had NO user_id column
        CREATE TABLE fin_valuations (
            id text PRIMARY KEY,
            account_id text NOT NULL REFERENCES fin_accounts(id),
            date date NOT NULL,
            value bigint NOT NULL,
            cost_basis bigint,
            note text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        CREATE TABLE fin_budgets (
            id text PRIMARY KEY,
            user_id text NOT NULL REFERENCES users(id),
            category_id text NOT NULL REFERENCES fin_categories(id),
            amount bigint NOT NULL,
            period text DEFAULT 'monthly',
            start_date date NOT NULL,
            end_date date,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        CREATE TABLE fin_recurring_rules (
            id text PRIMARY KEY,
            user_id text NOT NULL REFERENCES users(id),
            account_id text NOT NULL REFERENCES fin_accounts(id),
            to_account_id text REFERENCES fin_accounts(id),
            category_id text REFERENCES fin_categories(id),
            type text NOT NULL,
            amount bigint NOT NULL,
            payee text,
            note text,
            frequency text NOT NULL,
            interval integer DEFAULT 1,
            start_date date NOT NULL,
            end_date date,
            next_occurrence date NOT NULL,
            is_active boolean DEFAULT true,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        CREATE TABLE fin_pf_entries (
            id text PRIMARY KEY,
            user_id text NOT NULL REFERENCES users(id),
            account_id text NOT NULL REFERENCES fin_accounts(id),
            entry_kind text NOT NULL,
            period_month text,
            posted_date date,
            date_approx boolean DEFAULT false,
            epf_wages bigint DEFAULT 0,
            eps_wages bigint DEFAULT 0,
            employee_amount bigint DEFAULT 0,
            employer_amount bigint DEFAULT 0,
            pension_amount bigint DEFAULT 0,
            source_label text,
            passbook_key text NOT NULL,
            note text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        CREATE TABLE fin_reconciliations (
            id text PRIMARY KEY,
            user_id text NOT NULL REFERENCES users(id),
            account_id text NOT NULL REFERENCES fin_accounts(id),
            statement_date date NOT NULL,
            statement_balance bigint NOT NULL,
            cleared_balance bigint DEFAULT 0,
            difference bigint DEFAULT 0,
            status text DEFAULT 'pending',
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        CREATE TABLE fin_transactions (
            id text PRIMARY KEY,
            user_id text NOT NULL REFERENCES users(id),
            account_id text NOT NULL REFERENCES fin_accounts(id),
            to_account_id text REFERENCES fin_accounts(id),
            category_id text REFERENCES fin_categories(id),
            date date NOT NULL,
            type text NOT NULL,
            amount bigint NOT NULL,
            signed_amount bigint NOT NULL,
            payee text,
            note text,
            tags text,
            client_request_id text,
            import_hash text,
            is_recurring boolean DEFAULT false,
            recurring_rule_id text,
            deleted_at timestamptz,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );

        CREATE TABLE fin_inbox (
            id text PRIMARY KEY,
            user_id text NOT NULL REFERENCES users(id),
            idempotency_key text NOT NULL,
            source text NOT NULL,
            received_at timestamptz NOT NULL,
            date date NOT NULL,
            amount bigint NOT NULL,
            direction text NOT NULL,
            currency text DEFAULT 'INR',
            merchant text,
            description text,
            account_hint jsonb,
            reference text,
            raw text,
            status text DEFAULT 'pending',
            matched_account_id text REFERENCES fin_accounts(id),
            suggested_category_id text REFERENCES fin_categories(id),
            duplicate_warning jsonb,
            import_hash text,
            created_transaction_id text REFERENCES fin_transactions(id),
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
        );
    `);

    // Seed users:
    // 1. Alice (mapped)
    // 2. Demo User (demo, should be skipped)
    // 3. Bob (unmapped, should be skipped)
    await pglite.exec(`
        INSERT INTO users (id, email, name, password_hash) VALUES
            ('nanoid_alice_001', 'alice@personal.test', 'Alice Engineer', 'hash_secret_123'),
            ('nanoid_demo_002', 'demo@bikit.app', 'Demo User', 'hash_demo_456'),
            ('nanoid_bob_003', 'bob@external.test', 'Bob Contractor', 'hash_bob_789');

        INSERT INTO sessions (id, user_id, token) VALUES
            ('sess_1', 'nanoid_alice_001', 'token_123');

        INSERT INTO dashboards (id, title) VALUES
            ('dash_1', 'Company Overview');

        INSERT INTO fin_user_settings (user_id, base_currency, timezone, data_version) VALUES
            ('nanoid_alice_001', 'INR', 'Asia/Kolkata', 88);

        INSERT INTO fin_categories (id, user_id, name, type, is_system) VALUES
            ('cat_sys_income', NULL, 'Salary', 'income', true),
            ('cat_sys_expense', NULL, 'Groceries', 'expense', true),
            ('cat_alice_custom', 'nanoid_alice_001', 'Gadgets', 'expense', false);

        INSERT INTO fin_accounts (id, user_id, name, kind, class, currency) VALUES
            ('acc_alice_checking', 'nanoid_alice_001', 'HDFC Bank', 'bank', 'asset', 'INR'),
            ('acc_alice_savings', 'nanoid_alice_001', 'ICICI Savings', 'bank', 'asset', 'INR'),
            ('acc_bob_checking', 'nanoid_bob_003', 'Bob Bank', 'bank', 'asset', 'INR');

        INSERT INTO fin_valuations (id, account_id, date, value) VALUES
            ('val_alice_1', 'acc_alice_savings', '2026-11-01', 5000000);

        INSERT INTO fin_budgets (id, user_id, category_id, amount, start_date) VALUES
            ('bud_alice_1', 'nanoid_alice_001', 'cat_sys_expense', 3000000, '2026-11-01');

        INSERT INTO fin_recurring_rules (id, user_id, account_id, type, amount, frequency, start_date, next_occurrence) VALUES
            ('rec_alice_1', 'nanoid_alice_001', 'acc_alice_checking', 'expense', 150000, 'monthly', '2026-11-01', '2026-12-01');

        INSERT INTO fin_pf_entries (id, user_id, account_id, entry_kind, passbook_key, epf_wages, employee_amount) VALUES
            ('pf_alice_1', 'nanoid_alice_001', 'acc_alice_savings', 'contribution', 'key_nov_2026', 1500000, 180000);

        INSERT INTO fin_transactions (id, user_id, account_id, category_id, date, type, amount, signed_amount, payee) VALUES
            ('tx_alice_1', 'nanoid_alice_001', 'acc_alice_checking', 'cat_sys_income', '2026-11-01', 'income', 10000000, 10000000, 'Acme Corp'),
            ('tx_alice_2', 'nanoid_alice_001', 'acc_alice_checking', 'cat_sys_expense', '2026-11-05', 'expense', 250000, -250000, 'Supermarket'),
            ('tx_bob_1', 'nanoid_bob_003', 'acc_bob_checking', 'cat_sys_income', '2026-11-02', 'income', 5000000, 5000000, 'Client');
    `);
}

// Setup target Supabase schema by applying actual Drizzle migrations
async function setupTargetSupabaseDb(pglite: PGlite) {
    const db = drizzle(pglite);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

describe('Legacy to Supabase ETL Migration', () => {
    let sourcePglite: PGlite;
    let targetPglite: PGlite;

    const TARGET_ALICE_UUID = 'a0000000-0000-0000-0000-000000000001';
    const USER_MAP = {
        'alice@personal.test': TARGET_ALICE_UUID,
    };

    beforeEach(async () => {
        sourcePglite = new PGlite();
        targetPglite = new PGlite();
        await setupLegacySourceDb(sourcePglite);
        await setupTargetSupabaseDb(targetPglite);
    });

    afterEach(async () => {
        await sourcePglite.close();
        await targetPglite.close();
    });

    it('successfully remaps user ID, copies data in FK order, and resets fin_user_settings data_version', async () => {
        const summary = await runEtlMigration({
            sourceClient: sourcePglite,
            targetClient: targetPglite,
            userMap: USER_MAP,
            replace: false,
            dryRun: false,
        });

        expect(summary.verificationPassed).toBe(true);
        expect(summary.migratedUsers).toEqual(['alice@personal.test']);
        expect(summary.skippedUsers).toContain('demo@bikit.app (unmapped or demo)');
        expect(summary.skippedUsers).toContain('bob@external.test (unmapped or demo)');

        // Verify profiles in target
        const profRes = await targetPglite.query<{ id: string; display_name: string }>(
            `SELECT id, display_name FROM public.profiles WHERE id = $1`,
            [TARGET_ALICE_UUID]
        );
        expect(profRes.rows.length).toBe(1);
        expect(profRes.rows[0].id).toBe(TARGET_ALICE_UUID);
        expect(profRes.rows[0].display_name).toBe('Alice Engineer');

        // Verify fin_user_settings data_version was reset to 1
        const settingsRes = await targetPglite.query<{ user_id: string; data_version: string }>(
            `SELECT user_id, data_version FROM public.fin_user_settings WHERE user_id = $1`,
            [TARGET_ALICE_UUID]
        );
        expect(settingsRes.rows.length).toBe(1);
        expect(Number(settingsRes.rows[0].data_version)).toBe(1);

        // Verify fin_accounts user_id remapped to UUID
        const accountsRes = await targetPglite.query<{ id: string; user_id: string }>(
            `SELECT id, user_id FROM public.fin_accounts ORDER BY id`
        );
        expect(accountsRes.rows.length).toBe(2);
        for (const acc of accountsRes.rows) {
            expect(acc.user_id).toBe(TARGET_ALICE_UUID);
        }

        // Verify fin_valuations received user_id derived from account
        const valRes = await targetPglite.query<{ id: string; user_id: string; account_id: string }>(
            `SELECT id, user_id, account_id FROM public.fin_valuations WHERE id = 'val_alice_1'`
        );
        expect(valRes.rows.length).toBe(1);
        expect(valRes.rows[0].user_id).toBe(TARGET_ALICE_UUID);
        expect(valRes.rows[0].account_id).toBe('acc_alice_savings');

        // Verify transactions remapped
        const txRes = await targetPglite.query<{ id: string; user_id: string }>(
            `SELECT id, user_id FROM public.fin_transactions ORDER BY id`
        );
        expect(txRes.rows.length).toBe(2);
        for (const tx of txRes.rows) {
            expect(tx.user_id).toBe(TARGET_ALICE_UUID);
        }
    });

    it('identifies and skips sessions, passwords, BI tables, and reports them accurately', async () => {
        const summary = await runEtlMigration({
            sourceClient: sourcePglite,
            targetClient: targetPglite,
            userMap: USER_MAP,
            replace: false,
            dryRun: false,
        });

        expect(summary.skippedTables).toContain('sessions');
        expect(summary.skippedTables).toContain('login_attempts');
        expect(summary.skippedTables).toContain('dashboards');
        expect(summary.skippedTables).toContain('charts');

        // Target should not have any BI or session records
        const targetTablesRes = await targetPglite.query<{ tablename: string }>(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
        );
        const targetTableNames = targetTablesRes.rows.map((r) => r.tablename);
        expect(targetTableNames).not.toContain('sessions');
        expect(targetTableNames).not.toContain('dashboards');
        expect(targetTableNames).not.toContain('charts');
    });

    it('refuses to run against a non-empty target unless replace is specified', async () => {
        // Pre-populate target with a profile
        await targetPglite.query(
            `INSERT INTO public.profiles (id, display_name) VALUES ('${TARGET_ALICE_UUID}', 'Existing User')`
        );

        await expect(
            runEtlMigration({
                sourceClient: sourcePglite,
                targetClient: targetPglite,
                userMap: USER_MAP,
                replace: false,
            })
        ).rejects.toThrow(/Target database contains existing records/);
    });

    it('rolls back target completely when a verification mismatch occurs', async () => {
        await expect(
            runEtlMigration({
                sourceClient: sourcePglite,
                targetClient: targetPglite,
                userMap: USER_MAP,
                replace: false,
                dryRun: false,
                forcedMismatch: true,
            })
        ).rejects.toThrow(/FORCED MISMATCH/);

        // Verify target database was completely rolled back and is empty
        const countRes = await targetPglite.query<{ count: string }>(
            `SELECT count(*) as count FROM public.fin_accounts`
        );
        expect(Number(countRes.rows[0].count)).toBe(0);
    });

    it('rolls back target completely when dry-run is specified', async () => {
        const summary = await runEtlMigration({
            sourceClient: sourcePglite,
            targetClient: targetPglite,
            userMap: USER_MAP,
            replace: false,
            dryRun: true,
        });

        expect(summary.dryRun).toBe(true);
        expect(summary.verificationPassed).toBe(true);

        // In dry run, verification passes but target transaction rolls back
        const countRes = await targetPglite.query<{ count: string }>(
            `SELECT count(*) as count FROM public.fin_accounts`
        );
        expect(Number(countRes.rows[0].count)).toBe(0);
    });

    it('fails loudly when an unknown source column is encountered', async () => {
        // Add an unexpected column to legacy fin_accounts
        await sourcePglite.exec(`
            ALTER TABLE fin_accounts ADD COLUMN unapproved_random_col text;
        `);

        await expect(
            runEtlMigration({
                sourceClient: sourcePglite,
                targetClient: targetPglite,
                userMap: USER_MAP,
                replace: false,
                dryRun: false,
            })
        ).rejects.toThrow(/UNKNOWN COLUMN ERROR/);
    });
});
