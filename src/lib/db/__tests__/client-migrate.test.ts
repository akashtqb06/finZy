import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isLocalDatabaseUrl, getSslConfig } from '../client';
import { runMigrations } from '../migrate';

describe('DB Client & Migration Safety', () => {
    describe('isLocalDatabaseUrl', () => {
        it('identifies localhost as local', () => {
            expect(isLocalDatabaseUrl('postgres://postgres:postgres@localhost:54322/postgres')).toBe(true);
        });

        it('identifies 127.0.0.1 as local', () => {
            expect(isLocalDatabaseUrl('postgres://postgres:postgres@127.0.0.1:54322/postgres')).toBe(true);
        });

        it('identifies IPv6 ::1 as local', () => {
            expect(isLocalDatabaseUrl('postgres://postgres:postgres@[::1]:54322/postgres')).toBe(true);
        });

        it('identifies .local domains as local', () => {
            expect(isLocalDatabaseUrl('postgres://postgres:postgres@myserver.local:5432/postgres')).toBe(true);
        });

        it('identifies remote cloud domains as remote', () => {
            expect(isLocalDatabaseUrl('postgres://postgres:secret@db.xyz.supabase.co:5432/postgres')).toBe(false);
            expect(isLocalDatabaseUrl('postgres://postgres:secret@ep-foo-bar-12345.us-east-2.aws.neon.tech/neondb')).toBe(false);
            expect(isLocalDatabaseUrl('postgres://postgres:secret@192.168.1.100:5432/postgres')).toBe(false);
        });
    });

    describe('getSslConfig', () => {
        it('returns false for local database URLs', () => {
            expect(getSslConfig('postgres://postgres:postgres@localhost:54322/postgres')).toBe(false);
            expect(getSslConfig('postgres://postgres:postgres@127.0.0.1:54322/postgres')).toBe(false);
        });

        it('returns rejectUnauthorized: false for remote databases by default', () => {
            expect(getSslConfig('postgres://postgres:secret@db.xyz.supabase.co:5432/postgres')).toEqual({
                rejectUnauthorized: false,
            });
        });

        it('returns false if sslmode=disable is explicitly requested', () => {
            expect(getSslConfig('postgres://postgres:secret@db.xyz.supabase.co:5432/postgres?sslmode=disable')).toBe(false);
        });

        it('returns rejectUnauthorized: true if sslmode=verify-full', () => {
            expect(getSslConfig('postgres://postgres:secret@db.xyz.supabase.co:5432/postgres?sslmode=verify-full')).toEqual({
                rejectUnauthorized: true,
            });
        });
    });

    describe('runMigrations Vercel & remote protection', () => {
        const originalVercel = process.env.VERCEL;
        const originalNextPhase = process.env.NEXT_PHASE;

        beforeEach(() => {
            delete process.env.VERCEL;
            delete process.env.NEXT_PHASE;
        });

        afterEach(() => {
            if (originalVercel !== undefined) {
                process.env.VERCEL = originalVercel;
            } else {
                delete process.env.VERCEL;
            }
            if (originalNextPhase !== undefined) {
                process.env.NEXT_PHASE = originalNextPhase;
            } else {
                delete process.env.NEXT_PHASE;
            }
        });

        it('refuses to run when VERCEL environment variable is set', async () => {
            process.env.VERCEL = '1';
            await expect(runMigrations()).rejects.toThrow(
                /Migrations must NEVER run in the Vercel build/
            );
        });

        it('refuses to run when NEXT_PHASE is production build', async () => {
            process.env.NEXT_PHASE = 'phase-production-build';
            await expect(runMigrations()).rejects.toThrow(
                /Migrations must NEVER run in the Vercel build/
            );
        });

        it('refuses remote host when --target live is omitted', async () => {
            const originalDirect = process.env.DIRECT_URL;
            const originalArgv = [...process.argv];
            try {
                process.env.DIRECT_URL = 'postgres://user:pass@db.live.supabase.co:5432/postgres';
                process.argv = ['node', 'migrate.ts'];
                await expect(runMigrations()).rejects.toThrow(
                    /Migrating a remote database requires '--target live'/
                );
            } finally {
                if (originalDirect !== undefined) {
                    process.env.DIRECT_URL = originalDirect;
                } else {
                    delete process.env.DIRECT_URL;
                }
                process.argv = originalArgv;
            }
        });

        it('refuses local target if direct URL points to a remote host', async () => {
            const originalDirect = process.env.DIRECT_URL;
            const originalArgv = [...process.argv];
            try {
                process.env.DIRECT_URL = 'postgres://user:pass@db.live.supabase.co:5432/postgres';
                process.argv = ['node', 'migrate.ts', '--target', 'local'];
                await expect(runMigrations()).rejects.toThrow(
                    /Refusing to migrate remote host .* with '--target local'/
                );
            } finally {
                if (originalDirect !== undefined) {
                    process.env.DIRECT_URL = originalDirect;
                } else {
                    delete process.env.DIRECT_URL;
                }
                process.argv = originalArgv;
            }
        });

        it('refuses live target if direct URL points to a local host', async () => {
            const originalDirect = process.env.DIRECT_URL;
            const originalArgv = [...process.argv];
            try {
                process.env.DIRECT_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
                process.argv = ['node', 'migrate.ts', '--target', 'live'];
                await expect(runMigrations()).rejects.toThrow(
                    /is a local database, not a live remote database/
                );
            } finally {
                if (originalDirect !== undefined) {
                    process.env.DIRECT_URL = originalDirect;
                } else {
                    delete process.env.DIRECT_URL;
                }
                process.argv = originalArgv;
            }
        });
    });
});
