#!/usr/bin/env tsx
// pnpm finance:verify --user <email-or-uuid> [--hashed]
// Reconciles finance records and verifies account balances and net worth

import { parseArgs } from 'node:util';
import crypto from 'node:crypto';
import pg from 'pg';

export interface VerificationResult {
    userId: string;
    accountsCount: number;
    activeTxCount: number;
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    totalAssetsHash: string;
    totalLiabilitiesHash: string;
    netWorthHash: string;
    accountBalances: Map<string, { balance: number; valuation?: number }>;
}

export function hashAmount(amount: number): string {
    return crypto.createHash('sha256').update(String(amount)).digest('hex').slice(0, 16);
}

export async function verifyUserFinance(
    client: pg.Client | pg.PoolClient | { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
    userIdentifier: string,
    options: { asOfDate?: string } = {}
): Promise<VerificationResult> {
    const today = options.asOfDate || new Date().toISOString().slice(0, 10);

    // 1. Resolve userId
    let userId = userIdentifier.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

    if (!isUuid) {
        let resolved: string | null = null;
        try {
            const authRes = await client.query(
                `SELECT id FROM auth.users WHERE lower(email) = lower($1) LIMIT 1`,
                [userId]
            );
            if (authRes.rows.length > 0) {
                resolved = authRes.rows[0].id;
            }
        } catch {
            // auth schema might not be accessible
        }

        if (!resolved) {
            const profRes = await client.query(
                `SELECT id FROM public.profiles WHERE lower(display_name) = lower($1) LIMIT 1`,
                [userId]
            );
            if (profRes.rows.length > 0) {
                resolved = profRes.rows[0].id;
            }
        }

        if (!resolved) {
            throw new Error(`User with identifier '${userIdentifier}' not found in target database.`);
        }
        userId = resolved;
    }

    // 2. Count accounts
    const accCountRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM public.fin_accounts WHERE user_id = $1`,
        [userId]
    );
    const accountsCount = Number(accCountRes.rows[0]?.count ?? 0);

    // 3. Count active transactions
    const txCountRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM public.fin_transactions WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
    );
    const activeTxCount = Number(txCountRes.rows[0]?.count ?? 0);

    // 4. Accounts breakdown
    const accsRes = await client.query(
        `SELECT id, name, kind, class FROM public.fin_accounts WHERE user_id = $1 AND is_active = true ORDER BY name`,
        [userId]
    );
    const accs = accsRes.rows;

    const sourceSumsRes = await client.query(
        `SELECT account_id, COALESCE(SUM(signed_amount), 0)::bigint AS total
         FROM public.fin_transactions
         WHERE user_id = $1 AND deleted_at IS NULL
         GROUP BY account_id`,
        [userId]
    );
    const sourceMap = new Map<string, number>();
    for (const r of sourceSumsRes.rows) {
        sourceMap.set(r.account_id, Number(r.total));
    }

    const targetSumsRes = await client.query(
        `SELECT to_account_id, COALESCE(SUM(amount), 0)::bigint AS total
         FROM public.fin_transactions
         WHERE user_id = $1 AND type = 'transfer' AND deleted_at IS NULL AND to_account_id IS NOT NULL
         GROUP BY to_account_id`,
        [userId]
    );
    const targetMap = new Map<string, number>();
    for (const r of targetSumsRes.rows) {
        targetMap.set(r.to_account_id, Number(r.total));
    }

    const valRes = await client.query(
        `SELECT DISTINCT ON (account_id) account_id, value::bigint AS value
         FROM public.fin_valuations
         WHERE user_id = $1 AND date <= $2
         ORDER BY account_id, date DESC`,
        [userId, today]
    );
    const valMap = new Map<string, number>();
    for (const r of valRes.rows) {
        valMap.set(r.account_id, Number(r.value));
    }

    let totalAssets = 0;
    let totalLiabilities = 0;
    const accountBalances = new Map<string, { balance: number; valuation?: number }>();

    for (const acc of accs) {
        const rawBalance = (sourceMap.get(acc.id) ?? 0) + (targetMap.get(acc.id) ?? 0);
        const valuation = valMap.get(acc.id);
        const isLiability = acc.class === 'liability';
        const effectiveBalance = valuation !== undefined ? valuation : rawBalance;

        if (isLiability) {
            totalLiabilities += Math.max(0, -rawBalance);
        } else {
            totalAssets += effectiveBalance;
        }

        accountBalances.set(acc.id, { balance: rawBalance, valuation });
    }

    const netWorth = totalAssets - totalLiabilities;

    return {
        userId,
        accountsCount,
        activeTxCount,
        totalAssets,
        totalLiabilities,
        netWorth,
        totalAssetsHash: hashAmount(totalAssets),
        totalLiabilitiesHash: hashAmount(totalLiabilities),
        netWorthHash: hashAmount(netWorth),
        accountBalances,
    };
}

async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            user: { type: 'string', short: 'u' },
            hashed: { type: 'boolean', default: false },
            help: { type: 'boolean', short: 'h' },
        },
    });

    if (values.help || !values.user) {
        console.log(`Usage: pnpm finance:verify --user <email-or-uuid> [--hashed]`);
        process.exit(values.help ? 0 : 1);
    }

    const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!directUrl) {
        console.error('Error: DIRECT_URL or DATABASE_URL must be set to run finance:verify.');
        process.exit(1);
    }

    const isLocal = directUrl.includes('localhost') || directUrl.includes('127.0.0.1');
    const client = new pg.Client({
        connectionString: directUrl,
        ssl: isLocal ? false : { rejectUnauthorized: false },
    });

    await client.connect();
    try {
        const result = await verifyUserFinance(client, values.user);
        console.log(`\n======================================================`);
        console.log(` Finance Health Verification`);
        console.log(` User: ${result.userId}`);
        console.log(`======================================================`);
        console.log(`  Accounts Count:     ${result.accountsCount}`);
        console.log(`  Active Tx Count:    ${result.activeTxCount}`);

        if (values.hashed) {
            console.log(`  Total Assets Hash:  ${result.totalAssetsHash}`);
            console.log(`  Total Liab Hash:    ${result.totalLiabilitiesHash}`);
            console.log(`  Net Worth Hash:     ${result.netWorthHash}`);
        } else {
            console.log(`  Total Assets:       [Integrity Hash: ${result.totalAssetsHash}]`);
            console.log(`  Total Liabilities:  [Integrity Hash: ${result.totalLiabilitiesHash}]`);
            console.log(`  Net Worth:          [Integrity Hash: ${result.netWorthHash}]`);
        }
        console.log(`======================================================`);
        console.log(`Verification completed successfully.\n`);
    } finally {
        await client.end();
    }
}

if (process.argv[1] && process.argv[1].endsWith('finance-verify.ts')) {
    main().catch((err) => {
        console.error('Verification error:', err.message);
        process.exit(1);
    });
}
