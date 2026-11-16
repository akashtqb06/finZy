'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertCircleIcon, ArrowLeftIcon, CheckCircle2Icon, LoaderCircleIcon, MailIcon } from 'lucide-react';
import { createClient } from '@src/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const cleanEmail = email.trim();
        if (!cleanEmail) {
            setError('Please enter your email address.');
            return;
        }

        const supabase = createClient();
        setIsLoading(true);
        setError(null);

        try {
            // Supabase PKCE flow requires redirecting through the server callback /auth/confirm
            const redirectTo = `${window.location.origin}/auth/confirm?next=/reset-password`;
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
            if (resetError) throw resetError;
            setSuccess(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to send reset link. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <Card className="w-full max-w-sm border-border/60 bg-card text-card-foreground shadow-md">
                <CardHeader className="space-y-2 pb-4 text-center">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                        <CheckCircle2Icon className="size-6" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Check your email</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                        We sent a password reset link to
                        <br />
                        <span className="font-medium text-foreground">{email}</span>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-center text-xs text-muted-foreground">
                        Click the link in the email to set a new password. If you do not see it within a few minutes, check your spam folder.
                    </p>

                    <div className="flex flex-col gap-2 pt-2">
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                                setSuccess(false);
                                setError(null);
                            }}
                        >
                            Send to a different email
                        </Button>

                        <Button className="w-full" nativeButton={false} render={<Link href="/login" />}>
                            <ArrowLeftIcon className="mr-2 size-4" />
                            Back to Sign In
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-sm border-border/60 bg-card text-card-foreground shadow-md">
            <CardHeader className="space-y-1 pb-4 text-center">
                <CardTitle className="text-2xl font-bold tracking-tight">Reset password</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                    Enter your email address and we will send you a link to reset your password
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleForgotPassword} className="space-y-4" noValidate>
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium">
                            Email address
                        </Label>
                        <div className="relative">
                            <MailIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-11 pl-10 text-base md:text-sm"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="h-11 w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
                                Sending reset link...
                            </>
                        ) : (
                            'Send reset link'
                        )}
                    </Button>

                    <div className="pt-2 text-center text-sm">
                        <Link
                            href="/login"
                            className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                        >
                            <ArrowLeftIcon className="mr-1.5 size-3.5" />
                            Back to Sign In
                        </Link>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
