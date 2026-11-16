'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { SetupBanner } from '@src/components/finance/setup/setup-banner';
import { FinanceInitializer } from '@src/components/finance/shared/finance-initializer';
import { TimezoneNotice } from '@src/components/finance/shared/timezone-notice';

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname.startsWith('/finance/setup')) {
    return (
      <>
        <FinanceInitializer />
        <div className="flex flex-1 flex-col min-h-0 h-full overflow-y-auto bg-background pb-[calc(var(--bottom-nav-h)+16px)] md:pb-0 scroll-pb-[calc(var(--bottom-nav-h)+16px)] md:scroll-pb-0 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]">{children}</div>
      </>
    );
  }

  return (
    <div className="flex flex-1 min-w-0 flex-col min-h-0 overflow-hidden bg-background">
      <FinanceInitializer />
      <SetupBanner />
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 sm:p-6 pb-[calc(var(--bottom-nav-h)+16px)] md:pb-6 scroll-pb-[calc(var(--bottom-nav-h)+16px)] md:scroll-pb-6 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-6 sm:pr-6">
        <TimezoneNotice />
        {children}
      </main>
    </div>
  );
}
