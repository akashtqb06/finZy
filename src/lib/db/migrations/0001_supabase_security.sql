ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_user_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_valuations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_budgets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_pf_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_inbox" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fin_reconciliations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payee_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
    -- Ensure roles exist for test environments (PGlite) if permitted
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    -- Ensure auth schema and auth.uid() exist for test environments (PGlite) if permitted
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
        SELECT COALESCE(
            NULLIF(current_setting('request.jwt.claim.sub', true), ''),
            (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        )::uuid;
    $fn$;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') 
       AND EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
        DROP POLICY IF EXISTS "profiles_select_own" ON "profiles";
        CREATE POLICY "profiles_select_own" ON "profiles"
            FOR SELECT TO authenticated
            USING (id = auth.uid());

        DROP POLICY IF EXISTS "fin_user_settings_select_own" ON "fin_user_settings";
        CREATE POLICY "fin_user_settings_select_own" ON "fin_user_settings"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "fin_accounts_select_own" ON "fin_accounts";
        CREATE POLICY "fin_accounts_select_own" ON "fin_accounts"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "fin_categories_select_own" ON "fin_categories";
        CREATE POLICY "fin_categories_select_own" ON "fin_categories"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid() OR is_system = true OR user_id IS NULL);

        DROP POLICY IF EXISTS "fin_transactions_select_own" ON "fin_transactions";
        CREATE POLICY "fin_transactions_select_own" ON "fin_transactions"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "fin_valuations_select_own" ON "fin_valuations";
        CREATE POLICY "fin_valuations_select_own" ON "fin_valuations"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "fin_budgets_select_own" ON "fin_budgets";
        CREATE POLICY "fin_budgets_select_own" ON "fin_budgets"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "fin_recurring_rules_select_own" ON "fin_recurring_rules";
        CREATE POLICY "fin_recurring_rules_select_own" ON "fin_recurring_rules"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "fin_pf_entries_select_own" ON "fin_pf_entries";
        CREATE POLICY "fin_pf_entries_select_own" ON "fin_pf_entries"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "fin_inbox_select_own" ON "fin_inbox";
        CREATE POLICY "fin_inbox_select_own" ON "fin_inbox"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "fin_reconciliations_select_own" ON "fin_reconciliations";
        CREATE POLICY "fin_reconciliations_select_own" ON "fin_reconciliations"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "payee_rules_select_own" ON "payee_rules";
        CREATE POLICY "payee_rules_select_own" ON "payee_rules"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "webhook_endpoints_select_own" ON "webhook_endpoints";
        CREATE POLICY "webhook_endpoints_select_own" ON "webhook_endpoints"
            FOR SELECT TO authenticated
            USING (user_id = auth.uid());

        DROP POLICY IF EXISTS "webhook_deliveries_select_own" ON "webhook_deliveries";
        CREATE POLICY "webhook_deliveries_select_own" ON "webhook_deliveries"
            FOR SELECT TO authenticated
            USING (endpoint_id IN (SELECT id FROM webhook_endpoints WHERE user_id = auth.uid()));
    END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT USAGE ON SCHEMA public TO authenticated;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
        REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON SCHEMA public FROM anon;
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'fin_user_settings'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.fin_user_settings;
        END IF;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'profiles_id_auth_users_id_fk'
              AND table_schema = 'public'
              AND table_name = 'profiles'
        ) THEN
            ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_id_auth_users_id_fk
            FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
        END IF;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
