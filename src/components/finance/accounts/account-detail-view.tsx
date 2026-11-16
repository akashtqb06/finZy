'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  PlusIcon,
  CreditCardIcon,
  TrendingUpIcon,
  Trash2Icon,
  AlertCircleIcon,
  RefreshCwIcon,
  MoreHorizontalIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFinanceStore } from '../shared/finance-store';
import {
  formatINR,
  formatPercent,
  formatGain,
  formatLiabilityBalance,
} from '../shared/format';
import { FinanceAreaChart, formatDateShort, formatDayOrdinal } from '../charts';
import { useBreadcrumbStore } from '@src/components/layout/breadcrumb-store';
import { UpdateValuationDialog } from './update-valuation-dialog';
import { EditAccountOpeningDialog } from './edit-account-opening-dialog';
import { RDDetailSection } from './rd-detail-section';
import { FDDetailSection } from './fd-detail-section';
import { EpfDetailSection } from './epf-detail-section';
import { TransactionTable } from '../transactions/transaction-table';
import { cn } from '@/lib/utils';
import { useAppModal } from '@/components/ui/app-modal';

export function AccountDetailView({ accountId }: { accountId: string }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { showConfirm } = useAppModal();
  const setCrumbs = useBreadcrumbStore((s) => s.setCrumbs);
  const {
    accounts,
    accountHistory,
    refreshAccountHistory,
    refreshAccounts,
    refreshValuations,
    valuations,
    deleteAccount,
    openQuickAdd,
    openPayBill,
    recalculateAccount,
  } = useFinanceStore();

  const [valuationOpen, setValuationOpen] = useState(false);
  const [editOpeningOpen, setEditOpeningOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [preset, setPreset] = useState<'7D' | '30D' | '90D' | '1Y' | 'ALL'>('ALL');

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );

  // Set breadcrumb with actual account name
  useEffect(() => {
    if (account) {
      setCrumbs([
        { label: 'Finance', href: '/finance/overview' },
        { label: 'Accounts', href: '/finance/accounts' },
        { label: account.name },
      ]);
    }
    return () => {
      setCrumbs(null);
    };
  }, [account, setCrumbs]);

  // Ensure account metrics and balances are fresh when viewing detail
  useEffect(() => {
    void refreshAccounts();
  }, [accountId, refreshAccounts]);

  // Load valuations for investment accounts
  useEffect(() => {
    void refreshValuations(accountId);
  }, [accountId, refreshValuations]);

  // Fetch account history from server
  useEffect(() => {
    if (account) {
      void refreshAccountHistory(account.id, { preset });
    }
  }, [account, preset, refreshAccountHistory]);

  const handleRecalculate = async () => {
    if (!account) return;
    try {
      setIsRecalculating(true);
      await recalculateAccount(account.id);
      void refreshAccountHistory(account.id, { preset });
      toast.success('Valuations recalculated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Recalculation failed');
    } finally {
      setIsRecalculating(false);
    }
  };

  const accountValuations = useMemo(
    () => valuations[accountId] || [],
    [valuations, accountId]
  );

  const isCard = account?.kind === 'credit_card';
  const isInvestment = account?.kind === 'mutual_fund' || account?.kind === 'stocks';
  const isDeposit = account?.kind === 'fixed_deposit' || account?.kind === 'recurring_deposit';
  const isPf = account?.kind === 'epf' || account?.kind === 'vpf';
  const isLiability = isCard || account?.kind === 'loan' || account?.kind === 'other_liability';

  const historyData = account ? accountHistory[account.id] : undefined;
  const historyPoints = useMemo(() => historyData?.history || [], [historyData]);

  const chartPoints = useMemo(() => {
    return historyPoints.map((p) => ({
      date: p.date,
      value: isLiability ? p.outstanding : p.balance,
      hasActivity: p.hasActivity,
    }));
  }, [historyPoints, isLiability]);

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircleIcon className="size-10 text-muted-foreground/50 mb-3" />
        <h2 className="text-base font-bold">Account not found</h2>
        <p className="text-xs text-muted-foreground mt-1">
          This account may have been removed or does not exist.
        </p>
        <Link href="/finance/accounts" className="mt-4">
          <Button variant="outline" size="sm">
            Back to Accounts
          </Button>
        </Link>
      </div>
    );
  }

  const handleDelete = async () => {
    const confirmed = await showConfirm({
      title: `Delete ${account.name}?`,
      description: `Are you sure you want to delete ${account.name}? This action cannot be undone.`,
      confirmText: 'Delete Account',
      variant: 'destructive',
    });
    if (confirmed) {
      await deleteAccount(account.id);
      toast.success('Account deleted');
      router.push('/finance/accounts');
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 w-full pb-10">
      {/* Back button & Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/finance/accounts"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeftIcon className="size-3.5" />
          <span>Back to Accounts</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border bg-card shadow-xs">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-2xl font-bold tracking-tight text-foreground truncate" title={account.name}>
                {account.name}
              </h2>
              <Badge variant="outline" className="text-[10px] sm:text-xs uppercase font-semibold">
                {account.kind.replace('_', ' ')}
              </Badge>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                {formatINR(isLiability ? account.outstanding : (account.currentValue || account.balance))}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {isLiability ? 'outstanding' : 'current balance'}
              </span>
            </div>
          </div>

          {/* Primary actions as a horizontal chip row on mobile, full buttons on desktop */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1 sm:pt-0">
            {/* Primary Action 1: Add */}
            <Button
              type="button"
              variant="default"
              size="sm"
              className="min-h-[38px] text-xs font-semibold gap-1.5 shrink-0 rounded-full sm:rounded-md px-3.5 shadow-xs"
              onClick={() => openQuickAdd({ accountId: account.id })}
            >
              <PlusIcon className="size-3.5" />
              <span>Add</span>
            </Button>

            {/* Primary Action 2: Reconcile / Recalculate (Investments / Deposits) */}
            {isInvestment && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-[38px] text-xs font-semibold gap-1.5 shrink-0 rounded-full sm:rounded-md px-3.5"
                onClick={() => setValuationOpen(true)}
              >
                <TrendingUpIcon className="size-3.5 text-primary" />
                <span>Reconcile</span>
              </Button>
            )}

            {isDeposit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isRecalculating}
                className="min-h-[38px] text-xs font-semibold gap-1.5 shrink-0 rounded-full sm:rounded-md px-3.5"
                onClick={handleRecalculate}
              >
                <RefreshCwIcon className={cn('size-3.5 text-primary', isRecalculating && 'animate-spin')} />
                <span>Reconcile</span>
              </Button>
            )}

            {/* Primary Action 3: Pay bill (Cards) */}
            {isCard && account.outstanding > 0 && (
              <Button
                type="button"
                size="sm"
                className="min-h-[38px] text-xs font-semibold gap-1.5 shrink-0 rounded-full sm:rounded-md px-3.5 shadow-xs"
                onClick={() => openPayBill(account.id)}
              >
                <CreditCardIcon className="size-3.5" />
                <span>Pay bill</span>
              </Button>
            )}

            {/* Primary Action 4: Edit */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[38px] text-xs font-medium shrink-0 rounded-full sm:rounded-md px-3.5"
              onClick={() => setEditOpeningOpen(true)}
            >
              <span>Edit</span>
            </Button>

            {/* Rest in a dropdown menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                nativeButton={true}
                className="min-h-[38px] min-w-[38px] p-2 rounded-full sm:rounded-md border bg-card hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                aria-label="More account options"
              >
                <MoreHorizontalIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={handleRecalculate} disabled={isRecalculating}>
                    <RefreshCwIcon className="size-3.5 mr-2" />
                    <span>Recalculate Balances</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                    <Trash2Icon className="size-3.5 mr-2" />
                    <span>Delete Account</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* EPF / VPF Account Passbook Section */}
      {isPf ? (
        <EpfDetailSection accountId={account.id} accountName={account.name} />
      ) : (
        <>
          {/* Kind-Specific Highlight Panel */}
          {isCard && (
        <div className="p-4 rounded-xl border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="size-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Card Information & Utilization
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {account.currentDueDate && account.outstanding > 0 && (
                <Badge variant="destructive" className="text-xs font-medium">
                  Current Due: {account.currentDueDate}
                </Badge>
              )}
              {account.nextStatementDate && (
                <Badge variant="outline" className="text-xs font-medium">
                  Next Bill: {account.nextStatementDate}
                </Badge>
              )}
              {account.nextDueDate && (
                <Badge variant="secondary" className="text-xs font-medium">
                  Next Due: {account.nextDueDate}
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">
                {account.balance < 0 ? 'Outstanding Debt' : account.balance > 0 ? 'Credit Balance' : 'Card Balance'}
              </span>
              <div
                className={cn(
                  'text-xl font-bold mt-0.5',
                  account.balance < 0
                    ? 'text-destructive'
                    : account.balance > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-foreground'
                )}
              >
                {formatLiabilityBalance(account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Available Credit</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR((account.creditLimit || 0) - account.outstanding)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Credit Limit</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.creditLimit || 0)}
              </div>
            </div>
          </div>

          {account.creditLimit && account.creditLimit > 0 && (() => {
            const pct = Math.min(100, Math.max(0, account.utilization * 100));
            const formattedPct = (account.utilization * 100).toFixed(1);
            const colorClass =
              account.utilization > 0.6
                ? 'bg-rose-500'
                : account.utilization >= 0.3
                ? 'bg-amber-500'
                : 'bg-emerald-500';
            return (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Credit Utilization</span>
                  <span className="font-semibold text-foreground">
                    {formatINR(account.outstanding)} of {formatINR(account.creditLimit)} ({formattedPct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-300 rounded-full', colorClass)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t text-xs">
            <div className="p-2 rounded-lg bg-muted/30">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Billing Cycle</span>
              <p className="font-semibold text-foreground mt-0.5">
                {account.statementDay ? `${formatDayOrdinal(account.statementDay)} of month` : '21st'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Payment Due Days</span>
              <p className="font-semibold text-foreground mt-0.5">
                {account.dueDays ? `${account.dueDays} days` : '20 days'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Next Bill Generates</span>
              <p className="font-semibold text-foreground mt-0.5">{account.nextStatementDate || '—'}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30">
              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Next Due Date</span>
              <p className="font-semibold text-foreground mt-0.5">{account.nextDueDate || '—'}</p>
            </div>
          </div>
        </div>
      )}

      {isInvestment && (
        <div className="p-4 rounded-xl border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUpIcon className="size-4 text-emerald-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Investment Portfolio Metrics
              </h3>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setValuationOpen(true)}
            >
              <PlusIcon className="size-3" />
              <span>Record Valuation</span>
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Current Market Value</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.currentValue ?? account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Total Invested (Cost Basis)</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.costBasis ?? account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Total Returns (Gain)</span>
              <div
                className={cn(
                  'text-xl font-bold mt-0.5',
                  (account.gain || 0) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {formatGain(account.gain || 0).text}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Return Rate</span>
              <div
                className={cn(
                  'text-xl font-bold mt-0.5',
                  (account.gainPct || 0) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {formatPercent(account.gainPct || 0, true)}
              </div>
            </div>
          </div>

          {/* Valuations Log */}
          {accountValuations.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <h4 className="text-xs font-semibold text-muted-foreground">Valuation History</h4>
              <div className="divide-y border rounded-lg overflow-hidden bg-card text-xs">
                {accountValuations.slice().reverse().map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="font-medium text-foreground">{v.date}</span>
                      {v.note && (
                        <span className="text-muted-foreground italic ml-2">({v.note})</span>
                      )}
                    </div>
                    <div className="font-bold text-foreground">{formatINR(v.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {account.kind === 'recurring_deposit' && (
        <RDDetailSection
          account={account}
          onRefreshNeeded={() => recalculateAccount(account.id)}
        />
      )}

      {account.kind === 'fixed_deposit' && (
        <FDDetailSection
          account={account}
          onRefreshNeeded={() => recalculateAccount(account.id)}
          onEdit={() => setEditOpeningOpen(true)}
        />
      )}

      {/* Balance Trend Chart */}
      <div className="p-4 rounded-xl border bg-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Balance History
            </h3>
            <span className="text-xs font-semibold text-foreground">
              {isLiability ? 'Outstanding' : 'Current'}:{' '}
              {formatINR(isLiability ? account.outstanding : (account.currentValue || account.balance))}
            </span>
          </div>

          {/* Range Presets */}
          <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1 self-start sm:self-center">
            {(['7D', '30D', '90D', '1Y', 'ALL'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
                  preset === p
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p === 'ALL' ? 'All' : p}
              </button>
            ))}
          </div>
        </div>

        {/* Invariant Mismatch Alert */}
        {historyData?.isMismatch && (
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertTitle>Data mismatch</AlertTitle>
            <AlertDescription>
              The balance history last point does not match the account&apos;s current {isLiability ? 'outstanding' : 'balance'}.
            </AlertDescription>
          </Alert>
        )}

        <div className="w-full" style={{ height: isMobile ? 180 : 240 }}>
          <FinanceAreaChart
            data={chartPoints}
            label={isLiability ? 'Outstanding' : 'Balance'}
            height={isMobile ? 180 : 240}
            tickCount={isMobile ? 3 : 5}
          />
        </div>

        {historyPoints.length < 3 && (
          <p className="text-xs text-muted-foreground italic">
            Tracking started on {formatDateShort(String((account.metadata as Record<string, unknown> | null)?.openingBalanceDate || historyPoints[0]?.date || ''))}. History builds up as you add transactions.
          </p>
        )}
      </div>

      {/* Ledger Table */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Account Ledger
        </h3>
        <TransactionTable accountId={account.id} />
      </div>
      </>
      )}

      {/* Update Valuation Dialog */}
      <UpdateValuationDialog
        account={account}
        open={valuationOpen}
        onOpenChange={setValuationOpen}
      />

      {/* Edit Opening Balance & Date Dialog */}
      <EditAccountOpeningDialog
        account={account}
        open={editOpeningOpen}
        onOpenChange={setEditOpeningOpen}
      />
    </div>
  );
}
