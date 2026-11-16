import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
    let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
    try {
        cookieStore = await cookies();
    } catch {
        // May occur in non-request test contexts
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
    const supabaseAnonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        'dummy-anon-key-for-local-build-and-test';

    return createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return cookieStore ? cookieStore.getAll() : [];
                },
                setAll(cookiesToSet) {
                    if (!cookieStore || !cookieStore.set) return;
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // The `setAll` method was called from a Server Component.
                    }
                },
            },
        }
    );
}
