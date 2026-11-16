'use client';

import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import { paiseToRupees, rupeesToPaise } from '@src/components/finance/shared/format';
import { CategoryCombobox } from '../shared/category-combobox';
import type {
  AccountDTO,
  CategoryDTO,
  CreateRecurringRuleDTO,
  RecurringRuleDTO,
  UpdateRecurringRuleDTO,
} from '@src/lib/finance/contract';
import type { RecurringFrequency } from '@src/lib/finance/constants';
import { RECURRING_PRESETS } from '@src/lib/finance/recurring/presets';
import {
  createRecurringRuleAction,
  updateRecurringRuleAction,
} from '@src/app/(app)/finance/recurring/actions';
import { computeNextNDates, extractAnchorDay } from '@src/lib/finance/recurring/date-math';

interface RecurringRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleToEdit?: RecurringRuleDTO | null;
  initialPresetId?: 'rent' | 'sip' | 'emi' | 'subscription' | 'custom' | null;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  onSuccess: () => void;
}

const WEEKDAY_LABELS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

function RecurringRuleForm({
  ruleToEdit,
  initialPresetId,
  accounts,
  categories,
  onClose,
  onSuccess,
}: {
  ruleToEdit?: RecurringRuleDTO | null;
  initialPresetId?: 'rent' | 'sip' | 'emi' | 'subscription' | 'custom' | null;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = Boolean(ruleToEdit);
  const today = new Intl.DateTimeFormat('en-CA').format(new Date());

  // Form states
  const [type, setType] = useState<'expense' | 'income' | 'transfer' | 'contribution'>(
    (ruleToEdit?.type as 'expense' | 'income' | 'transfer' | 'contribution') || 'expense'
  );
  const [subType, setSubType] = useState<string>(ruleToEdit?.subType || '');
  const [payee, setPayee] = useState(ruleToEdit?.payee || '');
  const [amountRupees, setAmountRupees] = useState(
    ruleToEdit ? String(paiseToRupees(ruleToEdit.amount)) : ''
  );
  const [amountType, setAmountType] = useState<'fixed' | 'variable'>(
    ruleToEdit?.amountType || 'fixed'
  );
  const [mode, setMode] = useState<'auto_post' | 'ask_confirm'>(
    ruleToEdit?.mode || 'auto_post'
  );
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    ruleToEdit?.frequency || 'monthly'
  );
  const [interval, setInterval] = useState<number>(ruleToEdit?.interval || 1);
  const [weekdays, setWeekdays] = useState<number[]>(ruleToEdit?.weekdays || []);
  const [dayOfMonth, setDayOfMonth] = useState<string>(
    ruleToEdit?.dayOfMonth || (ruleToEdit ? String(extractAnchorDay(ruleToEdit)) : '1')
  );
  const [monthOfYear, setMonthOfYear] = useState<number>(
    ruleToEdit?.monthOfYear || 1
  );
  const [accountId, setAccountId] = useState(ruleToEdit?.accountId || accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(ruleToEdit?.toAccountId || '');
  const [categoryId, setCategoryId] = useState(ruleToEdit?.categoryId || '');
  const [startDate, setStartDate] = useState(ruleToEdit?.startDate || today);
  const [endCondition, setEndCondition] = useState<'never' | 'date' | 'occurrences'>(
    ruleToEdit?.endDate ? 'date' : ruleToEdit?.maxOccurrences ? 'occurrences' : 'never'
  );
  const [endDate, setEndDate] = useState(ruleToEdit?.endDate || '');
  const [maxOccurrences, setMaxOccurrences] = useState(
    ruleToEdit?.maxOccurrences ? String(ruleToEdit.maxOccurrences) : ''
  );
  const [note, setNote] = useState(
    ruleToEdit?.note ? ruleToEdit.note.replace(/\[DOM:(\d+|last)\]/i, '').trim() : ''
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live preview of next 5 occurrence dates
  const previewDates = useMemo(() => {
    try {
      return computeNextNDates(
        {
          startDate: startDate || today,
          frequency,
          interval: Number(interval) || 1,
          dayOfMonth: dayOfMonth.toLowerCase() === 'last' ? 'last' : dayOfMonth,
          monthOfYear,
          weekdays: weekdays.length > 0 ? weekdays : null,
          endDate: endCondition === 'date' ? endDate || null : null,
          maxOccurrences:
            endCondition === 'occurrences' && maxOccurrences
              ? parseInt(maxOccurrences, 10)
              : null,
          skippedDates: ruleToEdit?.skippedDates || [],
        },
        5
      );
    } catch {
      return [];
    }
  }, [
    startDate,
    frequency,
    interval,
    dayOfMonth,
    monthOfYear,
    weekdays,
    endCondition,
    endDate,
    maxOccurrences,
    today,
    ruleToEdit?.skippedDates,
  ]);

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const applyFrequencyPreset = (preset: 'daily' | 'weekly' | 'monthly' | 'yearly') => {
    setFrequency(preset);
    setInterval(1);
    if (preset === 'weekly' && weekdays.length === 0) {
      setWeekdays([1]); // Default to Monday
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    const amountNum = parseFloat(amountRupees);
    if (isNaN(amountNum) || amountNum <= 0) {
      errs.amount = 'Enter a valid positive amount';
    }

    if (!accountId) {
      errs.accountId = 'Source account is required';
    }

    if (type === 'transfer') {
      if (!toAccountId) {
        errs.toAccountId = 'Destination account is required for transfers';
      } else if (toAccountId === accountId) {
        errs.toAccountId = 'Destination account must be different from source';
      }
    }

    if (!startDate) {
      errs.startDate = 'Start date is required';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      errs.startDate = 'Invalid date format (YYYY-MM-DD)';
    }

    if (endCondition === 'date') {
      if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        errs.endDate = 'End date is required (YYYY-MM-DD)';
      } else if (startDate && endDate < startDate) {
        errs.endDate = 'End date cannot be earlier than start date';
      }
    }

    if (endCondition === 'occurrences') {
      const occNum = parseInt(maxOccurrences, 10);
      if (isNaN(occNum) || occNum <= 0) {
        errs.maxOccurrences = 'Enter a valid number of occurrences';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setIsSubmitting(true);
      const paise = rupeesToPaise(parseFloat(amountRupees));

      const cleanNoteText = note.trim();
      const noteWithDom =
        frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly'
          ? cleanNoteText
            ? `${cleanNoteText} [DOM:${dayOfMonth}]`
            : `[DOM:${dayOfMonth}]`
          : cleanNoteText || null;

      const finalEndDate = endCondition === 'date' && endDate.trim() ? endDate : null;
      const finalMaxOcc =
        endCondition === 'occurrences' && maxOccurrences
          ? parseInt(maxOccurrences, 10)
          : null;

      if (isEditing && ruleToEdit) {
        const payload: UpdateRecurringRuleDTO = {
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : null,
          categoryId: type !== 'transfer' ? categoryId || null : null,
          type,
          subType: subType || null,
          amount: paise,
          amountType,
          mode,
          payee: payee.trim() || null,
          note: noteWithDom,
          frequency,
          interval: Number(interval),
          weekdays: frequency === 'weekly' && weekdays.length > 0 ? weekdays : null,
          dayOfMonth:
            frequency === 'monthly' || frequency === 'yearly' ? dayOfMonth : null,
          monthOfYear: frequency === 'yearly' ? monthOfYear : null,
          startDate,
          endDate: finalEndDate,
          maxOccurrences: finalMaxOcc,
        };

        await updateRecurringRuleAction(ruleToEdit.id, payload);
        toast.success('Recurring rule updated successfully');
      } else {
        const payload: CreateRecurringRuleDTO = {
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : null,
          categoryId: type !== 'transfer' ? categoryId || null : null,
          type,
          subType: subType || null,
          amount: paise,
          amountType,
          mode,
          payee: payee.trim() || null,
          note: noteWithDom,
          frequency,
          interval: Number(interval),
          weekdays: frequency === 'weekly' && weekdays.length > 0 ? weekdays : null,
          dayOfMonth:
            frequency === 'monthly' || frequency === 'yearly' ? dayOfMonth : null,
          monthOfYear: frequency === 'yearly' ? monthOfYear : null,
          startDate,
          endDate: finalEndDate,
          maxOccurrences: finalMaxOcc,
          nextOccurrence: startDate,
        };

        await createRecurringRuleAction(payload);
        toast.success('Recurring rule created successfully');
      }

      onClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save recurring rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Rule Type & Subtype Presets */}
      {!isEditing && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Rule Type</Label>
          <div className="grid grid-cols-4 gap-2">
            {(['expense', 'income', 'transfer', 'contribution'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t);
                  if (t === 'transfer') setSubType('sip');
                  if (t === 'contribution') setSubType('pf');
                }}
                className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize cursor-pointer ${
                  type === t
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {type === 'transfer' && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground font-medium">Preset:</span>
              {[
                { id: 'sip', label: 'SIP' },
                { id: 'emi', label: 'EMI' },
                { id: 'rd', label: 'RD' },
                { id: 'card_payment', label: 'Card Bill' },
              ].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSubType(sub.id)}
                  className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors cursor-pointer ${
                    subType === sub.id
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mode Toggle (Auto-post vs Ask Confirm) */}
      <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-semibold">Posting Mode</Label>
            <p className="text-[11px] text-muted-foreground">
              {mode === 'auto_post'
                ? 'Transactions post automatically on due dates'
                : 'Creates a pending item in Inbox; review & adjust amount before posting'}
            </p>
          </div>
          <div className="flex rounded-lg border p-0.5 bg-background">
            <button
              type="button"
              onClick={() => setMode('auto_post')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer ${
                mode === 'auto_post'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Auto-Post
            </button>
            <button
              type="button"
              onClick={() => setMode('ask_confirm')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer ${
                mode === 'ask_confirm'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Confirm in Inbox
            </button>
          </div>
        </div>
      </div>

      {/* Payee / Name & Amount */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="rule-payee" className="text-xs font-medium">
            Payee / Title
          </Label>
          <Input
            id="rule-payee"
            type="text"
            placeholder="e.g. Landlord, Netflix, SIP"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="rule-amount" className="text-xs font-medium">
              Amount (₹) *
            </Label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAmountType('fixed')}
                className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                  amountType === 'fixed'
                    ? 'bg-primary/20 text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Fixed
              </button>
              <button
                type="button"
                onClick={() => {
                  setAmountType('variable');
                  setMode('ask_confirm'); // Variable amounts default to confirmation mode
                }}
                className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                  amountType === 'variable'
                    ? 'bg-primary/20 text-primary font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Variable
              </button>
            </div>
          </div>
          <Input
            id="rule-amount"
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="0.00"
            value={amountRupees}
            onChange={(e) => setAmountRupees(e.target.value)}
            className="h-8 text-xs font-mono"
            required
          />
          {errors.amount && <p className="text-[11px] text-destructive">{errors.amount}</p>}
        </div>
      </div>

      {/* Schedule & Frequency Presets */}
      <div className="space-y-2 p-3 rounded-lg border bg-muted/10">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Interval & Presets</Label>
          <div className="flex gap-1">
            {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyFrequencyPreset(p)}
                className={`px-2 py-0.5 text-[11px] rounded-md border capitalize cursor-pointer ${
                  frequency === p && interval === 1
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Custom interval selection */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <Label htmlFor="rule-frequency" className="text-xs text-muted-foreground">
              Repeat Cycle
            </Label>
            <Select
              items={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
              value={frequency}
              onValueChange={(val) => setFrequency(val as RecurringFrequency)}
            >
              <SelectTrigger id="rule-frequency" className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                <SelectItem value="quarterly" className="text-xs">Quarterly</SelectItem>
                <SelectItem value="yearly" className="text-xs">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="rule-interval" className="text-xs text-muted-foreground">
              Every N {frequency === 'daily' ? 'days' : frequency === 'weekly' ? 'weeks' : frequency === 'yearly' ? 'years' : 'months'}
            </Label>
            <Input
              id="rule-interval"
              type="number"
              min="1"
              value={interval}
              onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        {/* Weekday chips for weekly */}
        {frequency === 'weekly' && (
          <div className="space-y-1 pt-1">
            <Label className="text-xs text-muted-foreground">On Days</Label>
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAY_LABELS.map((w) => {
                const isSelected = weekdays.includes(w.day);
                return (
                  <button
                    key={w.day}
                    type="button"
                    onClick={() => toggleWeekday(w.day)}
                    className={`size-8 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'bg-background border text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Day of month for Monthly / Yearly */}
        {(frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly') && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="rule-dom" className="text-xs text-muted-foreground">
                Day of Month (1–31 or Last day)
              </Label>
              <button
                type="button"
                onClick={() => setDayOfMonth('last')}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                  dayOfMonth === 'last'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border text-muted-foreground hover:bg-muted/40'
                }`}
              >
                Last Day
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="rule-dom"
                type="text"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="1–31 or last"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        )}

        {/* Month of year for Yearly */}
        {frequency === 'yearly' && (
          <div className="space-y-1 pt-1">
            <Label htmlFor="rule-moy" className="text-xs text-muted-foreground">
              Month of Year (1–12)
            </Label>
            <Input
              id="rule-moy"
              type="number"
              min="1"
              max="12"
              value={monthOfYear}
              onChange={(e) => setMonthOfYear(Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className="h-8 text-xs font-mono"
            />
          </div>
        )}
      </div>

      {/* Start Date & End Conditions */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Start Date *</Label>
            <DatePicker
              value={startDate}
              onChange={(val) => setStartDate(val || today)}
              placeholder="Select start date"
            />
            {errors.startDate && <p className="text-[11px] text-destructive">{errors.startDate}</p>}
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">End Condition</Label>
            <Select
              items={[
                { value: 'never', label: 'Never ends' },
                { value: 'date', label: 'On specific date' },
                { value: 'occurrences', label: 'After N occurrences' },
              ]}
              value={endCondition}
              onValueChange={(val) => setEndCondition(val as 'never' | 'date' | 'occurrences')}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never" className="text-xs">Never ends</SelectItem>
                <SelectItem value="date" className="text-xs">On specific date</SelectItem>
                <SelectItem value="occurrences" className="text-xs">After N occurrences</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {endCondition === 'date' && (
          <div className="space-y-1">
            <Label className="text-xs font-medium">End Date *</Label>
            <DatePicker
              value={endDate}
              onChange={(val) => setEndDate(val || '')}
              placeholder="Select end date"
            />
            {errors.endDate && <p className="text-[11px] text-destructive">{errors.endDate}</p>}
          </div>
        )}

        {endCondition === 'occurrences' && (
          <div className="space-y-1">
            <Label className="text-xs font-medium">Maximum Occurrences *</Label>
            <Input
              type="number"
              min="1"
              value={maxOccurrences}
              onChange={(e) => setMaxOccurrences(e.target.value)}
              placeholder="e.g. 12"
              className="h-8 text-xs font-mono"
            />
            {errors.maxOccurrences && <p className="text-[11px] text-destructive">{errors.maxOccurrences}</p>}
          </div>
        )}
      </div>

      {/* Account Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium">Source Account *</Label>
          <Select
            items={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.kind})` }))}
            value={accountId}
            onValueChange={(val) => setAccountId(val ?? '')}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.name} ({a.kind})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.accountId && <p className="text-[11px] text-destructive">{errors.accountId}</p>}
        </div>

        {type === 'transfer' ? (
          <div className="space-y-1">
            <Label className="text-xs font-medium">Destination Account *</Label>
            <Select
              items={accounts
                .filter((a) => a.id !== accountId)
                .map((a) => ({ value: a.id, label: `${a.name} (${a.kind})` }))}
              value={toAccountId}
              onValueChange={(val) => setToAccountId(val ?? '')}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {a.name} ({a.kind})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.toAccountId && <p className="text-[11px] text-destructive">{errors.toAccountId}</p>}
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs font-medium">Category</Label>
            <CategoryCombobox
              categories={categories.filter((c) => (type === 'income' ? c.type === 'income' : c.type === 'expense'))}
              value={categoryId}
              onValueChange={setCategoryId}
            />
          </div>
        )}
      </div>

      {/* Note */}
      <div className="space-y-1">
        <Label htmlFor="rule-note" className="text-xs font-medium">
          Note (Optional)
        </Label>
        <Textarea
          id="rule-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add tags or additional context"
          className="text-xs resize-none h-16"
        />
      </div>

      {/* Live Preview of Next 5 Dates */}
      <div className="p-3 rounded-lg border bg-muted/30 space-y-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Next 5 Projected Occurrences
        </span>
        {previewDates.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {previewDates.map((d, idx) => (
              <Badge key={idx} variant="outline" className="text-xs font-mono bg-background">
                📅 {d}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No upcoming occurrences under current conditions.</p>
        )}
      </div>

      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Update Schedule' : 'Create Schedule'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RecurringRuleDialog({
  open,
  onOpenChange,
  ruleToEdit,
  initialPresetId,
  accounts,
  categories,
  onSuccess,
}: RecurringRuleDialogProps) {
  const isMobile = useIsMobile();
  const isEditing = Boolean(ruleToEdit);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto px-4 pb-6">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-base font-bold">
              {isEditing ? 'Edit Recurring Schedule' : 'New Recurring Schedule'}
            </SheetTitle>
          </SheetHeader>
          <RecurringRuleForm
            ruleToEdit={ruleToEdit}
            initialPresetId={initialPresetId}
            accounts={accounts}
            categories={categories}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {isEditing ? 'Edit Recurring Schedule' : 'New Recurring Schedule'}
          </DialogTitle>
        </DialogHeader>
        <RecurringRuleForm
          ruleToEdit={ruleToEdit}
          initialPresetId={initialPresetId}
          accounts={accounts}
          categories={categories}
          onClose={() => onOpenChange(false)}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
