'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from 'lucide-react';
import { createClient } from '@src/lib/supabase/browser';
import { isSafeRelativePath } from '@src/proxy';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm({ next = '/' }: { next?: string }) {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const safeNext = isSafeRelativePath(next) ? next : '/';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!email.trim() || !password) {
            setFormError('Please enter both email and password.');
            return;
        }

        startTransition(async () => {
            try {
                const supabase = createClient();
                const { error } = await supabase.auth.signInWithPassword({
                    email: email.trim(),
                    password,
                });

                if (error) {
                    // Friendly message without revealing whether email exists
                    setFormError('Invalid email or password');
                    return;
                }

                // Check MFA requirement
                const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
                if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
                    router.push(`/mfa?next=${encodeURIComponent(safeNext)}`);
                    return;
                }

                router.push(safeNext);
                router.refresh();
            } catch (_err: unknown) {
                setFormError('An unexpected error occurred. Please try again.');
            }
        });
    };

    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Sign in to your Finzy personal finance workspace.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
                    {formError && (
                        <Alert variant="destructive">
                            <AlertTitle>Sign in failed</AlertTitle>
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
            </CardContent>
        </Card>
    );
}
