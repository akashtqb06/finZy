import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@src/lib/supabase/server';
import { isSafeRelativePath } from '@src/proxy';

function getRedirectOrigin(request: NextRequest): string {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
    if (forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`;
    }
    return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';
    const safeNext = isSafeRelativePath(next) ? next : '/';
    const origin = getRedirectOrigin(request);

    if (token_hash && type) {
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        });

        if (!error) {
            return NextResponse.redirect(new URL(safeNext, origin));
        }
        console.error('OTP verification error:', error.message);
    }

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            return NextResponse.redirect(new URL(safeNext, origin));
        }
        console.error('PKCE code exchange error in confirm route:', error.message);
    }

    return NextResponse.redirect(new URL('/login?error=invalid_token', origin));
}
