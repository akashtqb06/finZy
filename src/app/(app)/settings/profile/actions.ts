'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { profiles, finUserSettings } from '@src/lib/db/schema';
import { requireUser } from '@src/lib/auth/dal';

export async function updateProfileDisplayNameAction(displayName: string): Promise<{ ok: boolean; error?: string }> {
    const user = await requireUser('/settings/profile');
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length > 80) {
        return { ok: false, error: 'Display name must be between 1 and 80 characters.' };
    }

    await db
        .update(profiles)
        .set({ displayName: trimmed, updatedAt: new Date() })
        .where(eq(profiles.id, user.id));

    revalidatePath('/settings/profile');
    return { ok: true };
}

export async function updateProfileTimezoneAction(timezone: string): Promise<{ ok: boolean; error?: string }> {
    const user = await requireUser('/settings/profile');
    if (!timezone) {
        return { ok: false, error: 'Timezone is required.' };
    }

    await db
        .update(finUserSettings)
        .set({ timezone, updatedAt: new Date() })
        .where(eq(finUserSettings.userId, user.id));

    revalidatePath('/settings/profile');
    return { ok: true };
}
