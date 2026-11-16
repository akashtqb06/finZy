import type { RecurringFrequency } from '../constants';
import type { RecurringRuleDTO } from '../contract';
import type { OccurrenceProjection } from './types';

/**
 * Checks whether a given Gregorian year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the exact number of days in a given month (month is 1-based: 1 = Jan, 12 = Dec).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Clamps a target day-of-month to the maximum valid day in that month.
 * e.g., Day 31 clamped to Feb 2024 (leap year) -> 29, Feb 2025 -> 28, Apr 2024 -> 30.
 */
export function clampDayToMonth(year: number, month: number, targetDay: number): number {
  const maxDays = getDaysInMonth(year, month);
  return Math.min(Math.max(1, targetDay), maxDays);
}

/**
 * Formats year, month (1-based), and day into an ISO date string (YYYY-MM-DD).
 */
export function formatDateUTC(year: number, month: number, day: number): string {
  const yStr = String(year).padStart(4, '0');
  const mStr = String(month).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Extracts the anchor day of month for a recurring rule.
 * Returns either an integer 1-31 or 'last'.
 */
export function extractAnchorDay(rule: {
  startDate: string;
  dayOfMonth?: string | null;
  note?: string | null;
}): number | 'last' {
  if (rule.dayOfMonth) {
    if (rule.dayOfMonth.toLowerCase() === 'last') return 'last';
    const parsed = parseInt(rule.dayOfMonth, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) return parsed;
  }

  if (rule.note) {
    const match = rule.note.match(/\[DOM:(\d{1,2}|last)\]/i);
    if (match) {
      if (match[1].toLowerCase() === 'last') return 'last';
      const parsed = parseInt(match[1], 10);
      if (parsed >= 1 && parsed <= 31) {
        return parsed;
      }
    }
  }

  const [, , dStr] = rule.startDate.split('-');
  return parseInt(dStr, 10);
}

/**
 * Extracts the anchor month for yearly recurrences (1-12).
 */
export function extractAnchorMonth(rule: {
  startDate: string;
  monthOfYear?: number | null;
}): number {
  if (rule.monthOfYear && rule.monthOfYear >= 1 && rule.monthOfYear <= 12) {
    return rule.monthOfYear;
  }
  const [, mStr] = rule.startDate.split('-');
  return parseInt(mStr, 10);
}

/**
 * Computes calendar difference in full days between two ISO date strings (targetDate - fromDate).
 */
export function daysBetween(fromDate: string, targetDate: string): number {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = targetDate.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((utc2 - utc1) / msPerDay);
}

/**
 * Adds N days to a YYYY-MM-DD date in UTC.
 */
export function addDaysUTC(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Advances a recurring occurrence date according to frequency, interval, weekdays, and clamping.
 * Preserves anchor day of month across months of varying lengths (e.g., 31st -> Feb 28 -> Mar 31).
 */
export function advanceRecurringDate(
  currentDate: string,
  frequency: RecurringFrequency,
  interval: number = 1,
  anchorDay?: number | 'last',
  anchorMonth?: number,
  weekdays?: number[] | null
): string {
  const [y, m, d] = currentDate.split('-').map((v) => parseInt(v, 10));
  const safeInterval = Math.max(1, interval);

  switch (frequency) {
    case 'daily': {
      return addDaysUTC(currentDate, safeInterval);
    }

    case 'weekly': {
      if (weekdays && weekdays.length > 0) {
        const sortedDays = Array.from(new Set(weekdays)).sort((a, b) => a - b);
        const currentDt = new Date(Date.UTC(y, m - 1, d));
        const currentDayOfWeek = currentDt.getUTCDay(); // 0=Sun..6=Sat

        // Look for next weekday in current week
        const nextInSameWeek = sortedDays.find((day) => day > currentDayOfWeek);
        if (nextInSameWeek !== undefined) {
          return addDaysUTC(currentDate, nextInSameWeek - currentDayOfWeek);
        }

        // Advance to next active cycle week
        const firstDayOfNextCycle = sortedDays[0];
        const daysToNextWeekStart = 7 - currentDayOfWeek;
        const totalDaysToNextCycle = daysToNextWeekStart + (safeInterval - 1) * 7 + firstDayOfNextCycle;
        return addDaysUTC(currentDate, totalDaysToNextCycle);
      }
      return addDaysUTC(currentDate, safeInterval * 7);
    }

    case 'monthly': {
      const totalMonths = y * 12 + (m - 1) + safeInterval;
      const targetYear = Math.floor(totalMonths / 12);
      const targetM = (totalMonths % 12) + 1;
      let targetDay: number;
      if (anchorDay === 'last') {
        targetDay = getDaysInMonth(targetYear, targetM);
      } else {
        targetDay = clampDayToMonth(targetYear, targetM, anchorDay ?? d);
      }
      return formatDateUTC(targetYear, targetM, targetDay);
    }

    case 'quarterly': {
      const totalMonths = y * 12 + (m - 1) + safeInterval * 3;
      const targetYear = Math.floor(totalMonths / 12);
      const targetM = (totalMonths % 12) + 1;
      let targetDay: number;
      if (anchorDay === 'last') {
        targetDay = getDaysInMonth(targetYear, targetM);
      } else {
        targetDay = clampDayToMonth(targetYear, targetM, anchorDay ?? d);
      }
      return formatDateUTC(targetYear, targetM, targetDay);
    }

    case 'yearly': {
      const targetYear = y + safeInterval;
      const targetM = anchorMonth ?? m;
      let targetDay: number;
      if (anchorDay === 'last') {
        targetDay = getDaysInMonth(targetYear, targetM);
      } else {
        targetDay = clampDayToMonth(targetYear, targetM, anchorDay ?? d);
      }
      return formatDateUTC(targetYear, targetM, targetDay);
    }
  }
}

/**
 * Returns effective rule parameters at a given occurrence date taking `history` overrides into account.
 */
export function getEffectiveRuleParams(
  rule: RecurringRuleDTO,
  occurrenceDate: string
): {
  amount: number;
  amountType: 'fixed' | 'variable';
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth?: string | null;
  weekdays?: number[] | null;
  monthOfYear?: number | null;
} {
  let effectiveAmount = rule.amount;
  let effectiveAmountType = rule.amountType ?? 'fixed';
  let effectiveFreq = rule.frequency;
  let effectiveInterval = rule.interval;
  let effectiveDom = rule.dayOfMonth;
  let effectiveWeekdays = rule.weekdays;
  let effectiveMonth = rule.monthOfYear;

  if (rule.history && rule.history.length > 0) {
    const sorted = [...rule.history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    for (const h of sorted) {
      if (h.effectiveFrom <= occurrenceDate) {
        if (h.amount !== undefined) effectiveAmount = h.amount;
        if (h.amountType !== undefined) effectiveAmountType = h.amountType;
        if (h.frequency !== undefined) effectiveFreq = h.frequency as RecurringFrequency;
        if (h.interval !== undefined) effectiveInterval = h.interval;
        if (h.dayOfMonth !== undefined) effectiveDom = h.dayOfMonth;
        if (h.weekdays !== undefined) effectiveWeekdays = h.weekdays;
        if (h.monthOfYear !== undefined) effectiveMonth = h.monthOfYear;
      }
    }
  }

  return {
    amount: effectiveAmount,
    amountType: effectiveAmountType,
    frequency: effectiveFreq,
    interval: effectiveInterval,
    dayOfMonth: effectiveDom,
    weekdays: effectiveWeekdays,
    monthOfYear: effectiveMonth,
  };
}

/**
 * Computes the next N occurrence dates starting from `fromOrNextDate` (exclusive or inclusive).
 */
export function computeNextNDates(
  rule: {
    startDate: string;
    nextOccurrence?: string;
    frequency: RecurringFrequency;
    interval: number;
    dayOfMonth?: string | null;
    monthOfYear?: number | null;
    weekdays?: number[] | null;
    endDate?: string | null;
    maxOccurrences?: number | null;
    occurrencesCount?: number | null;
    skippedDates?: string[] | null;
  },
  count: number = 5,
  fromDate?: string
): string[] {
  const anchorDay = extractAnchorDay(rule);
  const anchorMonth = extractAnchorMonth(rule);
  const results: string[] = [];
  const limitDate = rule.endDate;

  let current = fromDate || rule.nextOccurrence || rule.startDate;

  // If weekly with specific weekdays and starting on startDate, ensure current is on a valid weekday
  if (rule.frequency === 'weekly' && rule.weekdays && rule.weekdays.length > 0) {
    const [y, m, d] = current.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (!rule.weekdays.includes(dayOfWeek)) {
      // Advance to first eligible weekday
      const sorted = [...rule.weekdays].sort((a, b) => a - b);
      const nextDay = sorted.find((w) => w >= dayOfWeek);
      if (nextDay !== undefined) {
        current = addDaysUTC(current, nextDay - dayOfWeek);
      } else {
        current = addDaysUTC(current, 7 - dayOfWeek + sorted[0]);
      }
    }
  }

  let iterations = 0;
  const maxIterations = 500;

  while (results.length < count && iterations < maxIterations) {
    iterations++;

    if (limitDate && current > limitDate) break;

    // Check if skipped
    if (!rule.skippedDates || !rule.skippedDates.includes(current)) {
      results.push(current);
    }

    const nextOcc = advanceRecurringDate(
      current,
      rule.frequency,
      rule.interval,
      anchorDay,
      anchorMonth,
      rule.weekdays
    );

    if (nextOcc <= current) break;
    current = nextOcc;
  }

  return results;
}

/**
 * Projects all upcoming occurrences for active recurring rules over the specified horizon (default 60 days).
 */
export function projectUpcomingOccurrences(
  rules: RecurringRuleDTO[],
  fromDate: string = new Date().toISOString().slice(0, 10),
  daysAhead: number = 60
): OccurrenceProjection[] {
  const limitDate = addDaysUTC(fromDate, daysAhead);
  const projections: OccurrenceProjection[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;

    const anchorDay = extractAnchorDay(rule);
    const anchorMonth = extractAnchorMonth(rule);
    let occurrence = rule.nextOccurrence;

    let iterations = 0;
    const maxIterations = 200;

    while (occurrence <= limitDate && iterations < maxIterations) {
      iterations++;

      if (rule.endDate && occurrence > rule.endDate) break;

      if (occurrence >= fromDate) {
        const daysUntil = daysBetween(fromDate, occurrence);
        const name =
          rule.payee ||
          (rule.note ? rule.note.replace(/\[DOM:(\d+|last)\]/i, '').trim() : '') ||
          'Recurring Rule';

        const effective = getEffectiveRuleParams(rule, occurrence);

        projections.push({
          id: `${rule.id}_${occurrence}`,
          ruleId: rule.id,
          ruleName: name || 'Recurring Rule',
          date: occurrence,
          daysUntil,
          type: rule.type as 'expense' | 'income' | 'transfer',
          amount: effective.amount,
          payee: rule.payee,
          note: rule.note ? rule.note.replace(/\[DOM:(\d+|last)\]/i, '').trim() || null : null,
          accountId: rule.accountId,
          toAccountId: rule.toAccountId,
          categoryId: rule.categoryId,
          frequency: rule.frequency,
          interval: rule.interval,
          isActive: rule.isActive,
        });
      }

      const nextOcc = advanceRecurringDate(
        occurrence,
        rule.frequency,
        rule.interval,
        anchorDay,
        anchorMonth,
        rule.weekdays
      );

      if (nextOcc <= occurrence) break;
      occurrence = nextOcc;
    }
  }

  return projections.sort((a, b) => a.date.localeCompare(b.date));
}
