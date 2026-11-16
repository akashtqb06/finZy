import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@src/lib/supabase/server';
import { isSafeRelativePath } from '@src/proxy';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';
    const safeNext = isSafeRelativePath(next) ? next : '/';

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(new URL(safeNext, request.url));
        }
        console.error('PKCE code exchange error:', error.message);
    }

    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', request.url));
}

