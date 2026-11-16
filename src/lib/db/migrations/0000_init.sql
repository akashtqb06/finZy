CREATE TABLE "fin_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"class" text NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"credit_limit" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" text,
	"icon" text,
	"color" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"source" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"date" date NOT NULL,
	"amount" bigint NOT NULL,
	"direction" text NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"merchant" text,
	"description" text,
	"account_hint" jsonb,
	"reference" text,
	"raw" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"matched_account_id" text,
	"suggested_category_id" text,
	"duplicate_warning" jsonb,
	"import_hash" text,
	"created_transaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_pf_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"entry_kind" text NOT NULL,
	"period_month" text,
	"posted_date" date,
	"date_approx" boolean DEFAULT false NOT NULL,
	"epf_wages" bigint DEFAULT 0 NOT NULL,
	"eps_wages" bigint DEFAULT 0 NOT NULL,
	"employee_amount" bigint DEFAULT 0 NOT NULL,
	"employer_amount" bigint DEFAULT 0 NOT NULL,
	"pension_amount" bigint DEFAULT 0 NOT NULL,
	"source_label" text,
	"passbook_key" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"statement_date" date NOT NULL,
	"statement_balance" bigint NOT NULL,
	"cleared_balance" bigint DEFAULT 0 NOT NULL,
	"difference" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_recurring_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"category_id" text,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"payee" text,
	"note" text,
	"frequency" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"version" integer DEFAULT 1 NOT NULL,
	"next_occurrence" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"category_id" text,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"signed_amount" bigint NOT NULL,
	"payee" text,
	"note" text,
	"tags" text,
	"client_request_id" text,
	"import_hash" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurring_rule_id" text,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_transactions_amount_check" CHECK ("fin_transactions"."type" = 'adjustment' OR "fin_transactions"."amount" > 0),
	CONSTRAINT "fin_transactions_transfer_check" CHECK ("fin_transactions"."type" <> 'transfer' OR ("fin_transactions"."to_account_id" IS NOT NULL AND "fin_transactions"."to_account_id" <> "fin_transactions"."account_id"))
);
--> statement-breakpoint
CREATE TABLE "fin_user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"base_currency" text DEFAULT 'INR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"week_starts_on" integer DEFAULT 1 NOT NULL,
	"tracking_start_date" date,
	"include_eps_in_net_worth" boolean DEFAULT false NOT NULL,
	"include_accrued_interest_in_net_worth" boolean DEFAULT false NOT NULL,
	"setup_step" integer DEFAULT 1 NOT NULL,
	"setup_completed_at" timestamp with time zone,
	"setup_skipped_at" timestamp with time zone,
	"draft" jsonb,
	"data_version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_valuations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"date" date NOT NULL,
	"value" bigint NOT NULL,
	"cost_basis" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payee_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"payee_pattern" text NOT NULL,
	"category_id" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"response_status" integer,
	"response_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret_hash" text NOT NULL,
	"events" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_accounts" ADD CONSTRAINT "fin_accounts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_budgets" ADD CONSTRAINT "fin_budgets_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_budgets" ADD CONSTRAINT "fin_budgets_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_categories" ADD CONSTRAINT "fin_categories_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_inbox" ADD CONSTRAINT "fin_inbox_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_inbox" ADD CONSTRAINT "fin_inbox_matched_account_id_fin_accounts_id_fk" FOREIGN KEY ("matched_account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_inbox" ADD CONSTRAINT "fin_inbox_suggested_category_id_fin_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."fin_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_inbox" ADD CONSTRAINT "fin_inbox_created_transaction_id_fin_transactions_id_fk" FOREIGN KEY ("created_transaction_id") REFERENCES "public"."fin_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_pf_entries" ADD CONSTRAINT "fin_pf_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_pf_entries" ADD CONSTRAINT "fin_pf_entries_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_reconciliations" ADD CONSTRAINT "fin_reconciliations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_reconciliations" ADD CONSTRAINT "fin_reconciliations_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD CONSTRAINT "fin_recurring_rules_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD CONSTRAINT "fin_recurring_rules_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD CONSTRAINT "fin_recurring_rules_to_account_id_fin_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD CONSTRAINT "fin_recurring_rules_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_to_account_id_fin_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_user_settings" ADD CONSTRAINT "fin_user_settings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_valuations" ADD CONSTRAINT "fin_valuations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_valuations" ADD CONSTRAINT "fin_valuations_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee_rules" ADD CONSTRAINT "payee_rules_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee_rules" ADD CONSTRAINT "payee_rules_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fin_accounts_user_id_idx" ON "fin_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fin_accounts_user_kind_idx" ON "fin_accounts" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "fin_accounts_user_active_idx" ON "fin_accounts" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "fin_budgets_user_id_idx" ON "fin_budgets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fin_budgets_user_category_idx" ON "fin_budgets" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "fin_categories_user_id_idx" ON "fin_categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fin_categories_user_type_idx" ON "fin_categories" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "fin_inbox_user_status_idx" ON "fin_inbox" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_inbox_user_idempotency_key_idx" ON "fin_inbox" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_inbox_user_import_hash_idx" ON "fin_inbox" USING btree ("user_id","import_hash") WHERE "fin_inbox"."import_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "fin_inbox_user_id_idx" ON "fin_inbox" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_pf_entries_account_passbook_key_unique" ON "fin_pf_entries" USING btree ("account_id","passbook_key");--> statement-breakpoint
CREATE INDEX "fin_pf_entries_user_account_idx" ON "fin_pf_entries" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE INDEX "fin_pf_entries_account_period_idx" ON "fin_pf_entries" USING btree ("account_id","period_month");--> statement-breakpoint
CREATE INDEX "fin_pf_entries_account_date_idx" ON "fin_pf_entries" USING btree ("account_id","posted_date");--> statement-breakpoint
CREATE INDEX "fin_reconciliations_user_id_idx" ON "fin_reconciliations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fin_reconciliations_account_date_idx" ON "fin_reconciliations" USING btree ("account_id","statement_date");--> statement-breakpoint
CREATE INDEX "fin_recurring_user_id_idx" ON "fin_recurring_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fin_recurring_active_next_idx" ON "fin_recurring_rules" USING btree ("user_id","is_active","next_occurrence");--> statement-breakpoint
CREATE INDEX "fin_transactions_user_date_idx" ON "fin_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "fin_transactions_account_date_idx" ON "fin_transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "fin_transactions_user_category_idx" ON "fin_transactions" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_transactions_user_client_req_idx" ON "fin_transactions" USING btree ("user_id","client_request_id") WHERE "fin_transactions"."client_request_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fin_transactions_user_import_hash_idx" ON "fin_transactions" USING btree ("user_id","import_hash") WHERE "fin_transactions"."import_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fin_valuations_account_date_idx" ON "fin_valuations" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "fin_valuations_account_id_idx" ON "fin_valuations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "fin_valuations_user_id_idx" ON "fin_valuations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payee_rules_user_id_idx" ON "payee_rules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payee_rules_user_payee_pattern_idx" ON "payee_rules" USING btree ("user_id","payee_pattern");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_status_idx" ON "webhook_deliveries" USING btree ("endpoint_id","status");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_next_attempt_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_user_id_idx" ON "webhook_endpoints" USING btree ("user_id");