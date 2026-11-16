import { Suspense } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { profiles, finUserSettings } from '@src/lib/db/schema';
import { requireUser } from '@src/lib/auth/dal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileClient } from './profile-client';

async function ProfileContent() {
    const user = await requireUser('/settings/profile');

    const [profileRow] = await db
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);

    const [settingsRow] = await db
        .select({ timezone: finUserSettings.timezone })
        .from(finUserSettings)
        .where(eq(finUserSettings.userId, user.id))
        .limit(1);

    const displayName = profileRow?.displayName || user.name || (user.email ? user.email.split('@')[0] : 'User');
    const timezone = settingsRow?.timezone || 'Asia/Kolkata';

    return (
        <ProfileClient
            email={user.email}
            initialDisplayName={displayName}
            initialTimezone={timezone}
        />
    );
}

function ProfileSkeleton() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-64" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-9 w-80" />
                </CardContent>
            </Card>
        </div>
    );
}

export default function SettingsProfilePage() {
    return (
        <Suspense fallback={<ProfileSkeleton />}>
            <ProfileContent />
        </Suspense>
    );
}
