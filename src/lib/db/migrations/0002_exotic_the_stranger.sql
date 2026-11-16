CREATE TABLE IF NOT EXISTS "fin_job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"users_processed" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_accounts" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_budgets" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_categories" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "sub_type" text;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "amount_type" text DEFAULT 'fixed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "weekdays" integer[];
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "day_of_month" text;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "month_of_year" integer;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "max_occurrences" integer;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "occurrences_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'auto_post' NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "skipped_dates" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "history" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "fin_user_settings" ADD COLUMN IF NOT EXISTS "last_recurring_run_date" date;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_job_runs_job_started_idx" ON "fin_job_runs" USING btree ("job","started_at");
--> statement-breakpoint
ALTER TABLE "fin_job_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        DROP POLICY IF EXISTS "fin_job_runs_select_authenticated" ON "fin_job_runs";
        CREATE POLICY "fin_job_runs_select_authenticated" ON "fin_job_runs"
            FOR SELECT TO authenticated
            USING (true);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
