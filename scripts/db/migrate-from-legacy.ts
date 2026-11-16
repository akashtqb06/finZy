#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * scripts/db/migrate-from-legacy.ts
 * 
 * ETL Script: Migrates legacy BI-kit database (nanoid text user IDs, custom auth, BI tables)
 * into modern Supabase Finance database (UUID user IDs, profiles, RLS).
 * 
 * Invariants:
 * - Never prints credentials or amounts.
 * - Single target transaction in batches in strict FK order.
 * - Refuses non-empty target unless --replace + typed host confirmation.
 * - Rigorous verification with automatic rollback on discrepancy.
 */

import { parseArgs } from 'node:util';
import crypto from 'node:crypto';
import pg from 'pg';
import { verifyUserFinance } from '../finance-verify';

export interface UserMapping {
    [oldEmail: string]: string; // email -> new UUID
}

export interface EtlOptions {
    sourceUrl?: string;
    targetUrl?: string;
    sourceClient?: pg.Client | pg.PoolClient | any;
    targetClient?: pg.Client | pg.PoolClient | any;
    userMap: UserMapping;
    replace?: boolean;
    dryRun?: boolean;
    batchSize?: number;
    forcedMismatch?: boolean; // For testing rollback
    confirmHostFn?: (host: string) => Promise<boolean>;
}

