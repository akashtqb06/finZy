'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@src/lib/supabase/server';
import { credentialsSchema, registerSchema } from './schemas';
import type { AuthActionResult } from './types';
import { ensureProfile } from '@src/lib/finance/profile';

export async function loginAction(
    _prevState: AuthActionResult,
    formData: FormData
): Promise<AuthActionResult> {
    const rawEmail = formData.get('email');
    const rawPassword = formData.get('password');
    const next = (formData.get('next') as string) || '/finance/overview';

    const parsed = credentialsSchema.safeParse({
        email: rawEmail,
        password: rawPassword,
    });

    if (!parsed.success) {
        const fieldErrors: AuthActionResult['fieldErrors'] = {};
        for (const issue of parsed.error.issues) {
            const field = issue.path[0] as 'email' | 'password';
            fieldErrors[field] = issue.message;
        }
        return { ok: false, fieldErrors };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
    });

    if (error || !data.user) {
        return { ok: false, formError: error?.message || 'Invalid credentials' };
    }

    try {
        await ensureProfile({
            id: data.user.id,
            email: data.user.email ?? parsed.data.email,
            displayName: data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? undefined,
        });
    } catch (err) {
        console.error('Failed lazy profile provisioning on login:', err);
    }

    redirect(next);
}

export async function registerAction(
    _prevState: AuthActionResult,
    formData: FormData
): Promise<AuthActionResult> {
    const rawName = formData.get('name');
    const rawEmail = formData.get('email');
    const rawPassword = formData.get('password');
    const rawConfirm = formData.get('confirmPassword');
    const next = (formData.get('next') as string) || '/finance/overview';

    const parsed = registerSchema.safeParse({
        name: rawName,
        email: rawEmail,
        password: rawPassword,
        confirmPassword: rawConfirm,
    });

    if (!parsed.success) {
        const fieldErrors: AuthActionResult['fieldErrors'] = {};
        for (const issue of parsed.error.issues) {
            const field = issue.path[0] as 'name' | 'email' | 'password' | 'confirmPassword';
            fieldErrors[field] = issue.message;
        }
        return { ok: false, fieldErrors };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
            data: {
                full_name: parsed.data.name,
            },
        },
    });

    if (error || !data.user) {
        return { ok: false, formError: error?.message || 'Failed to create account' };
    }

    try {
        await ensureProfile({
            id: data.user.id,
            email: data.user.email ?? parsed.data.email,
            displayName: parsed.data.name,
        });
    } catch (err) {
        console.error('Failed lazy profile provisioning on register:', err);
    }

    redirect(next);
}

export async function logoutAction(): Promise<void> {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
}
