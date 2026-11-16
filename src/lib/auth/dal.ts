import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@src/lib/supabase/server';
import { ensureProfile } from '@src/lib/finance/profile';
import { isAllowedOrigin } from '@src/lib/security/origin';
import { isSafeRelativePath } from '@src/proxy';
import { ForbiddenError, UnauthorizedError, assertCan, assertOwner, can } from './policy';

export { assertCan, assertOwner, can, ForbiddenError, UnauthorizedError };

export type AuthUser = {
    id: string; // uuid
    email: string;
    name?: string;
};

// Backwards-compatibility type alias
export type SafeUser = AuthUser;

/**
 * Runs ensureProfile once per request using React cache()
 */
const cachedEnsureProfile = cache(async (user: { id: string; email?: string | null }) => {
    await ensureProfile({ id: user.id, email: user.email });
});

async function getRequestPathname(): Promise<string | null> {
    try {
        const headerList = await headers();
        const xPath = headerList.get('x-pathname');
        if (xPath) return xPath;

        const referer = headerList.get('referer');
        if (referer) {
            try {
                const url = new URL(referer);
                return url.pathname;
            } catch {
                // ignore invalid URL
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Returns { mfaRequired: boolean } based on Supabase Authenticator Assurance Level
 */
async function checkMfaAssurance(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
    try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error || !data) return false;
        // User has enrolled MFA factor (nextLevel === 'aal2'), but current session is only aal1
        if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
            return true;
        }
    } catch {
        // Ignored
    }
    return false;
}

/**
 * Returns { id (uuid), email } from verified Supabase claims.
 * Ensures user profile once per request.
 * Requires aal2 for sessions of MFA-enrolled users.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
    try {
        const supabase = await createClient();
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();

        if (!user || error) {
            return null;
        }

        const mfaRequired = await checkMfaAssurance(supabase);
        if (mfaRequired) {
            return null;
        }

        await cachedEnsureProfile({ id: user.id, email: user.email });

        return {
            id: user.id,
            email: user.email || '',
            name:
                user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                (user.email ? user.email.split('@')[0] : 'User'),
        };
    } catch {
        return null;
    }
}

/**
 * requireUser() for Server Components and Server Actions.
 * Redirects unauthenticated requests to /login?next=...
 * Redirects MFA-pending requests to /mfa?next=...
 */
export async function requireUser(next = '/'): Promise<AuthUser> {
    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    const requestPath = await getRequestPathname();
    const currentPath = requestPath ?? next;
    const safeNext = isSafeRelativePath(currentPath) ? currentPath : '/';

    if (!user || error) {
        redirect(`/login?next=${encodeURIComponent(safeNext)}`);
    }

    const mfaRequired = await checkMfaAssurance(supabase);
    if (mfaRequired) {
        redirect(`/mfa?next=${encodeURIComponent(safeNext)}`);
    }

    await cachedEnsureProfile({ id: user.id, email: user.email });

    return {
        id: user.id,
        email: user.email || '',
        name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            (user.email ? user.email.split('@')[0] : 'User'),
    };
}

/**
 * requireUserApi() for Route Handlers.
 * Throws UnauthorizedError (401 JSON) if unauthenticated or MFA is pending.
 * If request is provided, validates Origin on mutating methods (POST, PUT, PATCH, DELETE).
 */
export async function requireUserApi(request?: Request): Promise<AuthUser> {
    if (request && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) {
        const origin = request.headers.get('origin');
        if (!isAllowedOrigin(origin)) {
            throw new ForbiddenError('Invalid Origin');
        }
    }

    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (!user || error) {
        throw new UnauthorizedError();
    }

    const mfaRequired = await checkMfaAssurance(supabase);
    if (mfaRequired) {
        throw new UnauthorizedError('MFA verification required');
    }

    await cachedEnsureProfile({ id: user.id, email: user.email });

    return {
        id: user.id,
        email: user.email || '',
        name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            (user.email ? user.email.split('@')[0] : 'User'),
    };
}
