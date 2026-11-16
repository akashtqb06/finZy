import { and, eq, lte, or } from 'drizzle-orm';
import { db, finInbox, finRecurringRules, finTransactions, finUserSettings } from '@src/lib/db';
import { getFinanceService, type FinanceService } from '../service';
import type { RecurringRuleDTO, TransactionDTO } from '../contract';
import {
  advanceRecurringDate,
  extractAnchorDay,
  extractAnchorMonth,
  getEffectiveRuleParams,
  addDaysUTC,
} from './date-math';
import { todayInTz, DEFAULT_TZ } from '../timezone';
import { incrementDataVersion } from '../db-service/sync';
import type { GenerationResult, RuleGenerationDetail } from './types';
import { catchUpRecurringRulesIfDue } from './lazy';

export { catchUpRecurringRulesIfDue };
export function resetCatchUpThrottleForTest(): void {
  // Test hook for reset
}

export interface GenerateOptions {
  userId?: string;
  asOfDate?: string; // YYYY-MM-DD in the user's timezone
  backend?: 'mock' | 'db';
  service?: FinanceService;
}

/**
 * Returns the configured timezone for a user, or DEFAULT_TZ.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const [settings] = await db
      .select({ timezone: finUserSettings.timezone })
      .from(finUserSettings)
      .where(eq(finUserSettings.userId, userId))
      .limit(1);
    return settings?.timezone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/**
 * Creates due transactions or pending inbox items for recurring rules up to asOfDate.
 * Fully idempotent via clientRequestId = `${rule.id}:${occurrence}` and inbox idempotencyKey.
 * Back-fills missed cycles with a 366-day safety window.
 */
export async function generateDueRecurringTransactions(
  options: GenerateOptions = {}
): Promise<GenerationResult> {
  let asOfDate = options.asOfDate;
  if (!asOfDate) {
    let tz = DEFAULT_TZ;
    if (options.userId) {
      tz = await getUserTimezone(options.userId);
    }
    asOfDate = todayInTz(tz);
  }

  const backend = options.backend || process.env.FINANCE_BACKEND || 'db';

  if (backend === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FINANCE_BACKEND=mock is strictly prohibited in production');
    }
    return generateMockBackend(asOfDate, options.userId, options.service);
  }

  return generateDbBackend(asOfDate, options.userId);
}

/**
 * DB backend generator running against PostgreSQL / Drizzle.
 */
