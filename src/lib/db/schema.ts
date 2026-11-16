import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { newId } from './id';

// ---------------------------------------------------------------------------
// profiles (matches Supabase Auth users)
// ---------------------------------------------------------------------------
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// fin_user_settings
// ---------------------------------------------------------------------------
export const finUserSettings = pgTable('fin_user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  baseCurrency: text('base_currency').notNull().default('INR'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  weekStartsOn: integer('week_starts_on').notNull().default(1),
  trackingStartDate: date('tracking_start_date', { mode: 'string' }),
  includeEpsInNetWorth: boolean('include_eps_in_net_worth').notNull().default(false),
  includeAccruedInterestInNetWorth: boolean('include_accrued_interest_in_net_worth').notNull().default(false),
  setupStep: integer('setup_step').notNull().default(1),
  setupCompletedAt: timestamp('setup_completed_at', { withTimezone: true, mode: 'date' }),
  setupSkippedAt: timestamp('setup_skipped_at', { withTimezone: true, mode: 'date' }),
  draft: jsonb('draft').$type<Record<string, unknown>>(),
  lastRecurringRunDate: date('last_recurring_run_date', { mode: 'string' }),
  dataVersion: bigint('data_version', { mode: 'number' }).notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// fin_accounts
// ---------------------------------------------------------------------------
export const finAccounts = pgTable(
  'fin_accounts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', {
      enum: [
        'cash',
        'bank',
        'wallet',
        'credit_card',
        'fixed_deposit',
        'recurring_deposit',
        'mutual_fund',
        'stocks',
        'loan',
        'other_asset',
        'other_liability',
        'epf',
        'vpf',
        'ppf',
        'nps',
      ],
    }).notNull(),
    class: text('class', {
      enum: ['asset', 'liability'],
    }).notNull(),
    currency: text('currency').notNull().default('INR'),
    creditLimit: bigint('credit_limit', { mode: 'number' }),
    isActive: boolean('is_active').notNull().default(true),
    version: integer('version').notNull().default(1),
    metadata: jsonb('metadata')
      .notNull()
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('fin_accounts_user_id_idx').on(table.userId),
    index('fin_accounts_user_kind_idx').on(table.userId, table.kind),
    index('fin_accounts_user_active_idx').on(table.userId, table.isActive),
  ]
);

// ---------------------------------------------------------------------------
// fin_categories
// ---------------------------------------------------------------------------
export const finCategories = pgTable(
  'fin_categories',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', {
      enum: ['expense', 'income'],
    }).notNull(),
    parentId: text('parent_id'),
    icon: text('icon'),
    color: text('color'),
    isSystem: boolean('is_system').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('fin_categories_user_id_idx').on(table.userId),
    index('fin_categories_user_type_idx').on(table.userId, table.type),
  ]
);

// ---------------------------------------------------------------------------
// fin_transactions
// ---------------------------------------------------------------------------
export const finTransactions = pgTable(
  'fin_transactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => finAccounts.id, { onDelete: 'cascade' }),
    toAccountId: text('to_account_id').references(() => finAccounts.id, { onDelete: 'set null' }),
    categoryId: text('category_id').references(() => finCategories.id, { onDelete: 'set null' }),
    date: date('date', { mode: 'string' }).notNull(),
    type: text('type', {
      enum: ['expense', 'income', 'transfer', 'adjustment'],
    }).notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    signedAmount: bigint('signed_amount', { mode: 'number' }).notNull(),
    payee: text('payee'),
    note: text('note'),
    tags: text('tags'),
    clientRequestId: text('client_request_id'),
    importHash: text('import_hash'),
    isRecurring: boolean('is_recurring').notNull().default(false),
    recurringRuleId: text('recurring_rule_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('fin_transactions_user_date_idx').on(table.userId, table.date),
    index('fin_transactions_account_date_idx').on(table.accountId, table.date),
    index('fin_transactions_user_category_idx').on(table.userId, table.categoryId),
    uniqueIndex('fin_transactions_user_client_req_idx')
      .on(table.userId, table.clientRequestId)
      .where(sql`${table.clientRequestId} IS NOT NULL`),
    uniqueIndex('fin_transactions_user_import_hash_idx')
      .on(table.userId, table.importHash)
      .where(sql`${table.importHash} IS NOT NULL`),
    check(
      'fin_transactions_amount_check',
      sql`${table.type} = 'adjustment' OR ${table.amount} > 0`
    ),
    check(
      'fin_transactions_transfer_check',
      sql`${table.type} <> 'transfer' OR (${table.toAccountId} IS NOT NULL AND ${table.toAccountId} <> ${table.accountId})`
    ),
  ]
);

