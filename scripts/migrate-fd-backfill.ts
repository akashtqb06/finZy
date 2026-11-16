import { db, finAccounts } from '@src/lib/db';
import { eq } from 'drizzle-orm';
import { recomputeDepositValuations } from '@src/lib/finance/db-service/valuations';
import { addMonthsToDate } from '@src/lib/finance/domain/deposits';

export async function backfillFDAccounts() {
  console.log('🔄 Starting idempotent FD accounts backfill migration...');
  const fds = await db
    .select()
    .from(finAccounts)
    .where(eq(finAccounts.kind, 'fixed_deposit'));

  console.log(`Found ${fds.length} fixed_deposit account(s) to inspect.`);

  let updatedCount = 0;
  const userIds = new Set<string>();

  for (const fd of fds) {
    const meta = (fd.metadata || {}) as Record<string, unknown>;
    const startDate =
      (meta.startDate as string) ||
      (fd.createdAt instanceof Date
        ? fd.createdAt.toISOString().slice(0, 10)
        : String(fd.createdAt).slice(0, 10));

    const tenureMonths = Number(meta.tenureMonths || meta.tenure || 12);
    const maturityDate =
      (meta.maturityDate as string) || addMonthsToDate(startDate, tenureMonths);

    const rawRate = Number(meta.interestRate ?? meta.ratePercent ?? meta.rate ?? 7.1);
    const ratePercent = rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2));

    const principal = Number(
      meta.principalPaise ??
        meta.principal ??
        meta.depositAmount ??
        meta.openingBalancePaise ??
        0
    );

    const compounding = (meta.compounding ??
      meta.compoundingFrequency ??
      'quarterly') as string;

    const fdType = (meta.fdType as string) || 'cumulative';
    const accrualMode = (meta.accrualMode as string) || 'bank';
    const dayCount = (meta.dayCount as string) || 'act_365';

    const updatedMeta: Record<string, unknown> = {
      ...meta,
      fdType,
      principal,
      principalPaise: principal,
      ratePercent,
      interestRate: ratePercent,
      startDate,
      maturityDate,
      compounding,
      compoundingFrequency: compounding,
      accrualMode,
      dayCount,
    };

    if (meta.maturityAmountPerReceipt !== undefined) {
      updatedMeta.maturityAmountPerReceipt = Number(meta.maturityAmountPerReceipt);
    }
    if (meta.payoutFrequency !== undefined) {
      updatedMeta.payoutFrequency = meta.payoutFrequency;
    }
    if (meta.payoutAccountId !== undefined) {
      updatedMeta.payoutAccountId = meta.payoutAccountId;
    }

    await db
      .update(finAccounts)
      .set({ metadata: updatedMeta, updatedAt: new Date() })
      .where(eq(finAccounts.id, fd.id));

    userIds.add(fd.userId);
    updatedCount++;
  }

  console.log(`Updated metadata for ${updatedCount} FD accounts.`);

  // Recompute deposit valuations for all affected users
  for (const uid of userIds) {
    console.log(`Recomputing valuations for user: ${uid}`);
    const res = await recomputeDepositValuations(uid);
    console.log(
      `User ${uid}: wrote ${res.valuationsWritten} valuations across ${res.processedAccounts} deposit accounts.`
    );
  }

  console.log('✅ FD backfill migration completed successfully.');
}

if (process.argv[1]?.endsWith('migrate-fd-backfill.ts')) {
  backfillFDAccounts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal backfill error:', err);
      process.exit(1);
    });
}