async function generateDbBackend(
  asOfDate: string,
  userId?: string
): Promise<GenerationResult> {
  const conditions = [
    eq(finRecurringRules.isActive, true),
    lte(finRecurringRules.nextOccurrence, asOfDate),
  ];

  if (userId) {
    conditions.push(eq(finRecurringRules.userId, userId));
  }

  const dueRules = await db
    .select()
    .from(finRecurringRules)
    .where(and(...conditions));

  let created = 0;
  let skipped = 0;
  let pending = 0;
  let backfilled = 0;
  const createdTransactions: TransactionDTO[] = [];
  const rulesProcessed: RuleGenerationDetail[] = [];
  const usersWithChanges = new Set<string>();

  const minDowntimeWindow = addDaysUTC(asOfDate, -366);

  for (const rawRule of dueRules) {
    const anchorDay = extractAnchorDay(rawRule);
    const anchorMonth = extractAnchorMonth(rawRule);
    const initialNextOccurrence = rawRule.nextOccurrence;

    let occurrence = initialNextOccurrence;
    let ruleOccurrencesCount = rawRule.occurrencesCount ?? 0;
    const occurrencesGenerated: string[] = [];

    // Downtime safety window: if rule is behind by > 366 days, cap and warn instead of flooding
    if (occurrence < minDowntimeWindow) {
      console.warn(
        `[recurring] Rule ${rawRule.id} nextOccurrence (${occurrence}) is older than 366-day downtime window (${minDowntimeWindow}). Capping backfill.`
      );
      // Fast-forward occurrence towards minDowntimeWindow
      let fastForwardGuard = 0;
      while (occurrence < minDowntimeWindow && fastForwardGuard < 1000) {
        fastForwardGuard++;
        const next = advanceRecurringDate(
          occurrence,
          rawRule.frequency as RecurringRuleDTO['frequency'],
          rawRule.interval,
          anchorDay,
          anchorMonth,
          rawRule.weekdays
        );
        if (next <= occurrence) break;
        occurrence = next;
      }
    }

    let loopGuard = 0;
    const maxCyclesPerRule = 366;

    while (occurrence <= asOfDate && loopGuard < maxCyclesPerRule) {
      loopGuard++;

      // Check end date
      if (rawRule.endDate && occurrence > rawRule.endDate) {
        break;
      }

      // Check max occurrences
      if (rawRule.maxOccurrences && ruleOccurrencesCount >= rawRule.maxOccurrences) {
        break;
      }

      // Check if this date was explicitly skipped via "Skip next"
      const skippedDates = rawRule.skippedDates || [];
      if (skippedDates.includes(occurrence)) {
        skipped++;
        occurrence = advanceRecurringDate(
          occurrence,
          rawRule.frequency as RecurringRuleDTO['frequency'],
          rawRule.interval,
          anchorDay,
          anchorMonth,
          rawRule.weekdays
        );
        continue;
      }

      const clientRequestId = `${rawRule.id}:${occurrence}`;
      const legacyClientRequestId = `${rawRule.id}_${occurrence}`;

      const effective = getEffectiveRuleParams(
        {
          ...rawRule,
          amount: Number(rawRule.amount),
          type: rawRule.type as RecurringRuleDTO['type'],
          frequency: rawRule.frequency as RecurringRuleDTO['frequency'],
          amountType: (rawRule.amountType ?? 'fixed') as RecurringRuleDTO['amountType'],
          mode: (rawRule.mode ?? 'auto_post') as RecurringRuleDTO['mode'],
          history: (rawRule.history ?? []) as RecurringRuleDTO['history'],
        } as RecurringRuleDTO,
        occurrence
      );

      const isConfirmMode = (rawRule.mode || 'auto_post') === 'ask_confirm';

      if (isConfirmMode) {
        // Mode ask_confirm: create a pending Inbox item
        const direction = rawRule.type === 'income' ? 'credit' : 'debit';
        const [inboxItem] = await db
          .insert(finInbox)
          .values({
            userId: rawRule.userId,
            idempotencyKey: clientRequestId,
            source: 'recurring',
            receivedAt: new Date(),
            date: occurrence,
            amount: effective.amount,
            direction,
            currency: 'INR',
            merchant: rawRule.payee || null,
            description: rawRule.note || `Recurring ${rawRule.type}`,
            status: 'pending',
            matchedAccountId: rawRule.accountId,
            suggestedCategoryId: rawRule.categoryId || null,
            raw: JSON.stringify({
              ruleId: rawRule.id,
              occurrence,
              mode: 'ask_confirm',
            }),
          })
          .onConflictDoNothing()
          .returning();

        if (inboxItem) {
          pending++;
          occurrencesGenerated.push(occurrence);
          ruleOccurrencesCount++;
          usersWithChanges.add(rawRule.userId);
        } else {
          skipped++;
        }
      } else {
        // Mode auto_post: create transaction
        // First check if legacy or modern key already exists
        const [existingTxn] = await db
          .select({ id: finTransactions.id })
          .from(finTransactions)
          .where(
            and(
              eq(finTransactions.userId, rawRule.userId),
              or(
                eq(finTransactions.clientRequestId, clientRequestId),
                eq(finTransactions.clientRequestId, legacyClientRequestId)
              )
            )
          )
          .limit(1);

        if (existingTxn) {
          skipped++;
        } else {
          let signedAmount = -Math.abs(Number(effective.amount));
          if (rawRule.type === 'income') {
            signedAmount = Math.abs(Number(effective.amount));
          }

          const [inserted] = await db
            .insert(finTransactions)
            .values({
              userId: rawRule.userId,
              accountId: rawRule.accountId,
              toAccountId: rawRule.toAccountId || null,
              categoryId: rawRule.categoryId || null,
              date: occurrence,
              type: rawRule.type as 'expense' | 'income' | 'transfer',
              amount: Number(effective.amount),
              signedAmount,
              payee: rawRule.payee || null,
              note: rawRule.note || null,
              clientRequestId,
              isRecurring: true,
              recurringRuleId: rawRule.id,
            })
            .onConflictDoNothing()
            .returning();

          if (inserted) {
            created++;
            occurrencesGenerated.push(occurrence);
            ruleOccurrencesCount++;
            usersWithChanges.add(rawRule.userId);

            if (occurrence < asOfDate) {
              backfilled++;
            }

            createdTransactions.push({
              id: inserted.id,
              userId: inserted.userId,
              accountId: inserted.accountId,
              toAccountId: inserted.toAccountId,
              categoryId: inserted.categoryId,
              date: inserted.date,
              type: inserted.type as TransactionDTO['type'],
              amount: Number(inserted.amount),
              signedAmount: Number(inserted.signedAmount),
              payee: inserted.payee,
              note: inserted.note,
              tags: inserted.tags,
              clientRequestId: inserted.clientRequestId,
              importHash: inserted.importHash,
              isRecurring: inserted.isRecurring,
              recurringRuleId: inserted.recurringRuleId,
              deletedAt: inserted.deletedAt ? inserted.deletedAt.toISOString() : null,
              createdAt: inserted.createdAt.toISOString(),
              updatedAt: inserted.updatedAt.toISOString(),
            });
          } else {
            skipped++;
          }
        }
      }

      // Advance occurrence to next cycle
      const nextOcc = advanceRecurringDate(
        occurrence,
        effective.frequency,
        effective.interval,
        anchorDay,
        anchorMonth,
        effective.weekdays
      );

      if (nextOcc <= occurrence) {
        break;
      }
      occurrence = nextOcc;
    }

    const isExpired = Boolean(
      (rawRule.endDate && occurrence > rawRule.endDate) ||
        (rawRule.maxOccurrences && ruleOccurrencesCount >= rawRule.maxOccurrences)
    );

    // Update rule state in DB
    await db
      .update(finRecurringRules)
      .set({
        nextOccurrence: occurrence,
        occurrencesCount: ruleOccurrencesCount,
        isActive: !isExpired,
        updatedAt: new Date(),
      })
      .where(eq(finRecurringRules.id, rawRule.id));

    rulesProcessed.push({
      ruleId: rawRule.id,
      rulePayee: rawRule.payee,
      previousNextOccurrence: initialNextOccurrence,
      newNextOccurrence: occurrence,
      occurrencesGenerated,
      isExpired,
    });
  }

  // Bump dataVersion once per user who had new items
  for (const uid of usersWithChanges) {
    try {
      await db.transaction(async (tx) => {
        await incrementDataVersion(tx, uid);
      });
    } catch {
      // Ignore version bump error if user settings row missing
    }
  }

  return {
    created,
    skipped,
    pending,
    processed: dueRules.length,
    generated: created,
    backfilled,
    transactions: createdTransactions,
    rulesProcessed,
  };
}

