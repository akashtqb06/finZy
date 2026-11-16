'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    CheckCircle2Icon,
    CopyIcon,
    KeyRoundIcon,
    LaptopIcon,
    LoaderCircleIcon,
    LogOutIcon,
    MailIcon,
    QrCodeIcon,
    ShieldAlertIcon,
    ShieldCheckIcon,
    SmartphoneIcon,
    Trash2Icon,
} from 'lucide-react';
import { createClient } from '@src/lib/supabase/browser';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FactorItem {
    id: string;
    friendly_name?: string;
    factor_type: string;
    status: string;
    created_at: string;
}

export function SecurityClient({ currentEmail }: { currentEmail: string }) {
    const router = useRouter();
    const supabase = createClient();

    // -------------------------------------------------------------------------
    // Password state
    // -------------------------------------------------------------------------
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSavingPassword, startPasswordTransition] = useTransition();

    // -------------------------------------------------------------------------
    // Email state
    // -------------------------------------------------------------------------
    const [newEmail, setNewEmail] = useState('');
    const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);
    const [isSavingEmail, startEmailTransition] = useTransition();

    // -------------------------------------------------------------------------
    // MFA state
    // -------------------------------------------------------------------------
    const [factors, setFactors] = useState<FactorItem[]>([]);
    const [isLoadingFactors, setIsLoadingFactors] = useState(true);
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [enrolledFactorId, setEnrolledFactorId] = useState<string | null>(null);
    const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
    const [manualSecret, setManualSecret] = useState<string | null>(null);
    const [verifyCode, setVerifyCode] = useState('');
    const [mfaError, setMfaError] = useState<string | null>(null);
    const [isVerifyingMfa, startMfaTransition] = useTransition();

    // Unenroll dialog / re-auth state
    const [unenrollFactorId, setUnenrollFactorId] = useState<string | null>(null);
    const [reauthChallengeId, setReauthChallengeId] = useState<string | null>(null);
    const [reauthCode, setReauthCode] = useState('');
    const [isUnenrolling, startUnenrollTransition] = useTransition();

    // -------------------------------------------------------------------------
    // Load factors
    // -------------------------------------------------------------------------
    const loadFactors = useCallback(async () => {
        try {
            const { data, error } = await supabase.auth.mfa.listFactors();
            if (!error && data) {
                setFactors(data.totp as FactorItem[]);
            }
        } catch (_err: unknown) {
            console.error('Failed to load factors:', _err);
        } finally {
            setIsLoadingFactors(false);
        }
    }, [supabase]);

    useEffect(() => {
        let isMounted = true;
        void supabase.auth.mfa.listFactors().then(({ data, error }) => {
            if (isMounted && !error && data) {
                setFactors(data.totp as FactorItem[]);
            }
        }).catch((_err: unknown) => {
            console.error('Failed to load factors:', _err);
        }).finally(() => {
            if (isMounted) {
                setIsLoadingFactors(false);
            }
        });
        return () => {
            isMounted = false;
        };
    }, [supabase]);

    // -------------------------------------------------------------------------
    // 1. Change Password
    // -------------------------------------------------------------------------
    const handleUpdatePassword = (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 8) {
            toast.error('Password must be at least 8 characters long');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        startPasswordTransition(async () => {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) {
                toast.error(error.message || 'Failed to update password');
            } else {
                toast.success('Password updated successfully');
                setPassword('');
                setConfirmPassword('');
            }
        });
    };

    // -------------------------------------------------------------------------
    // 2. Change Email
    // -------------------------------------------------------------------------
    const handleUpdateEmail = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmail.trim() || newEmail === currentEmail) {
            toast.error('Please enter a different email address');
            return;
        }

        startEmailTransition(async () => {
            const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
            if (error) {
                toast.error(error.message || 'Failed to update email');
            } else {
                setEmailSuccessMsg(
                    `A confirmation link has been sent to ${newEmail.trim()}. Please verify it to complete the change.`
                );
                setNewEmail('');
            }
        });
    };

    // -------------------------------------------------------------------------
    // 3. MFA Enroll & Verify
    // -------------------------------------------------------------------------
    const handleStartEnroll = async () => {
        setMfaError(null);
        setIsEnrolling(true);
        try {
            const { data, error } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
            });
            if (error) {
                setMfaError(error.message || 'Failed to initiate MFA enrollment');
                setIsEnrolling(false);
                return;
            }
            setEnrolledFactorId(data.id);
            setQrCodeSvg(data.totp.qr_code);
            setManualSecret(data.totp.secret);
        } catch (_err: unknown) {
            setMfaError('An error occurred during enrollment initialization');
            setIsEnrolling(false);
        }
    };

    const handleConfirmEnroll = (e: React.FormEvent) => {
        e.preventDefault();
        if (!enrolledFactorId || verifyCode.trim().length !== 6) {
            toast.error('Please enter a 6-digit code');
            return;
        }
        setMfaError(null);

        startMfaTransition(async () => {
            try {
                const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
                    factorId: enrolledFactorId,
                });
                if (challengeError) {
                    setMfaError(challengeError.message);
                    return;
                }

                const { error: verifyError } = await supabase.auth.mfa.verify({
                    factorId: enrolledFactorId,
                    challengeId: challenge.id,
                    code: verifyCode.trim(),
                });

                if (verifyError) {
                    setMfaError('Invalid code. Please check your authenticator app and try again.');
                    return;
                }

                toast.success('Two-factor authentication enabled successfully!');
                setIsEnrolling(false);
                setEnrolledFactorId(null);
                setQrCodeSvg(null);
                setManualSecret(null);
                setVerifyCode('');
                await loadFactors();
            } catch (_err: unknown) {
                setMfaError('Failed to verify code.');
            }
        });
    };

    // -------------------------------------------------------------------------
    // 4. MFA Remove (Re-auth required if AAL1)
    // -------------------------------------------------------------------------
    const handleStartRemove = async (factorId: string) => {
        setUnenrollFactorId(factorId);
        setReauthCode('');

        // Check assurance level
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel === 'aal2') {
            // Already elevated, can unenroll directly
            executeUnenroll(factorId);
        } else {
            // Need re-auth challenge
            const { data: challenge, error } = await supabase.auth.mfa.challenge({ factorId });
            if (error) {
                toast.error(error.message || 'Failed to create security challenge');
                setUnenrollFactorId(null);
                return;
            }
            setReauthChallengeId(challenge.id);
        }
    };

    const executeUnenroll = (factorId: string) => {
        startUnenrollTransition(async () => {
            const { error } = await supabase.auth.mfa.unenroll({ factorId });
            if (error) {
                toast.error(error.message || 'Failed to remove two-factor factor');
            } else {
                toast.success('Two-factor authentication removed');
                setUnenrollFactorId(null);
                setReauthChallengeId(null);
                setReauthCode('');
                await loadFactors();
            }
        });
    };

    const handleConfirmReauthAndRemove = (e: React.FormEvent) => {
        e.preventDefault();
        if (!unenrollFactorId || !reauthChallengeId || reauthCode.trim().length !== 6) {
            toast.error('Please enter the 6-digit confirmation code');
            return;
        }

        startUnenrollTransition(async () => {
            // Verify code to elevate session
            const { error: verifyErr } = await supabase.auth.mfa.verify({
                factorId: unenrollFactorId,
                challengeId: reauthChallengeId,
                code: reauthCode.trim(),
            });

            if (verifyErr) {
                toast.error('Invalid confirmation code. Factor was not removed.');
                return;
            }

            // Now elevated, unenroll
            executeUnenroll(unenrollFactorId);
        });
    };

    // -------------------------------------------------------------------------
    // 5. Sign Out Scopes
    // -------------------------------------------------------------------------
    const handleSignOutLocal = async () => {
        await supabase.auth.signOut({ scope: 'local' });
        router.push('/login');
        router.refresh();
    };

    const handleSignOutOthers = async () => {
        const { error } = await supabase.auth.signOut({ scope: 'others' });
        if (error) {
            toast.error(error.message || 'Failed to sign out other devices');
        } else {
            toast.success('Signed out of all other active sessions');
        }
    };

    const handleSignOutGlobal = async () => {
        await supabase.auth.signOut({ scope: 'global' });
        router.push('/login');
        router.refresh();
    };

    return (
        <div className="space-y-6">
            {/* 1. Change Password Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <KeyRoundIcon className="size-5 text-primary" />
                        <CardTitle>Change Password</CardTitle>
                    </div>
                    <CardDescription>
                        Update your password to keep your financial account safe.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                        <div className="grid gap-2">
                            <Label htmlFor="new-password">New Password</Label>
                            <Input
                                id="new-password"
                                type="password"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isSavingPassword}
                                required
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                            <Input
                                id="confirm-new-password"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={isSavingPassword}
                                required
                            />
                        </div>
                        <Button type="submit" disabled={isSavingPassword || !password}>
                            {isSavingPassword ? (
                                <>
                                    <LoaderCircleIcon className="size-4 animate-spin mr-2" />
                                    Updating...
                                </>
                            ) : (
                                'Update Password'
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* 2. Change Email Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <MailIcon className="size-5 text-primary" />
                        <CardTitle>Change Email</CardTitle>
                    </div>
                    <CardDescription>
                        Update the email address associated with your Finzy account.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 max-w-md">
                    <div className="grid gap-2">
                        <Label>Current Email</Label>
                        <Input value={currentEmail} disabled className="bg-muted text-muted-foreground" />
                    </div>
                    {emailSuccessMsg && (
                        <Alert className="border-emerald-500/50 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20">
                            <CheckCircle2Icon className="size-4 text-emerald-600" />
                            <AlertTitle>Verification Email Sent</AlertTitle>
                            <AlertDescription>{emailSuccessMsg}</AlertDescription>
                        </Alert>
                    )}
                    <form onSubmit={handleUpdateEmail} className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="new-email">New Email Address</Label>
                            <Input
                                id="new-email"
                                type="email"
                                autoComplete="email"
                                placeholder="new@example.com"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                disabled={isSavingEmail}
                                required
                            />
                        </div>
                        <Button type="submit" disabled={isSavingEmail || !newEmail || newEmail === currentEmail}>
                            {isSavingEmail ? (
                                <>
                                    <LoaderCircleIcon className="size-4 animate-spin mr-2" />
                                    Sending verification...
                                </>
                            ) : (
                                'Change Email'
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* 3. Two-Factor Authentication Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <SmartphoneIcon className="size-5 text-primary" />
                        <CardTitle>Multi-Factor Authentication (MFA)</CardTitle>
                    </div>
                    <CardDescription>
                        Add an extra layer of defense with a Time-based One-Time Password (TOTP) authenticator app.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* List verified factors */}
                    {isLoadingFactors ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <LoaderCircleIcon className="size-4 animate-spin text-primary" />
                            <span>Loading security factors...</span>
                        </div>
                    ) : factors.length > 0 ? (
                        <div className="space-y-3">
                            <div className="text-sm font-medium">Configured Authenticator Apps</div>
                            {factors.map((factor) => (
                                <div
                                    key={factor.id}
                                    className="flex items-center justify-between p-3 border rounded-lg bg-card"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 text-primary rounded-md">
                                            <ShieldCheckIcon className="size-5" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">
                                                {factor.friendly_name || 'Authenticator App'}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Enabled on {new Date(factor.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-emerald-600 border-emerald-500/30">
                                            Active (AAL2)
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:bg-destructive/10"
                                            onClick={() => void handleStartRemove(factor.id)}
                                            disabled={isUnenrolling}
                                        >
                                            <Trash2Icon className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No two-factor authenticator app is currently enrolled.
                        </p>
                    )}

                    {/* Re-auth confirmation box for unenroll */}
                    {reauthChallengeId && (
                        <div className="p-4 border border-destructive/30 bg-destructive/5 rounded-lg space-y-3">
                            <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                                <ShieldAlertIcon className="size-4" />
                                <span>Security verification required to remove factor</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Enter the 6-digit code from your authenticator app to authorize removal.
                            </p>
                            <form onSubmit={handleConfirmReauthAndRemove} className="flex gap-2">
                                <Input
                                    type="text"
                                    maxLength={6}
                                    placeholder="123456"
                                    value={reauthCode}
                                    onChange={(e) => setReauthCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-36 font-mono tracking-widest text-center"
                                    disabled={isUnenrolling}
                                    autoFocus
                                    required
                                />
                                <Button type="submit" variant="destructive" disabled={isUnenrolling || reauthCode.length !== 6}>
                                    {isUnenrolling ? 'Removing...' : 'Confirm Remove'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setReauthChallengeId(null);
                                        setUnenrollFactorId(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                            </form>
                        </div>
                    )}

                    {/* Enrollment UI */}
                    {!isEnrolling && factors.length === 0 && (
                        <Button onClick={() => void handleStartEnroll()}>
                            <QrCodeIcon className="size-4 mr-2" />
                            Enable Two-Factor Authentication
                        </Button>
                    )}

                    {isEnrolling && (
                        <div className="border rounded-lg p-5 bg-muted/20 space-y-4 max-w-md">
                            <div className="text-sm font-semibold">1. Scan QR Code</div>
                            <p className="text-xs text-muted-foreground">
                                Open Google Authenticator, 1Password, or Authy on your phone and scan this code:
                            </p>

                            {qrCodeSvg && (
                                <div
                                    className="flex justify-center bg-white p-4 rounded-md border w-fit mx-auto"
                                    dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
                                />
                            )}

                            {manualSecret && (
                                <div className="space-y-1">
                                    <div className="text-xs text-muted-foreground">Or enter manual key:</div>
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs font-mono bg-muted px-2 py-1 rounded border flex-1 break-all">
                                            {manualSecret}
                                        </code>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                void navigator.clipboard.writeText(manualSecret);
                                                toast.success('Secret key copied');
                                            }}
                                        >
                                            <CopyIcon className="size-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="text-sm font-semibold pt-2">2. Enter 6-digit Code</div>
                            {mfaError && (
                                <Alert variant="destructive">
                                    <AlertDescription>{mfaError}</AlertDescription>
                                </Alert>
                            )}
                            <form onSubmit={handleConfirmEnroll} className="space-y-3">
                                <Input
                                    type="text"
                                    maxLength={6}
                                    placeholder="123456"
                                    value={verifyCode}
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                                    className="font-mono tracking-widest text-center text-lg"
                                    disabled={isVerifyingMfa}
                                    required
                                />
                                <div className="flex gap-2">
                                    <Button
                                        type="submit"
                                        className="flex-1"
                                        disabled={isVerifyingMfa || verifyCode.length !== 6}
                                    >
                                        {isVerifyingMfa ? 'Verifying...' : 'Verify and Activate'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsEnrolling(false)}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 4. Sign Out Scopes Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <LogOutIcon className="size-5 text-destructive" />
                        <CardTitle>Session Sign-Out</CardTitle>
                    </div>
                    <CardDescription>
                        Manage active sessions and sign out across devices.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="p-4 border rounded-lg space-y-2 bg-card">
                            <div className="flex items-center gap-2 font-medium text-sm">
                                <LaptopIcon className="size-4 text-primary" />
                                <span>This Device</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Terminates your session on this current browser tab only.
                            </p>
                            <Button variant="outline" className="w-full" onClick={() => void handleSignOutLocal()}>
                                Sign Out Here
                            </Button>
                        </div>

                        <div className="p-4 border rounded-lg space-y-2 bg-card">
                            <div className="flex items-center gap-2 font-medium text-sm">
                                <SmartphoneIcon className="size-4 text-primary" />
                                <span>All Other Devices</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Signs out all other phones, laptops, and browsers, keeping this session active.
                            </p>
                            <Button variant="outline" className="w-full" onClick={() => void handleSignOutOthers()}>
                                Sign Out Others
                            </Button>
                        </div>

                        <div className="p-4 border border-destructive/30 rounded-lg space-y-2 bg-destructive/5">
                            <div className="flex items-center gap-2 font-medium text-sm text-destructive">
                                <LogOutIcon className="size-4" />
                                <span>Everywhere</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Revokes all active refresh tokens and logs out from all devices completely.
                            </p>
                            <Button variant="destructive" className="w-full" onClick={() => void handleSignOutGlobal()}>
                                Sign Out Everywhere
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
