import 'server-only';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, finAccounts, finJobRuns, finTransactions } from '@src/lib/db';
import { jsonNoStore } from '../utils';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';
import { getNetWorthHistory } from '@src/lib/finance/db-service/history';

// Owner-only endpoint: checks DB integrity and reconciles balances
export async function GET() {
  try {
    const user = await requireUserApi();
    const userId = user.id;

    const backend = process.env.FINANCE_BACKEND ?? 'db';
    const today = todayInTz(DEFAULT_TZ);

    // Count rows
    const [accountsCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(finAccounts)
      .where(eq(finAccounts.userId, userId));

    const [txCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(finTransactions)
      .where(and(eq(finTransactions.userId, userId), isNull(finTransactions.deletedAt)));

    // Reconcile: compute balances independently with raw SQL
    const accs = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.userId, userId), eq(finAccounts.isActive, true)));

    const sourceSums = await db
      .select({
        accountId: finTransactions.accountId,
        total: sql<string>`COALESCE(SUM(${finTransactions.signedAmount}), 0)`,
      })
      .from(finTransactions)
      .where(and(eq(finTransactions.userId, userId), isNull(finTransactions.deletedAt)))
      .groupBy(finTransactions.accountId);

    const targetSums = await db
      .select({
        accountId: finTransactions.toAccountId,
        total: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
      })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, userId),
          eq(finTransactions.type, 'transfer'),
          isNull(finTransactions.deletedAt)
        )
      )
      .groupBy(finTransactions.toAccountId);

    const sourceMap = new Map<string, number>();
    for (const r of sourceSums) sourceMap.set(r.accountId, Number(r.total));
    const targetMap = new Map<string, number>();
    for (const r of targetSums) {
      if (r.accountId) targetMap.set(r.accountId, Number(r.total));
    }

    const accountReconciliation = accs.map((acc) => {
      const balance = (sourceMap.get(acc.id) ?? 0) + (targetMap.get(acc.id) ?? 0);
      const isLiability = acc.class === 'liability';
      const outstanding = isLiability ? Math.max(0, -balance) : 0;
      return {
        accountId: acc.id,
        name: acc.name,
        kind: acc.kind,
        class: acc.class,
        ledgerBalance: balance,
        outstanding,
      };
    });

    const totalAssets = accountReconciliation
      .filter((a) => a.class === 'asset')
      .reduce((sum, a) => sum + a.ledgerBalance, 0);
    const totalLiabilities = accountReconciliation
      .filter((a) => a.class === 'liability')
      .reduce((sum, a) => sum + a.outstanding, 0);
    const netWorth = totalAssets - totalLiabilities;

    // Check invariant: net worth history ending point must match current calculated net worth
    const nwHistory = await getNetWorthHistory(userId, { interval: 'daily', endDate: today });
    const lastHistoryPoint = nwHistory[nwHistory.length - 1];
    const netWorthHistoryLastPoint = lastHistoryPoint ? lastHistoryPoint.netWorth : netWorth;
    const netWorthHistoryMatches = Math.abs(netWorthHistoryLastPoint - netWorth) === 0;

    if (!netWorthHistoryMatches) {
      console.error(
        `[Diagnostics Invariant Mismatch] Net worth history last point (${netWorthHistoryLastPoint}) !== current net worth (${netWorth})`
      );
    }

    const [lastJob] = await db
      .select({
        id: finJobRuns.id,
        job: finJobRuns.job,
        startedAt: finJobRuns.startedAt,
        finishedAt: finJobRuns.finishedAt,
        status: finJobRuns.status,
        usersProcessed: finJobRuns.usersProcessed,
        created: finJobRuns.created,
        errorCount: finJobRuns.errorCount,
      })
      .from(finJobRuns)
      .where(eq(finJobRuns.job, 'daily'))
      .orderBy(desc(finJobRuns.startedAt))
      .limit(1);

    const now = Date.now();
    const lastJobRunStarted = lastJob?.startedAt ? new Date(lastJob.startedAt).getTime() : null;
    const hoursSinceLastRun = lastJobRunStarted ? (now - lastJobRunStarted) / (1000 * 60 * 60) : null;
    const isStale = hoursSinceLastRun === null || hoursSinceLastRun > 36;

    return jsonNoStore({
      backend,
      databaseConnected: true,
      asOf: today,
      user: { id: userId, email: user.email },
      counts: {
        accounts: Number(accountsCount?.count ?? 0),
        transactions: Number(txCount?.count ?? 0),
      },
      lastDailyJob: lastJob
        ? {
            id: lastJob.id,
            job: lastJob.job,
            startedAt: lastJob.startedAt.toISOString(),
            finishedAt: lastJob.finishedAt?.toISOString() ?? null,
            status: lastJob.status,
            usersProcessed: lastJob.usersProcessed,
            created: lastJob.created,
            errorCount: lastJob.errorCount,
            hoursSinceLastRun,
            isStale,
          }
        : null,
      reconciliation: {
        totalAssets,
        totalLiabilities,
        netWorth,
        netWorthHistoryLastPoint,
        netWorthHistoryMatches,
        accounts: accountReconciliation,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

