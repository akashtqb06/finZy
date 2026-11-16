'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFinanceStore } from '../shared/finance-store';
import { rupeesToPaise } from '../shared/format';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';
import type { AccountWithBalance } from '../shared/fixtures';

export function UpdateValuationDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AccountWithBalance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const { addValuation, timezone } = useFinanceStore();
  const userTz = timezone || DEFAULT_TZ;

  const [valueRupees, setValueRupees] = useState('');
  const [date, setDate] = useState(() => todayInTz(userTz));
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (account) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValueRupees(((account.currentValue ?? account.balance) / 100).toString());
      setDate(todayInTz(userTz));
      setNote('');
      setError(null);
    }
  }, [account, userTz]);

  if (!account) return null;

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setTimeout(() => {
        if (typeof document !== 'undefined') {
          document.body.removeAttribute('inert');
          document.body.style.pointerEvents = '';
        }
      }, 50);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(valueRupees);
    if (isNaN(val) || val < 0) {
      setError('Please enter a valid positive valuation');
      return;
    }

    try {
      setIsSubmitting(true);
      const valPaise = rupeesToPaise(val);

      await addValuation({
        accountId: account.id,
        date,
        value: valPaise,
        // Do NOT send costBasis — it is always derived from transactions.
        // Storing it here would override the transaction-based invested amount.
        note: note.trim() || undefined,
      });

      toast.success('Valuation updated successfully');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record valuation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formFields = (
    <div className="space-y-3.5 py-2">
      <div className="space-y-1">
        <Label htmlFor="val-value" className="text-xs font-medium text-muted-foreground">
          Current Market Value (₹)
        </Label>
        <Input
          id="val-value"
          type="number"
          inputMode="decimal"
          step="0.01"
          required
          className="h-9 text-base font-bold"
          value={valueRupees}
          onChange={(e) => setValueRupees(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="val-date" className="text-xs font-medium text-muted-foreground">
          Valuation Date
        </Label>
        <DatePicker
          id="val-date"
          required
          className="h-9 text-xs"
          value={date}
          onChange={setDate}
          placeholder="Select valuation date"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="val-note" className="text-xs font-medium text-muted-foreground">
          Note (optional)
        </Label>
        <Input
          id="val-note"
          type="text"
          placeholder="e.g. End of month NAV update"
          className="h-9 text-xs"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        💡 Total Invested (cost basis) is always derived from your transactions — only the market value is recorded here.
      </p>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );

  const actions = (
    <div className="flex items-center justify-end gap-2 pt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onOpenChange(false)}
        className="text-xs"
      >
        Cancel
      </Button>
      <Button
        type="submit"
        size="sm"
        disabled={isSubmitting}
        className="text-xs font-semibold"
      >
        {isSubmitting ? 'Updating...' : 'Save Valuation'}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto px-4 pb-6">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="text-base font-bold">Update Valuation</SheetTitle>
            <SheetDescription className="text-xs">
              Record latest market value for {account.name}.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSave}>
            {formFields}
            <div className="sticky bottom-0 bg-background/95 pt-2 pb-safe border-t">
              {actions}
            </div>
          </form>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Update Valuation</DialogTitle>
          <DialogDescription className="text-xs">
            Record latest market value for {account.name}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave}>
          {formFields}
          <DialogFooter className="pt-2">
            {actions}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
