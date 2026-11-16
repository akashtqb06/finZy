import { NextResponse, type NextRequest } from 'next/server';
import { validateRequestOrigin } from '@src/lib/security/origin';
import { updateSession } from '@src/lib/supabase/proxy';

export function isSafeRelativePath(path: string | null | undefined): boolean {
    if (!path || typeof path !== 'string') return false;
    if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
        return false;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) {
        return false;
    }
    if (path.includes('\\')) {
        return false;
    }
    return true;
}

export async function proxy(request: NextRequest) {
    // CSRF / Origin verification on mutating requests
    const originCheck = validateRequestOrigin(request);
    if (!originCheck.ok) {
        return new NextResponse(`Forbidden: ${originCheck.reason}`, { status: 403 });
    }

    const { pathname, search } = request.nextUrl;
    const isApi = pathname.startsWith('/api/') || pathname === '/api';
    const isPublicAuthPage =
        pathname === '/login' ||
        pathname === '/register' ||
        pathname === '/forgot-password' ||
        pathname === '/reset-password' ||
        pathname === '/invite-accept' ||
        pathname === '/mfa' ||
        pathname.startsWith('/auth/');

    // Refresh Supabase auth cookies
    const { supabaseResponse, user } = await updateSession(request);

    // Set x-pathname for layout and DAL helpers
    supabaseResponse.headers.set('x-pathname', pathname);

    // Real authorization checks live in the DAL (requireUserApi returns 401 JSON)
    if (isApi || isPublicAuthPage) {
        return supabaseResponse;
    }

    // Optimistic redirect of unauthenticated page requests to /login?next=...
    if (!user) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.search = '';
        const currentPath = `${pathname}${search}`;
        const safeNext = isSafeRelativePath(currentPath) ? currentPath : '/';
        loginUrl.searchParams.set('next', safeNext);

        const redirectResponse = NextResponse.redirect(loginUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
        });
        return redirectResponse;
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|ico|woff|woff2|ttf|otf)$).*)',
    ],
};