export interface EtlSummary {
    migratedUsers: string[];
    skippedUsers: string[];
    skippedTables: string[];
    tableCounts: Record<string, { source: number; target: number; idChecksum: string }>;
    verificationPassed: boolean;
    dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Table Schema & Column Mappings
// ---------------------------------------------------------------------------

// Tables to skip explicitly
export const SKIPPED_TABLES = new Set([
    'sessions',
    'login_attempts',
    'audit_log',
    'schema_cache',
    'app_settings',
    'data_sources',
    'workbooks',
    'folders',
    'queries',
    'charts',
    'dashboards',
    'dashboard_favorites',
    'dashboard_views',
]);

// Source column allowlists per table. If an unexpected column is present, fail loudly.
export const TABLE_COLUMN_MAP: Record<string, { allowedSourceCols: string[]; targetCols: string[] }> = {
    users: {
        allowedSourceCols: ['id', 'name', 'email', 'password_hash', 'role', 'created_at', 'updated_at', 'avatar_url', 'metadata'],
        targetCols: ['id', 'display_name', 'created_at', 'updated_at'],
    },
    fin_user_settings: {
        allowedSourceCols: [
            'user_id',
            'base_currency',
            'timezone',
            'week_starts_on',
            'tracking_start_date',
            'include_eps_in_net_worth',
            'include_accrued_interest_in_net_worth',
            'setup_step',
            'setup_completed_at',
            'setup_skipped_at',
            'draft',
            'data_version',
            'created_at',
            'updated_at',
        ],
        targetCols: [
            'user_id',
            'base_currency',
            'timezone',
            'week_starts_on',
            'tracking_start_date',
            'include_eps_in_net_worth',
            'include_accrued_interest_in_net_worth',
            'setup_step',
            'setup_completed_at',
            'setup_skipped_at',
            'draft',
            'data_version',
            'created_at',
            'updated_at',
        ],
    },
    fin_categories: {
        allowedSourceCols: ['id', 'user_id', 'name', 'type', 'parent_id', 'icon', 'color', 'is_system', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'name', 'type', 'parent_id', 'icon', 'color', 'is_system', 'created_at', 'updated_at'],
    },
    fin_accounts: {
        allowedSourceCols: ['id', 'user_id', 'name', 'kind', 'class', 'currency', 'credit_limit', 'is_active', 'metadata', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'name', 'kind', 'class', 'currency', 'credit_limit', 'is_active', 'metadata', 'created_at', 'updated_at'],
    },
    fin_valuations: {
        allowedSourceCols: ['id', 'user_id', 'account_id', 'date', 'value', 'cost_basis', 'note', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'account_id', 'date', 'value', 'cost_basis', 'note', 'created_at', 'updated_at'],
    },
    fin_budgets: {
        allowedSourceCols: ['id', 'user_id', 'category_id', 'amount', 'period', 'start_date', 'end_date', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'category_id', 'amount', 'period', 'start_date', 'end_date', 'created_at', 'updated_at'],
    },
    fin_recurring_rules: {
        allowedSourceCols: ['id', 'user_id', 'account_id', 'to_account_id', 'category_id', 'type', 'amount', 'payee', 'note', 'notes', 'frequency', 'interval', 'start_date', 'end_date', 'next_occurrence', 'is_active', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'account_id', 'to_account_id', 'category_id', 'type', 'amount', 'payee', 'note', 'frequency', 'interval', 'start_date', 'end_date', 'next_occurrence', 'is_active', 'created_at', 'updated_at'],
    },
    fin_pf_entries: {
        allowedSourceCols: ['id', 'user_id', 'account_id', 'entry_kind', 'period_month', 'posted_date', 'date_approx', 'epf_wages', 'eps_wages', 'employee_amount', 'employer_amount', 'pension_amount', 'source_label', 'passbook_key', 'note', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'account_id', 'entry_kind', 'period_month', 'posted_date', 'date_approx', 'epf_wages', 'eps_wages', 'employee_amount', 'employer_amount', 'pension_amount', 'source_label', 'passbook_key', 'note', 'created_at', 'updated_at'],
    },
    fin_reconciliations: {
        allowedSourceCols: ['id', 'user_id', 'account_id', 'statement_date', 'statement_balance', 'cleared_balance', 'difference', 'status', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'account_id', 'statement_date', 'statement_balance', 'cleared_balance', 'difference', 'status', 'created_at', 'updated_at'],
    },
    fin_transactions: {
        allowedSourceCols: ['id', 'user_id', 'account_id', 'to_account_id', 'category_id', 'date', 'type', 'amount', 'signed_amount', 'payee', 'note', 'notes', 'tags', 'client_request_id', 'import_hash', 'is_recurring', 'recurring_rule_id', 'deleted_at', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'account_id', 'to_account_id', 'category_id', 'date', 'type', 'amount', 'signed_amount', 'payee', 'note', 'tags', 'client_request_id', 'import_hash', 'is_recurring', 'recurring_rule_id', 'deleted_at', 'created_at', 'updated_at'],
    },
    fin_inbox: {
        allowedSourceCols: ['id', 'user_id', 'idempotency_key', 'source', 'received_at', 'date', 'amount', 'direction', 'currency', 'merchant', 'description', 'account_hint', 'reference', 'raw', 'status', 'matched_account_id', 'suggested_category_id', 'duplicate_warning', 'import_hash', 'created_transaction_id', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'idempotency_key', 'source', 'received_at', 'date', 'amount', 'direction', 'currency', 'merchant', 'description', 'account_hint', 'reference', 'raw', 'status', 'matched_account_id', 'suggested_category_id', 'duplicate_warning', 'import_hash', 'created_transaction_id', 'created_at', 'updated_at'],
    },
    payee_rules: {
        allowedSourceCols: ['id', 'user_id', 'payee_pattern', 'match_type', 'category_id', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'payee_pattern', 'match_type', 'category_id', 'created_at', 'updated_at'],
    },
    webhook_endpoints: {
        allowedSourceCols: ['id', 'user_id', 'url', 'secret_hash', 'events', 'enabled', 'created_at', 'updated_at'],
        targetCols: ['id', 'user_id', 'url', 'secret_hash', 'events', 'enabled', 'created_at', 'updated_at'],
    },
    webhook_deliveries: {
        allowedSourceCols: ['id', 'endpoint_id', 'event_type', 'payload', 'status', 'attempt_count', 'next_attempt_at', 'last_attempt_at', 'last_status_code', 'last_error', 'created_at'],
        targetCols: ['id', 'endpoint_id', 'event_type', 'payload', 'status', 'attempt_count', 'next_attempt_at', 'last_attempt_at', 'last_status_code', 'last_error', 'created_at'],
    },
};

export function sha256Hex(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Host confirmation
// ---------------------------------------------------------------------------

async function defaultConfirmHost(hostname: string): Promise<boolean> {
    if (process.env.CONFIRM_REMOTE_HOST === hostname) {
        return true;
    }
    if (process.stdin.isTTY) {
        const readline = await import('node:readline/promises');
        const { stdin: input, stdout: output } = await import('node:process');
        const rl = readline.createInterface({ input, output });
        try {
            const answer = await rl.question(
                `CAUTION: Target database is not empty. Type target host '${hostname}' to confirm replacing data: `
            );
            return answer.trim() === hostname;
        } finally {
            rl.close();
        }
    }
    throw new Error(
        `Non-interactive terminal: replacing data on target host '${hostname}' requires CONFIRM_REMOTE_HOST='${hostname}'.`
    );
}

// ---------------------------------------------------------------------------
// Main ETL Runner
// ---------------------------------------------------------------------------

export async function runEtlMigration(options: EtlOptions): Promise<EtlSummary> {
    const {
        sourceUrl,
        targetUrl,
        userMap,
        replace = false,
        dryRun = false,
        batchSize = 500,
        forcedMismatch = false,
        confirmHostFn = defaultConfirmHost,
    } = options;

    let sourceClient = options.sourceClient;
    let targetClient = options.targetClient;
    let createdSourceClient = false;
    let createdTargetClient = false;

    if (!sourceClient) {
        if (!sourceUrl) throw new Error('SOURCE_DATABASE_URL is required for ETL migration.');
        const isLocal = sourceUrl.includes('localhost') || sourceUrl.includes('127.0.0.1');
        sourceClient = new pg.Client({ connectionString: sourceUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
        await sourceClient.connect();
        createdSourceClient = true;
    }

    if (!targetClient) {
        if (!targetUrl) throw new Error('DIRECT_URL is required for ETL migration.');
        const isLocal = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
        targetClient = new pg.Client({ connectionString: targetUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
        await targetClient.connect();
        createdTargetClient = true;
    }

    try {
        // 1. Introspect Source Tables
        const sourceTablesRes = await sourceClient.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        const sourceTableNames: string[] = sourceTablesRes.rows.map((r: { table_name: string }) => r.table_name);

        const skippedTables: string[] = [];
        const candidateTables: string[] = [];

        for (const tbl of sourceTableNames) {
            if (SKIPPED_TABLES.has(tbl) || tbl.startsWith('data_store_') || tbl.startsWith('_sync_')) {
                skippedTables.push(tbl);
            } else if (TABLE_COLUMN_MAP[tbl]) {
                candidateTables.push(tbl);
            } else {
                skippedTables.push(`${tbl} (unrecognized)`);
            }
        }

        // 2. Validate columns on all candidate source tables (Fail loudly on unknown columns)
        for (const tbl of candidateTables) {
            const colsRes = await sourceClient.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1;
            `, [tbl]);
            const actualCols: string[] = colsRes.rows.map((r: { column_name: string }) => r.column_name);
            const mapping = TABLE_COLUMN_MAP[tbl];

            for (const col of actualCols) {
                if (!mapping.allowedSourceCols.includes(col)) {
                    throw new Error(`UNKNOWN COLUMN ERROR: Source table '${tbl}' has unknown column '${col}'. ETL aborted.`);
                }
            }
        }

        // 3. User Resolution and Filtering
        const sourceUsersRes = await sourceClient.query(`
            SELECT id, email, name, created_at, updated_at
            FROM public.users;
        `);

        const oldIdToNewUuid = new Map<string, string>();
        const migratedUsers: string[] = [];
        const skippedUsers: string[] = [];
        const mappedUsersList: { oldId: string; newUuid: string; name: string; email: string; createdAt: Date; updatedAt: Date }[] = [];

        for (const u of sourceUsersRes.rows) {
            const emailLower = (u.email || '').trim().toLowerCase();
            const targetUuid = userMap[emailLower] || userMap[u.email];

            if (targetUuid && !emailLower.includes('demo')) {
                oldIdToNewUuid.set(u.id, targetUuid);
                migratedUsers.push(u.email);
                mappedUsersList.push({
                    oldId: u.id,
                    newUuid: targetUuid,
                    name: u.name || u.email,
                    email: u.email,
                    createdAt: u.created_at,
                    updatedAt: u.updated_at,
                });
            } else {
                skippedUsers.push(`${u.email || u.id} (unmapped or demo)`);
            }
        }

        if (mappedUsersList.length === 0) {
            throw new Error('No mapped users found matching --user-map. Migration aborted.');
        }

        const mappedOldUserIds = Array.from(oldIdToNewUuid.keys());

        // 4. Check Target Non-Empty State
        const targetCountRes = await targetClient.query(`
            SELECT 
                (SELECT count(*)::int FROM public.fin_accounts) as acc_count,
                (SELECT count(*)::int FROM public.fin_transactions) as tx_count,
                (SELECT count(*)::int FROM public.profiles) as prof_count;
        `);
        const existingTargetRecords =
            Number(targetCountRes.rows[0].acc_count) +
            Number(targetCountRes.rows[0].tx_count) +
            Number(targetCountRes.rows[0].prof_count);

        if (existingTargetRecords > 0) {
            if (!replace) {
                throw new Error(
                    `Target database contains existing records (${existingTargetRecords} total). ETL refused without --replace flag.`
                );
            }
            // If replace is specified, require host confirmation
            let targetHost = 'target-db';
            if (targetUrl) {
                try {
                    targetHost = new URL(targetUrl).hostname;
                } catch {
                    // Ignore
                }
            }
            const confirmed = await confirmHostFn(targetHost);
            if (!confirmed) {
                throw new Error(`ETL aborted: Target host confirmation failed for host '${targetHost}'.`);
            }
        }

        // 5. Begin ONE Target Transaction
        await targetClient.query('BEGIN');

        try {
            // Clean target tables if replace is active
            if (replace && existingTargetRecords > 0) {
                await targetClient.query(`
                    TRUNCATE TABLE 
                        public.webhook_deliveries,
                        public.webhook_endpoints,
                        public.payee_rules,
                        public.fin_inbox,
                        public.fin_transactions,
                        public.fin_reconciliations,
                        public.fin_pf_entries,
                        public.fin_recurring_rules,
                        public.fin_budgets,
                        public.fin_valuations,
                        public.fin_accounts,
                        public.fin_categories,
                        public.fin_user_settings,
                        public.profiles
                    CASCADE;
                `);
            }

            // A. profiles
            for (const user of mappedUsersList) {
                await targetClient.query(
                    `INSERT INTO public.profiles (id, display_name, created_at, updated_at)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;`,
                    [user.newUuid, user.name, user.createdAt, user.updatedAt]
                );
            }

            // B. fin_user_settings (Reset dataVersion = 1)
            const oldSettingsRes = await sourceClient.query(
                `SELECT * FROM public.fin_user_settings WHERE user_id = ANY($1)`,
                [mappedOldUserIds]
            );
            for (const s of oldSettingsRes.rows) {
                const newUuid = oldIdToNewUuid.get(s.user_id)!;
                await targetClient.query(
                    `INSERT INTO public.fin_user_settings (
                        user_id, base_currency, timezone, week_starts_on, tracking_start_date,
                        include_eps_in_net_worth, include_accrued_interest_in_net_worth,
                        setup_step, setup_completed_at, setup_skipped_at, draft, data_version,
                        created_at, updated_at
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12, $13)
                     ON CONFLICT (user_id) DO UPDATE SET
                        base_currency = EXCLUDED.base_currency,
                        timezone = EXCLUDED.timezone,
                        data_version = 1;`,
                    [
                        newUuid,
                        s.base_currency ?? 'INR',
                        s.timezone ?? 'Asia/Kolkata',
                        s.week_starts_on ?? 1,
                        s.tracking_start_date,
                        s.include_eps_in_net_worth ?? false,
                        s.include_accrued_interest_in_net_worth ?? false,
                        s.setup_step ?? 1,
                        s.setup_completed_at,
                        s.setup_skipped_at,
                        s.draft ? JSON.stringify(s.draft) : null,
                        s.created_at,
                        s.updated_at,
                    ]
                );
            }

            // C. fin_categories (Roots first where parent_id IS NULL, then child categories)
            const oldCategoriesRes = await sourceClient.query(
                `SELECT * FROM public.fin_categories WHERE user_id IS NULL OR user_id = ANY($1) ORDER BY parent_id NULLS FIRST`,
                [mappedOldUserIds]
            );
            for (const c of oldCategoriesRes.rows) {
                const newUserId = c.user_id ? oldIdToNewUuid.get(c.user_id) ?? null : null;
                await targetClient.query(
                    `INSERT INTO public.fin_categories (id, user_id, name, type, parent_id, icon, color, is_system, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     ON CONFLICT (id) DO NOTHING;`,
                    [c.id, newUserId, c.name, c.type, c.parent_id, c.icon, c.color, c.is_system ?? false, c.created_at, c.updated_at]
                );
            }

            // D. fin_accounts
            const oldAccountsRes = await sourceClient.query(
                `SELECT * FROM public.fin_accounts WHERE user_id = ANY($1) ORDER BY created_at`,
                [mappedOldUserIds]
            );
            const accountUserMap = new Map<string, string>(); // accountId -> newUuid
            for (const a of oldAccountsRes.rows) {
                const newUuid = oldIdToNewUuid.get(a.user_id)!;
                accountUserMap.set(a.id, newUuid);
                await targetClient.query(
                    `INSERT INTO public.fin_accounts (id, user_id, name, kind, class, currency, credit_limit, is_active, metadata, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                     ON CONFLICT (id) DO NOTHING;`,
                    [a.id, newUuid, a.name, a.kind, a.class, a.currency, a.credit_limit, a.is_active, JSON.stringify(a.metadata || {}), a.created_at, a.updated_at]
                );
            }

            const mappedAccountIds = Array.from(accountUserMap.keys());

            // E. fin_valuations (Source had no user_id; derive user_id from fin_accounts)
            let oldValuationsRes = { rows: [] as any[] };
            if (candidateTables.includes('fin_valuations') && mappedAccountIds.length > 0) {
                oldValuationsRes = await sourceClient.query(
                    `SELECT * FROM public.fin_valuations WHERE account_id = ANY($1) ORDER BY date`,
                    [mappedAccountIds]
                );
                for (const v of oldValuationsRes.rows) {
                    const newUuid = accountUserMap.get(v.account_id);
                    if (!newUuid) continue;
                    await targetClient.query(
                        `INSERT INTO public.fin_valuations (id, user_id, account_id, date, value, cost_basis, note, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                         ON CONFLICT (id) DO NOTHING;`,
                        [v.id, newUuid, v.account_id, v.date, v.value, v.cost_basis, v.note, v.created_at, v.updated_at]
                    );
                }
            }

            // F. fin_budgets
            let oldBudgetsRes = { rows: [] as any[] };
            if (candidateTables.includes('fin_budgets')) {
                oldBudgetsRes = await sourceClient.query(
                    `SELECT * FROM public.fin_budgets WHERE user_id = ANY($1)`,
                    [mappedOldUserIds]
                );
                for (const b of oldBudgetsRes.rows) {
                    const newUuid = oldIdToNewUuid.get(b.user_id)!;
                    await targetClient.query(
                        `INSERT INTO public.fin_budgets (id, user_id, category_id, amount, period, start_date, end_date, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                         ON CONFLICT (id) DO NOTHING;`,
                        [b.id, newUuid, b.category_id, b.amount, b.period ?? 'monthly', b.start_date, b.end_date, b.created_at, b.updated_at]
                    );
                }
            }

            // G. fin_recurring_rules
            let oldRecurringRes = { rows: [] as any[] };
            if (candidateTables.includes('fin_recurring_rules')) {
                oldRecurringRes = await sourceClient.query(
                    `SELECT * FROM public.fin_recurring_rules WHERE user_id = ANY($1)`,
                    [mappedOldUserIds]
                );
                for (const r of oldRecurringRes.rows) {
                    const newUuid = oldIdToNewUuid.get(r.user_id)!;
                    const note = r.note || r.notes || null;
                    await targetClient.query(
                        `INSERT INTO public.fin_recurring_rules (
                            id, user_id, account_id, to_account_id, category_id, type, amount, payee,
                            note, frequency, interval, start_date, end_date, next_occurrence, is_active,
                            created_at, updated_at
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                         ON CONFLICT (id) DO NOTHING;`,
                        [
                            r.id,
                            newUuid,
                            r.account_id,
                            r.to_account_id,
                            r.category_id,
                            r.type,
                            r.amount,
                            r.payee,
                            note,
                            r.frequency,
                            r.interval ?? 1,
                            r.start_date,
                            r.end_date,
                            r.next_occurrence,
                            r.is_active ?? true,
                            r.created_at,
                            r.updated_at,
                        ]
                    );
                }
            }

            // H. fin_pf_entries
            let oldPfRes = { rows: [] as any[] };
            if (candidateTables.includes('fin_pf_entries')) {
                oldPfRes = await sourceClient.query(
                    `SELECT * FROM public.fin_pf_entries WHERE user_id = ANY($1)`,
                    [mappedOldUserIds]
                );
                for (const pf of oldPfRes.rows) {
                    const newUuid = oldIdToNewUuid.get(pf.user_id)!;
                    await targetClient.query(
                        `INSERT INTO public.fin_pf_entries (
                            id, user_id, account_id, entry_kind, period_month, posted_date, date_approx,
                            epf_wages, eps_wages, employee_amount, employer_amount, pension_amount,
                            source_label, passbook_key, note, created_at, updated_at
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                         ON CONFLICT (id) DO NOTHING;`,
                        [
                            pf.id,
                            newUuid,
                            pf.account_id,
                            pf.entry_kind,
                            pf.period_month,
                            pf.posted_date,
                            pf.date_approx ?? false,
                            pf.epf_wages ?? 0,
                            pf.eps_wages ?? 0,
                            pf.employee_amount ?? 0,
                            pf.employer_amount ?? 0,
                            pf.pension_amount ?? 0,
                            pf.source_label,
                            pf.passbook_key,
                            pf.note,
                            pf.created_at,
                            pf.updated_at,
                        ]
                    );
                }
            }

            // I. fin_reconciliations
            let oldReconRes = { rows: [] as any[] };
            if (candidateTables.includes('fin_reconciliations')) {
                oldReconRes = await sourceClient.query(
                    `SELECT * FROM public.fin_reconciliations WHERE user_id = ANY($1)`,
                    [mappedOldUserIds]
                );
                for (const rec of oldReconRes.rows) {
                    const newUuid = oldIdToNewUuid.get(rec.user_id)!;
                    await targetClient.query(
                        `INSERT INTO public.fin_reconciliations (
                            id, user_id, account_id, statement_date, statement_balance, cleared_balance,
                            difference, status, created_at, updated_at
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                         ON CONFLICT (id) DO NOTHING;`,
                        [
                            rec.id,
                            newUuid,
                            rec.account_id,
                            rec.statement_date,
                            rec.statement_balance,
                            rec.cleared_balance ?? 0,
                            rec.difference ?? 0,
                            rec.status ?? 'pending',
                            rec.created_at,
                            rec.updated_at,
                        ]
                    );
                }
            }

            // J. fin_transactions (Batched insertion)
            const oldTxCountRes = await sourceClient.query(
                `SELECT count(*)::int as count FROM public.fin_transactions WHERE user_id = ANY($1)`,
                [mappedOldUserIds]
            );
            const totalTxCount = Number(oldTxCountRes.rows[0].count);

            for (let offset = 0; offset < totalTxCount; offset += batchSize) {
                const batchRes = await sourceClient.query(
                    `SELECT * FROM public.fin_transactions WHERE user_id = ANY($1) ORDER BY date, created_at LIMIT $2 OFFSET $3`,
                    [mappedOldUserIds, batchSize, offset]
                );

                for (const tx of batchRes.rows) {
                    const newUuid = oldIdToNewUuid.get(tx.user_id)!;
                    const note = tx.note || tx.notes || null;
                    await targetClient.query(
                        `INSERT INTO public.fin_transactions (
                            id, user_id, account_id, to_account_id, category_id, date, type, amount,
                            signed_amount, payee, note, tags, client_request_id, import_hash,
                            is_recurring, recurring_rule_id, deleted_at, created_at, updated_at
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                         ON CONFLICT (id) DO NOTHING;`,
                        [
                            tx.id,
                            newUuid,
                            tx.account_id,
                            tx.to_account_id,
                            tx.category_id,
                            tx.date,
                            tx.type,
                            tx.amount,
                            tx.signed_amount,
                            tx.payee,
                            note,
                            tx.tags,
                            tx.client_request_id,
                            tx.import_hash,
                            tx.is_recurring ?? false,
                            tx.recurring_rule_id,
                            tx.deleted_at,
                            tx.created_at,
                            tx.updated_at,
                        ]
                    );
                }
            }

            // K. fin_inbox
            let oldInboxRes = { rows: [] as any[] };
            if (candidateTables.includes('fin_inbox')) {
                oldInboxRes = await sourceClient.query(
                    `SELECT * FROM public.fin_inbox WHERE user_id = ANY($1)`,
                    [mappedOldUserIds]
                );
                for (const inb of oldInboxRes.rows) {
                    const newUuid = oldIdToNewUuid.get(inb.user_id)!;
                    await targetClient.query(
                        `INSERT INTO public.fin_inbox (
                            id, user_id, idempotency_key, source, received_at, date, amount, direction,
                            currency, merchant, description, account_hint, reference, raw, status,
                            matched_account_id, suggested_category_id, duplicate_warning, import_hash,
                            created_transaction_id, created_at, updated_at
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
                         ON CONFLICT (id) DO NOTHING;`,
                        [
                            inb.id,
                            newUuid,
                            inb.idempotency_key,
                            inb.source,
                            inb.received_at,
                            inb.date,
                            inb.amount,
                            inb.direction,
                            inb.currency ?? 'INR',
                            inb.merchant,
                            inb.description,
                            inb.account_hint ? JSON.stringify(inb.account_hint) : null,
                            inb.reference,
                            inb.raw,
                            inb.status ?? 'pending',
                            inb.matched_account_id,
                            inb.suggested_category_id,
                            inb.duplicate_warning ? JSON.stringify(inb.duplicate_warning) : null,
                            inb.import_hash,
                            inb.created_transaction_id,
                            inb.created_at,
                            inb.updated_at,
                        ]
                    );
                }
            }

            // L. payee_rules
            if (candidateTables.includes('payee_rules')) {
                const oldRulesRes = await sourceClient.query(
                    `SELECT * FROM public.payee_rules WHERE user_id = ANY($1)`,
                    [mappedOldUserIds]
                );
                for (const pr of oldRulesRes.rows) {
                    const newUuid = oldIdToNewUuid.get(pr.user_id)!;
                    await targetClient.query(
                        `INSERT INTO public.payee_rules (id, user_id, payee_pattern, match_type, category_id, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         ON CONFLICT (id) DO NOTHING;`,
                        [pr.id, newUuid, pr.payee_pattern, pr.match_type, pr.category_id, pr.created_at, pr.updated_at]
                    );
                }
            }

            // M. webhook_endpoints & deliveries
            if (candidateTables.includes('webhook_endpoints')) {
                const oldEndpointsRes = await sourceClient.query(
                    `SELECT * FROM public.webhook_endpoints WHERE user_id = ANY($1)`,
                    [mappedOldUserIds]
                );
                for (const we of oldEndpointsRes.rows) {
                    const newUuid = oldIdToNewUuid.get(we.user_id)!;
                    await targetClient.query(
                        `INSERT INTO public.webhook_endpoints (id, user_id, url, secret_hash, events, enabled, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                         ON CONFLICT (id) DO NOTHING;`,
                        [we.id, newUuid, we.url, we.secret_hash, we.events, we.enabled, we.created_at, we.updated_at]
                    );
                }
                if (candidateTables.includes('webhook_deliveries')) {
                    const endpointIds = oldEndpointsRes.rows.map((e: { id: string }) => e.id);
                    if (endpointIds.length > 0) {
                        const oldDeliveriesRes = await sourceClient.query(
                            `SELECT * FROM public.webhook_deliveries WHERE endpoint_id = ANY($1)`,
                            [endpointIds]
                        );
                        for (const wd of oldDeliveriesRes.rows) {
                            await targetClient.query(
                                `INSERT INTO public.webhook_deliveries (
                                    id, endpoint_id, event_type, payload, status, attempt_count,
                                    next_attempt_at, last_attempt_at, last_status_code, last_error, created_at
                                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                                 ON CONFLICT (id) DO NOTHING;`,
                                [
                                    wd.id,
                                    wd.endpoint_id,
                                    wd.event_type,
                                    wd.payload ? JSON.stringify(wd.payload) : null,
                                    wd.status,
                                    wd.attempt_count ?? 0,
                                    wd.next_attempt_at,
                                    wd.last_attempt_at,
                                    wd.last_status_code,
                                    wd.last_error,
                                    wd.created_at,
                                ]
                            );
                        }
                    }
                }
            }

            // -------------------------------------------------------------------
            // In-Transaction Verification
            // -------------------------------------------------------------------

            const tableCounts: Record<string, { source: number; target: number; idChecksum: string }> = {};

            const verifiedTables = [
                { name: 'fin_accounts', queryWhere: 'user_id = ANY($1)', srcParams: [mappedOldUserIds], tgtParams: [Array.from(oldIdToNewUuid.values())] },
                { name: 'fin_categories', queryWhere: 'user_id IS NULL OR user_id = ANY($1)', srcParams: [mappedOldUserIds], tgtParams: [Array.from(oldIdToNewUuid.values())] },
                { name: 'fin_transactions', queryWhere: 'user_id = ANY($1)', srcParams: [mappedOldUserIds], tgtParams: [Array.from(oldIdToNewUuid.values())] },
                { name: 'fin_valuations', queryWhere: 'account_id = ANY($1)', srcParams: [mappedAccountIds], tgtParams: [mappedAccountIds], tgtWhere: 'account_id = ANY($1)' },
                { name: 'fin_budgets', queryWhere: 'user_id = ANY($1)', srcParams: [mappedOldUserIds], tgtParams: [Array.from(oldIdToNewUuid.values())] },
                { name: 'fin_recurring_rules', queryWhere: 'user_id = ANY($1)', srcParams: [mappedOldUserIds], tgtParams: [Array.from(oldIdToNewUuid.values())] },
                { name: 'fin_pf_entries', queryWhere: 'user_id = ANY($1)', srcParams: [mappedOldUserIds], tgtParams: [Array.from(oldIdToNewUuid.values())] },
            ];

            for (const vt of verifiedTables) {
                const sRes = await sourceClient.query(
                    `SELECT id FROM public.${vt.name} WHERE ${vt.queryWhere} ORDER BY id`,
                    vt.srcParams
                );
                const tRes = await targetClient.query(
                    `SELECT id FROM public.${vt.name} WHERE ${vt.tgtWhere || vt.queryWhere} ORDER BY id`,
                    vt.tgtParams
                );

                const srcIds: string[] = sRes.rows.map((r: { id: string }) => r.id);
                const tgtIds: string[] = tRes.rows.map((r: { id: string }) => r.id);

                const srcHash = sha256Hex(srcIds.join(','));
                const tgtHash = sha256Hex(tgtIds.join(','));

                if (srcIds.length !== tgtIds.length || srcHash !== tgtHash) {
                    throw new Error(
                        `VERIFICATION MISMATCH on table '${vt.name}': source count ${srcIds.length} (hash ${srcHash}) != target count ${tgtIds.length} (hash ${tgtHash})`
                    );
                }

                tableCounts[vt.name] = {
                    source: srcIds.length,
                    target: tgtIds.length,
                    idChecksum: tgtHash,
                };
            }

            // Verification of transaction sums by type (hashed)
            const srcSumsRes = await sourceClient.query(`
                SELECT type, SUM(amount)::bigint as total_amount, SUM(signed_amount)::bigint as total_signed
                FROM public.fin_transactions
                WHERE user_id = ANY($1) AND deleted_at IS NULL
                GROUP BY type ORDER BY type;
            `, [mappedOldUserIds]);

            const tgtSumsRes = await targetClient.query(`
                SELECT type, SUM(amount)::bigint as total_amount, SUM(signed_amount)::bigint as total_signed
                FROM public.fin_transactions
                WHERE user_id = ANY($1) AND deleted_at IS NULL
                GROUP BY type ORDER BY type;
            `, [Array.from(oldIdToNewUuid.values())]);

            const srcSumsStr = JSON.stringify(srcSumsRes.rows);
            const tgtSumsStr = JSON.stringify(tgtSumsRes.rows);
            if (srcSumsStr !== tgtSumsStr) {
                throw new Error(
                    `TRANSACTION SUMS MISMATCH: Source and target sums by transaction type do not match.`
                );
            }

            // Date ranges check (cast to ::text for string comparison)
            const srcDatesRes = await sourceClient.query(`
                SELECT MIN(date)::text as min_date, MAX(date)::text as max_date
                FROM public.fin_transactions
                WHERE user_id = ANY($1);
            `, [mappedOldUserIds]);

            const tgtDatesRes = await targetClient.query(`
                SELECT MIN(date)::text as min_date, MAX(date)::text as max_date
                FROM public.fin_transactions
                WHERE user_id = ANY($1);
            `, [Array.from(oldIdToNewUuid.values())]);

            const srcMin = srcDatesRes.rows[0]?.min_date ?? null;
            const srcMax = srcDatesRes.rows[0]?.max_date ?? null;
            const tgtMin = tgtDatesRes.rows[0]?.min_date ?? null;
            const tgtMax = tgtDatesRes.rows[0]?.max_date ?? null;

            if (srcMin !== tgtMin || srcMax !== tgtMax) {
                throw new Error(`DATE RANGE MISMATCH: Transaction date bounds (${srcMin}..${srcMax}) != (${tgtMin}..${tgtMax}).`);
            }

            // Run app reconciliation on each mapped user
            for (const user of mappedUsersList) {
                const recon = await verifyUserFinance(targetClient, user.newUuid);
                if (recon.accountsCount === 0 && tableCounts['fin_accounts']?.target > 0) {
                    throw new Error(`RECONCILIATION FAILURE for user ${user.newUuid}: 0 accounts found.`);
                }
            }

            // Forced mismatch simulation for tests
            if (forcedMismatch) {
                throw new Error('FORCED MISMATCH: Simulating verification failure to prove transaction rollback.');
            }

            if (dryRun) {
                await targetClient.query('ROLLBACK');
            } else {
                await targetClient.query('COMMIT');
            }

            return {
                migratedUsers,
                skippedUsers,
                skippedTables,
                tableCounts,
                verificationPassed: true,
                dryRun,
            };
        } catch (txErr) {
            await targetClient.query('ROLLBACK');
            throw txErr;
        }
    } finally {
        if (createdSourceClient) await sourceClient.end();
        if (createdTargetClient) await targetClient.end();
    }
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            'user-map': { type: 'string', multiple: true },
            'source-url': { type: 'string' },
            'target-url': { type: 'string' },
            replace: { type: 'boolean', default: false },
            'dry-run': { type: 'boolean', default: false },
            'batch-size': { type: 'string', default: '500' },
            help: { type: 'boolean', short: 'h' },
        },
    });

    if (values.help) {
        console.log(`
Usage: pnpm tsx scripts/db/migrate-from-legacy.ts [options]

Options:
  --user-map <email=uuid>   Mapping from legacy user email to target Supabase Auth UUID (repeatable or comma-separated)
  --source-url <url>        Source legacy PostgreSQL URL (defaults to SOURCE_DATABASE_URL env)
  --target-url <url>        Target Supabase PostgreSQL URL (defaults to DIRECT_URL or DATABASE_URL env)
  --replace                 Replace existing target data if non-empty (requires typed host confirmation)
  --dry-run                 Run ETL and full verification inside a transaction and rollback at the end
  --batch-size <num>        Batch size for inserting transactions (default: 500)
`);
        process.exit(0);
    }

    const rawUserMap = values['user-map'] || (process.env.USER_MAP ? [process.env.USER_MAP] : []);
    const userMap: UserMapping = {};

    for (const entry of rawUserMap) {
        const parts = entry.split(',');
        for (const part of parts) {
            const [email, uuid] = part.split('=');
            if (email && uuid) {
                userMap[email.trim().toLowerCase()] = uuid.trim();
            }
        }
    }

    if (Object.keys(userMap).length === 0) {
        console.error('Error: At least one user mapping is required via --user-map old-email=new-auth-uuid or USER_MAP env.');
        process.exit(1);
    }

    const sourceUrl = values['source-url'] || process.env.SOURCE_DATABASE_URL;
    const targetUrl = values['target-url'] || process.env.DIRECT_URL || process.env.DATABASE_URL;

    if (!sourceUrl || !targetUrl) {
        console.error('Error: Both SOURCE_DATABASE_URL and DIRECT_URL (target) must be provided.');
        process.exit(1);
    }

    console.log(`\n======================================================`);
    console.log(` Starting Legacy Finance ETL Migration`);
    console.log(` Mode: ${values['dry-run'] ? 'DRY-RUN (will rollback)' : 'LIVE MIGRATION'}`);
    console.log(`======================================================\n`);

    const summary = await runEtlMigration({
        sourceUrl,
        targetUrl,
        userMap,
        replace: values.replace,
        dryRun: values['dry-run'],
        batchSize: parseInt(values['batch-size'] || '500', 10),
    });

    console.log(`Migrated Users (${summary.migratedUsers.length}):`);
    for (const u of summary.migratedUsers) console.log(`  + ${u}`);

    console.log(`\nSkipped Users (${summary.skippedUsers.length}):`);
    for (const u of summary.skippedUsers) console.log(`  - ${u}`);

    console.log(`\nSkipped Tables (${summary.skippedTables.length}):`);
    for (const t of summary.skippedTables) console.log(`  - ${t}`);

    console.log(`\n========================================================================================`);
    console.log(` Table Migration Summary & Checksums (Masked Display)`);
    console.log(`========================================================================================`);
    console.log(` ${'Table Name'.padEnd(26)} | ${'Source Rows'.padStart(12)} | ${'Target Rows'.padStart(12)} | ${'ID Checksum (SHA-256)'.padStart(20)}`);
    console.log(`----------------------------------------------------------------------------------------`);
    for (const [tbl, data] of Object.entries(summary.tableCounts)) {
        console.log(` ${tbl.padEnd(26)} | ${String(data.source).padStart(12)} | ${String(data.target).padStart(12)} | ${data.idChecksum.padStart(20)}`);
    }
    console.log(`========================================================================================\n`);

    if (summary.dryRun) {
        console.log(`[DRY-RUN COMPLETE] Verification passed 100%. Target transaction successfully rolled back.`);
    } else {
        console.log(`[MIGRATION SUCCESS] Target transaction committed. All verification checks passed.`);
    }
}

if (process.argv[1] && process.argv[1].endsWith('migrate-from-legacy.ts')) {
    main().catch((err) => {
        console.error('\nETL Migration FAILED:', err.message);
        process.exit(1);
    });
}
