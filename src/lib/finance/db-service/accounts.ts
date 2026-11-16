import { and, eq, sql } from 'drizzle-orm';
import { db, finAccounts, finCategories, finRecurringRules, finTransactions } from '@src/lib/db';
import { NotFoundError, ConflictError } from '@src/app/api/utils';
import { incrementDataVersion } from './sync';
import { ACCOUNT_KIND_CLASS_MAP } from '../constants';
import {
  type AccountDTO,
  type AccountFilters,
  type CreateAccountDTO,
  type UpdateAccountDTO,
  createAccountSchema,
  updateAccountSchema,
} from '../contract';
import {
  generateSchedule,
  type RDConfig,
  type RDDayHistoryItem,
} from '../domain/rd';
import {
  getPayoutFrequencyCount,
  diffDays,
  type FDPayoutFrequency,
} from '../domain/fd';
import { addMonthsToDate } from '../domain/deposits';
import { catchUpRecurringRulesIfDue } from '../recurring';
import { recomputeDepositValuations } from './valuations';

export function mapAccountToDTO(row: typeof finAccounts.$inferSelect): AccountDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    kind: row.kind as AccountDTO['kind'],
    class: row.class as AccountDTO['class'],
    currency: row.currency,
    creditLimit: row.creditLimit !== null ? Number(row.creditLimit) : null,
    isActive: row.isActive,
    version: row.version ?? 1,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function listAccounts(
  userId: string,
  filters?: AccountFilters
): Promise<AccountDTO[]> {
  const conditions = [eq(finAccounts.userId, userId)];

  if (filters?.class) {
    conditions.push(eq(finAccounts.class, filters.class));
  }
  if (filters?.kind) {
    conditions.push(eq(finAccounts.kind, filters.kind));
  }
  if (filters?.isActive !== undefined) {
    conditions.push(eq(finAccounts.isActive, filters.isActive));
  }

  const rows = await db
    .select()
    .from(finAccounts)
    .where(and(...conditions))
    .orderBy(finAccounts.name);

  return rows.map(mapAccountToDTO);
}

