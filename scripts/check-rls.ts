import pg from 'pg';
import path from 'node:path';

async function main() {
    const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    let tablesWithoutRls: string[] = [];

    if (directUrl) {
        console.log(`Checking RLS status against database...`);
        const client = new pg.Client({ connectionString: directUrl });
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
