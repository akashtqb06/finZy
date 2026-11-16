'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { useFinanceStore } from '../shared/finance-store';
import { parseAmountExpression } from '../shared/expression-parser';
import { formatAccountDisplayBalance } from '../shared/format';
import { CategoryCombobox } from '../shared/category-combobox';
import { ConflictDialog } from '../shared/conflict-dialog';
import type { TransactionDTO } from '@src/lib/finance/contract';

export function TransactionEditDialog({
  transaction,
  open,
  onOpenChange,
}: {
  transaction: TransactionDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const { accounts, categories, updateTransaction } = useFinanceStore();

  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [payee, setPayee] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Concurrency conflict states
  const [expectedVersion, setExpectedVersion] = useState<number>(1);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictRecord, setConflictRecord] = useState<TransactionDTO | null>(null);

  useEffect(() => {
    if (transaction) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmountStr((transaction.amount / 100).toString());
      setDate(transaction.date);
      setAccountId(transaction.accountId);
      setCategoryId(transaction.categoryId || '');
      setPayee(transaction.payee || '');
      setNote(transaction.note || '');
      setExpectedVersion(transaction.version ?? 1);
      setError(null);
      setConflictOpen(false);
      setConflictRecord(null);
    }
  }, [transaction]);

  if (!transaction) return null;

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

  const handleSave = async (overrideVersion?: number) => {
    const parsed = parseAmountExpression(amountStr);
    if (!parsed.isValid || !parsed.paise || parsed.paise <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    if (!accountId) {
      setError('Account is required');
      return;
    }

    try {
      setIsSubmitting(true);
      await updateTransaction(transaction.id, {
        amount: parsed.paise,
        date,
        accountId,
        categoryId: transaction.type !== 'transfer' ? (categoryId || null) : null,
        payee: payee.trim() || null,
        note: note.trim() || null,
        expectedVersion: overrideVersion ?? expectedVersion,
      });
      toast.success('Transaction updated');
      onOpenChange(false);
    } catch (err: unknown) {
      const maybeConflict = err as { status?: number; currentRecord?: TransactionDTO; message?: string };
      if (maybeConflict.status === 409) {
        setConflictRecord(maybeConflict.currentRecord ?? null);
        setConflictOpen(true);
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to update transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReload = () => {
    if (conflictRecord) {
      setAmountStr((conflictRecord.amount / 100).toString());
      setDate(conflictRecord.date);
      setAccountId(conflictRecord.accountId);
      setCategoryId(conflictRecord.categoryId || '');
      setPayee(conflictRecord.payee || '');
      setNote(conflictRecord.note || '');
      setExpectedVersion(conflictRecord.version ?? 1);
      toast.info('Reloaded latest data from server');
    }
  };

  const handleOverwrite = async () => {
    if (conflictRecord) {
      await handleSave(conflictRecord.version);
    } else {
      await handleSave();
    }
  };

  const formBody = (
    <div className="space-y-3.5 py-2">
      {/* Amount */}
      <div className="space-y-1">
        <Label htmlFor="edit-amount" className="text-xs font-medium text-muted-foreground">
          Amount (₹)
        </Label>
        <Input
          id="edit-amount"
          type="text"
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="h-9 text-base font-bold"
        />
      </div>

      {/* Date */}
      <div className="space-y-1">
        <Label htmlFor="edit-date" className="text-xs font-medium text-muted-foreground">
          Date
        </Label>
        <DatePicker
          id="edit-date"
          value={date}
          onChange={setDate}
          className="h-9 text-xs"
          placeholder="Select date"
        />
      </div>

      {/* Account */}
      <div className="space-y-1">
        <Label htmlFor="edit-account" className="text-xs font-medium text-muted-foreground">
          Account
        </Label>
        <Select
          items={accounts.map((acc) => ({
            value: acc.id,
            label: `${acc.name} (${formatAccountDisplayBalance(acc)})`,
          }))}
          value={accountId}
          onValueChange={(val) => setAccountId(val || '')}
        >
          <SelectTrigger id="edit-account" className="w-full h-9 bg-card px-3 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id} className="text-xs">
                {acc.name} ({formatAccountDisplayBalance(acc)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category */}
      {transaction.type !== 'transfer' && (
        <div className="space-y-1">
          <Label htmlFor="edit-category" className="text-xs font-medium text-muted-foreground">
            Category
          </Label>
          <CategoryCombobox
            id="edit-category"
            value={categoryId}
            onValueChange={(val) => setCategoryId(val)}
            categories={categories}
            filterType={transaction.type as 'expense' | 'income'}
            includeUncategorized
            placeholder="Uncategorized"
          />
        </div>
      )}

      {/* Payee */}
      <div className="space-y-1">
        <Label htmlFor="edit-payee" className="text-xs font-medium text-muted-foreground">
          Payee
        </Label>
        <Input
          id="edit-payee"
          type="text"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          className="h-9 text-xs"
        />
      </div>

      {/* Note */}
      <div className="space-y-1">
        <Label htmlFor="edit-note" className="text-xs font-medium text-muted-foreground">
          Note
        </Label>
        <Input
          id="edit-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-9 text-xs"
        />
      </div>

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );

  const actions = (
    <div className="flex items-center justify-end gap-2 pt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-xs"
        onClick={() => onOpenChange(false)}
      >
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        className="text-xs font-semibold"
        disabled={isSubmitting}
        onClick={() => handleSave()}
      >
        {isSubmitting ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[92dvh] overflow-y-auto px-4 pb-6">
            <SheetHeader className="text-left pb-2">
              <SheetTitle className="text-base font-bold">Edit Transaction</SheetTitle>
            </SheetHeader>
            {formBody}
            <div className="sticky bottom-0 bg-background/95 pt-2 pb-safe border-t">
              {actions}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Edit Transaction</DialogTitle>
            </DialogHeader>
            {formBody}
            <DialogFooter>
              {actions}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        onReload={handleReload}
        onOverwrite={handleOverwrite}
      />
    </>
  );
}