// ---------------------------------------------------------------------------
// fin_valuations
// ---------------------------------------------------------------------------
export const finValuations = pgTable(
  'fin_valuations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => finAccounts.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    value: bigint('value', { mode: 'number' }).notNull(),
    costBasis: bigint('cost_basis', { mode: 'number' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('fin_valuations_account_date_idx').on(table.accountId, table.date),
    index('fin_valuations_account_id_idx').on(table.accountId),
    index('fin_valuations_user_id_idx').on(table.userId),
  ]
);

// ---------------------------------------------------------------------------
// fin_budgets
// ---------------------------------------------------------------------------
export const finBudgets = pgTable(
  'fin_budgets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => finCategories.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    period: text('period', {
      enum: ['monthly', 'quarterly', 'yearly'],
    })
      .notNull()
      .default('monthly'),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('fin_budgets_user_id_idx').on(table.userId),
    index('fin_budgets_user_category_idx').on(table.userId, table.categoryId),
  ]
);

// ---------------------------------------------------------------------------
// fin_recurring_rules
// ---------------------------------------------------------------------------
export const finRecurringRules = pgTable(
  'fin_recurring_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => finAccounts.id, { onDelete: 'cascade' }),
    toAccountId: text('to_account_id').references(() => finAccounts.id, { onDelete: 'set null' }),
    categoryId: text('category_id').references(() => finCategories.id, { onDelete: 'set null' }),
    type: text('type', {
      enum: ['expense', 'income', 'transfer', 'contribution'],
    }).notNull(),
    subType: text('sub_type'),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    amountType: text('amount_type', {
      enum: ['fixed', 'variable'],
    })
      .notNull()
      .default('fixed'),
    payee: text('payee'),
    note: text('note'),
    frequency: text('frequency', {
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
    }).notNull(),
    interval: integer('interval').notNull().default(1),
    weekdays: integer('weekdays').array(),
    dayOfMonth: text('day_of_month'),
    monthOfYear: integer('month_of_year'),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    maxOccurrences: integer('max_occurrences'),
    occurrencesCount: integer('occurrences_count').notNull().default(0),
    mode: text('mode', {
      enum: ['auto_post', 'ask_confirm'],
    })
      .notNull()
      .default('auto_post'),
    skippedDates: text('skipped_dates')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    history: jsonb('history')
      .$type<
        Array<{
          effectiveFrom: string;
          amount?: number;
          amountType?: 'fixed' | 'variable';
          frequency?: string;
          interval?: number;
          dayOfMonth?: string;
          weekdays?: number[];
          monthOfYear?: number;
        }>
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),
    version: integer('version').notNull().default(1),
    nextOccurrence: date('next_occurrence', { mode: 'string' }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('fin_recurring_user_id_idx').on(table.userId),
    index('fin_recurring_active_next_idx').on(table.userId, table.isActive, table.nextOccurrence),
  ]
);

// ---------------------------------------------------------------------------
// fin_pf_entries
// ---------------------------------------------------------------------------
export const finPfEntries = pgTable(
  'fin_pf_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => finAccounts.id, { onDelete: 'cascade' }),
    entryKind: text('entry_kind', {
      enum: [
        'opening',
        'contribution',
        'transfer_in_principal',
        'transfer_in_interest',
        'interest_credit',
        'withdrawal',
      ],
    }).notNull(),
    periodMonth: text('period_month'),
    postedDate: date('posted_date', { mode: 'string' }),
    dateApprox: boolean('date_approx').notNull().default(false),
    epfWages: bigint('epf_wages', { mode: 'number' }).notNull().default(0),
    epsWages: bigint('eps_wages', { mode: 'number' }).notNull().default(0),
    employeeAmount: bigint('employee_amount', { mode: 'number' }).notNull().default(0),
    employerAmount: bigint('employer_amount', { mode: 'number' }).notNull().default(0),
    pensionAmount: bigint('pension_amount', { mode: 'number' }).notNull().default(0),
    sourceLabel: text('source_label'),
    passbookKey: text('passbook_key').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('fin_pf_entries_account_passbook_key_unique').on(table.accountId, table.passbookKey),
    index('fin_pf_entries_user_account_idx').on(table.userId, table.accountId),
    index('fin_pf_entries_account_period_idx').on(table.accountId, table.periodMonth),
    index('fin_pf_entries_account_date_idx').on(table.accountId, table.postedDate),
  ]
);

// ---------------------------------------------------------------------------
// fin_inbox
// ---------------------------------------------------------------------------
export const finInbox = pgTable(
  'fin_inbox',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    idempotencyKey: text('idempotency_key').notNull(),
    source: text('source', {
      enum: ['email', 'sms', 'api', 'n8n', 'recurring'],
    }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    direction: text('direction', {
      enum: ['debit', 'credit'],
    }).notNull(),
    currency: text('currency').notNull().default('INR'),
    merchant: text('merchant'),
    description: text('description'),
    accountHint: jsonb('account_hint').$type<{ last4?: string; name?: string } | null>(),
    reference: text('reference'),
    raw: text('raw'),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected', 'duplicate'],
    })
      .notNull()
      .default('pending'),
    matchedAccountId: text('matched_account_id').references(() => finAccounts.id, {
      onDelete: 'set null',
    }),
    suggestedCategoryId: text('suggested_category_id').references(() => finCategories.id, {
      onDelete: 'set null',
    }),
    duplicateWarning: jsonb('duplicate_warning').$type<
      Array<{ reason: string; existingId?: string }>
    >(),
    importHash: text('import_hash'),
    createdTransactionId: text('created_transaction_id').references(
      () => finTransactions.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('fin_inbox_user_status_idx').on(table.userId, table.status),
    uniqueIndex('fin_inbox_user_idempotency_key_idx').on(table.userId, table.idempotencyKey),
    uniqueIndex('fin_inbox_user_import_hash_idx')
      .on(table.userId, table.importHash)
      .where(sql`${table.importHash} IS NOT NULL`),
    index('fin_inbox_user_id_idx').on(table.userId),
  ]
);