/**
 * In-memory Mock backend generator for local test and mock personas.
 */
async function generateMockBackend(
  asOfDate: string,
  userId?: string,
  providedService?: FinanceService
): Promise<GenerationResult> {
  const service = providedService || getFinanceService();
  const effectiveUserId = userId || 'mock_user';

  const allRules = await service.listRecurringRules(effectiveUserId);
  const dueRules = allRules.filter(
    (r) => r.isActive && r.nextOccurrence <= asOfDate && (!userId || r.userId === userId)
  );

  let created = 0;
  let skipped = 0;
  let pending = 0;
  let backfilled = 0;
  const createdTransactions: TransactionDTO[] = [];
  const rulesProcessed: RuleGenerationDetail[] = [];

  for (const rule of dueRules) {
    const anchorDay = extractAnchorDay(rule);
    const anchorMonth = extractAnchorMonth(rule);
    const initialNextOccurrence = rule.nextOccurrence;

    let occurrence = initialNextOccurrence;
    let ruleOccurrencesCount = rule.occurrencesCount ?? 0;
    const occurrencesGenerated: string[] = [];

    let loopGuard = 0;
    const maxCyclesPerRule = 366;

    while (occurrence <= asOfDate && loopGuard < maxCyclesPerRule) {
      loopGuard++;

      if (rule.endDate && occurrence > rule.endDate) break;
      if (rule.maxOccurrences && ruleOccurrencesCount >= rule.maxOccurrences) break;

      if (rule.skippedDates && rule.skippedDates.includes(occurrence)) {
        skipped++;
        occurrence = advanceRecurringDate(
          occurrence,
          rule.frequency,
          rule.interval,
          anchorDay,
          anchorMonth,
          rule.weekdays
        );
        continue;
      }

      const clientRequestId = `${rule.id}:${occurrence}`;
      const effective = getEffectiveRuleParams(rule, occurrence);

      if (rule.mode === 'ask_confirm') {
        pending++;
        occurrencesGenerated.push(occurrence);
        ruleOccurrencesCount++;
      } else {
        try {
          const txn = await service.createTransaction(
            rule.userId,
            {
              accountId: rule.accountId,
              toAccountId: rule.toAccountId,
              categoryId: rule.categoryId,
              date: occurrence,
              type: rule.type as 'expense' | 'income' | 'transfer',
              amount: effective.amount,
              payee: rule.payee,
              note: rule.note,
              clientRequestId,
              isRecurring: true,
              recurringRuleId: rule.id,
            },
            { clientRequestId }
          );

          created++;
          occurrencesGenerated.push(occurrence);
          ruleOccurrencesCount++;
          if (occurrence < asOfDate) {
            backfilled++;
          }
          createdTransactions.push(txn);
        } catch {
          skipped++;
        }
      }

      occurrence = advanceRecurringDate(
        occurrence,
        effective.frequency,
        effective.interval,
        anchorDay,
        anchorMonth,
        effective.weekdays
      );
    }

    const isExpired = Boolean(
      (rule.endDate && occurrence > rule.endDate) ||
        (rule.maxOccurrences && ruleOccurrencesCount >= rule.maxOccurrences)
    );

    await service.updateRecurringRule(rule.userId, rule.id, {
      nextOccurrence: occurrence,
      occurrencesCount: ruleOccurrencesCount,
      isActive: !isExpired,
    });

    rulesProcessed.push({
      ruleId: rule.id,
      rulePayee: rule.payee,
      previousNextOccurrence: initialNextOccurrence,
      newNextOccurrence: occurrence,
      occurrencesGenerated,
      isExpired,
    });
  }

  return {
    created,
    skipped,
    pending,
    processed: dueRules.length,
    generated: created,
    backfilled,
    transactions: createdTransactions,
    rulesProcessed,
  };
}
