'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
    ArrowLeftIcon,
    EyeIcon,
    EyeOffIcon,
    KeyRoundIcon,
    LoaderCircleIcon,
    MailCheckIcon,
    SparklesIcon,
} from 'lucide-react';
import { loginAction } from '@src/app/actions/auth';
import { createClient } from '@src/lib/supabase/browser';
import { isSafeRelativePath } from '@src/proxy';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function LoginForm({
    next = '/',
    initialError,
}: {
    next?: string;
    initialError?: string;
}) {
    const router = useRouter();
    const [authMethod, setAuthMethod] = useState<'password' | 'magic-link'>('password');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [formError, setFormError] = useState<string | null>(() => {
        if (!initialError) return null;
        if (initialError === 'invalid_token') {
            return 'The authentication link has expired or is invalid. Please sign in or request a new link.';
        }
        if (initialError === 'auth_callback_failed') {
            return 'Authentication callback could not complete. Please try signing in again.';
        }
        return 'Authentication failed. Please sign in again.';
    });
    const [magicLinkSent, setMagicLinkSent] = useState(false);
    const [isPending, setIsPending] = useState(false);

    const safeNext = isSafeRelativePath(next) ? next : '/';

    // Parse error hash fragments from Supabase GoTrue redirects (e.g. #error=access_denied&error_code=otp_expired)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const hash = window.location.hash.startsWith('#')
            ? window.location.hash.substring(1)
            : window.location.hash;
        if (!hash) return;
        const hashParams = new URLSearchParams(hash);
        const errorCode = hashParams.get('error_code');
        const errorDesc = hashParams.get('error_description');

        if (errorCode || errorDesc) {
            queueMicrotask(() => {
                if (errorCode === 'otp_expired') {
                    setFormError(
                        'This sign-in or reset link has expired or was already used. Please sign in with your password below, or request a fresh link/code.'
                    );
                } else {
                    setFormError(
                        errorDesc?.replace(/\+/g, ' ') ||
                            'Authentication error encountered from link. Please try signing in again.'
                    );
                }
            });
        }
    }, []);

    const handlePasswordLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsPending(true);
        setFormError(null);

        try {
            const formData = new FormData(e.currentTarget);
            formData.set('next', safeNext);
            const res = await loginAction(formData);
            if (res?.error) {
                setFormError(res.error);
                setIsPending(false);
            }
        } catch (caughtError) {
            // Next.js redirect throws an error that should not be intercepted as a regular error
            if (caughtError instanceof Error && caughtError.message.includes('NEXT_REDIRECT')) {
                throw caughtError;
            }
            setFormError(caughtError instanceof Error ? caughtError.message : 'Invalid email or password.');
            setIsPending(false);
        }
    };

    const handleMagicLinkSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!email.trim()) {
            setFormError('Please enter your email address.');
            return;
        }

        setIsPending(true);
        try {
            const supabase = createClient();
            const origin = window.location.origin;
            const { error } = await supabase.auth.signInWithOtp({
                email: email.trim(),
                options: {
                    emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(safeNext)}`,
                },
            });

            if (error) {
                setFormError(error.message || 'Failed to send magic link. Please try again.');
                setIsPending(false);
                return;
            }

            setMagicLinkSent(true);
            setIsPending(false);
        } catch (_err: unknown) {
            setFormError('An unexpected error occurred while sending the magic link.');
            setIsPending(false);
        }
    };

    const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!otpCode.trim()) {
            setFormError('Please enter the 6-digit verification code.');
            return;
        }

        setIsPending(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.verifyOtp({
                email: email.trim(),
                token: otpCode.trim(),
                type: 'email',
            });

            if (error) {
                setFormError(error.message || 'Invalid or expired verification code.');
                setIsPending(false);
                return;
            }

            router.push(safeNext);
            router.refresh();
        } catch (_err: unknown) {
            setFormError('Failed to verify code. Please try again.');
            setIsPending(false);
        }
    };

    if (magicLinkSent) {
        return (
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <MailCheckIcon className="size-6" />
                    </div>
                    <CardTitle>Check your email</CardTitle>
                    <CardDescription>
                        We sent a magic sign-in link and verification code to{' '}
                        <span className="font-medium text-foreground">{email}</span>.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {formError && (
                        <Alert variant="destructive">
                            <AlertTitle>Verification failed</AlertTitle>
                            <AlertDescription>{formError}</AlertDescription>
                        </Alert>
                    )}
                    <p className="text-xs text-muted-foreground text-center">
                        Click the link in your email to sign in directly, or enter the 6-digit code below:
                    </p>
                    <form onSubmit={handleVerifyOtpSubmit} className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="otp-code">6-digit verification code</Label>
                            <Input
                                id="otp-code"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="123456"
                                maxLength={8}
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value)}
                                disabled={isPending}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isPending || !otpCode.trim()}>
                            {isPending ? (
                                <>
                                    <LoaderCircleIcon className="size-4 animate-spin mr-2" />
                                    Verifying code...
                                </>
                            ) : (
                                'Verify code & sign in'
                            )}
                        </Button>
                    </form>
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                            setMagicLinkSent(false);
                            setFormError(null);
                            setOtpCode('');
                        }}
                    >
                        <ArrowLeftIcon className="size-4 mr-2" />
                        Use a different sign-in method
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Sign in to your Finzy personal finance workspace.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs
                    value={authMethod}
                    onValueChange={(val) => {
                        setAuthMethod(val as 'password' | 'magic-link');
                        setFormError(null);
                    }}
                    className="w-full"
                >
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="password" className="gap-1.5">
                            <KeyRoundIcon className="size-3.5" />
                            Password
                        </TabsTrigger>
                        <TabsTrigger value="magic-link" className="gap-1.5">
                            <SparklesIcon className="size-3.5" />
                            Magic Link
                        </TabsTrigger>
                    </TabsList>

                    {formError && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertTitle>Sign in failed</AlertTitle>
                            <AlertDescription>{formError}</AlertDescription>
                        </Alert>
                    )}

                    <TabsContent value="password">
                        <form onSubmit={handlePasswordLogin} className="grid gap-4" noValidate>
                            <div className="grid gap-2">
                                <Label htmlFor="email-password">Email</Label>
                                <Input
                                    id="email-password"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isPending}
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password">Password</Label>
                                    <Link
                                        href="/forgot-password"
                                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                                    >
                                        Forgot password?
                                    </Link>
                                </div>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        className="pr-10"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={isPending}
                                        required
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        tabIndex={-1}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? (
                                            <EyeOffIcon className="size-4" />
                                        ) : (
                                            <EyeIcon className="size-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <Button type="submit" className="w-full mt-2" disabled={isPending}>
                                {isPending ? (
                                    <>
                                        <LoaderCircleIcon className="size-4 animate-spin mr-2" />
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </Button>
                        </form>
                    </TabsContent>

                    <TabsContent value="magic-link">
                        <form onSubmit={handleMagicLinkSubmit} className="grid gap-4" noValidate>
                            <div className="grid gap-2">
                                <Label htmlFor="email-magic">Email</Label>
                                <Input
                                    id="email-magic"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isPending}
                                    required
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                We will email you a secure link and a 6-digit code to log you in instantly.
                            </p>
                            <Button type="submit" className="w-full mt-2" disabled={isPending}>
                                {isPending ? (
                                    <>
                                        <LoaderCircleIcon className="size-4 animate-spin mr-2" />
                                        Sending link...
                                    </>
                                ) : (
                                    'Send Magic Link'
                                )}
                            </Button>
                        </form>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
