import { Suspense } from 'react';
import { requireUser } from '@src/lib/auth/dal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SecurityClient } from './security-client';

async function SecurityContent() {
    const user = await requireUser('/settings/security');
    return <SecurityClient currentEmail={user.email} />;
}

function SecuritySkeleton() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-4 w-64" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-9 w-full max-w-md" />
                    <Skeleton className="h-9 w-full max-w-md" />
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-44" />
                    <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-9 w-36" />
                </CardContent>
            </Card>
        </div>
    );
}

export default function SettingsSecurityPage() {
    return (
        <Suspense fallback={<SecuritySkeleton />}>
            <SecurityContent />
        </Suspense>
    );
}

