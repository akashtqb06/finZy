import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { FDFormFields, type FDFormValues } from '../fd-form-fields';
import { FDDetailSection } from '../fd-detail-section';
import type { AccountWithBalance } from '../../shared/fixtures';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/finance/accounts/acc_fd_test',
}));

vi.mock('../../shared/finance-store', () => ({
  useFinanceStore: () => ({
    accounts: [
      { id: 'acc_bank_1', name: 'HDFC Savings', kind: 'bank', balance: 5000000 },
    ],
    refreshAccounts: vi.fn(),
    refreshOverviewStats: vi.fn(),
  }),
}));

// Mock recharts to render clean markup in SSR
vi.mock('../charts/finance-area-chart', () => ({
  FinanceAreaChart: (props: { label?: string; data?: unknown[] }) => (
    <div data-testid="finance-area-chart" data-points-count={props.data?.length}>
      Area Chart Mock ({props.label})
    </div>
  ),
}));

describe('FDFormFields Component', () => {
  it('renders cumulative FD fields and calculates accurate live preview for ₹1,00,000 at 7.1% quarterly for 1 year', () => {
    const values: FDFormValues = {
      fdType: 'cumulative',
      principalRupees: '100000',
      ratePercent: '7.1',
      compounding: 'quarterly',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
      tenureYears: '1',
      tenureMonths: '0',
      tenureDays: '0',
      accrualMode: 'bank',
      maturityAmountReceiptRupees: '',
      payoutFrequency: 'quarterly',
      payoutAccountId: '',
    };

    const html = renderToString(
      <FDFormFields values={values} onChange={vi.fn()} />
    );

    // Verify type options
    expect(html).toContain('Cumulative FD');
    expect(html).toContain('Interest compounds and is paid out with principal at maturity.');
    expect(html).toContain('Payout FD');

    // Verify fields
    expect(html).toContain('Principal Deposit Amount (₹)');
    expect(html).toContain('Annual Interest Rate (%)');
    expect(html).toContain('Compounding Frequency');

    // Live preview card verification
    expect(html).toContain('FD Projection Preview');
    expect(html).toContain('7.29'); // Effective yield
    expect(html).toContain('1,07,291'); // Maturity Value
    expect(html).toContain('7,291'); // Total Interest
  });

  it('renders payout FD fields with periodic interest payout estimate', () => {
    const values: FDFormValues = {
      fdType: 'payout',
      principalRupees: '100000',
      ratePercent: '7.1',
      compounding: 'quarterly',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
      tenureYears: '1',
      tenureMonths: '0',
      tenureDays: '0',
      accrualMode: 'bank',
      maturityAmountReceiptRupees: '',
      payoutFrequency: 'quarterly',
      payoutAccountId: 'acc_bank_1',
    };

    const html = renderToString(
      <FDFormFields
        values={values}
        onChange={vi.fn()}
        bankAccounts={[{ id: 'acc_bank_1', name: 'HDFC Savings' }]}
      />
    );

    expect(html).toContain('Payout Frequency');
    expect(html).toContain('Payout Credit Account');
    expect(html).toContain('Payout per Period');
    expect(html).toContain('₹1,775'); // 1,00,000 * 7.1 / (100 * 4) = 1,775
  });
});

describe('FDDetailSection Component', () => {
  it('renders metric cards, actions, and growth chart wrapper', () => {
    const mockAccount: AccountWithBalance = {
      id: 'acc_fd_test',
      userId: 'user_1',
      name: 'HDFC 1-Year FD',
      kind: 'fixed_deposit',
      class: 'asset',
      currency: 'INR',
      balance: 10358151,
      currentValue: 10358151,
      accruedValue: 10358151,
      principal: 10000000,
      interestEarned: 358151,
      projectedMaturityAmount: 10729128,
      interestRate: 7.1,
      compoundingFrequency: 'quarterly',
      maturityDate: '2027-01-01',
      daysToMaturity: 180,
      isActive: true,
      version: 1,
      metadata: {
        principalPaise: 10000000,
        ratePercent: 7.1,
        compounding: 'quarterly',
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        accrualMode: 'bank',
        dayCount: 'act_365',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      outstanding: 0,
      utilization: 0,
    };

    const html = renderToString(
      <FDDetailSection account={mockAccount} />
    );

    expect(html).toContain('Cumulative Fixed Deposit');
    expect(html).toContain('Recalculate');
    expect(html).toContain('Edit');
    expect(html).toContain('Close FD');
    expect(html).toContain('Current Value');
    expect(html).toContain('Accrued Interest');
    expect(html).toContain('Principal');
    expect(html).toContain('Maturity Value');
    expect(html).toContain('Interest Rate');
    expect(html).toContain('Compounding');
    expect(html).toContain('Days to Maturity');
    expect(html).toContain('Value Growth Curve to Maturity');
  });
});
