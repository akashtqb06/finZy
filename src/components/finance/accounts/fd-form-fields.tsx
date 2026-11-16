'use client';

import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatINR } from '../shared/format';
import {
  calculateFDValue,
  deriveFDMaturityDate,
  type FDType,
  type FDCompounding,
  type FDAccrualMode,
  type FDPayoutFrequency,
  type FDConfig,
} from '@src/lib/finance/domain/fd';
import { InfoIcon, SparklesIcon, TrendingUpIcon, WalletIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FDFormValues {
  fdType: FDType;
  principalRupees: string;
  ratePercent: string;
  compounding: FDCompounding;
  startDate: string;
  maturityDate: string;
  tenureYears: string;
  tenureMonths: string;
  tenureDays: string;
  accrualMode: FDAccrualMode;
  maturityAmountReceiptRupees: string;
  payoutFrequency: FDPayoutFrequency;
  payoutAccountId: string;
}

export interface FDFormFieldsProps {
  values: FDFormValues;
  onChange: (patch: Partial<FDFormValues>) => void;
  bankAccounts?: Array<{ id: string; name: string }>;
  className?: string;
}

export function FDFormFields({
  values,
  onChange,
  bankAccounts = [],
  className,
}: FDFormFieldsProps) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  // Parse numeric values
  const principalPaise = Math.round((parseFloat(values.principalRupees) || 0) * 100);
  const rateNum = parseFloat(values.ratePercent) || 0;
  const receiptPaise = values.maturityAmountReceiptRupees
    ? Math.round(parseFloat(values.maturityAmountReceiptRupees) * 100)
    : undefined;

  // Live calculation preview
  const livePreview = useMemo(() => {
    if (principalPaise <= 0 || !values.startDate || !values.maturityDate || values.maturityDate <= values.startDate) {
      return null;
    }

    try {
      const cfg: FDConfig = {
        principal: principalPaise,
        ratePercent: rateNum,
        startDate: values.startDate,
        maturityDate: values.maturityDate,
        fdType: values.fdType,
        compounding: values.compounding,
        accrualMode: values.accrualMode,
        dayCount: 'act_365',
        maturityAmountPerReceipt: receiptPaise,
        payoutFrequency: values.payoutFrequency,
        payoutAccountId: values.payoutAccountId || null,
      };

      return calculateFDValue(cfg, values.startDate);
    } catch {
      return null;
    }
  }, [
    principalPaise,
    rateNum,
    values.startDate,
    values.maturityDate,
    values.fdType,
    values.compounding,
    values.accrualMode,
    receiptPaise,
    values.payoutFrequency,
    values.payoutAccountId,
  ]);

  // Synchronize tenure with maturity date
  const handleTenureChange = (field: 'tenureYears' | 'tenureMonths' | 'tenureDays', val: string) => {
    const updated = {
      ...values,
      [field]: val,
    };
    const years = parseInt(updated.tenureYears, 10) || 0;
    const months = parseInt(updated.tenureMonths, 10) || 0;
    const days = parseInt(updated.tenureDays, 10) || 0;

    if (updated.startDate && (years > 0 || months > 0 || days > 0)) {
      const derived = deriveFDMaturityDate(updated.startDate, { years, months, days });
      onChange({ [field]: val, maturityDate: derived });
    } else {
      onChange({ [field]: val });
    }
  };

  const handleStartDateChange = (newStart: string) => {
    const years = parseInt(values.tenureYears, 10) || 0;
    const months = parseInt(values.tenureMonths, 10) || 0;
    const days = parseInt(values.tenureDays, 10) || 0;

    if (newStart && (years > 0 || months > 0 || days > 0)) {
      const derived = deriveFDMaturityDate(newStart, { years, months, days });
      onChange({ startDate: newStart, maturityDate: derived });
    } else {
      onChange({ startDate: newStart });
    }
  };

  return (
    <div className={cn('space-y-4 pt-2 border-t', className)}>
      {/* 1. Deposit Type */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Deposit Type</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ fdType: 'cumulative' })}
            className={cn(
              'flex flex-col text-left p-2.5 rounded-lg border transition-colors',
              values.fdType === 'cumulative'
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border bg-card hover:bg-muted/50'
            )}
          >
            <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
              <TrendingUpIcon className="size-3.5 text-primary" />
              <span>Cumulative FD</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
              Interest compounds and is paid out with principal at maturity.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onChange({ fdType: 'payout' })}
            className={cn(
              'flex flex-col text-left p-2.5 rounded-lg border transition-colors',
              values.fdType === 'payout'
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border bg-card hover:bg-muted/50'
            )}
          >
            <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
              <WalletIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Payout FD</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
              Principal stays fixed; interest is periodically credited to a bank account.
            </p>
          </button>
        </div>
      </div>

      {/* 2. Principal & Interest Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fd-principal" className="text-xs font-medium text-muted-foreground">
            Principal Deposit Amount (₹) *
          </Label>
          <Input
            id="fd-principal"
            type="number"
            inputMode="decimal"
            placeholder="100000"
            className="h-9 text-xs bg-card"
            value={values.principalRupees}
            onChange={(e) => onChange({ principalRupees: e.target.value })}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fd-rate" className="text-xs font-medium text-muted-foreground">
            Annual Interest Rate (%) *
          </Label>
          <Input
            id="fd-rate"
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="7.10"
            className="h-9 text-xs bg-card"
            value={values.ratePercent}
            onChange={(e) => onChange({ ratePercent: e.target.value })}
            required
          />
        </div>
      </div>

      {/* 3. Compounding Frequency (for Cumulative) or Payout Frequency (for Payout) */}
      {values.fdType === 'cumulative' ? (
        <div className="space-y-1.5">
          <Label htmlFor="fd-compounding" className="text-xs font-medium text-muted-foreground">
            Compounding Frequency
          </Label>
          <Select
            items={[
              { value: 'quarterly', label: 'Quarterly (Indian Banking Default)' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'half_yearly', label: 'Half-Yearly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
            value={values.compounding}
            onValueChange={(val) => onChange({ compounding: val as FDCompounding })}
          >
            <SelectTrigger id="fd-compounding" className="w-full h-9 bg-card px-2 text-xs">
              <SelectValue placeholder="Select compounding" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quarterly">Quarterly (Indian Banking Default)</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="half_yearly">Half-Yearly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fd-payout-freq" className="text-xs font-medium text-muted-foreground">
              Payout Frequency
            </Label>
            <Select
              items={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'half_yearly', label: 'Half-Yearly' },
                { value: 'yearly', label: 'Yearly' },
                { value: 'at_maturity', label: 'At Maturity' },
              ]}
              value={values.payoutFrequency}
              onValueChange={(val) => onChange({ payoutFrequency: val as FDPayoutFrequency })}
            >
              <SelectTrigger id="fd-payout-freq" className="w-full h-9 bg-card px-2 text-xs">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="half_yearly">Half-Yearly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="at_maturity">At Maturity</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fd-payout-acc" className="text-xs font-medium text-muted-foreground">
              Payout Credit Account
            </Label>
            <Select
              items={
                bankAccounts.length > 0
                  ? bankAccounts.map((b) => ({ value: b.id, label: b.name }))
                  : [{ value: 'none', label: 'No bank accounts available' }]
              }
              value={values.payoutAccountId || (bankAccounts[0]?.id ?? '')}
              onValueChange={(val) => onChange({ payoutAccountId: val })}
            >
              <SelectTrigger id="fd-payout-acc" className="w-full h-9 bg-card px-2 text-xs">
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* 4. Dates & Tenure Synchronization */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="fd-start" className="text-xs font-medium text-muted-foreground">
            Start Date *
          </Label>
          <DatePicker
            id="fd-start"
            className="h-9 text-xs bg-card"
            value={values.startDate}
            onChange={handleStartDateChange}
            placeholder="Select start date"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fd-maturity" className="text-xs font-medium text-muted-foreground">
            Maturity Date *
          </Label>
          <DatePicker
            id="fd-maturity"
            className="h-9 text-xs bg-card"
            value={values.maturityDate}
            onChange={(d) => onChange({ maturityDate: d })}
            placeholder="Select maturity date"
          />
        </div>
      </div>

      {/* Tenure helper inputs (Years, Months, Days) */}
      <div className="space-y-1.5">
        <span className="text-[11px] text-muted-foreground">Or set tenure (auto-calculates maturity date):</span>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Input
              type="number"
              min="0"
              placeholder="Years"
              className="h-8 text-xs bg-card"
              value={values.tenureYears}
              onChange={(e) => handleTenureChange('tenureYears', e.target.value)}
            />
            <span className="text-[10px] text-muted-foreground ml-1">Years</span>
          </div>
          <div>
            <Input
              type="number"
              min="0"
              placeholder="Months"
              className="h-8 text-xs bg-card"
              value={values.tenureMonths}
              onChange={(e) => handleTenureChange('tenureMonths', e.target.value)}
            />
            <span className="text-[10px] text-muted-foreground ml-1">Months</span>
          </div>
          <div>
            <Input
              type="number"
              min="0"
              placeholder="Days"
              className="h-8 text-xs bg-card"
              value={values.tenureDays}
              onChange={(e) => handleTenureChange('tenureDays', e.target.value)}
            />
            <span className="text-[10px] text-muted-foreground ml-1">Days</span>
          </div>
        </div>
      </div>

      {/* 5. Advanced Settings Toggle */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
        >
          <span>{showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}</span>
        </button>

        {showAdvanced && (
          <div className="space-y-3 pt-3 mt-2 border-t bg-muted/20 p-3 rounded-lg">
            {values.fdType === 'cumulative' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="fd-accrual-mode" className="text-xs font-medium text-muted-foreground">
                    Accrual Method
                  </Label>
                  <span title="Bank mode compounds on period boundaries and adds simple interest for in-progress days. Smooth mode follows a continuous compound growth curve.">
                    <InfoIcon className="size-3 text-muted-foreground cursor-help" />
                  </span>
                </div>
                <Select
                  items={[
                    { value: 'bank', label: 'Bank (Discrete Compounding + Simple Days, Default)' },
                    { value: 'smooth', label: 'Smooth (Continuous Fractional Curve)' },
                  ]}
                  value={values.accrualMode}
                  onValueChange={(val) => onChange({ accrualMode: val as FDAccrualMode })}
                >
                  <SelectTrigger id="fd-accrual-mode" className="w-full h-8 bg-card px-2 text-xs">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank (Discrete Compounding + Simple Days, Default)</SelectItem>
                    <SelectItem value="smooth">Smooth (Continuous Fractional Curve)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fd-receipt-amt" className="text-xs font-medium text-muted-foreground">
                Maturity Amount as per Receipt (₹, Optional)
              </Label>
              <Input
                id="fd-receipt-amt"
                type="number"
                inputMode="decimal"
                placeholder="Matches printed bank receipt exactly"
                className="h-8 text-xs bg-card"
                value={values.maturityAmountReceiptRupees}
                onChange={(e) => onChange({ maturityAmountReceiptRupees: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">
                Calibrates accruals so your projected value matches the bank receipt to the exact paisa.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 6. Live Preview Card */}
      {livePreview && (
        <div data-testid="fd-live-preview" className="p-3 rounded-lg border bg-primary/5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <SparklesIcon className="size-3.5 text-primary" />
            <span>FD Projection Preview</span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="p-2 rounded-md bg-background/80 border">
              <span className="text-[10px] text-muted-foreground block">Effective Yield</span>
              <span className="text-xs font-bold text-foreground">
                {livePreview.effectiveYieldPercent}% p.a.
              </span>
            </div>

            <div className="p-2 rounded-md bg-background/80 border">
              <span className="text-[10px] text-muted-foreground block">Total Interest</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                +{formatINR(
                  values.fdType === 'payout'
                    ? (livePreview.payoutSchedule?.reduce((sum, p) => sum + p.amount, 0) || 0)
                    : (livePreview.projectedMaturityValue - principalPaise)
                )}
              </span>
            </div>

            <div className="p-2 rounded-md bg-background/80 border">
              <span className="text-[10px] text-muted-foreground block">
                {values.fdType === 'payout' ? 'Payout per Period' : 'Maturity Value'}
              </span>
              <span className="text-xs font-bold text-primary">
                {formatINR(
                  values.fdType === 'payout'
                    ? (livePreview.payoutSchedule?.[0]?.amount || 0)
                    : livePreview.projectedMaturityValue
                )}
              </span>
            </div>
          </div>

          {livePreview.differenceFromReceiptText && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              ℹ️ {livePreview.differenceFromReceiptText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

