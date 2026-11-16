'use client';

import { Suspense, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRoundIcon, LoaderCircleIcon, ShieldCheckIcon } from 'lucide-react';
import { createClient } from '@src/lib/supabase/browser';
import { isSafeRelativePath } from '@src/proxy';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function MFAChallengeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const nextParam = searchParams.get('next') ?? '/';
    const safeNext = isSafeRelativePath(nextParam) ? nextParam : '/';

    const [factorId, setFactorId] = useState<string | null>(null);
    const [challengeId, setChallengeId] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let isMounted = true;
        async function initMfa() {
            try {
                const supabase = createClient();
                const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
                if (listError || !factors) {
                    if (isMounted) {
                        setFormError('Failed to load multi-factor configuration. Please try logging in again.');
                        setIsLoading(false);
                    }
                    return;
                }

                const verifiedFactor = factors.totp.find((f) => f.status === 'verified');
                if (!verifiedFactor) {
                    // No verified MFA factor, redirect to destination
                    if (isMounted) {
                        router.push(safeNext);
                    }
                    return;
                }

                if (isMounted) {
                    setFactorId(verifiedFactor.id);
                }

                const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
                    factorId: verifiedFactor.id,
                });

                if (challengeError || !challenge) {
                    if (isMounted) {
                        setFormError('Failed to create MFA challenge. Please refresh or try logging in again.');
                        setIsLoading(false);
                    }
                    return;
                }

                if (isMounted) {
                    setChallengeId(challenge.id);
                    setIsLoading(false);
                }
            } catch (_err: unknown) {
                if (isMounted) {
                    setFormError('An unexpected error occurred while preparing two-factor verification.');
                    setIsLoading(false);
                }
            }
        }

        void initMfa();
        return () => {
            isMounted = false;
        };
    }, [router, safeNext]);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!code.trim() || code.trim().length !== 6) {
            setFormError('Please enter the 6-digit authentication code.');
            return;
        }

        if (!factorId || !challengeId) {
            setFormError('MFA session expired. Please refresh the page.');
            return;
        }

        startTransition(async () => {
            try {
                const supabase = createClient();
                const { error } = await supabase.auth.mfa.verify({
                    factorId,
                    challengeId,
                    code: code.trim(),
                });

                if (error) {
                    setFormError('Invalid authentication code. Please try again.');
                    return;
                }

                // Successful verification upgrades session to AAL2
                router.push(safeNext);
                router.refresh();
            } catch (_err: unknown) {
                setFormError('Failed to verify code. Please try again.');
            }
        });
    };

    return (
        <Card className="w-full max-w-sm">
            <CardHeader className="text-center">
                <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ShieldCheckIcon className="size-6" />
                </div>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                    Enter the 6-digit code from your authenticator app to complete sign-in.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
                        <LoaderCircleIcon className="size-6 animate-spin text-primary" />
                        <span>Preparing verification...</span>
                    </div>
                ) : (
                    <form onSubmit={handleVerify} className="grid gap-4" noValidate>
                        {formError && (
                            <Alert variant="destructive">
                                <AlertTitle>Verification failed</AlertTitle>
                                <AlertDescription>{formError}</AlertDescription>
                            </Alert>
                        )}
                        <div className="grid gap-2">
                            <Label htmlFor="mfa-code">Authenticator Code</Label>
                            <Input
                                id="mfa-code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                autoComplete="one-time-code"
                                placeholder="123456"
                                className="text-center text-lg tracking-widest font-mono"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                disabled={isPending}
                                autoFocus
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full mt-2" disabled={isPending || code.length !== 6}>
                            {isPending ? (
                                <>
                                    <LoaderCircleIcon className="size-4 animate-spin mr-2" />
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    <KeyRoundIcon className="size-4 mr-2" />
                                    Verify Code
                                </>
                            )}
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}

export default function MFAPage() {
    return (
        <Suspense
            fallback={
                <Card className="w-full max-w-sm">
                    <CardHeader className="text-center">
                        <CardTitle>Two-Factor Authentication</CardTitle>
                        <CardDescription>Loading security challenge...</CardDescription>
                    </CardHeader>
                </Card>
            }
        >
            <MFAChallengeContent />
        </Suspense>
    );
}
