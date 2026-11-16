import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { getCurrentUser } from '@src/lib/auth/dal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type LoginPageProps = {
    searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
};

async function LoginPageContent({ searchParams }: LoginPageProps) {
    const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
    if (user) {
        redirect('/');
    }
    const next = typeof params.next === 'string' ? params.next : '/';
    const error = typeof params.error === 'string' ? params.error : undefined;

    return <LoginForm next={next} initialError={error} />;
}

function LoginFormSkeleton() {
    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Sign in to your Finzy personal finance workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <Skeleton className="h-9 w-full" />
            </CardContent>
        </Card>
    );
}

export default function LoginPage(props: LoginPageProps) {
    return (
        <Suspense fallback={<LoginFormSkeleton />}>
            <LoginPageContent {...props} />
        </Suspense>
    );
}
