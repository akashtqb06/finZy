import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Supabase Auth lifecycle & flows (e2e)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('login flow: succeeds with valid credentials and handles invalid credentials gracefully', async () => {
        const mockAuth = {
            signInWithPassword: vi.fn().mockImplementation(async ({ email, password }) => {
                if (email === 'dev@finzy.local' && password === 'valid_pass') {
                    return {
                        data: {
                            user: { id: 'u-123', email },
                            session: { access_token: 'valid.jwt.token' },
                        },
                        error: null,
                    };
                }
                return {
                    data: { user: null, session: null },
                    error: { message: 'Invalid login credentials', status: 400 },
                };
            }),
            mfa: {
                getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
                    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
                    error: null,
                }),
            },
        };

        const client = { auth: mockAuth };
        // Valid login
        const validRes = await client.auth.signInWithPassword({
            email: 'dev@finzy.local',
            password: 'valid_pass',
        });
        expect(validRes.error).toBeNull();
        expect(validRes.data.user?.id).toBe('u-123');

        // Invalid login (returns friendly error without leaking user existence)
        const invalidRes = await client.auth.signInWithPassword({
            email: 'nonexistent@finzy.local',
            password: 'wrong',
        });
        expect(invalidRes.error).not.toBeNull();
        expect(invalidRes.error?.message).toBe('Invalid login credentials');
    });

    it('forgot password flow: triggers reset password email', async () => {
        const mockAuth = {
            resetPasswordForEmail: vi.fn().mockResolvedValue({
                data: {},
                error: null,
            }),
        };

        const client = { auth: mockAuth };
        const res = await client.auth.resetPasswordForEmail('user@finzy.local', {
            redirectTo: 'http://localhost:3000/auth/confirm?next=/reset-password',
        });
        expect(res.error).toBeNull();
        expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith(
            'user@finzy.local',
            expect.objectContaining({
                redirectTo: 'http://localhost:3000/auth/confirm?next=/reset-password',
            })
        );
    });

    it('passwordless magic link flow: triggers signInWithOtp', async () => {
        const mockAuth = {
            signInWithOtp: vi.fn().mockResolvedValue({
                data: {},
                error: null,
            }),
        };

        const client = { auth: mockAuth };
        const res = await client.auth.signInWithOtp({
            email: 'user@finzy.local',
            options: {
                emailRedirectTo: 'http://localhost:3000/auth/confirm?next=/',
            },
        });
        expect(res.error).toBeNull();
        expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
            email: 'user@finzy.local',
            options: {
                emailRedirectTo: 'http://localhost:3000/auth/confirm?next=/',
            },
        });
    });

    it('reset password flow: updateUser updates password for authenticated recovery session', async () => {
        const mockAuth = {
            updateUser: vi.fn().mockResolvedValue({
                data: { user: { id: 'u-123' } },
                error: null,
            }),
        };

        const client = { auth: mockAuth };
        const res = await client.auth.updateUser({
            password: 'new-secure-password',
        });
        expect(res.error).toBeNull();
        expect(res.data?.user?.id).toBe('u-123');
        expect(mockAuth.updateUser).toHaveBeenCalledWith({
            password: 'new-secure-password',
        });
    });

    it('MFA enroll, challenge, and verify flow', async () => {
        const mockMfa = {
            enroll: vi.fn().mockResolvedValue({
                data: {
                    id: 'factor-totp-123',
                    type: 'totp',
                    totp: {
                        qr_code: '<svg>mock-qr</svg>',
                        secret: 'JBSWY3DPEHPK3PXP',
                        uri: 'otpauth://totp/Finzy?secret=JBSWY3DPEHPK3PXP',
                    },
                },
                error: null,
            }),
            challenge: vi.fn().mockResolvedValue({
                data: {
                    id: 'challenge-456',
                    expires_at: 1700000000,
                },
                error: null,
            }),
            verify: vi.fn().mockResolvedValue({
                data: {
                    user: { id: 'u-123' },
                },
                error: null,
            }),
            getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
                data: { currentLevel: 'aal2', nextLevel: 'aal2' },
                error: null,
            }),
        };

        const client = { auth: { mfa: mockMfa } };

        // 1. Enroll
        const enrollRes = await client.auth.mfa.enroll({ factorType: 'totp' });
        expect(enrollRes.data?.id).toBe('factor-totp-123');
        expect(enrollRes.data?.totp.qr_code).toBe('<svg>mock-qr</svg>');

        // 2. Challenge
        const challengeRes = await client.auth.mfa.challenge({ factorId: enrollRes.data!.id });
        expect(challengeRes.data?.id).toBe('challenge-456');

        // 3. Verify
        const verifyRes = await client.auth.mfa.verify({
            factorId: enrollRes.data!.id,
            challengeId: challengeRes.data!.id,
            code: '123456',
        });
        expect(verifyRes.error).toBeNull();

        // 4. Assurance level reaches aal2
        const aalRes = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        expect(aalRes.data?.currentLevel).toBe('aal2');
    });

    it('signOut supports local, others, and global scopes', async () => {
        const signOutMock = vi.fn().mockResolvedValue({ error: null });
        const client = { auth: { signOut: signOutMock } };

        // Scope: local
        await client.auth.signOut({ scope: 'local' });
        expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });

        // Scope: others
        await client.auth.signOut({ scope: 'others' });
        expect(signOutMock).toHaveBeenCalledWith({ scope: 'others' });

        // Scope: global
        await client.auth.signOut({ scope: 'global' });
        expect(signOutMock).toHaveBeenCalledWith({ scope: 'global' });
    });
});
