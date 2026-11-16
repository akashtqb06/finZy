'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboardIcon,
  ArrowLeftRightIcon,
  PlusIcon,
  LandmarkIcon,
  MenuIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { useFinanceStore } from '@src/components/finance/shared/finance-store';
import { useKeyboardVisible, useIsDialogOpen } from './use-mobile-detection';

export function BottomNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const openQuickAdd = useFinanceStore((s) => s.openQuickAdd);
  const isKeyboardVisible = useKeyboardVisible();
  const isDialogOpen = useIsDialogOpen();

  // Hide when virtual keyboard is open or when any dialog/sheet is active
  if (isKeyboardVisible || isDialogOpen) {
    return null;
  }

  const isOverviewActive =
    pathname === '/finance/overview' || pathname === '/finance' || pathname === '/';
  const isTransactionsActive =
    pathname === '/finance/transactions' || pathname.startsWith('/finance/transactions/');
  const isAccountsActive =
    pathname === '/finance/accounts' || pathname.startsWith('/finance/accounts/');

  return (
    <nav
      aria-label="Mobile Navigation"
      className={cn(
        'fixed bottom-0 inset-x-0 z-40 md:hidden',
        'bg-background/95 backdrop-blur-md border-t border-border',
        'pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] pt-1 px-3',
        'flex items-center justify-around select-none'
      )}
    >
      {/* 1. Overview */}
      <Link
        href="/finance/overview"
        className={cn(
          'flex flex-col items-center justify-center min-w-[44px] min-h-[44px] px-2 py-1 text-[11px] font-medium transition-colors rounded-md',
          isOverviewActive
            ? 'text-primary font-semibold'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <LayoutDashboardIcon className="size-5 shrink-0" />
        <span className="mt-0.5">Overview</span>
      </Link>

      {/* 2. Transactions */}
      <Link
        href="/finance/transactions"
        className={cn(
          'flex flex-col items-center justify-center min-w-[44px] min-h-[44px] px-2 py-1 text-[11px] font-medium transition-colors rounded-md',
          isTransactionsActive
            ? 'text-primary font-semibold'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <ArrowLeftRightIcon className="size-5 shrink-0" />
        <span className="mt-0.5">Transactions</span>
      </Link>

      {/* 3. Centered Quick Add (+) */}
      <div className="flex items-center justify-center min-w-[44px] min-h-[44px] -mt-5">
        <button
          type="button"
          onClick={() => openQuickAdd()}
          aria-label="Add transaction"
          className={cn(
            'flex items-center justify-center size-12 rounded-full',
            'bg-primary text-primary-foreground shadow-lg',
            'hover:bg-primary/90 active:scale-95 transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
        >
          <PlusIcon className="size-6" />
        </button>
      </div>

      {/* 4. Accounts */}
      <Link
        href="/finance/accounts"
        className={cn(
          'flex flex-col items-center justify-center min-w-[44px] min-h-[44px] px-2 py-1 text-[11px] font-medium transition-colors rounded-md',
          isAccountsActive
            ? 'text-primary font-semibold'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <LandmarkIcon className="size-5 shrink-0" />
        <span className="mt-0.5">Accounts</span>
      </Link>

      {/* 5. More */}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        aria-label="More navigation options"
        className="flex flex-col items-center justify-center min-w-[44px] min-h-[44px] px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md"
      >
        <MenuIcon className="size-5 shrink-0" />
        <span className="mt-0.5">More</span>
      </button>
    </nav>
  );
}
