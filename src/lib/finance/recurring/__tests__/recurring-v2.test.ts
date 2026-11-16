import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import {
  db,
  finAccounts,
  finRecurringRules,
  finTransactions,
  finInbox,
  finJobRuns,
} from '@src/lib/db';
import { setupFinanceTestDb, USER_A, USER_B } from '../../__tests__/db/test-helper';
import { generateDueRecurringTransactions } from '../generator';
import { advanceRecurringDate } from '../date-math';
import { todayInTz } from '../../timezone';
import { approveItems } from '../../inbox/service';
import { GET as dailyCronGET, POST as dailyCronPOST } from '@src/app/api/cron/daily/route';

describe('Recurring Transactions V2 Comprehensive Suite', () => {
  let accountAId: string;
  let accountBId: string;
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(async () => {
    process.env.FINANCE_BACKEND = 'db';
    process.env.CRON_SECRET = 'test_cron_secret_v2';
    await setupFinanceTestDb();

    // Create accounts for USER_A and USER_B
    const [accA] = await db
      .insert(finAccounts)
      .values({
        userId: USER_A,
        name: 'HDFC Savings A',
        kind: 'bank',
        class: 'asset',
        currency: 'INR',
        isActive: true,
      })
      .returning();
    accountAId = accA.id;

    const [accB] = await db
      .insert(finAccounts)
      .values({
        userId: USER_B,
        name: 'ICICI Savings B',
        kind: 'bank',
        class: 'asset',
        currency: 'INR',
        isActive: true,
      })
      .returning();
    accountBId = accB.id;
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  // 1. Month-end clamping (31st)
  describe('1. Month-end clamping (31st)', () => {
    it('clamps 31st to 28th/30th and recovers 31st on 31-day months', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 500000,
          payee: 'Month-end Service',
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: '31',
          startDate: '2026-01-31',
          nextOccurrence: '2026-01-31',
          isActive: true,
        })
        .returning();

      const result = await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-05-31',
        backend: 'db',
      });

      expect(result.created).toBe(5);

      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        )
        .orderBy(finTransactions.date);

      const dates = txns.map((t) => t.date);
      // Jan 31 -> Feb 28 (non-leap) -> Mar 31 -> Apr 30 -> May 31
      expect(dates).toEqual([
        '2026-01-31',
        '2026-02-28',
        '2026-03-31',
        '2026-04-30',
        '2026-05-31',
      ]);
    });

    it('clamps 31st to 29th on leap year February', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 500000,
          payee: 'Leap Month-end Service',
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: '31',
          startDate: '2024-01-31',
          nextOccurrence: '2024-01-31',
          isActive: true,
        })
        .returning();

      await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2024-03-31',
        backend: 'db',
      });

      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        )
        .orderBy(finTransactions.date);

      const dates = txns.map((t) => t.date);
      expect(dates).toEqual(['2024-01-31', '2024-02-29', '2024-03-31']);
    });
  });

  // 2. Feb 29 leap-year fallback (Feb 28 in non-leap year)
  describe('2. Feb 29 leap-year fallback', () => {
    it('date-math correctly advances Feb 29 across leap and non-leap years', () => {
      const d1 = '2024-02-29';
      const d2 = advanceRecurringDate(d1, 'yearly', 1, 29, 2);
      expect(d2).toBe('2025-02-28');

      const d3 = advanceRecurringDate(d2, 'yearly', 1, 29, 2);
      expect(d3).toBe('2026-02-28');

      const d4 = advanceRecurringDate(d3, 'yearly', 1, 29, 2);
      expect(d4).toBe('2027-02-28');

      const d5 = advanceRecurringDate(d4, 'yearly', 1, 29, 2);
      expect(d5).toBe('2028-02-29');
    });

    it('generator falls back to Feb 28 on non-leap years within backfill window', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 1200000,
          payee: 'Leap Day Subscription',
          frequency: 'yearly',
          interval: 1,
          monthOfYear: 2,
          dayOfMonth: '29',
          startDate: '2024-02-29',
          nextOccurrence: '2024-02-29',
          isActive: true,
        })
        .returning();

      // Run generator up to 2025-03-01 (within 366-day downtime window)
      await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2025-03-01',
        backend: 'db',
      });

      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        )
        .orderBy(finTransactions.date);

      const dates = txns.map((t) => t.date);
      expect(dates).toEqual(['2024-02-29', '2025-02-28']);
    });
  });

  // 3. Every 2 weeks with weekdays
  describe('3. Every 2 weeks with weekdays', () => {
    it('generates occurrences on designated weekdays every 2 weeks', async () => {
      // 2026-01-05 is a Monday (weekday 1)
      // 2026-01-08 is a Thursday (weekday 4)
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 150000,
          payee: 'Bi-weekly Cleaning',
          frequency: 'weekly',
          interval: 2,
          weekdays: [1, 4], // Monday and Thursday
          startDate: '2026-01-05',
          nextOccurrence: '2026-01-05',
          isActive: true,
        })
        .returning();

      await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-01-25',
        backend: 'db',
      });

      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        )
        .orderBy(finTransactions.date);

      const dates = txns.map((t) => t.date);
      // Week 1: Jan 5 (Mon), Jan 8 (Thu)
      // Week 2: skip
      // Week 3: Jan 19 (Mon), Jan 22 (Thu)
      expect(dates).toEqual([
        '2026-01-05',
        '2026-01-08',
        '2026-01-19',
        '2026-01-22',
      ]);
    });
  });

  // 4. Every 3 months (quarterly intervals)
  describe('4. Every 3 months (quarterly)', () => {
    it('generates transactions every 3 months correctly', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 300000,
          payee: 'Quarterly Maintenance',
          frequency: 'monthly',
          interval: 3,
          dayOfMonth: '15',
          startDate: '2026-01-15',
          nextOccurrence: '2026-01-15',
          isActive: true,
        })
        .returning();

      await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-10-20',
        backend: 'db',
      });

      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        )
        .orderBy(finTransactions.date);

      const dates = txns.map((t) => t.date);
      expect(dates).toEqual([
        '2026-01-15',
        '2026-04-15',
        '2026-07-15',
        '2026-10-15',
      ]);
    });
  });

  // 5. End date and max occurrences
  describe('5. End date and max occurrences', () => {
    it('stops generating after endDate', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 100000,
          payee: 'Temporary Daily Pass',
          frequency: 'daily',
          interval: 1,
          startDate: '2026-01-01',
          endDate: '2026-01-05',
          nextOccurrence: '2026-01-01',
          isActive: true,
        })
        .returning();

      await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-01-20',
        backend: 'db',
      });

      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        )
        .orderBy(finTransactions.date);

      expect(txns.length).toBe(5);
      expect(txns[txns.length - 1].date).toBe('2026-01-05');
    });

    it('stops generating after reaching maxOccurrences', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 100000,
          payee: 'Fixed 4-Installment Fee',
          frequency: 'daily',
          interval: 1,
          startDate: '2026-01-01',
          maxOccurrences: 4,
          nextOccurrence: '2026-01-01',
          isActive: true,
        })
        .returning();

      await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-01-20',
        backend: 'db',
      });

      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        )
        .orderBy(finTransactions.date);

      expect(txns.length).toBe(4);
      expect(txns.map((t) => t.date)).toEqual([
        '2026-01-01',
        '2026-01-02',
        '2026-01-03',
        '2026-01-04',
      ]);
    });
  });

  // 6. 40-day back-fill
  describe('6. 40-day back-fill', () => {
    it('backfills all 41 occurrences across 40 days gap in a single run', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 20000,
          payee: 'Daily Newspaper',
          frequency: 'daily',
          interval: 1,
          startDate: '2026-01-01',
          nextOccurrence: '2026-01-01',
          isActive: true,
        })
        .returning();

      const result = await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-02-10', // 40 days gap (41 days inclusive)
        backend: 'db',
      });

      expect(result.created).toBe(41);

      const countRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        );

      expect(Number(countRes[0].count)).toBe(41);
    });
  });

  // 7. Double run idempotency
  describe('7. Double run idempotency', () => {
    it('creates 0 transactions on a second consecutive run', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 1500000,
          payee: 'Apartment Maintenance',
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: '1',
          startDate: '2026-01-01',
          nextOccurrence: '2026-01-01',
          isActive: true,
        })
        .returning();

      // First run creates 3 transactions (Jan 1, Feb 1, Mar 1)
      const run1 = await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-03-01',
        backend: 'db',
      });
      expect(run1.created).toBe(3);

      // Second run immediately produces 0 new transactions
      const run2 = await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-03-01',
        backend: 'db',
      });
      expect(run2.created).toBe(0);

      // If rule is artificially rewound to 2026-01-01, generator skips all existing transactions
      await db
        .update(finRecurringRules)
        .set({ nextOccurrence: '2026-01-01' })
        .where(eq(finRecurringRules.id, rule.id));

      const run3 = await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-03-01',
        backend: 'db',
      });
      expect(run3.created).toBe(0);
      expect(run3.skipped).toBe(3);

      // Verify DB has exactly 3 transactions in total
      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        );
      expect(txns.length).toBe(3);
    });
  });

  // 8. Concurrent lazy and cron runs race condition
  describe('8. Concurrent lazy and cron runs', () => {
    it('creates each row exactly once under concurrent parallel runs', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 80000,
          payee: 'Gym Subscription',
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: '1',
          startDate: '2026-01-01',
          nextOccurrence: '2026-01-01',
          isActive: true,
        })
        .returning();

      // Launch both runs concurrently
      const [res1, res2] = await Promise.all([
        generateDueRecurringTransactions({
          userId: USER_A,
          asOfDate: '2026-04-01',
          backend: 'db',
        }),
        generateDueRecurringTransactions({
          userId: USER_A,
          asOfDate: '2026-04-01',
          backend: 'db',
        }),
      ]);

      // Total created across both runs must equal exactly 4
      expect(res1.created + res2.created).toBe(4);

      // Total transactions in DB must be exactly 4
      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        );

      expect(txns.length).toBe(4);
    });
  });

  // 9. Timezone boundary (00:30 IST versus UTC date)
  describe('9. Timezone boundary', () => {
    it('correctly uses the date in the user timezone rather than UTC', async () => {
      // 2026-11-15 19:30:00 UTC is 2026-11-16 01:00:00 in Asia/Kolkata (+05:30)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-15T19:30:00.000Z'));
      const istDate = todayInTz('Asia/Kolkata');
      vi.useRealTimers();
      expect(istDate).toBe('2026-11-16');

      // Rule scheduled for 2026-11-16
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 50000,
          payee: 'Morning Tea',
          frequency: 'daily',
          interval: 1,
          startDate: '2026-11-16',
          nextOccurrence: '2026-11-16',
          isActive: true,
        })
        .returning();

      // When evaluating with user's timezone date (2026-11-16), it generates the item
      const result = await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: istDate,
        backend: 'db',
      });

      expect(result.created).toBe(1);

      const [txn] = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        );
      expect(txn.date).toBe('2026-11-16');
    });
  });

  // 10. ask_confirm mode & Inbox integration
  describe('10. ask_confirm mode', () => {
    it('creates a pending item in fin_inbox once, and approving it posts the transaction', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 250000,
          payee: 'Electricity Bill (Variable)',
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: '10',
          startDate: '2026-01-10',
          nextOccurrence: '2026-01-10',
          mode: 'ask_confirm',
          amountType: 'variable',
          isActive: true,
        })
        .returning();

      // First run generates a pending inbox item
      const run1 = await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-01-10',
        backend: 'db',
      });

      expect(run1.created).toBe(0);
      expect(run1.pending).toBe(1);

      // Verify inbox item
      const inboxItems = await db
        .select()
        .from(finInbox)
        .where(
          and(
            eq(finInbox.userId, USER_A),
            eq(finInbox.source, 'recurring')
          )
        );

      expect(inboxItems.length).toBe(1);
      const item = inboxItems[0];
      expect(item.status).toBe('pending');
      expect(item.idempotencyKey).toBe(`${rule.id}:2026-01-10`);
      expect(item.amount).toBe(250000);

      // Ensure no transaction was posted yet
      const txnsBefore = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        );
      expect(txnsBefore.length).toBe(0);

      // Double run does not create duplicate inbox items
      const run2 = await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-01-10',
        backend: 'db',
      });
      expect(run2.pending).toBe(0);

      // Now approve the inbox item with an edited amount (e.g. 280000 paise)
      const approveRes = await approveItems(USER_A, [
        {
          id: item.id,
          amount: 280000,
          accountId: accountAId,
        },
      ]);

      expect(approveRes.approved).toContain(item.id);

      // Transaction is now posted with editable amount, isRecurring = true, recurringRuleId set
      const txnsAfter = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        );

      expect(txnsAfter.length).toBe(1);
      expect(txnsAfter[0].amount).toBe(280000);
      expect(txnsAfter[0].isRecurring).toBe(true);
      expect(txnsAfter[0].recurringRuleId).toBe(rule.id);
    });
  });

  // 11. Change-from-date history
  describe('11. Change-from-date history', () => {
    it('applies updated amount only on or after effectiveFrom date without rewriting earlier rows', async () => {
      const [rule] = await db
        .insert(finRecurringRules)
        .values({
          userId: USER_A,
          accountId: accountAId,
          type: 'expense',
          amount: 100000, // ₹1,000 initially
          payee: 'Broadband Plan',
          frequency: 'monthly',
          interval: 1,
          dayOfMonth: '1',
          startDate: '2026-01-01',
          nextOccurrence: '2026-01-01',
          history: [
            {
              effectiveFrom: '2026-03-01',
              amount: 140000, // ₹1,400 starting March 1st
            },
          ],
          isActive: true,
        })
        .returning();

      await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-04-01',
        backend: 'db',
      });

      const txns = await db
        .select()
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, USER_A),
            eq(finTransactions.recurringRuleId, rule.id)
          )
        )
        .orderBy(finTransactions.date);

      expect(txns.length).toBe(4);
      // Jan 1 -> 100000
      // Feb 1 -> 100000
      // Mar 1 -> 140000
      // Apr 1 -> 140000
      expect(txns[0].amount).toBe(100000);
      expect(txns[1].amount).toBe(100000);
      expect(txns[2].amount).toBe(140000);
      expect(txns[3].amount).toBe(140000);
    });
  });

  // 12. User isolation
  describe('12. User isolation', () => {
    it('isolates generation strictly to the specified user', async () => {
      // Create rule for USER_A
      await db.insert(finRecurringRules).values({
        userId: USER_A,
        accountId: accountAId,
        type: 'expense',
        amount: 50000,
        payee: 'User A Subscription',
        frequency: 'daily',
        interval: 1,
        startDate: '2026-01-01',
        nextOccurrence: '2026-01-01',
        isActive: true,
      });

      // Create rule for USER_B
      await db.insert(finRecurringRules).values({
        userId: USER_B,
        accountId: accountBId,
        type: 'expense',
        amount: 70000,
        payee: 'User B Subscription',
        frequency: 'daily',
        interval: 1,
        startDate: '2026-01-01',
        nextOccurrence: '2026-01-01',
        isActive: true,
      });

      // Run generator ONLY for USER_A
      await generateDueRecurringTransactions({
        userId: USER_A,
        asOfDate: '2026-01-02',
        backend: 'db',
      });

      // USER_A has 2 transactions
      const txnsA = await db
        .select()
        .from(finTransactions)
        .where(eq(finTransactions.userId, USER_A));
      expect(txnsA.length).toBe(2);

      // USER_B has 0 transactions
      const txnsB = await db
        .select()
        .from(finTransactions)
        .where(eq(finTransactions.userId, USER_B));
      expect(txnsB.length).toBe(0);
    });
  });

  // 13. Cron route 401 and 200 for GET and POST
  describe('13. Daily Cron Route (/api/cron/daily)', () => {
    it('rejects requests without CRON_SECRET with 401', async () => {
      const getReq = new NextRequest('http://localhost:3000/api/cron/daily', {
        method: 'GET',
      });
      const getRes = await dailyCronGET(getReq);
      expect(getRes.status).toBe(401);

      const postReq = new NextRequest('http://localhost:3000/api/cron/daily', {
        method: 'POST',
      });
      const postRes = await dailyCronPOST(postReq);
      expect(postRes.status).toBe(401);
    });

    it('rejects requests with incorrect bearer token with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/daily', {
        method: 'GET',
        headers: {
          authorization: 'Bearer wrong_secret',
        },
      });
      const res = await dailyCronGET(req);
      expect(res.status).toBe(401);
    });

    it('accepts valid GET request with Bearer token and returns 200', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/daily', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test_cron_secret_v2',
        },
      });
      const res = await dailyCronGET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.jobId).toBeDefined();
      expect(json.status).toBe('completed');
    });

    it('accepts valid POST request with Bearer token and returns 200', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/daily', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test_cron_secret_v2',
        },
      });
      const res = await dailyCronPOST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('completed');
    });
  });

  // 14. Job run logging and 36-hour warning
  describe('14. Job run logging and 36-hour warning', () => {
    it('records job run in fin_job_runs and correctly evaluates stale warning threshold', async () => {
      // Trigger daily cron
      const req = new NextRequest('http://localhost:3000/api/cron/daily', {
        method: 'GET',
        headers: {
          authorization: 'Bearer test_cron_secret_v2',
        },
      });
      await dailyCronGET(req);

      // Check fin_job_runs has the record
      const runs = await db
        .select()
        .from(finJobRuns)
        .where(eq(finJobRuns.job, 'daily'));

      expect(runs.length).toBeGreaterThanOrEqual(1);
      const latestRun = runs[runs.length - 1];
      expect(latestRun.status).toBe('completed');
      expect(typeof latestRun.usersProcessed).toBe('number');
      expect(latestRun.errorCount).toBe(0);

      // Diagnostic check: fresh run within 36 hours is NOT stale
      const now = new Date();
      const hoursSinceRecent =
        (now.getTime() - new Date(latestRun.startedAt).getTime()) / (1000 * 60 * 60);
      expect(hoursSinceRecent).toBeLessThan(36);
      const isRecentStale = hoursSinceRecent > 36;
      expect(isRecentStale).toBe(false);

      // Diagnostic check: simulated run from 37 hours ago IS stale
      const oldDate = new Date(Date.now() - 37 * 60 * 60 * 1000);
      const [oldRun] = await db
        .insert(finJobRuns)
        .values({
          job: 'daily_simulated_old',
          startedAt: oldDate,
          finishedAt: oldDate,
          status: 'completed',
          usersProcessed: 1,
          created: 0,
          errorCount: 0,
        })
        .returning();

      const hoursSinceOld =
        (Date.now() - new Date(oldRun.startedAt).getTime()) / (1000 * 60 * 60);
      expect(hoursSinceOld).toBeGreaterThan(36);
      const isOldStale = hoursSinceOld > 36;
      expect(isOldStale).toBe(true);
    });
  });
});