export async function getAccount(userId: string, accountId: string): Promise<AccountDTO> {
  const [row] = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Account not found: ${accountId}`);
  }

  return mapAccountToDTO(row);
}

export async function syncRDAutoDebitRule(
  userId: string,
  accountId: string,
  meta: Record<string, unknown>,
  accountName: string,
  accountIsActive: boolean = true
): Promise<void> {
  const payFromAccountId = (meta.payFromAccountId as string | null) || null;
  const autoDebit = meta.autoDebit !== undefined ? Boolean(meta.autoDebit) : Boolean(payFromAccountId);
  const monthlyInstallment = Number(
    meta.monthlyInstallmentPaise ??
      meta.monthlyInstallment ??
      meta.installment ??
      meta.installmentAmount ??
      0
  );

  // If account is inactive, or autoDebit is disabled, or no payFromAccountId:
  if (!accountIsActive || !autoDebit || !payFromAccountId || monthlyInstallment <= 0) {
    await db
      .update(finRecurringRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(finRecurringRules.userId, userId),
          eq(finRecurringRules.toAccountId, accountId),
          eq(finRecurringRules.type, 'transfer')
        )
      );
    return;
  }

  const startDate = (meta.startDate as string) || new Date().toISOString().slice(0, 10);
  const tenureMonths = Number(meta.tenureMonths || 12);
  const installmentDay =
    meta.installmentDay !== undefined
      ? (meta.installmentDay as number | 'last')
      : parseInt(startDate.slice(8, 10), 10);
  const firstInstallmentOn =
    (meta.firstInstallmentOn as 'start_date' | 'first_installment_day') || 'start_date';
  const installmentDayHistory =
    (meta.installmentDayHistory as RDDayHistoryItem[] | undefined) || [];
  const skippedInstallments = (meta.skippedInstallments as string[]) || [];

  const rdConfig: RDConfig = {
    monthlyInstallment,
    startDate,
    installmentDay,
    firstInstallmentOn,
    tenureMonths,
    interestRate: Number(meta.interestRate || 6.8),
    installmentDayHistory,
    skippedInstallments,
  };

  const today = new Date().toISOString().slice(0, 10);
  const schedule = generateSchedule(rdConfig, today);
  if (schedule.length === 0) return;

  const validItems = schedule.filter((s) => s.status !== 'skipped');
  if (validItems.length === 0) return;

  const ruleStartDate = validItems[0].dueDate;
  const ruleEndDate = validItems[validItems.length - 1].dueDate;

  const domTag = installmentDay === 'last' ? 31 : installmentDay;
  const note = `RD auto-debit: ${accountName} [DOM:${domTag}]`;

  // Look for existing recurring rule
  const [existingRule] = await db
    .select()
    .from(finRecurringRules)
    .where(
      and(
        eq(finRecurringRules.userId, userId),
        eq(finRecurringRules.toAccountId, accountId),
        eq(finRecurringRules.type, 'transfer')
      )
    )
    .limit(1);

  if (existingRule) {
    const nextPending = validItems.find((s) => s.dueDate >= today);
    const nextOccurrence = nextPending ? nextPending.dueDate : ruleEndDate;

    await db
      .update(finRecurringRules)
      .set({
        accountId: payFromAccountId,
        amount: monthlyInstallment,
        startDate: ruleStartDate,
        endDate: ruleEndDate,
        nextOccurrence,
        note,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(finRecurringRules.id, existingRule.id));
  } else {
    await db.insert(finRecurringRules).values({
      userId,
      accountId: payFromAccountId,
      toAccountId: accountId,
      type: 'transfer',
      amount: monthlyInstallment,
      frequency: 'monthly',
      interval: 1,
      startDate: ruleStartDate,
      endDate: ruleEndDate,
      nextOccurrence: ruleStartDate,
      note,
      isActive: true,
    });
  }
}

export async function syncFDPayoutRule(
  userId: string,
  accountId: string,
  meta: Record<string, unknown>,
  accountName: string,
  accountIsActive: boolean = true
): Promise<void> {
  const fdType = (meta.fdType as string) || 'cumulative';
  const payoutAccountId = (meta.payoutAccountId as string | null) || null;
  const principal = Number(meta.principalPaise ?? meta.principal ?? 0);
  const rawRate = Number(meta.ratePercent ?? meta.interestRate ?? meta.rate ?? 7.1);
  const ratePercent = rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2));
  const subType = `fd_payout_${accountId}`;

  // If not active, or not payout, or no payoutAccountId, or principal <= 0:
  if (!accountIsActive || fdType !== 'payout' || !payoutAccountId || principal <= 0 || ratePercent <= 0) {
    await db
      .update(finRecurringRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(finRecurringRules.userId, userId),
          eq(finRecurringRules.subType, subType)
        )
      );
    return;
  }

  const startDate = (meta.startDate as string) || new Date().toISOString().slice(0, 10);
  const tenureMonths = Number(meta.tenureMonths || 12);
  const maturityDate = (meta.maturityDate as string) || addMonthsToDate(startDate, tenureMonths);
  const payoutFreq = (meta.payoutFrequency as FDPayoutFrequency) || 'quarterly';
  const nPayout = getPayoutFrequencyCount(payoutFreq);
  const stepMonths = payoutFreq === 'at_maturity' ? 12 : Math.max(1, Math.floor(12 / nPayout));
  const firstPayoutDate = addMonthsToDate(startDate, stepMonths);

  const interestPerPayout = payoutFreq === 'at_maturity'
    ? Math.round(principal * (ratePercent / 100) * (diffDays(startDate, maturityDate) / 365))
    : Math.round(principal * (ratePercent / (100 * nPayout)));

  if (interestPerPayout <= 0) return;

  // Find or lookup "Interest" category
  const [interestCat] = await db
    .select({ id: finCategories.id })
    .from(finCategories)
    .where(
      and(
        eq(finCategories.userId, userId),
        eq(finCategories.name, 'Interest'),
        eq(finCategories.type, 'income')
      )
    )
    .limit(1);

  // Map frequency and interval for recurring rule
  let frequency: 'monthly' | 'quarterly' | 'yearly' = 'quarterly';
  let interval = 1;
  if (payoutFreq === 'monthly') {
    frequency = 'monthly';
    interval = 1;
  } else if (payoutFreq === 'quarterly') {
    frequency = 'quarterly';
    interval = 1;
  } else if (payoutFreq === 'half_yearly') {
    frequency = 'monthly';
    interval = 6;
  } else {
    frequency = 'yearly';
    interval = 1;
  }

  const note = `FD Interest Payout: ${accountName}`;
  const payee = `${accountName} Interest`;

  const [existingRule] = await db
    .select()
    .from(finRecurringRules)
    .where(
      and(
        eq(finRecurringRules.userId, userId),
        eq(finRecurringRules.subType, subType)
      )
    )
    .limit(1);

  if (existingRule) {
    await db
      .update(finRecurringRules)
      .set({
        accountId: payoutAccountId,
        categoryId: interestCat?.id || null,
        amount: interestPerPayout,
        frequency,
        interval,
        startDate: firstPayoutDate,
        endDate: maturityDate,
        note,
        payee,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(finRecurringRules.id, existingRule.id));
  } else {
    await db.insert(finRecurringRules).values({
      userId,
      accountId: payoutAccountId,
      toAccountId: null,
      categoryId: interestCat?.id || null,
      type: 'income',
      subType,
      amount: interestPerPayout,
      amountType: 'fixed',
      frequency,
      interval,
      startDate: firstPayoutDate,
      endDate: maturityDate,
      nextOccurrence: firstPayoutDate,
      note,
      payee,
      mode: 'auto_post',
      isActive: true,
    });
  }

  // Trigger catch-up so any due payouts generate idempotently
  try {
    await catchUpRecurringRulesIfDue(userId);
  } catch (err) {
    console.warn('[syncFDPayoutRule] catchUpRecurringRulesIfDue failed:', err);
  }
}

export async function createAccount(
  userId: string,
  data: CreateAccountDTO
): Promise<AccountDTO> {
  const validated = createAccountSchema.parse(data);
  const accountClass = ACCOUNT_KIND_CLASS_MAP[validated.kind];

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(finAccounts)
      .values({
        userId,
        name: validated.name,
        kind: validated.kind,
        class: accountClass,
        currency: validated.currency || 'INR',
        creditLimit: validated.creditLimit !== undefined ? validated.creditLimit : null,
        isActive: true,
        version: 1,
        metadata: validated.metadata || {},
      })
      .returning();

    await incrementDataVersion(tx, userId);
    return inserted;
  });

  if (row.kind === 'recurring_deposit') {
    try {
      await syncRDAutoDebitRule(
        userId,
        row.id,
        (row.metadata || {}) as Record<string, unknown>,
        row.name,
        row.isActive
      );
    } catch (err) {
      console.warn(`[createAccount] syncRDAutoDebitRule failed for ${row.id}:`, err);
    }
  }

  if (row.kind === 'fixed_deposit') {
    try {
      await syncFDPayoutRule(
        userId,
        row.id,
        (row.metadata || {}) as Record<string, unknown>,
        row.name,
        row.isActive
      );
      await recomputeDepositValuations(userId, row.id);
    } catch (err) {
      console.warn(`[createAccount] syncFDPayoutRule failed for ${row.id}:`, err);
    }
  }

  return mapAccountToDTO(row);
}

export async function updateAccount(
  userId: string,
  accountId: string,
  data: UpdateAccountDTO
): Promise<AccountDTO> {
  const validated = updateAccountSchema.parse(data);

  // Check account exists and belongs to user
  const existing = await getAccount(userId, accountId);

  // Concurrency check
  if (validated.expectedVersion !== undefined && existing.version !== validated.expectedVersion) {
    throw new ConflictError('Changed on another device', existing);
  }

  const updateValues: Partial<typeof finAccounts.$inferInsert> = {
    updatedAt: new Date(),
    version: (existing.version ?? 1) + 1,
  };

  if (validated.name !== undefined) updateValues.name = validated.name;
  if (validated.currency !== undefined) updateValues.currency = validated.currency;
  if (validated.creditLimit !== undefined) updateValues.creditLimit = validated.creditLimit;
  if (validated.isActive !== undefined) updateValues.isActive = validated.isActive;
  if (validated.metadata !== undefined) updateValues.metadata = validated.metadata;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(finAccounts)
      .set(updateValues)
      .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
      .returning();

    await incrementDataVersion(tx, userId);
    return row;
  });

  if (updated.kind === 'recurring_deposit') {
    try {
      await syncRDAutoDebitRule(
        userId,
        updated.id,
        (updated.metadata || {}) as Record<string, unknown>,
        updated.name,
        updated.isActive
      );
    } catch (err) {
      console.warn(`[updateAccount] syncRDAutoDebitRule failed for ${updated.id}:`, err);
    }
  }

  if (updated.kind === 'fixed_deposit') {
    try {
      await syncFDPayoutRule(
        userId,
        updated.id,
        (updated.metadata || {}) as Record<string, unknown>,
        updated.name,
        updated.isActive
      );
      await recomputeDepositValuations(userId, updated.id);
    } catch (err) {
      console.warn(`[updateAccount] syncFDPayoutRule failed for ${updated.id}:`, err);
    }
  }

  return mapAccountToDTO(updated);
}

export async function deleteAccount(
  userId: string,
  accountId: string,
  expectedVersion?: number
): Promise<void> {
  // Check account exists and belongs to user
  const existing = await getAccount(userId, accountId);

  // Concurrency check
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    throw new ConflictError('Changed on another device', existing);
  }

  await db.transaction(async (tx) => {
    // Deactivate any recurring rule pointing to this RD or FD payout
    try {
      await tx
        .update(finRecurringRules)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(finRecurringRules.userId, userId),
            sql`(${finRecurringRules.toAccountId} = ${accountId} OR ${finRecurringRules.subType} = ${'fd_payout_' + accountId})`
          )
        );
    } catch (err) {
      console.warn(`[deleteAccount] disabling recurring rules for ${accountId} failed:`, err);
    }

    // Check if any non-deleted transactions exist for this account
    const existingTx = await tx
      .select({ id: finTransactions.id })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, userId),
          and(
            sql`(${finTransactions.accountId} = ${accountId} OR ${finTransactions.toAccountId} = ${accountId})`,
            sql`${finTransactions.deletedAt} IS NULL`
          )
        )
      )
      .limit(1);

    if (existingTx.length > 0) {
      // Soft archive instead of delete when transactions exist
      await tx
        .update(finAccounts)
        .set({ isActive: false, updatedAt: new Date(), version: (existing.version ?? 1) + 1 })
        .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)));
    } else {
      // Hard delete if no transactions exist
      await tx
        .delete(finAccounts)
        .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)));
    }

    await incrementDataVersion(tx, userId);
  });
}

