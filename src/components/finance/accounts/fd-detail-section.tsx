'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  PiggyBankIcon,
  RefreshCwIcon,
  CalendarIcon,
  Edit2Icon,
  ArrowRightIcon,
  InfoIcon,
  TrendingUpIcon,
  CheckCircle2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { formatINR } from '../shared/format';
import type { AccountWithBalance } from '../shared/fixtures';
import type {
  FDConfig,
  FDValuationResult,
  FDScheduleItem,
  FDType,
  FDCompounding,
  FDAccrualMode,
  FDPayoutFrequency,
} from '@src/lib/finance/domain/fd';
import { cn } from '@/lib/utils';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';
import { useFinanceStore } from '../shared/finance-store';
import { FinanceAreaChart, type FinanceAreaPoint } from '../charts/finance-area-chart';
import { FDFormFields, type FDFormValues } from './fd-form-fields';
import { parseMoneyToPaise } from '@src/lib/finance/import/number-parser';

export interface FDDetailSectionProps {
  account: AccountWithBalance;
  onRefreshNeeded?: () => void;
  onEdit?: () => void;
}

export function FDDetailSection({ account, onRefreshNeeded, onEdit }: FDDetailSectionProps) {
  const [loading, setLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [scheduleData, setScheduleData] = useState<{
    config: FDConfig;
    valuation: FDValuationResult;
  } | null>(null);

  // Close FD dialog state
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [targetAccountId, setTargetAccountId] = useState('');
  const [closeDate, setCloseDate] = useState(() => todayInTz(DEFAULT_TZ));
  const [closeAmountRupees, setCloseAmountRupees] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  // Edit FD dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editValues, setEditValues] = useState<FDFormValues>({
    fdType: 'cumulative',
    principalRupees: '100000',
    ratePercent: '7.1',
    compounding: 'quarterly',
    startDate: todayInTz(DEFAULT_TZ),
    maturityDate: '',
    tenureYears: '1',
    tenureMonths: '0',
    tenureDays: '0',
    accrualMode: 'bank',
    maturityAmountReceiptRupees: '',
    payoutFrequency: 'quarterly',
    payoutAccountId: '',
  });

  const { accounts, refreshAccounts, refreshOverviewStats } = useFinanceStore();
  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.kind === 'bank' && a.id !== account.id),
    [accounts, account.id]
  );

  const today = todayInTz(DEFAULT_TZ);

  // Fetch FD schedule and valuation
  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/finance/accounts/${account.id}/fd-schedule`);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      const data = await res.json();
      setScheduleData(data);
    } catch (err) {
      console.warn('Error fetching FD schedule:', err);
    } finally {
      setLoading(false);
    }
  }, [account.id]);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/finance/accounts/${account.id}/fd-schedule`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => {
        if (!ignore) {
          setScheduleData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('Error fetching FD schedule:', err);
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [account.id]);

  const handleRecalculate = async () => {
    try {
      setIsRecalculating(true);
      const res = await fetch(`/api/finance/accounts/${account.id}/recalculate`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Recalculation failed');
      }
      toast.success('Fixed deposit recalculation completed');
      await fetchSchedule();
      onRefreshNeeded?.();
      await Promise.all([refreshAccounts(), refreshOverviewStats()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Recalculation failed');
    } finally {
      setIsRecalculating(false);
    }
  };

  // Open Edit dialog with current account values
  const handleOpenEdit = () => {
    if (onEdit) {
      onEdit();
      return;
    }
    const meta = (account.metadata || {}) as Record<string, unknown>;
    const principalPaise = Number(
      meta.principalPaise ?? meta.principal ?? meta.depositAmount ?? account.balance ?? 10000000
    );
    const rate = Number(meta.ratePercent ?? meta.interestRate ?? meta.rate ?? 7.1);

    setEditValues({
      fdType: (meta.fdType as FDType) || 'cumulative',
      principalRupees: (principalPaise / 100).toString(),
      ratePercent: rate.toString(),
      compounding: (meta.compounding ?? meta.compoundingFrequency ?? 'quarterly') as FDCompounding,
      startDate: (meta.startDate as string) || today,
      maturityDate: (meta.maturityDate as string) || '',
      tenureYears: (meta.tenureYears as number | undefined)?.toString() || '1',
      tenureMonths: (meta.tenureMonths as number | undefined)?.toString() || '0',
      tenureDays: (meta.tenureDays as number | undefined)?.toString() || '0',
      accrualMode: (meta.accrualMode as FDAccrualMode) || 'bank',
      maturityAmountReceiptRupees: meta.maturityAmountPerReceipt
        ? (Number(meta.maturityAmountPerReceipt) / 100).toString()
        : '',
      payoutFrequency: (meta.payoutFrequency as FDPayoutFrequency) || 'quarterly',
      payoutAccountId: (meta.payoutAccountId as string) || '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      setIsSavingEdit(true);
      const principalPaise = parseMoneyToPaise(editValues.principalRupees)?.paise ?? 0;
      const rateNum = parseFloat(editValues.ratePercent) || 0;
      const receiptPaise = editValues.maturityAmountReceiptRupees
        ? parseMoneyToPaise(editValues.maturityAmountReceiptRupees)?.paise
        : undefined;

      const updatedMeta = {
        ...(account.metadata || {}),
        fdType: editValues.fdType,
        compounding: editValues.compounding,
        compoundingFrequency: editValues.compounding,
        principal: principalPaise,
        principalPaise,
        ratePercent: rateNum,
        interestRate: rateNum,
        startDate: editValues.startDate,
        maturityDate: editValues.maturityDate,
        tenureYears: parseInt(editValues.tenureYears, 10) || 0,
        tenureMonths: parseInt(editValues.tenureMonths, 10) || 0,
        tenureDays: parseInt(editValues.tenureDays, 10) || 0,
        accrualMode: editValues.accrualMode,
        dayCount: 'act_365',
        maturityAmountPerReceipt: receiptPaise,
        payoutFrequency: editValues.fdType === 'payout' ? editValues.payoutFrequency : undefined,
        payoutAccountId: editValues.fdType === 'payout' ? editValues.payoutAccountId : undefined,
      };

      const res = await fetch(`/api/finance/accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: updatedMeta }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update account');
      }

      toast.success('Fixed deposit details updated');
      setEditDialogOpen(false);
      await fetchSchedule();
      onRefreshNeeded?.();
      await Promise.all([refreshAccounts(), refreshOverviewStats()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update fixed deposit');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open Close FD dialog
  const handleOpenClose = () => {
    const projectedPaise =
      scheduleData?.valuation?.projectedMaturityValue ??
      scheduleData?.valuation?.currentValue ??
      account.projectedMaturityAmount ??
      account.accruedValue ??
      account.balance;

    setCloseAmountRupees((projectedPaise / 100).toString());
    setCloseDate(today);
    if (bankAccounts.length > 0 && !targetAccountId) {
      setTargetAccountId(bankAccounts[0].id);
    }
    setCloseDialogOpen(true);
  };

  const handleConfirmClose = async () => {
    if (!targetAccountId) {
      toast.error('Please select a destination bank account');
      return;
    }
    try {
      setIsClosing(true);
      const amountPaise = parseMoneyToPaise(closeAmountRupees)?.paise ?? 0;
      if (amountPaise <= 0) {
        toast.error('Maturity proceeds amount must be greater than zero');
        return;
      }

      const res = await fetch(`/api/finance/accounts/${account.id}/close-fd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAccountId,
          date: closeDate,
          amount: amountPaise,
          note: closeNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to close fixed deposit');
      }

      toast.success('Fixed deposit closed and maturity proceeds recorded');
      setCloseDialogOpen(false);
      onRefreshNeeded?.();
      await Promise.all([refreshAccounts(), refreshOverviewStats()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close fixed deposit');
    } finally {
      setIsClosing(false);
    }
  };

  const valuation = scheduleData?.valuation;
  const config = scheduleData?.config;

  // Chart data: growth curve from start to maturity with today marked
  const chartPoints = useMemo<FinanceAreaPoint[]>(() => {
    if (!scheduleData || !valuation || !config) return [];
    const pointsMap = new Map<string, number>();

    // Start point
    pointsMap.set(config.startDate, config.principal);

    // Period boundaries
    if (valuation.schedule) {
      for (const p of valuation.schedule) {
        pointsMap.set(p.to, p.closingBalance);
      }
    }

    // Today point (if between start and maturity)
    if (today >= config.startDate && today <= valuation.maturityDate) {
      pointsMap.set(today, valuation.currentValue);
    }

    const sortedDates = Array.from(pointsMap.keys()).sort();
    return sortedDates.map((date) => ({
      date,
      value: pointsMap.get(date) ?? 0,
    }));
  }, [scheduleData, valuation, config, today]);

  const isMatured = valuation ? valuation.daysToMaturity <= 0 : false;
  const isPayout = config?.fdType === 'payout';

  const payoutAccountName = useMemo(() => {
    if (!config?.payoutAccountId) return null;
    return accounts.find((a) => a.id === config.payoutAccountId)?.name || null;
  }, [accounts, config]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Primary Actions */}
      <div className="p-4 rounded-xl border bg-card space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <PiggyBankIcon className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  {isPayout ? 'Payout Fixed Deposit' : 'Cumulative Fixed Deposit'}
                </h3>
                <Badge
                  variant={isMatured ? 'secondary' : 'default'}
                  className={cn(
                    'text-[10px] py-0 px-2 font-medium',
                    isMatured
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  )}
                >
                  {isMatured ? 'Matured' : `${valuation?.daysToMaturity ?? '—'} days left`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isPayout
                  ? 'Interest paid periodically to bank account; principal returned at maturity.'
                  : 'Compounding interest reinvested until maturity.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRecalculating || loading}
              className="h-8 text-xs gap-1.5"
              onClick={handleRecalculate}
            >
              <RefreshCwIcon
                className={cn('size-3.5 text-primary', isRecalculating && 'animate-spin')}
              />
              <span>{isRecalculating ? 'Recalculating...' : 'Recalculate'}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={handleOpenEdit}
            >
              <Edit2Icon className="size-3.5" />
              <span>Edit</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-8 text-xs gap-1.5"
              onClick={handleOpenClose}
            >
              <ArrowRightIcon className="size-3.5" />
              <span>Close FD</span>
            </Button>
          </div>
        </div>

        {/* Receipt Difference Alert */}
        {valuation?.differenceFromReceiptPaise !== undefined &&
          valuation.differenceFromReceiptPaise !== 0 && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 flex items-start gap-2.5 text-xs">
              <InfoIcon className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  Receipt Calibration Active
                </span>
                <p className="text-muted-foreground">
                  Your bank&apos;s receipt differs by{' '}
                  <strong className="text-foreground">
                    {formatINR(Math.abs(valuation.differenceFromReceiptPaise))}
                  </strong>{' '}
                  from the formula. Implied yield is calibrated to{' '}
                  <strong className="text-foreground">
                    {valuation.impliedAnnualRatePercent?.toFixed(3)}% p.a.
                  </strong>{' '}
                  to match the receipt exactly at maturity.
                </p>
              </div>
            </div>
          )}

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {/* 1. Current Value */}
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground font-medium">Current Value</span>
            <div className="text-xl font-bold text-foreground mt-0.5">
              {formatINR(valuation?.currentValue ?? account.accruedValue ?? account.balance)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              earns about{' '}
              <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {formatINR(valuation?.dailyAccrual ?? 0)}
              </strong>
              /day
            </div>
          </div>

          {/* 2. Accrued Interest or Total Payouts */}
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground font-medium">
              {isPayout ? 'Total Interest Paid' : 'Accrued Interest'}
            </span>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              +{formatINR(
                isPayout
                  ? valuation?.totalInterestPaidOut ?? 0
                  : valuation?.interestAccrued ?? account.interestEarned ?? 0
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {isPayout ? 'Credited to payout account' : 'Reinvested in principal'}
            </div>
          </div>

          {/* 3. Principal */}
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground font-medium">Principal</span>
            <div className="text-xl font-bold text-foreground mt-0.5">
              {formatINR(config?.principal ?? account.principal ?? account.balance)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Since {config?.startDate || '—'}
            </div>
          </div>

          {/* 4. Projected Maturity Value */}
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground font-medium">Maturity Value</span>
            <div className="text-xl font-bold text-primary mt-0.5">
              {formatINR(
                valuation?.projectedMaturityValue ??
                  account.projectedMaturityAmount ??
                  account.balance
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Matures {valuation?.maturityDate || '—'}
            </div>
          </div>

          {/* 5. Interest Rate & Effective Yield */}
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground font-medium">Interest Rate</span>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {config?.ratePercent ?? account.interestRate ?? 7.1}% p.a.
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Yield: <strong className="text-foreground">{valuation?.effectiveYieldPercent.toFixed(2) ?? '—'}%</strong> p.a.
            </div>
          </div>

          {/* 6. Compounding / Payout Frequency */}
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground font-medium">
              {isPayout ? 'Payout Frequency' : 'Compounding'}
            </span>
            <div className="text-lg font-bold capitalize text-foreground mt-0.5">
              {isPayout ? config?.payoutFrequency : config?.compounding ?? 'Quarterly'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 truncate">
              {isPayout
                ? payoutAccountName
                  ? `To: ${payoutAccountName}`
                  : 'Recurring income'
                : `${config?.accrualMode === 'smooth' ? 'Smooth' : 'Bank'} discrete`}
            </div>
          </div>

          {/* 7. Next Compounding / Payout Date */}
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground font-medium">
              {isPayout ? 'Next Payout' : 'Next Compounding'}
            </span>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {valuation?.nextCompoundingDate || (isMatured ? 'Matured' : '—')}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {isMatured ? 'Tenure complete' : 'Interest credits to balance'}
            </div>
          </div>

          {/* 8. Tenure & Days to Maturity */}
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground font-medium">Days to Maturity</span>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {isMatured ? '0 days' : `${valuation?.daysToMaturity ?? '—'} days`}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {isMatured ? 'Ready for closure' : `Due on ${valuation?.maturityDate ?? '—'}`}
            </div>
          </div>
        </div>
      </div>

      {/* Growth Curve Chart */}
      <div className="p-4 rounded-xl border bg-card space-y-3 shadow-xs">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <TrendingUpIcon className="size-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Value Growth Curve to Maturity
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {config?.startDate} → {valuation?.maturityDate}
          </span>
        </div>

        <div className="w-full pt-2">
          <FinanceAreaChart
            data={chartPoints}
            label="Deposit Value"
            referenceX={today >= (config?.startDate || '') && today <= (valuation?.maturityDate || '') ? today : undefined}
            referenceXLabel="Today"
            height={200}
            tickCount={5}
          />
        </div>
      </div>

      {/* Compounding Period Schedule Table */}
      {valuation?.schedule && valuation.schedule.length > 0 && (
        <div className="p-4 rounded-xl border bg-card space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Compounding Schedule
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {valuation.schedule.length} {valuation.schedule.length === 1 ? 'period' : 'periods'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground">
                  <th className="py-2.5 px-3 font-semibold">Period</th>
                  <th className="py-2.5 px-3 font-semibold">From</th>
                  <th className="py-2.5 px-3 font-semibold">To</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Days</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Opening Balance</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Interest</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {valuation.schedule.map((p: FDScheduleItem) => {
                  const isCurrent = today >= p.from && today <= p.to;
                  return (
                    <tr
                      key={p.period}
                      className={cn(
                        'hover:bg-muted/40 transition-colors',
                        isCurrent && 'bg-primary/5 font-medium'
                      )}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span>Q{p.period}</span>
                          {isCurrent && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 border-primary/40 text-primary"
                            >
                              Current
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                        {p.from}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                        {p.to}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {p.days}d
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatINR(p.openingBalance)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                        +{formatINR(p.interest)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        {formatINR(p.closingBalance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Close FD Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CheckCircle2Icon className="size-5 text-emerald-500" />
              <span>Close Fixed Deposit</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Transfer maturity proceeds to a bank account and archive this fixed deposit.
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Destination Bank Account *</Label>
              <Select
                items={bankAccounts.map((b) => ({ value: b.id, label: b.name }))}
                value={targetAccountId}
                onValueChange={(val) => setTargetAccountId(val ?? '')}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({formatINR(b.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="close-date" className="text-xs font-semibold">
                  Maturity / Closure Date *
                </Label>
                <DatePicker
                  id="close-date"
                  value={closeDate}
                  onChange={setCloseDate}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="close-amount" className="text-xs font-semibold">
                  Maturity Amount (₹) *
                </Label>
                <Input
                  id="close-amount"
                  placeholder="e.g. 1,07,291"
                  value={closeAmountRupees}
                  onChange={(e) => setCloseAmountRupees(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="close-note" className="text-xs font-semibold">
                Notes (Optional)
              </Label>
              <Input
                id="close-note"
                placeholder="e.g. Credited at full maturity"
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isClosing}
              onClick={() => setCloseDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isClosing}
              onClick={handleConfirmClose}
            >
              {isClosing ? 'Closing...' : 'Confirm & Close FD'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit FD Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Edit2Icon className="size-4 text-primary" />
              <span>Edit Fixed Deposit</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <FDFormFields
              values={editValues}
              onChange={(patch) => setEditValues((prev) => ({ ...prev, ...patch }))}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSavingEdit}
              onClick={() => setEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSavingEdit}
              onClick={handleSaveEdit}
            >
              {isSavingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
