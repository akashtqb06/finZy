'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ArrowLeftIcon, LoaderCircleIcon, MailCheckIcon } from 'lucide-react';
import { createClient } from '@src/lib/supabase/browser';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!email.trim()) {
            setFormError('Please enter your email address.');
            return;
        }

        startTransition(async () => {
            try {
                const supabase = createClient();
                const origin = window.location.origin;
                const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
                });

                if (error) {
                    console.error('Password reset request error:', error.message);
                }
                // Always display success message to prevent user enumeration
                setIsSubmitted(true);
            } catch (err: unknown) {
                console.error('Password reset unexpected error:', err);
                setIsSubmitted(true);
            }
        });
    };

    if (isSubmitted) {
        return (
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MailCheckIcon className="size-6" />
                    </div>
                    <CardTitle>Check your email</CardTitle>
                    <CardDescription>
                        If an account exists for <span className="font-medium text-foreground">{email}</span>, you
                        will receive a password reset link shortly.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground text-center">
                        Click the link in the email to choose a new password. You can close this window.
                    </p>
                    <Button variant="outline" className="w-full" nativeButton={false} render={<Link href="/login" />}>
                        <ArrowLeftIcon className="size-4 mr-2" />
                        Back to sign in
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Reset password</CardTitle>
                <CardDescription>
                    Enter your email address and we will send you a link to reset your password.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
                    {formError && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{formError}</AlertDescription>
                        </Alert>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isPending}
                            required
                        />
                    </div>
                    <Button type="submit" className="w-full mt-2" disabled={isPending}>
                        {isPending ? (
                            <>
                                <LoaderCircleIcon className="size-4 animate-spin mr-2" />
                                Sending reset link...
                            </>
                        ) : (
                            'Send reset link'
                        )}
                    </Button>
                    <div className="text-center">
                        <Link
                            href="/login"
                            className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeftIcon className="size-3 mr-1" />
                            Back to sign in
                        </Link>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
