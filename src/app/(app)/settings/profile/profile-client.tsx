'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { GlobeIcon, LoaderCircleIcon, UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    updateProfileDisplayNameAction,
    updateProfileTimezoneAction,
} from './actions';

const TIMEZONE_OPTIONS = [
    { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST +5:30)' },
    { value: 'UTC', label: 'UTC (UTC +0:00)' },
    { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
    { value: 'America/Chicago', label: 'America/Chicago (CST/CDT)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
    { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
    { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
    { value: 'Asia/Dubai', label: 'Asia/Dubai (GST +4:00)' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT +8:00)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST +9:00)' },
    { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
];

export function ProfileClient({
    email,
    initialDisplayName,
    initialTimezone,
}: {
    email: string;
    initialDisplayName: string;
    initialTimezone: string;
}) {
    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [timezone, setTimezone] = useState(initialTimezone || 'Asia/Kolkata');
    const [isSavingName, startNameTransition] = useTransition();
    const [isSavingTz, startTzTransition] = useTransition();

    const handleSaveName = (e: React.FormEvent) => {
        e.preventDefault();
        startNameTransition(async () => {
            const res = await updateProfileDisplayNameAction(displayName);
            if (res.ok) {
                toast.success('Display name updated');
            } else {
                toast.error(res.error || 'Failed to update name');
            }
        });
    };

    const handleSaveTimezone = (newTz: string | null) => {
        if (!newTz) return;
        setTimezone(newTz);
        startTzTransition(async () => {
            const res = await updateProfileTimezoneAction(newTz);
            if (res.ok) {
                toast.success('Regional timezone updated');
            } else {
                toast.error(res.error || 'Failed to update timezone');
            }
        });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <UserIcon className="size-5 text-primary" />
                        <CardTitle>Profile Details</CardTitle>
                    </div>
                    <CardDescription>
                        Manage your public display name and account identification.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={email} disabled className="bg-muted text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                            To change your email address, visit the Security settings tab.
                        </p>
                    </div>
                    <form onSubmit={handleSaveName} className="grid gap-2 pt-2">
                        <Label htmlFor="display-name">Display Name</Label>
                        <div className="flex gap-2">
                            <Input
                                id="display-name"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                disabled={isSavingName}
                                required
                            />
                            <Button type="submit" disabled={isSavingName || displayName === initialDisplayName}>
                                {isSavingName ? (
                                    <>
                                        <LoaderCircleIcon className="size-4 animate-spin mr-2" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save'
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <GlobeIcon className="size-5 text-primary" />
                        <CardTitle>Regional Timezone</CardTitle>
                    </div>
                    <CardDescription>
                        All financial tracking, ledger dates, and reporting boundaries are calculated in your configured timezone.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="timezone-select">Default Timezone</Label>
                        <Select
                            value={timezone}
                            onValueChange={handleSaveTimezone}
                            disabled={isSavingTz}
                            items={TIMEZONE_OPTIONS}
                        >
                            <SelectTrigger id="timezone-select" className="w-full sm:w-80">
                                <SelectValue placeholder="Select timezone" />
                            </SelectTrigger>
                            <SelectContent>
                                {TIMEZONE_OPTIONS.map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                        {item.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {isSavingTz && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <LoaderCircleIcon className="size-3 animate-spin text-primary" />
                                <span>Updating timezone...</span>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
