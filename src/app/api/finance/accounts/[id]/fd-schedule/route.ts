import 'server-only';
import { NextRequest } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError, NotFoundError, BadRequestError } from '@src/app/api/utils';
import { jsonNoStore } from '../../../utils';
import { and, desc, eq, lte } from 'drizzle-orm';
import { db, finAccounts, finValuations } from '@src/lib/db';
import {
  calculateFDValue,
  type FDConfig,
  type FDCompounding,
  type FDAccrualMode,
  type FDDayCount,
  type FDType,
  type FDPayoutFrequency,
} from '@src/lib/finance/domain/fd';
import { addMonthsToDate } from '@src/lib/finance/domain/deposits';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUserApi();
    const { id: accountId } = await props.params;

    const [account] = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, user.id)))
      .limit(1);

    if (!account) {
      throw new NotFoundError(`Account not found: ${accountId}`);
    }

    if (account.kind !== 'fixed_deposit') {
      throw new BadRequestError(`Account ${accountId} is not a fixed deposit.`);
    }

    const today = todayInTz(DEFAULT_TZ);
    const meta = (account.metadata || {}) as Record<string, unknown>;

    const startDate =
      (meta.startDate as string) ||
      (account.createdAt instanceof Date
        ? account.createdAt.toISOString().slice(0, 10)
        : String(account.createdAt).slice(0, 10));

    const tenureMonths = Number(meta.tenureMonths || 12);
    const maturityDate =
      (meta.maturityDate as string) || addMonthsToDate(startDate, tenureMonths);

    const principal = Number(
      meta.principalPaise ??
        meta.principal ??
        meta.depositAmount ??
        meta.openingBalancePaise ??
        0
    );

    const rawRate = Number(meta.ratePercent ?? meta.interestRate ?? meta.rate ?? 7.1);
    const ratePercent = rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2));

    const fdType = (meta.fdType as FDType) || 'cumulative';
    const compounding = (meta.compounding ??
      meta.compoundingFrequency ??
      'quarterly') as FDCompounding;
    const accrualMode = (meta.accrualMode as FDAccrualMode) || 'bank';
    const dayCount = (meta.dayCount as FDDayCount) || 'act_365';

    // Find manual anchor
    const manualValuations = await db
      .select()
      .from(finValuations)
      .where(
        and(
          eq(finValuations.accountId, accountId),
          eq(finValuations.userId, user.id),
          lte(finValuations.date, today)
        )
      )
      .orderBy(desc(finValuations.date));

    const latestManual = manualValuations.find((v) => v.note !== 'computed');
    const manualAnchor = latestManual
      ? { date: latestManual.date, value: Number(latestManual.value) }
      : undefined;

    const fdConfig: FDConfig = {
      principal,
      ratePercent,
      startDate,
      maturityDate,
      fdType,
      compounding,
      accrualMode,
      dayCount,
      maturityAmountPerReceipt: meta.maturityAmountPerReceipt
        ? Number(meta.maturityAmountPerReceipt)
        : undefined,
      manualAnchor,
      payoutFrequency: meta.payoutFrequency as FDPayoutFrequency | undefined,
      payoutAccountId: meta.payoutAccountId as string | undefined,
      renewal: (meta.renewal as string) || null,
      notes: (meta.notes as string) || null,
    };

    const valuation = calculateFDValue(fdConfig, today);

    return jsonNoStore({
      success: true,
      config: fdConfig,
      valuation,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
