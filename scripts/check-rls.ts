import pg from 'pg';
import path from 'node:path';

function isLocalDatabaseUrl(connectionUrl: string): boolean {
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

function getSslConfig(connectionUrl: string): boolean | pg.ConnectionConfig['ssl'] {
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

async function main() {
    const targetIndex = process.argv.indexOf('--target');
    const target = targetIndex !== -1 ? process.argv[targetIndex + 1] : undefined;

    let directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!directUrl && target === 'local') {
        directUrl = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
    }

    let tablesWithoutRls: string[] = [];

    if (directUrl) {
        const parsed = new URL(directUrl);
        console.log(`Checking RLS status against database at ${parsed.hostname}...`);
        const client = new pg.Client({
            connectionString: directUrl,
            ssl: getSslConfig(directUrl),
        });
        await client.connect();
        try {
            const res = await client.query<{ tablename: string; rowsecurity: boolean }>(`
                SELECT tablename, rowsecurity
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY tablename;
            `);
            tablesWithoutRls = res.rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
        } finally {
            await client.end();
        }
    } else {
        console.log(`No DATABASE_URL set. Running check against in-memory PGlite with migrations...`);
        const { PGlite } = await import('@electric-sql/pglite');
        const { drizzle } = await import('drizzle-orm/pglite');
        const { migrate } = await import('drizzle-orm/pglite/migrator');

        const pglite = new PGlite();
        const db = drizzle(pglite);
        const migrationsFolder = path.resolve(process.cwd(), 'src/lib/db/migrations');
        await migrate(db, { migrationsFolder });

        const res = await pglite.query<{ tablename: string; rowsecurity: boolean }>(`
            SELECT tablename, rowsecurity
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename;
        `);
        tablesWithoutRls = res.rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
        await pglite.close();
    }

    if (tablesWithoutRls.length > 0) {
        console.error(`[RLS Check FAILED] The following public tables lack Row Level Security (RLS):`);
        for (const tbl of tablesWithoutRls) {
            console.error(`  - ${tbl}`);
        }
        process.exit(1);
    }

    console.log(`[RLS Check PASSED] All public tables have Row Level Security (RLS) enabled.`);
}

main().catch((err) => {
    console.error('Failed to run RLS check:', err);
    process.exit(1);
});