// ---------------------------------------------------------------------------
// fin_reconciliations
// ---------------------------------------------------------------------------
export const finReconciliations = pgTable(
  'fin_reconciliations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => finAccounts.id, { onDelete: 'cascade' }),
    statementDate: date('statement_date', { mode: 'string' }).notNull(),
    statementBalance: bigint('statement_balance', { mode: 'number' }).notNull(),
    clearedBalance: bigint('cleared_balance', { mode: 'number' }).notNull().default(0),
    difference: bigint('difference', { mode: 'number' }).notNull().default(0),
    status: text('status', {
      enum: ['pending', 'reconciled'],
    })
      .notNull()
      .default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('fin_reconciliations_user_id_idx').on(table.userId),
    index('fin_reconciliations_account_date_idx').on(table.accountId, table.statementDate),
  ]
);

// ---------------------------------------------------------------------------
// payee_rules
// ---------------------------------------------------------------------------
export const payeeRules = pgTable(
  'payee_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    payeePattern: text('payee_pattern').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => finCategories.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('payee_rules_user_id_idx').on(table.userId),
    uniqueIndex('payee_rules_user_payee_pattern_idx').on(table.userId, table.payeePattern),
  ]
);

// ---------------------------------------------------------------------------
// webhook_endpoints
// ---------------------------------------------------------------------------
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secretHash: text('secret_hash').notNull(),
    events: text('events').array().notNull().default(sql`'{}'::text[]`),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('webhook_endpoints_user_id_idx').on(table.userId)]
);

// ---------------------------------------------------------------------------
// webhook_deliveries
// ---------------------------------------------------------------------------
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    status: text('status', {
      enum: ['pending', 'success', 'failed'],
    })
      .notNull()
      .default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, mode: 'date' }),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_endpoint_status_idx').on(table.endpointId, table.status),
    index('webhook_deliveries_status_next_attempt_idx').on(table.status, table.nextAttemptAt),
  ]
);

// ---------------------------------------------------------------------------
// fin_job_runs
// ---------------------------------------------------------------------------
export const finJobRuns = pgTable(
  'fin_job_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => newId()),
    job: text('job').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    status: text('status', {
      enum: ['running', 'completed', 'failed'],
    })
      .notNull()
      .default('running'),
    usersProcessed: integer('users_processed').notNull().default(0),
    created: integer('created').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('fin_job_runs_job_started_idx').on(table.job, table.startedAt),
  ]
);

// ---------------------------------------------------------------------------
// Inferred TypeScript domain types
// ---------------------------------------------------------------------------
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type FinUserSettings = typeof finUserSettings.$inferSelect;
export type NewFinUserSettings = typeof finUserSettings.$inferInsert;

export type FinAccount = typeof finAccounts.$inferSelect;
export type NewFinAccount = typeof finAccounts.$inferInsert;

export type FinCategory = typeof finCategories.$inferSelect;
export type NewFinCategory = typeof finCategories.$inferInsert;

export type FinTransaction = typeof finTransactions.$inferSelect;
export type NewFinTransaction = typeof finTransactions.$inferInsert;

export type FinValuation = typeof finValuations.$inferSelect;
export type NewFinValuation = typeof finValuations.$inferInsert;

export type FinBudget = typeof finBudgets.$inferSelect;
export type NewFinBudget = typeof finBudgets.$inferInsert;

export type FinRecurringRule = typeof finRecurringRules.$inferSelect;
export type NewFinRecurringRule = typeof finRecurringRules.$inferInsert;

export type FinPfEntry = typeof finPfEntries.$inferSelect;
export type NewFinPfEntry = typeof finPfEntries.$inferInsert;

export type FinInbox = typeof finInbox.$inferSelect;
export type NewFinInbox = typeof finInbox.$inferInsert;

export type FinReconciliation = typeof finReconciliations.$inferSelect;
export type NewFinReconciliation = typeof finReconciliations.$inferInsert;

export type PayeeRule = typeof payeeRules.$inferSelect;
export type NewPayeeRule = typeof payeeRules.$inferInsert;

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;

export type FinJobRun = typeof finJobRuns.$inferSelect;
export type NewFinJobRun = typeof finJobRuns.$inferInsert;
