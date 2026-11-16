'use server';

import { createClient } from '@src/lib/supabase/server';
import { isSafeRelativePath } from '@src/proxy';
import { redirect } from 'next/navigation';

export type LoginActionResult = {
    success: boolean;
    error?: string;
};

export async function loginAction(formData: FormData): Promise<LoginActionResult> {
    const email = (formData.get('email') as string)?.trim();
    const password = formData.get('password') as string;
    const rawNext = (formData.get('next') as string) || '/';
    const safeNext = isSafeRelativePath(rawNext) ? rawNext : '/';

    if (!email || !password) {
        return { success: false, error: 'Please enter both email and password.' };
    }

    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return { success: false, error: error.message || 'Invalid email or password.' };
        }

        if (!data.session) {
            return { success: false, error: 'Could not create session. Please try again.' };
        }

        // Check MFA requirement
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
            redirect(`/mfa?next=${encodeURIComponent(safeNext)}`);
        }
    } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
            throw err;
        }
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Login failed. Please try again.',
        };
    }

    redirect(safeNext);
}

export async function signOutAction(): Promise<void> {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
}
