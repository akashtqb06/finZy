'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2Icon, EyeIcon, EyeOffIcon, LoaderCircleIcon } from 'lucide-react';
import { createClient } from '@src/lib/supabase/browser';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isPending, startTransition] = useTransition();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!password) {
            setFormError('Please enter a new password.');
            return;
        }

        if (password.length < 8) {
            setFormError('Password must be at least 8 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            setFormError('Passwords do not match.');
            return;
        }

        startTransition(async () => {
            try {
                const supabase = createClient();
                const { error } = await supabase.auth.updateUser({
                    password,
                });

                if (error) {
                    setFormError(error.message || 'Failed to update password.');
                    return;
                }

                setIsSuccess(true);
                setTimeout(() => {
                    router.push('/');
                    router.refresh();
                }, 1500);
            } catch (_err: unknown) {
                setFormError('An unexpected error occurred while resetting your password.');
            }
        });
    };

    if (isSuccess) {
        return (
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                        <CheckCircle2Icon className="size-6" />
                    </div>
                    <CardTitle>Password reset complete</CardTitle>
                    <CardDescription>
                        Your password has been successfully updated. Redirecting to workspace...
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Create new password</CardTitle>
                <CardDescription>Please enter and confirm your new password below.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
                    {formError && (
                        <Alert variant="destructive">
                            <AlertTitle>Reset failed</AlertTitle>
                            <AlertDescription>{formError}</AlertDescription>
                        </Alert>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="password">New Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
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
                    <div className="grid gap-2">
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input
                            id="confirm-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            disabled={isPending}
                            required
                        />
                    </div>
                    <Button type="submit" className="w-full mt-2" disabled={isPending}>
                        {isPending ? (
                            <>
                                <LoaderCircleIcon className="size-4 animate-spin mr-2" />
                                Updating password...
                            </>
                        ) : (
                            'Set new password'
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
