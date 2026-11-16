'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@src/lib/supabase/server';

export async function signOutAction(): Promise<void> {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
}

export async function logoutAction(): Promise<void> {
    return signOutAction();
}
