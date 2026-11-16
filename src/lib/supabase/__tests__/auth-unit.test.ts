import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentUser, requireUserApi } from '@src/lib/auth/dal';
import { UnauthorizedError, ForbiddenError } from '@src/lib/auth/policy';
import * as supabaseServer from '@src/lib/supabase/server';
import * as profileModule from '@src/lib/finance/profile';

describe('Supabase Auth DAL unit tests', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('getCurrentUser returns verified user id and email and provisions profile', async () => {
        const mockUser = {
            id: 'b0000000-0000-4000-a000-000000000001',
            email: 'user@example.com',
            user_metadata: { name: 'Verified User' },
        };

        const mockClient = {
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
                mfa: {
                    getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
                        data: { currentLevel: 'aal1', nextLevel: 'aal1' },
                        error: null,
                    }),
                },
            },
        };

        vi.spyOn(supabaseServer, 'createClient').mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);
        const ensureProfileSpy = vi.spyOn(profileModule, 'ensureProfile').mockResolvedValue();

        const user = await getCurrentUser();
        expect(user).not.toBeNull();
        expect(user?.id).toBe(mockUser.id);
        expect(user?.email).toBe(mockUser.email);
        expect(ensureProfileSpy).toHaveBeenCalledWith({ id: mockUser.id, email: mockUser.email });
    });

    it('getCurrentUser returns null when Supabase returns an error or no user', async () => {
        const mockClient = {
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Invalid token') }),
            },
        };

        vi.spyOn(supabaseServer, 'createClient').mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);
        const user = await getCurrentUser();
        expect(user).toBeNull();
    });

    it('getCurrentUser returns null when user has MFA enrolled but session is only AAL1', async () => {
        const mockUser = {
            id: 'b0000000-0000-4000-a000-000000000002',
            email: 'mfa@example.com',
        };

        const mockClient = {
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
                mfa: {
                    getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
                        data: { currentLevel: 'aal1', nextLevel: 'aal2' },
                        error: null,
                    }),
                },
            },
        };

        vi.spyOn(supabaseServer, 'createClient').mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);
        const user = await getCurrentUser();
        expect(user).toBeNull();
    });

    it('requireUserApi throws UnauthorizedError when no session is present', async () => {
        const mockClient = {
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }),
            },
        };

        vi.spyOn(supabaseServer, 'createClient').mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);
        await expect(requireUserApi()).rejects.toThrow(UnauthorizedError);
    });

    it('requireUserApi throws UnauthorizedError when MFA is enrolled but session is only AAL1', async () => {
        const mockUser = { id: 'mfa-uuid', email: 'mfa@example.com' };
        const mockClient = {
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
                mfa: {
                    getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
                        data: { currentLevel: 'aal1', nextLevel: 'aal2' },
                        error: null,
                    }),
                },
            },
        };

        vi.spyOn(supabaseServer, 'createClient').mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);
        await expect(requireUserApi()).rejects.toThrow(UnauthorizedError);
    });

    it('requireUserApi rejects mutating request with untrusted origin', async () => {
        const origAppUrl = process.env.APP_URL;
        process.env.APP_URL = 'https://app.finzy.local';

        try {
            const req = new Request('https://app.finzy.local/api/finance/accounts', {
                method: 'POST',
                headers: {
                    origin: 'https://evil.com',
                },
            });

            await expect(requireUserApi(req)).rejects.toThrow(ForbiddenError);
        } finally {
            process.env.APP_URL = origAppUrl;
        }
    });
});
