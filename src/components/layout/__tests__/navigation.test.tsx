import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { AppSidebar } from '../app-sidebar';
import { BottomNav } from '../bottom-nav';
import { AppHeader } from '../app-header';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useFinanceStore, type AccountWithBalance } from '@src/components/finance/shared/finance-store';
import { useBreadcrumbStore } from '../breadcrumb-store';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/finance/overview'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@src/components/settings/app-settings-provider', () => ({
  useAppSettings: () => ({ appName: 'FinZy' }),
}));

vi.mock('@src/components/auth/user-provider', () => ({
  useCurrentUser: () => ({
    id: 'user_1',
    name: 'Akash Saravanan',
    email: 'akash@example.com',
  }),
}));

vi.mock('../use-mobile-detection', () => ({
  useKeyboardVisible: vi.fn(() => false),
  useIsDialogOpen: vi.fn(() => false),
}));

describe('Sidebar & BottomNav Navigation', () => {
  beforeEach(() => {
    useBreadcrumbStore.getState().setCrumbs(null);
    useFinanceStore.setState({
      accounts: [
        {
          id: 'acc_secret_42',
          name: 'HDFC Salary Account',
          kind: 'bank',
          currency: 'INR',
          class: 'asset',
          balance: 10000000,
          outstanding: 0,
          utilization: 0,
          currentValue: 10000000,
          isActive: true,
          creditLimit: null,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as unknown as AccountWithBalance,
      ],
      quickAddOpen: false,
    });
  });

  it('renders AppSidebar with finance navigation items and brand', () => {
    const html = renderToString(
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
      </SidebarProvider>
    );

    // Header brand
    expect(html).toContain('FinZy');

    // Group items
    expect(html).toContain('Overview');
    expect(html).toContain('Transactions');
    expect(html).toContain('Accounts');
    expect(html).toContain('Budgets');
    expect(html).toContain('Recurring');
    expect(html).toContain('Import');

    // Footer settings
    expect(html).toContain('Settings');
  });

  it('renders BottomNav on mobile with 5 main actions and 44px touch targets', () => {
    const html = renderToString(
      <SidebarProvider defaultOpen={true}>
        <BottomNav />
      </SidebarProvider>
    );

    expect(html).toContain('Overview');
    expect(html).toContain('Transactions');
    expect(html).toContain('aria-label="Add transaction"');
    expect(html).toContain('Accounts');
    expect(html).toContain('More');
    expect(html).toContain('min-w-[44px]');
    expect(html).toContain('min-h-[44px]');
  });

  it('resolves account NAME instead of account ID in breadcrumbs', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/finance/accounts/acc_secret_42');

    const html = renderToString(
      <SidebarProvider defaultOpen={true}>
        <AppHeader />
      </SidebarProvider>
    );

    // It should render "HDFC Salary Account", NEVER "acc_secret_42"
    expect(html).toContain('HDFC Salary Account');
    expect(html).not.toContain('acc_secret_42');
  });
});
