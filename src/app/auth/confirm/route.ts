import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@src/lib/supabase/server';
import { isSafeRelativePath } from '@src/proxy';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const next = searchParams.get('next') ?? '/';
    const safeNext = isSafeRelativePath(next) ? next : '/';

    if (token_hash && type) {
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash,
        });

        if (!error) {
            return NextResponse.redirect(new URL(safeNext, request.url));
        }
        console.error('OTP verification error:', error.message);
    }

    return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
}

