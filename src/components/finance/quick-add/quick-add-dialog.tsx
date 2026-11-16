'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import {
  CreditCardIcon,
  ArrowRightLeftIcon,
  SparklesIcon,
  SearchIcon,
  CheckIcon,
  CalendarIcon,
  XIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
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
import { formatINR, formatAccountDisplayBalance } from '../shared/format';
import { CategoryCombobox } from '../shared/category-combobox';
import { todayInTz, yesterdayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';
import { getDeterministicCategoryColor } from '@src/lib/finance/colors';
import type { TransactionType } from '@src/lib/finance/constants';
import type { CategoryDTO, CreateTransactionDTO } from '@src/lib/finance/contract';
import { cn } from '@/lib/utils';

/**
 * Mobile Category Picker Bottom Sheet
 */
function MobileCategorySheet({
  open,
  onOpenChange,
  categories,
  filterType,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryDTO[];
  filterType: 'expense' | 'income';
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = categories.filter((c) => c.type === filterType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [categories, filterType, search]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] flex flex-col p-0 z-[75]">
        <SheetHeader className="px-4 pt-4 pb-2 border-b text-left">
          <SheetTitle className="text-base font-bold">Select Category</SheetTitle>
        </SheetHeader>
        <div className="p-3 border-b">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-10 text-base rounded-lg bg-muted/40"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label="Clear search"
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No categories found matching &quot;{search}&quot;
            </div>
          ) : (
            filtered.map((cat) => {
              const color = cat.color || getDeterministicCategoryColor(cat.id || cat.name);
              const isSelected = cat.id === selectedId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    onSelect(cat.id);
                    onOpenChange(false);
                  }}
                  className={cn(
                    'w-full min-h-[48px] px-3 py-2 flex items-center justify-between text-left rounded-lg transition-colors',
                    isSelected ? 'bg-primary/10 font-semibold' : 'hover:bg-muted/50 active:bg-muted'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="size-3.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm text-foreground">{cat.name}</span>
                  </div>
                  {isSelected && <CheckIcon className="size-4 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function QuickAddForm({
  onClose,
  initialData,
  isMobile = false,
}: {
  onClose?: () => void;
  initialData?: Partial<CreateTransactionDTO> | null;
  isMobile?: boolean;
}) {
  const {
    accounts,
    categories,
    transactions,
    lastUsedAccountId,
    timezone,
    addTransaction,
    openPayBill,
  } = useFinanceStore();

  const userTz = timezone || DEFAULT_TZ;

  // Form states
  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [showCardsAndLoans, setShowCardsAndLoans] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [payee, setPayee] = useState('');
  const [note, setNote] = useState('');
  const [dateSelection, setDateSelection] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(() => todayInTz(userTz));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Keyboard offset tracking for sticky footer
  const [viewportBottomOffset, setViewportBottomOffset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vp = window.visualViewport;
    const update = () => {
      const bottom = Math.max(0, window.innerHeight - vp.height - vp.offsetTop);
      setViewportBottomOffset(bottom);
    };

    vp.addEventListener('resize', update);
    vp.addEventListener('scroll', update);
    update();

    return () => {
      vp.removeEventListener('resize', update);
      vp.removeEventListener('scroll', update);
    };
  }, []);

  // Default asset account helper (never defaults to a liability)
  const defaultAssetAccountId = useMemo(() => {
    const lastAcc = accounts.find((a) => a.id === lastUsedAccountId);
    if (lastAcc && lastAcc.class === 'asset') return lastAcc.id;
    const firstBankOrCash = accounts.find(
      (a) => (a.kind === 'bank' || a.kind === 'cash' || a.kind === 'wallet') && a.isActive
    );
    if (firstBankOrCash) return firstBankOrCash.id;
    const firstAsset = accounts.find((a) => a.class === 'asset' && a.isActive);
    return firstAsset?.id || accounts[0]?.id || '';
  }, [accounts, lastUsedAccountId]);

  // Today and Yesterday date strings in user configured timezone
  const todayStr = useMemo(() => todayInTz(userTz), [userTz]);
  const yesterdayStr = useMemo(() => yesterdayInTz(userTz), [userTz]);

  const activeDate = useMemo(() => {
    if (dateSelection === 'today') return todayStr;
    if (dateSelection === 'yesterday') return yesterdayStr;
    return customDate;
  }, [dateSelection, todayStr, yesterdayStr, customDate]);

  // Evaluated expression amount
  const parsedExpression = useMemo(() => parseAmountExpression(amountInput), [amountInput]);

  // Top recent accounts from transaction history
  const recentAccounts = useMemo(() => {
    const seen = new Set<string>();
    const list: typeof accounts = [];
    for (const t of transactions) {
      if (t.accountId && !seen.has(t.accountId)) {
        seen.add(t.accountId);
        const acc = accounts.find((a) => a.id === t.accountId);
        if (acc && acc.isActive) {
          list.push(acc);
          if (list.length >= 3) break;
        }
      }
    }
    return list;
  }, [transactions, accounts]);

  // Top recent categories for current type
  const recentCategories = useMemo(() => {
    const seen = new Set<string>();
    const list: CategoryDTO[] = [];
    for (const t of transactions) {
      if (t.type === type && t.categoryId && !seen.has(t.categoryId)) {
        seen.add(t.categoryId);
        const cat = categories.find((c) => c.id === t.categoryId);
        if (cat) {
          list.push(cat);
          if (list.length >= 4) break;
        }
      }
    }
    return list;
  }, [transactions, categories, type]);

  // Payee history autocomplete
  const recentPayees = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.payee?.trim()) {
        const p = t.payee.trim();
        map.set(p, (map.get(p) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p);
  }, [transactions]);

  const matchingPayees = useMemo(() => {
    if (!payee.trim()) return recentPayees.slice(0, 4);
    const q = payee.toLowerCase();
    return recentPayees
      .filter((p) => p.toLowerCase().includes(q) && p.toLowerCase() !== q)
      .slice(0, 4);
  }, [recentPayees, payee]);

  // Sync initial data
  useEffect(() => {
    if (initialData) {
      const initType = initialData.type || 'expense';
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setType(initType);
      if (initialData.amount) {
        setAmountInput((initialData.amount / 100).toString());
      } else {
        setAmountInput('');
      }

      let fromId = initialData.accountId || lastUsedAccountId || '';
      if (initType === 'transfer') {
        const fromAcc = accounts.find((a) => a.id === fromId);
        if (!fromAcc || fromAcc.class === 'liability') {
          fromId = defaultAssetAccountId;
        }
      } else {
        if (!fromId) fromId = accounts[0]?.id || '';
      }
      setAccountId(fromId);
      setToAccountId(initialData.toAccountId || '');
      setCategoryId(initialData.categoryId || '');
      setPayee(initialData.payee || '');
      setNote(initialData.note || '');
      if (initialData.date) {
        if (initialData.date === todayStr) {
          setDateSelection('today');
        } else if (initialData.date === yesterdayStr) {
          setDateSelection('yesterday');
        } else {
          setDateSelection('custom');
          setCustomDate(initialData.date);
        }
      }
    } else {
      setType('expense');
      setAmountInput('');
      setAccountId(lastUsedAccountId || accounts[0]?.id || '');
      setToAccountId('');
      setCategoryId('');
      setPayee('');
      setNote('');
      setDateSelection('today');
    }
    setErrors({});
    setShowCardsAndLoans(false);
  }, [initialData, lastUsedAccountId, accounts, defaultAssetAccountId, todayStr, yesterdayStr]);

  // Auto-suggest category based on payee
  const handlePayeeChange = (val: string) => {
    setPayee(val);
    if (!val.trim()) return;

    const matchedCatId = transactions.find(
      (t) => t.payee?.trim().toLowerCase() === val.trim().toLowerCase() && t.categoryId
    )?.categoryId;
    if (matchedCatId && (!categoryId || categoryId === '')) {
      const exists = categories.some((c) => c.id === matchedCatId);
      if (exists) {
        setCategoryId(matchedCatId);
      }
    }
  };

  // Selected accounts
  const selectedToAccount = useMemo(
    () => accounts.find((a) => a.id === toAccountId),
    [accounts, toAccountId]
  );

  // Destination credit card quick payment amount helper
  const destinationIsCard = selectedToAccount?.kind === 'credit_card';
  const cardOutstanding = destinationIsCard ? selectedToAccount?.outstanding || 0 : 0;

  // Swap From & To
  const handleSwapAccounts = () => {
    const temp = accountId;
    setAccountId(toAccountId);
    setToAccountId(temp);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!amountInput.trim()) {
      newErrors.amount = 'Amount is required';
    } else if (!parsedExpression.isValid || !parsedExpression.paise || parsedExpression.paise <= 0) {
      newErrors.amount = parsedExpression.error || 'Please enter a valid positive amount';
    }

    if (!accountId) {
      newErrors.accountId = 'Please select an account';
    }

    if (type === 'transfer') {
      if (!toAccountId) {
        newErrors.toAccountId = 'Destination account is required for transfers';
      } else if (toAccountId === accountId) {
        newErrors.toAccountId = 'Destination must be different from source account';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (keepOpenAfterSave = false) => {
    if (isSubmitting) return;
    if (!validate()) return;

    setIsSubmitting(true);
    const clientRequestId = `req-${nanoid(16)}`;

    try {
      const paise = parsedExpression.paise!;
      const result = await addTransaction(
        {
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : null,
          categoryId: type !== 'transfer' ? categoryId || null : null,
          date: activeDate,
          type,
          amount: paise,
          payee: payee.trim() || null,
          note: note.trim() || null,
        },
        clientRequestId
      );

      const typeLabel = type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : 'Transfer';
      toast.success(`${typeLabel} of ${formatINR(paise)} added`, {
        action: {
          label: 'Undo',
          onClick: () => {
            result.undo();
            toast.info('Transaction undone');
          },
        },
      });

      if (keepOpenAfterSave) {
        setAmountInput('');
        setPayee('');
        setNote('');
        setCategoryId('');
        setErrors({});
      } else {
        onClose?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        handleSubmit(false);
      }
    }
  };

  const selectedCategoryObj = categories.find((c) => c.id === categoryId);

  return (
    <div className="flex flex-col flex-1 min-h-0" onKeyDown={handleKeyDown}>
      <div className="flex-1 overflow-y-auto space-y-4 px-1 py-1">
        {/* Type Segmented Control */}
        <div
          role="radiogroup"
          aria-label="Transaction Type"
          className="grid grid-cols-3 p-1 bg-muted rounded-lg text-xs font-medium"
        >
          <button
            type="button"
            role="radio"
            aria-checked={type === 'expense'}
            className={cn(
              'min-h-[44px] py-1.5 px-3 rounded-md transition-all text-center flex items-center justify-center gap-1.5',
              type === 'expense'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => {
              setType('expense');
              setCategoryId('');
            }}
          >
            <span className="size-2 rounded-full bg-red-500 inline-block" />
            <span>Expense</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={type === 'income'}
            className={cn(
              'min-h-[44px] py-1.5 px-3 rounded-md transition-all text-center flex items-center justify-center gap-1.5',
              type === 'income'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => {
              setType('income');
              setCategoryId('');
            }}
          >
            <span className="size-2 rounded-full bg-emerald-500 inline-block" />
            <span>Income</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={type === 'transfer'}
            className={cn(
              'min-h-[44px] py-1.5 px-3 rounded-md transition-all text-center flex items-center justify-center gap-1.5',
              type === 'transfer'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => {
              setType('transfer');
              setCategoryId('');
              const currentAcc = accounts.find((a) => a.id === accountId);
              if (!currentAcc || currentAcc.class === 'liability') {
                setAccountId(defaultAssetAccountId);
              }
            }}
          >
            <ArrowRightLeftIcon className="size-3 text-blue-500 inline-block" />
            <span>Transfer</span>
          </button>
        </div>

        {/* Large Amount Input with live expression support */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="amount-input" className="text-xs font-medium text-muted-foreground">
              Amount
            </Label>
            {parsedExpression.isValid &&
              parsedExpression.paise &&
              parsedExpression.paise > 0 &&
              amountInput.includes('+') && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <SparklesIcon className="size-3" />= {formatINR(parsedExpression.paise)}
                </span>
              )}
          </div>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground select-none">
              ₹
            </span>
            <Input
              id="amount-input"
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="0"
              className="pl-9 text-2xl sm:text-3xl font-bold tracking-tight min-h-[52px] h-13 bg-card"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
          </div>
          {errors.amount && (
            <p className="text-xs font-medium text-destructive mt-1">{errors.amount}</p>
          )}
        </div>

        {/* Account Selectors */}
        {type === 'transfer' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] items-end gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="from-account" className="text-xs font-medium text-muted-foreground">
                    From Account
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowCardsAndLoans((prev) => !prev)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    {showCardsAndLoans ? 'Hide cards' : 'Show cards'}
                  </button>
                </div>
                <Select
                  value={accountId || undefined}
                  onValueChange={(val) => setAccountId(val || '')}
                >
                  <SelectTrigger id="from-account" className="w-full min-h-[44px] h-11 bg-card px-3 text-base sm:text-xs">
                    <SelectValue placeholder="Select source account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(showCardsAndLoans ? accounts : accounts.filter((a) => a.class === 'asset')).map(
                      (acc) => (
                        <SelectItem key={acc.id} value={acc.id} className="text-base sm:text-xs min-h-[44px]">
                          {acc.name} ({formatAccountDisplayBalance(acc)})
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center pb-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-full shrink-0"
                  title="Swap From and To accounts"
                  onClick={handleSwapAccounts}
                  disabled={!accountId || !toAccountId}
                >
                  <ArrowRightLeftIcon className="size-4" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="to-account" className="text-xs font-medium text-muted-foreground">
                  To Account
                </Label>
                <Select
                  value={toAccountId || undefined}
                  onValueChange={(val) => setToAccountId(val || '')}
                >
                  <SelectTrigger id="to-account" className="w-full min-h-[44px] h-11 bg-card px-3 text-base sm:text-xs">
                    <SelectValue placeholder="Select destination..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== accountId)
                      .map((acc) => (
                        <SelectItem key={acc.id} value={acc.id} className="text-base sm:text-xs min-h-[44px]">
                          {acc.name} ({formatAccountDisplayBalance(acc)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {errors.accountId && (
              <p className="text-xs font-medium text-destructive">{errors.accountId}</p>
            )}
            {errors.toAccountId && (
              <p className="text-xs font-medium text-destructive">{errors.toAccountId}</p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="account-select" className="text-xs font-medium text-muted-foreground">
              Account
            </Label>
            <Select
              value={accountId || undefined}
              onValueChange={(val) => setAccountId(val || '')}
            >
              <SelectTrigger id="account-select" className="w-full min-h-[44px] h-11 bg-card px-3 text-base sm:text-xs">
                <SelectValue placeholder="Select account..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id} className="text-base sm:text-xs min-h-[44px]">
                    {acc.name} ({formatAccountDisplayBalance(acc)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* One-tap Recent Account Chips */}
            {recentAccounts.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                <span className="text-[10px] text-muted-foreground shrink-0 uppercase font-medium">Recent:</span>
                {recentAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setAccountId(acc.id)}
                    className={cn(
                      'min-h-[36px] px-2.5 py-1 text-xs rounded-full border transition-colors shrink-0 flex items-center gap-1',
                      accountId === acc.id
                        ? 'bg-primary text-primary-foreground border-primary font-semibold'
                        : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    <span>{acc.name}</span>
                  </button>
                ))}
              </div>
            )}
            {errors.accountId && (
              <p className="text-xs font-medium text-destructive">{errors.accountId}</p>
            )}
          </div>
        )}

        {/* Credit Card Bill Shortcut Pill (for transfers to card) */}
        {type === 'transfer' && destinationIsCard && cardOutstanding > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="size-4 text-primary shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-foreground">Card bill due: </span>
                <span className="text-destructive font-bold">{formatINR(cardOutstanding)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[36px] text-xs font-medium px-2.5"
                onClick={() => setAmountInput((cardOutstanding / 100).toString())}
              >
                Pay full ({formatINR(cardOutstanding)})
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-[36px] text-xs font-semibold px-2.5"
                onClick={() => {
                  onClose?.();
                  openPayBill(toAccountId);
                }}
              >
                Pay bill dialog
              </Button>
            </div>
          </div>
        )}

        {/* Category Selection (Expense / Income) */}
        {type !== 'transfer' && (
          <div className="space-y-1.5">
            <Label htmlFor="quick-add-category" className="text-xs font-medium text-muted-foreground">
              Category
            </Label>
            {isMobile ? (
              <>
                <button
                  type="button"
                  id="quick-add-category"
                  onClick={() => setMobileCategoryOpen(true)}
                  className="w-full min-h-[44px] h-11 px-3 bg-card border rounded-lg flex items-center justify-between text-base sm:text-xs text-left"
                >
                  {selectedCategoryObj ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            selectedCategoryObj.color ||
                            getDeterministicCategoryColor(selectedCategoryObj.id || selectedCategoryObj.name),
                        }}
                      />
                      <span className="font-medium text-foreground">{selectedCategoryObj.name}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select category...</span>
                  )}
                  <span className="text-xs text-primary font-medium">Browse</span>
                </button>
                <MobileCategorySheet
                  open={mobileCategoryOpen}
                  onOpenChange={setMobileCategoryOpen}
                  categories={categories}
                  filterType={type as 'expense' | 'income'}
                  selectedId={categoryId}
                  onSelect={(id) => setCategoryId(id)}
                />
              </>
            ) : (
              <CategoryCombobox
                id="quick-add-category"
                value={categoryId}
                onValueChange={(val) => setCategoryId(val)}
                categories={categories}
                filterType={type as 'expense' | 'income'}
                placeholder="Search category or select below..."
              />
            )}

            {/* One-tap Recent Category Chips */}
            {recentCategories.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                <span className="text-[10px] text-muted-foreground shrink-0 uppercase font-medium">Recent:</span>
                {recentCategories.map((cat) => {
                  const color = cat.color || getDeterministicCategoryColor(cat.id || cat.name);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={cn(
                        'min-h-[36px] px-2.5 py-1 text-xs rounded-full border transition-colors shrink-0 flex items-center gap-1.5',
                        categoryId === cat.id
                          ? 'bg-primary text-primary-foreground border-primary font-semibold'
                          : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                      )}
                    >
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Date Selector with One-Tap Chips */}
        <div className="space-y-1.5">
          <Label htmlFor="transaction-date-picker" className="text-xs font-medium text-muted-foreground">
            Transaction Date
          </Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                'min-h-[44px] flex-1 py-1.5 px-3 text-xs rounded-lg font-medium transition-colors border text-center',
                dateSelection === 'today'
                  ? 'bg-primary text-primary-foreground border-primary font-semibold'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
              )}
              onClick={() => {
                setCustomDate(todayStr);
                setDateSelection('today');
                setShowDatePicker(false);
              }}
            >
              Today
            </button>
            <button
              type="button"
              className={cn(
                'min-h-[44px] flex-1 py-1.5 px-3 text-xs rounded-lg font-medium transition-colors border text-center',
                dateSelection === 'yesterday'
                  ? 'bg-primary text-primary-foreground border-primary font-semibold'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
              )}
              onClick={() => {
                setCustomDate(yesterdayStr);
                setDateSelection('yesterday');
                setShowDatePicker(false);
              }}
            >
              Yesterday
            </button>
            <button
              type="button"
              className={cn(
                'min-h-[44px] flex-1 py-1.5 px-3 text-xs rounded-lg font-medium transition-colors border flex items-center justify-center gap-1 text-center',
                dateSelection === 'custom'
                  ? 'bg-primary text-primary-foreground border-primary font-semibold'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
              )}
              onClick={() => setShowDatePicker((prev) => !prev)}
            >
              <CalendarIcon className="size-3.5" />
              <span>{dateSelection === 'custom' ? customDate : 'Pick date'}</span>
            </button>
          </div>

          {(showDatePicker || dateSelection === 'custom') && (
            <div className="pt-1">
              <DatePicker
                id="transaction-date-picker"
                className="min-h-[44px] h-11 text-base sm:text-xs w-full bg-card"
                value={activeDate}
                onChange={(newDate) => {
                  setCustomDate(newDate);
                  if (newDate === todayStr) setDateSelection('today');
                  else if (newDate === yesterdayStr) setDateSelection('yesterday');
                  else setDateSelection('custom');
                }}
                placeholder="Select transaction date"
              />
            </div>
          )}
        </div>

        {/* Payee and Autocomplete */}
        <div className="space-y-1.5">
          <Label htmlFor="payee-input" className="text-xs font-medium text-muted-foreground">
            {type === 'transfer' ? 'Recipient / Reference' : 'Payee'}
          </Label>
          <Input
            id="payee-input"
            type="text"
            placeholder={type === 'income' ? 'e.g. Employer, Dividend' : 'e.g. Starbucks, Amazon'}
            className="min-h-[44px] h-11 text-base sm:text-xs bg-card"
            value={payee}
            onChange={(e) => handlePayeeChange(e.target.value)}
          />

          {/* Autocomplete chips from history */}
          {matchingPayees.length > 0 && (
            <div className="flex items-center gap-1.5 pt-0.5 overflow-x-auto no-scrollbar">
              <span className="text-[10px] text-muted-foreground shrink-0 uppercase font-medium">Suggestions:</span>
              {matchingPayees.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePayeeChange(p)}
                  className="min-h-[32px] px-2.5 py-0.5 text-xs rounded-full bg-muted/60 text-foreground border border-border/80 hover:bg-muted shrink-0 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Note */}
        <div className="space-y-1.5">
          <Label htmlFor="note-input" className="text-xs font-medium text-muted-foreground">
            Note (optional)
          </Label>
          <Input
            id="note-input"
            type="text"
            placeholder="e.g. Lunch with friends"
            className="min-h-[44px] h-11 text-base sm:text-xs bg-card"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {/* Sticky Action Footer that stays above on-screen keyboard */}
      <div
        className={cn(
          'sticky bottom-0 bg-background/95 backdrop-blur-md border-t p-3 flex items-center justify-end gap-2 shrink-0 z-20 transition-transform duration-100',
          isMobile ? 'px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]' : 'pt-3'
        )}
        style={{
          transform: viewportBottomOffset > 0 ? `translateY(-${viewportBottomOffset}px)` : undefined,
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden sm:inline-flex text-xs min-h-[44px]"
          onClick={onClose}
        >
          Cancel (Esc)
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1 sm:flex-none text-xs min-h-[44px]"
          disabled={isSubmitting}
          onClick={() => handleSubmit(true)}
        >
          Add Another
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1 sm:flex-none text-xs font-semibold min-h-[44px]"
          disabled={isSubmitting}
          onClick={() => handleSubmit(false)}
        >
          {isSubmitting
            ? 'Saving...'
            : type === 'expense'
            ? 'Save Expense'
            : type === 'income'
            ? 'Save Income'
            : 'Save Transfer'}
        </Button>
      </div>
    </div>
  );
}

export function QuickAddDialog() {
  const isMobile = useIsMobile();
  const {
    quickAddOpen,
    quickAddInitialData,
    closeQuickAdd,
  } = useFinanceStore();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeQuickAdd();
      setTimeout(() => {
        if (typeof document !== 'undefined') {
          document.body.removeAttribute('inert');
          document.body.style.pointerEvents = '';
          if (!document.querySelector('[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="drawer-content"]')) {
            document.querySelectorAll('[data-base-ui-inert]').forEach((el) => {
              el.removeAttribute('data-base-ui-inert');
              el.removeAttribute('inert');
              el.removeAttribute('aria-hidden');
            });
          }
        }
      }, 50);
    }
  };

  const formContent = quickAddOpen ? (
    <QuickAddForm
      key={quickAddInitialData ? JSON.stringify(quickAddInitialData) : 'qa-new'}
      onClose={() => handleOpenChange(false)}
      initialData={quickAddInitialData}
      isMobile={isMobile}
    />
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={quickAddOpen} onOpenChange={handleOpenChange}>
        <DrawerContent className="max-h-[96dvh] h-[96dvh] flex flex-col p-0">
          <DrawerHeader className="border-b px-4 py-3 shrink-0">
            <DrawerTitle className="text-base font-bold">Quick Add Transaction</DrawerTitle>
            <DrawerDescription className="text-xs text-muted-foreground">
              Add an expense, income, or transfer
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
            {formContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={quickAddOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Quick Add Transaction</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
