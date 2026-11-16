import { createClient } from '@src/lib/supabase/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { isSafeRelativePath } from '@src/proxy';

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const rawNext = searchParams.get('next') ?? '/';
    const next = isSafeRelativePath(rawNext) ? rawNext : '/';

    const forwardedHost = request.headers.get('x-forwarded-host');
    const isLocalEnv = process.env.NODE_ENV === 'development';

    const getRedirectUrl = (path: string) => {
        if (isLocalEnv) {
            return `${origin}${path}`;
        } else if (forwardedHost) {
            return `https://${forwardedHost}${path}`;
        } else {
            return `${origin}${path}`;
        }
    };

    const supabase = await createClient();

    // 1. Handle PKCE code flow (standard in @supabase/ssr)
    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(getRedirectUrl(next));
        }
        return NextResponse.redirect(
            getRedirectUrl(`/auth/error?error=${encodeURIComponent(error.message)}`)
        );
    }

    // 2. Handle token hash / OTP flow (e.g. magic link, recovery, signup confirmation)
    if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        });
        if (!error) {
            return NextResponse.redirect(getRedirectUrl(next));
        }
        return NextResponse.redirect(
            getRedirectUrl(`/auth/error?error=${encodeURIComponent(error.message)}`)
        );
    }

    // 3. Neither code nor token_hash provided
    return NextResponse.redirect(
        getRedirectUrl('/auth/error?error=Invalid+or+missing+confirmation+token')
    );
}
