import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import OverviewPage from '../overview/page';
import TransactionsPage from '../transactions/page';
import AccountsPage from '../accounts/page';
import BudgetsPage from '../budgets/page';
import RecurringPage from '../recurring/page';
import ImportPage from '../import/page';
import CategoriesPage from '../categories/page';
import SetupPage from '../setup/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/finance/overview',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  notFound: vi.fn(),
}));

vi.mock('@src/components/settings/app-settings-provider', () => ({
  useAppSettings: () => ({ appName: 'FinZy' }),
}));

vi.mock('@src/components/auth/user-provider', () => ({
  useCurrentUser: () => ({
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Test User',
    email: 'test@example.com',
  }),
}));

describe('Finance Pages Smoke Test', () => {
  it('renders OverviewPage without crashing', () => {
    const html = renderToString(<OverviewPage />);
    expect(html).toBeDefined();
  });

  it('renders TransactionsPage without crashing', () => {
    const html = renderToString(<TransactionsPage />);
    expect(html).toBeDefined();
  });

  it('renders AccountsPage without crashing', () => {
    const html = renderToString(<AccountsPage />);
    expect(html).toBeDefined();
  });

  it('renders BudgetsPage without crashing', () => {
    const html = renderToString(<BudgetsPage />);
    expect(html).toBeDefined();
  });

  it('renders RecurringPage without crashing', () => {
    const html = renderToString(<RecurringPage />);
    expect(html).toBeDefined();
  });

  it('renders ImportPage without crashing', () => {
    const html = renderToString(<ImportPage />);
    expect(html).toBeDefined();
  });

  it('renders CategoriesPage without crashing', () => {
    const html = renderToString(<CategoriesPage />);
    expect(html).toBeDefined();
  });

  it('renders SetupPage without crashing', () => {
    const html = renderToString(<SetupPage />);
    expect(html).toBeDefined();
  });
});
