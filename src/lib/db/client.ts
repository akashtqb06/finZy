import 'server-only';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { type PgDatabase, type PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema';
import { assertTestIsolationGuard } from './guard';
import { wrapDbError, wrapDrizzleSession, wrapQueryThenable } from './errors';

export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

// Configure safe integer & numeric parsers for node-postgres
pg.types.setTypeParser(20, (val: string) => {
    if (val === null) return null;
    const bi = BigInt(val);
    if (bi >= BigInt(Number.MIN_SAFE_INTEGER) && bi <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(bi);
    }
    return val;
});

pg.types.setTypeParser(1700, (val: string) => {
    if (val === null) return null;
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : val;
});

// Singleton pattern on globalThis (survives Next.js dev HMR)
const globalForDb = globalThis as unknown as {
    _biKitDb: AppDb | undefined;
    _biKitPool: pg.Pool | undefined;
    _biKitPglite: PGlite | undefined;
    _isPglite: boolean | undefined;
};

export function isLocalDatabaseUrl(connectionUrl: string): boolean {
    try {
        const url = new URL(connectionUrl);
        const hostname = url.hostname.toLowerCase();
        return (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname === '[::1]' ||
            hostname.endsWith('.local')
        );
    } catch {
        return connectionUrl.includes('localhost') || connectionUrl.includes('127.0.0.1');
    }
}

export function getSslConfig(connectionUrl: string): boolean | pg.ConnectionConfig['ssl'] {
    if (isLocalDatabaseUrl(connectionUrl)) {
        return false;
    }
    try {
        const url = new URL(connectionUrl);
        const sslmode = url.searchParams.get('sslmode');
        if (sslmode === 'disable') {
            return false;
        }
        if (sslmode === 'verify-full') {
            return { rejectUnauthorized: true };
        }
    } catch {
        // Fallback
    }
    return { rejectUnauthorized: false };
}

function shouldUsePglite(): boolean {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (isTest && process.env.USE_REAL_PG !== 'true') {
        return true;
    }
    return false;
}

function createDb(): AppDb {
    if (shouldUsePglite()) {
        assertTestIsolationGuard();
        const pglite = new PGlite();
        const drizzleDb = drizzlePglite(pglite, { schema });
        wrapDrizzleSession(drizzleDb);
        globalForDb._biKitPglite = pglite;
        globalForDb._biKitDb = drizzleDb;
        globalForDb._isPglite = true;
        return drizzleDb;
    }

    const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:54422/postgres';
    assertTestIsolationGuard(dbUrl);

    // Node-postgres Pool for serverless: max 2, idle timeout 30s, allowExitOnIdle
    const poolMax = process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 2;
    const pool = new pg.Pool({
        connectionString: dbUrl,
        max: poolMax,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        allowExitOnIdle: true,
        ssl: getSslConfig(dbUrl),
    });

    const drizzleDb = drizzlePg(pool, { schema });
    wrapDrizzleSession(drizzleDb);
    globalForDb._biKitPool = pool;
    globalForDb._biKitDb = drizzleDb;
    globalForDb._isPglite = false;
    return drizzleDb;
}

/**
 * Resets the connection handle (if open) and creates a new Drizzle instance.
 * In test mode, creates a fresh isolated PGlite instance.
 */
export function resetConnection(): AppDb {
    if (globalForDb._biKitPglite) {
        try {
            void globalForDb._biKitPglite.close();
        } catch {
            // Ignore if already closed
        }
        globalForDb._biKitPglite = undefined;
    }
    if (globalForDb._biKitPool) {
        try {
            void globalForDb._biKitPool.end();
        } catch {
            // Ignore if already ended
        }
        globalForDb._biKitPool = undefined;
    }
    globalForDb._biKitDb = undefined;
    return createDb();
}

export async function closeConnection(): Promise<void> {
    if (globalForDb._biKitPglite) {
        try {
            await globalForDb._biKitPglite.close();
        } catch {}
        globalForDb._biKitPglite = undefined;
    }
    if (globalForDb._biKitPool) {
        try {
            await globalForDb._biKitPool.end();
        } catch {}
        globalForDb._biKitPool = undefined;
    }
    globalForDb._biKitDb = undefined;
}

export function getDb(): AppDb {
    if (!globalForDb._biKitDb) {
        return createDb();
    }
    return globalForDb._biKitDb;
}

export function getPool(): pg.Pool | undefined {
    return globalForDb._biKitPool;
}

export function getPgliteInstance(): PGlite | undefined {
    return globalForDb._biKitPglite;
}

export function isPglite(): boolean {
    return Boolean(globalForDb._isPglite);
}

/**
 * Execute a transaction with SET LOCAL statement_timeout (safe for transaction poolers).
 */
export async function withTransaction<T>(
    callback: (tx: Parameters<Parameters<AppDb['transaction']>[0]>[0]) => Promise<T>,
    timeoutMs = 15000
): Promise<T> {
    const active = getDb();
    return await active.transaction(async (tx) => {
        try {
            await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(String(timeoutMs))}`);
        } catch {
            // Ignore in environments where SET LOCAL is unsupported
        }
        return await callback(tx);
    });
}

/**
 * Proxied `db` export: All callers importing `db` will seamlessly use the active
 * Drizzle connection, even after `resetConnection()` recreates the underlying instance.
 * Automatically injects SET LOCAL statement_timeout for transaction pooler safety.
 */
export const db = new Proxy({} as AppDb, {
    get(_target, prop, receiver) {
        const active = getDb();
        if (prop === 'transaction') {
            return async (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                callback: (tx: any) => Promise<any>,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                config?: any
            ) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return await (active as any).transaction(async (tx: any) => {
                    const timeoutMs = process.env.DB_STATEMENT_TIMEOUT_MS || '15000';
                    try {
                        await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(String(timeoutMs))}`);
                    } catch {
                        // Ignore in environments where SET LOCAL is unsupported
                    }
                    return await callback(tx);
                }, config);
            };
        }
        const value = Reflect.get(active as object, prop, receiver);
        if (typeof value === 'function') {
            const bound = (value as (...args: unknown[]) => unknown).bind(active);
            return (...args: unknown[]) => {
                try {
                    const result = bound(...args);
                    if (result && typeof (result as Record<string, unknown>).then === 'function') {
                        return wrapQueryThenable(result);
                    }
                    return result;
                } catch (err) {
                    throw wrapDbError(err);
                }
            };
        }
        return value;
    },
});
