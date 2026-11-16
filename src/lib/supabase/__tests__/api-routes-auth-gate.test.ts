import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as supabaseServer from '@src/lib/supabase/server';

function findApiRouteFiles(dir: string, baseDir = dir): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findApiRouteFiles(fullPath, baseDir));
        } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
            results.push(fullPath);
        }
    }
    return results;
}

describe('API routes 401 unauthenticated security gate (enumerating test)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        // Unauthenticated client mock
        const mockClient = {
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }),
                mfa: {
                    getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: null, error: null }),
                },
            },
        };
        vi.spyOn(supabaseServer, 'createClient').mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);
    });

    const apiRootDir = path.resolve(process.cwd(), 'src/app/api');
    const routeFiles = findApiRouteFiles(apiRootDir);

    // Routes that are deliberately unauthenticated:
    // - /api/health (public monitoring endpoint)
    // - /api/settings/public (public app settings)
    // - /api/cron/* (authenticated via Bearer CRON_SECRET, not user session)
    const publicOrCronEndpoints = [
        'src/app/api/health/route.ts',
        'src/app/api/settings/public/route.ts',
        'src/app/api/cron/daily/route.ts',
        'src/app/api/cron/recurring/route.ts',
        'src/app/api/cron/valuations/route.ts',
    ];

    const protectedRouteFiles = routeFiles.filter((filePath) => {
        const relative = path.relative(process.cwd(), filePath);
        return !publicOrCronEndpoints.some((pub) => relative.endsWith(pub));
    });

    it('finds protected API routes in src/app/api', () => {
        expect(protectedRouteFiles.length).toBeGreaterThan(5);
    });

    for (const filePath of protectedRouteFiles) {
        const relPath = path.relative(process.cwd(), filePath);

        it(`route ${relPath} rejects unauthenticated calls with 401`, async () => {
            const routeModule = await import(filePath);
            const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

            for (const method of methods) {
                const handler = routeModule[method];
                if (typeof handler === 'function') {
                    const fakeReq = new Request(`http://localhost:3000/${relPath}`, {
                        method,
                        headers: {
                            'content-type': 'application/json',
                        },
                    });

                    let res: Response | null = null;
                    try {
                        res = await handler(fakeReq, { params: Promise.resolve({ id: 'test-id' }) });
                    } catch (err: unknown) {
                        // Threw UnauthorizedError directly
                        expect((err as Error).name).toBe('UnauthorizedError');
                        continue;
                    }

                    if (res) {
                        expect(res.status).toBe(401);
                    }
                }
            }
        });
    }
});

