/**
 * Recurring rules repository — higher-level helpers built on top of
 * db-service/recurring.ts CRUD functions.
 */

import {
  listRecurringRules,
  getRecurringRule,
  updateRecurringRule,
  skipNextRecurringRule as dbSkipNextRecurringRule,
} from '../db-service/recurring';
import { projectUpcomingOccurrences } from './date-math';
import { generateDueRecurringTransactions, getUserTimezone } from './generator';
import { todayInTz } from '../timezone';
import type { OccurrenceProjection, GenerationResult } from './types';
import type { RecurringRuleDTO } from '../contract';

// ---------------------------------------------------------------------------
// Pause / Resume / Skip Next
// ---------------------------------------------------------------------------

/**
 * Pauses a recurring rule (sets isActive = false).
 * Scoped to the owner: will throw NotFoundError if ruleId belongs to a
 * different userId.
 */
export async function pauseRecurringRule(
  userId: string,
  ruleId: string
): Promise<RecurringRuleDTO> {
  await getRecurringRule(userId, ruleId);
  return updateRecurringRule(userId, ruleId, { isActive: false });
}

/**
 * Resumes a paused recurring rule (sets isActive = true).
 */
export async function resumeRecurringRule(
  userId: string,
  ruleId: string
): Promise<RecurringRuleDTO> {
  await getRecurringRule(userId, ruleId);
  return updateRecurringRule(userId, ruleId, { isActive: true });
}

/**
 * Skips the next due occurrence of a recurring rule without generating a transaction.
 */
export async function skipNextRecurringRule(
  userId: string,
  ruleId: string
): Promise<RecurringRuleDTO> {
  return dbSkipNextRecurringRule(userId, ruleId);
}

// ---------------------------------------------------------------------------
// Upcoming occurrences projection
// ---------------------------------------------------------------------------

/**
 * Returns the next occurrences for all active rules owned by userId within
 * the next `days` calendar days (default 60).
 */
export async function getUpcomingOccurrences(
  userId: string,
  days = 60,
  fromDate?: string
): Promise<OccurrenceProjection[]> {
  const rules = await listRecurringRules(userId);
  const activeRules = rules.filter((r) => r.isActive);
  let start = fromDate;
  if (!start) {
    const tz = await getUserTimezone(userId);
    start = todayInTz(tz);
  }
  return projectUpcomingOccurrences(activeRules, start, days);
}

// ---------------------------------------------------------------------------
// Idempotent due-transaction generation
// ---------------------------------------------------------------------------

/**
 * Generates transactions or inbox items for all due occurrences up to `upTo` (YYYY-MM-DD).
 *
 * Idempotent: clientRequestId = `${ruleId}:${yyyy-mm-dd}` prevents duplicates.
 * Respects user's timezone when `upTo` is not passed.
 */
export async function generateDueTransactions(
  userId: string,
  upTo?: string
): Promise<GenerationResult> {
  let asOfDate = upTo;
  if (!asOfDate) {
    const tz = await getUserTimezone(userId);
    asOfDate = todayInTz(tz);
  }

  return generateDueRecurringTransactions({
    userId,
    asOfDate,
    backend: 'db',
  });
}
