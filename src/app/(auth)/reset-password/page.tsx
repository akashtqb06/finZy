'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
    AlertCircleIcon,
    ArrowLeftIcon,
    CheckCircle2Icon,
    EyeIcon,
    EyeOffIcon,
    KeyRoundIcon,
    LoaderCircleIcon,
    LockIcon,
} from 'lucide-react';
import { createClient } from '@src/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifyingSession, setIsVerifyingSession] = useState(true);
    const [hasValidSession, setHasValidSession] = useState<boolean | null>(null);

    const router = useRouter();

    useEffect(() => {
        let isMounted = true;
        const supabase = createClient();

        // 1. Check for errors in URL hash fragments (e.g. #error=access_denied&error_code=otp_expired)
        if (typeof window !== 'undefined') {
            const hash = window.location.hash.startsWith('#')
                ? window.location.hash.substring(1)
                : window.location.hash;
            const hashParams = new URLSearchParams(hash);
            const errorCode = hashParams.get('error_code');
            const errorDesc = hashParams.get('error_description');

            if (errorCode || errorDesc) {
                queueMicrotask(() => {
                    if (isMounted) {
                        setHasValidSession(false);
                        setIsVerifyingSession(false);
                        setError(
                            errorDesc?.replace(/\+/g, ' ') ||
                                'The password reset link is invalid or has expired. Please request a new one.'
                        );
                    }
                });
                return;
            }
        }

        // 2. Verify whether the user has a valid authenticated session from the recovery link
        const checkSession = async () => {
            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                if (session) {
                    if (isMounted) setHasValidSession(true);
                } else {
                    const {
                        data: { user },
                    } = await supabase.auth.getUser();
                    if (isMounted) setHasValidSession(Boolean(user));
                }
            } catch {
                if (isMounted) setHasValidSession(false);
            } finally {
                if (isMounted) setIsVerifyingSession(false);
            }
        };

        checkSession();

        // 3. Listen for auth state change (e.g. PASSWORD_RECOVERY event)
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isMounted) return;
            if (event === 'PASSWORD_RECOVERY' || (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION'))) {
                setHasValidSession(true);
                setIsVerifyingSession(false);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError('Password must be at least 8 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match. Please verify both fields.');
            return;
        }

        const supabase = createClient();
        setIsLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password,
            });

            if (updateError) throw updateError;

            setSuccess(true);
            setTimeout(() => {
                router.push('/');
                router.refresh();
            }, 1500);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to update password. Please try again.');
            setIsLoading(false);
        }
    };

    if (isVerifyingSession) {
        return (
            <Card className="w-full max-w-sm border-border/60 bg-card text-card-foreground shadow-md">
                <CardContent className="flex flex-col items-center justify-center py-10 space-y-3">
                    <LoaderCircleIcon className="size-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Verifying your password reset session...</p>
                </CardContent>
            </Card>
        );
    }

    if (hasValidSession === false) {
        return (
            <Card className="w-full max-w-sm border-border/60 bg-card text-card-foreground shadow-md">
                <CardHeader className="space-y-2 pb-4 text-center">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                        <AlertCircleIcon className="size-6" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Link Invalid or Expired</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                        {error || 'This password reset link is invalid, has expired, or has already been used.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-center text-xs text-muted-foreground">
                        For security, password reset links can only be used once and expire after a short period. Please request a new link to proceed.
                    </p>
                    <div className="flex flex-col gap-2 pt-2">
                        <Button className="w-full" nativeButton={false} render={<Link href="/forgot-password" />}>
                            Request New Reset Link
                        </Button>
                        <Button variant="outline" className="w-full" nativeButton={false} render={<Link href="/login" />}>
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
                <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <KeyRoundIcon className="size-5" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight">Create new password</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                    Enter a strong new password for your account
                </CardDescription>
            </CardHeader>
            <CardContent>
                {success ? (
                    <div className="space-y-4 py-2 text-center">
                        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                            <CheckCircle2Icon className="size-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-foreground">Password updated successfully!</h3>
                            <p className="mt-1 text-xs text-muted-foreground">Redirecting to your workspace...</p>
                        </div>
                        <div className="pt-2">
                            <LoaderCircleIcon className="mx-auto size-5 animate-spin text-primary" />
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleUpdatePassword} className="space-y-4" noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-sm font-medium">
                                New password
                            </Label>
                            <div className="relative">
                                <LockIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-11 pl-10 pr-10 text-base md:text-sm"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    tabIndex={-1}
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? (
                                        <EyeOffIcon className="size-4" />
                                    ) : (
                                        <EyeIcon className="size-4" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Must be at least 8 characters long.</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-sm font-medium">
                                Confirm new password
                            </Label>
                            <div className="relative">
                                <LockIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="h-11 pl-10 pr-10 text-base md:text-sm"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    tabIndex={-1}
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                                >
                                    {showConfirmPassword ? (
                                        <EyeOffIcon className="size-4" />
                                    ) : (
                                        <EyeIcon className="size-4" />
                                    )}
                                </Button>
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
                                    Updating password...
                                </>
                            ) : (
                                'Update Password'
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
                )}
            </CardContent>
        </Card>
    );
}
