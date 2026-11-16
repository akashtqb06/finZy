import React, { Suspense } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon } from 'lucide-react';
import { requireUser } from '@src/lib/auth/dal';
import { SettingsNav } from '@src/components/settings/settings-nav';

async function SettingsNavWrapper() {
    await requireUser('/settings');
    return <SettingsNav />;
}

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-1 min-w-0 flex-col min-h-0 h-full overflow-hidden">
            {/* Fixed header */}
            <div className="shrink-0 border-b bg-background px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link
                        href="/finance/overview"
                        className="md:hidden size-9 rounded-lg border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                        aria-label="Back to Overview"
                    >
                        <ChevronLeftIcon className="size-4" />
                    </Link>
                    <div>
                        <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Settings</h1>
                        <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                            Manage your profile, security preferences, and appearance.
                        </p>
                    </div>
                </div>
            </div>

            {/* Single scroll area */}
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6 pb-[calc(var(--bottom-nav-h)+16px)] md:pb-6 scroll-pb-[calc(var(--bottom-nav-h)+16px)] md:scroll-pb-6 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-6 sm:pr-6">
                <div className="flex flex-col md:flex-row gap-8 max-w-5xl">
                    <Suspense fallback={<SettingsNav />}>
                        <SettingsNavWrapper />
                    </Suspense>
                    <main className="flex-1 min-w-0 max-w-3xl pb-12">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
