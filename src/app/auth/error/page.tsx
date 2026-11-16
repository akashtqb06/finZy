import { Suspense } from 'react';
import Link from 'next/link';
import { AlertTriangleIcon, ArrowLeftIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
    title: 'Authentication Error | Finzy',
    description: 'An error occurred during authentication',
};

interface ErrorPageProps {
    searchParams: Promise<{
        error?: string;
        error_description?: string;
        message?: string;
    }>;
}

async function ErrorDetails({ searchParams }: ErrorPageProps) {
    const params = await searchParams;
    const rawError = params.error_description || params.error || params.message || '';

    const isExpired =
        !rawError ||
        rawError.toLowerCase().includes('expired') ||
        rawError.toLowerCase().includes('invalid') ||
        rawError.toLowerCase().includes('token') ||
        rawError.toLowerCase().includes('code');

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-center text-sm text-destructive">
                {rawError ? (
                    <p className="font-medium">{rawError}</p>
                ) : (
                    <p className="font-medium">The verification or reset link is invalid or has expired.</p>
                )}
            </div>

            <p className="text-center text-xs text-muted-foreground">
                {isExpired
                    ? 'Security links are time-sensitive and can only be used once. Please request a fresh link or sign in with your password.'
                    : 'Please try requesting a new link or contact support if the problem persists.'}
            </p>

            <div className="flex flex-col gap-2 pt-2">
                <Button className="w-full" nativeButton={false} render={<Link href="/forgot-password" />}>
                    <RefreshCwIcon className="mr-2 size-4" />
                    Request New Reset Link
                </Button>

                <Button variant="outline" className="w-full" nativeButton={false} render={<Link href="/login" />}>
                    <ArrowLeftIcon className="mr-2 size-4" />
                    Back to Sign In
                </Button>
            </div>
        </div>
    );
}

export default function AuthErrorPage({ searchParams }: ErrorPageProps) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground sm:px-6">
            <div className="w-full max-w-sm space-y-6">
                <Card className="border-border/60 bg-card text-card-foreground shadow-md">
                    <CardHeader className="space-y-2 pb-4 text-center">
                        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                            <AlertTriangleIcon className="size-6" />
                        </div>
                        <CardTitle className="text-2xl font-bold tracking-tight">Authentication Error</CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                            We could not complete your authentication request
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Suspense
                            fallback={
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                    Loading details...
                                </div>
                            }
                        >
                            <ErrorDetails searchParams={searchParams} />
                        </Suspense>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
