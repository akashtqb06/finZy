import { and, eq, sql } from 'drizzle-orm';
import { db, finAccounts, finCategories, finRecurringRules, finTransactions } from '@src/lib/db';
import { BadRequestError, NotFoundError, ConflictError } from '@src/app/api/utils';
import { incrementDataVersion } from './sync';
import {
  type CreateRecurringRuleDTO,
  type RecurringRuleDTO,
  type UpdateRecurringRuleDTO,
  createRecurringRuleSchema,
  updateRecurringRuleSchema,
} from '../contract';
import {
  advanceRecurringDate,
  extractAnchorDay,
  extractAnchorMonth,
} from '../recurring/date-math';

export { advanceRecurringDate };

export function mapRecurringRuleToDTO(row: typeof finRecurringRules.$inferSelect): RecurringRuleDTO {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    type: row.type as RecurringRuleDTO['type'],
    subType: row.subType ?? undefined,
    amount: Number(row.amount),
    amountType: (row.amountType ?? 'fixed') as RecurringRuleDTO['amountType'],
    payee: row.payee,
    note: row.note,
    frequency: row.frequency as RecurringRuleDTO['frequency'],
    interval: row.interval,
    weekdays: row.weekdays ?? undefined,
    dayOfMonth: row.dayOfMonth ?? undefined,
    monthOfYear: row.monthOfYear ?? undefined,
    startDate: row.startDate,
    endDate: row.endDate,
    maxOccurrences: row.maxOccurrences ?? undefined,
    occurrencesCount: row.occurrencesCount ?? 0,
    mode: (row.mode ?? 'auto_post') as RecurringRuleDTO['mode'],
    skippedDates: row.skippedDates ?? [],
    history: (row.history ?? []) as RecurringRuleDTO['history'],
    nextOccurrence: row.nextOccurrence,
    isActive: row.isActive,
    version: row.version ?? 1,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function listRecurringRules(userId: string): Promise<RecurringRuleDTO[]> {
  const rows = await db
    .select()
    .from(finRecurringRules)
    .where(eq(finRecurringRules.userId, userId))
    .orderBy(finRecurringRules.nextOccurrence);

  return rows.map(mapRecurringRuleToDTO);
}

export async function getRecurringRule(userId: string, ruleId: string): Promise<RecurringRuleDTO> {
  const [row] = await db
    .select()
    .from(finRecurringRules)
    .where(and(eq(finRecurringRules.id, ruleId), eq(finRecurringRules.userId, userId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Recurring rule not found: ${ruleId}`);
  }

  return mapRecurringRuleToDTO(row);
}

export async function createRecurringRule(
  userId: string,
  data: CreateRecurringRuleDTO
): Promise<RecurringRuleDTO> {
  const validated = createRecurringRuleSchema.parse(data);

  // Validate account
  const [account] = await db
    .select({ id: finAccounts.id })
    .from(finAccounts)
    .where(and(eq(finAccounts.id, validated.accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new NotFoundError(`Account not found: ${validated.accountId}`);
  }

  if (validated.type === 'transfer') {
    if (!validated.toAccountId || validated.toAccountId === validated.accountId) {
      throw new BadRequestError('Transfer recurring rule requires distinct toAccountId');
    }
    const [toAccount] = await db
      .select({ id: finAccounts.id })
      .from(finAccounts)
      .where(and(eq(finAccounts.id, validated.toAccountId), eq(finAccounts.userId, userId)))
      .limit(1);
    if (!toAccount) {
      throw new NotFoundError(`Destination account not found: ${validated.toAccountId}`);
    }
  }

  if (validated.categoryId) {
    const [cat] = await db
      .select({ id: finCategories.id })
      .from(finCategories)
      .where(
        and(
          eq(finCategories.id, validated.categoryId),
          sql`(${finCategories.userId} = ${userId} OR ${finCategories.isSystem} = true)`
        )
      )
      .limit(1);
    if (!cat) {
      throw new NotFoundError(`Category not found: ${validated.categoryId}`);
    }
  }

  const nextOccurrence = validated.nextOccurrence || validated.startDate;

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(finRecurringRules)
      .values({
        userId,
        accountId: validated.accountId,
        toAccountId: validated.toAccountId || null,
        categoryId: validated.categoryId || null,
        type: validated.type,
        subType: validated.subType || null,
        amount: validated.amount,
        amountType: validated.amountType || 'fixed',
        payee: validated.payee || null,
        note: validated.note || null,
        frequency: validated.frequency,
        interval: validated.interval,
        weekdays: validated.weekdays || null,
        dayOfMonth: validated.dayOfMonth || null,
        monthOfYear: validated.monthOfYear || null,
        startDate: validated.startDate,
        endDate: validated.endDate || null,
        maxOccurrences: validated.maxOccurrences || null,
        occurrencesCount: 0,
        mode: validated.mode || 'auto_post',
        skippedDates: [],
        history: [],
        nextOccurrence,
        isActive: true,
        version: 1,
      })
      .returning();

    await incrementDataVersion(tx, userId);
    return inserted;
  });

  return mapRecurringRuleToDTO(row);
}

export async function updateRecurringRule(
  userId: string,
  ruleId: string,
  data: UpdateRecurringRuleDTO
): Promise<RecurringRuleDTO> {
  const validated = updateRecurringRuleSchema.parse(data);
  const existing = await getRecurringRule(userId, ruleId);

  // Concurrency check
  if (validated.expectedVersion !== undefined && existing.version !== validated.expectedVersion) {
    throw new ConflictError('Changed on another device', existing);
  }

  const updateValues: Partial<typeof finRecurringRules.$inferInsert> = {
    updatedAt: new Date(),
    version: (existing.version ?? 1) + 1,
  };

  if (validated.accountId !== undefined) updateValues.accountId = validated.accountId;
  if (validated.toAccountId !== undefined) updateValues.toAccountId = validated.toAccountId;
  if (validated.categoryId !== undefined) updateValues.categoryId = validated.categoryId;
  if (validated.type !== undefined) updateValues.type = validated.type;
  if (validated.subType !== undefined) updateValues.subType = validated.subType;
  if (validated.amount !== undefined) updateValues.amount = validated.amount;
  if (validated.amountType !== undefined) updateValues.amountType = validated.amountType;
  if (validated.payee !== undefined) updateValues.payee = validated.payee;
  if (validated.note !== undefined) updateValues.note = validated.note;
  if (validated.frequency !== undefined) updateValues.frequency = validated.frequency;
  if (validated.interval !== undefined) updateValues.interval = validated.interval;
  if (validated.weekdays !== undefined) updateValues.weekdays = validated.weekdays;
  if (validated.dayOfMonth !== undefined) updateValues.dayOfMonth = validated.dayOfMonth;
  if (validated.monthOfYear !== undefined) updateValues.monthOfYear = validated.monthOfYear;
  if (validated.startDate !== undefined) updateValues.startDate = validated.startDate;
  if (validated.endDate !== undefined) updateValues.endDate = validated.endDate;
  if (validated.maxOccurrences !== undefined) updateValues.maxOccurrences = validated.maxOccurrences;
  if (validated.occurrencesCount !== undefined) updateValues.occurrencesCount = validated.occurrencesCount;
  if (validated.mode !== undefined) updateValues.mode = validated.mode;
  if (validated.skippedDates !== undefined) updateValues.skippedDates = validated.skippedDates;
  if (validated.history !== undefined) updateValues.history = validated.history;
  if (validated.nextOccurrence !== undefined) updateValues.nextOccurrence = validated.nextOccurrence;
  if (validated.isActive !== undefined) updateValues.isActive = validated.isActive;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(finRecurringRules)
      .set(updateValues)
      .where(and(eq(finRecurringRules.id, ruleId), eq(finRecurringRules.userId, userId)))
      .returning();

    await incrementDataVersion(tx, userId);
    return row;
  });

  return mapRecurringRuleToDTO(updated);
}

export async function skipNextRecurringRule(
  userId: string,
  ruleId: string
): Promise<RecurringRuleDTO> {
  const rule = await getRecurringRule(userId, ruleId);
  const skippedDate = rule.nextOccurrence;
  const skippedDates = [...(rule.skippedDates || []), skippedDate];

  const anchorDay = extractAnchorDay(rule);
  const anchorMonth = extractAnchorMonth(rule);

  const nextDate = advanceRecurringDate(
    rule.nextOccurrence,
    rule.frequency,
    rule.interval,
    anchorDay,
    anchorMonth,
    rule.weekdays
  );

  const isExpired = Boolean(
    (rule.endDate && nextDate > rule.endDate) ||
      (rule.maxOccurrences && (rule.occurrencesCount ?? 0) >= rule.maxOccurrences)
  );

  return updateRecurringRule(userId, ruleId, {
    nextOccurrence: nextDate,
    skippedDates,
    isActive: !isExpired,
  });
}

export async function deleteRecurringRule(
  userId: string,
  ruleId: string,
  expectedVersion?: number
): Promise<void> {
  const existing = await getRecurringRule(userId, ruleId);

  // Concurrency check
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    throw new ConflictError('Changed on another device', existing);
  }

  await db.transaction(async (tx) => {
    // Null out recurringRuleId on generated transactions so they are preserved
    await tx
      .update(finTransactions)
      .set({ recurringRuleId: null })
      .where(and(eq(finTransactions.userId, userId), eq(finTransactions.recurringRuleId, ruleId)));

    await tx
      .delete(finRecurringRules)
      .where(and(eq(finRecurringRules.id, ruleId), eq(finRecurringRules.userId, userId)));

    await incrementDataVersion(tx, userId);
  });
}

/**
 * Backward-compatible helper for db-service/index.ts: delegates to generateDueRecurringTransactions.
 */
export async function processRecurringRules(): Promise<{ processed: number; generated: number }> {
  const { generateDueRecurringTransactions } = await import('../recurring/generator');
  const res = await generateDueRecurringTransactions({ backend: 'db' });
  return { processed: res.processed, generated: res.created };
}
