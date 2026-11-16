import type { Config } from 'drizzle-kit';

export default {
    schema: ['./src/lib/db/schema.ts'],
    out: './src/lib/db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:54322/postgres',
    },
} satisfies Config;
