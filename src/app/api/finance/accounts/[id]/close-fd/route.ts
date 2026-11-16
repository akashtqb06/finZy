import 'server-only';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError, NotFoundError, BadRequestError } from '@src/app/api/utils';
import { jsonNoStore } from '../../../utils';
import { and, eq } from 'drizzle-orm';
import { db, finAccounts, finTransactions, finRecurringRules } from '@src/lib/db';
import { incrementDataVersion } from '@src/lib/finance/db-service/sync';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';

const closeFdSchema = z.object({
  targetAccountId: z.string().min(1, 'Destination bank account is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid YYYY-MM-DD date required').optional(),
  amount: z.number().int().positive('Maturity amount must be positive'),
  note: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUserApi();
    const { id: accountId } = await props.params;

    const body = await req.json();
    const validated = closeFdSchema.parse(body);

    // Verify FD account
    const [fdAccount] = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, user.id)))
      .limit(1);

    if (!fdAccount) {
      throw new NotFoundError(`FD account not found: ${accountId}`);
    }

    if (fdAccount.kind !== 'fixed_deposit') {
      throw new BadRequestError(`Account ${accountId} is not a fixed deposit.`);
    }

    // Verify target bank account
    const [targetAccount] = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.id, validated.targetAccountId), eq(finAccounts.userId, user.id)))
      .limit(1);

    if (!targetAccount) {
      throw new NotFoundError(`Target account not found: ${validated.targetAccountId}`);
    }

    if (targetAccount.id === fdAccount.id) {
      throw new BadRequestError('Cannot transfer maturity proceeds to the same account.');
    }

    const txDate = validated.date || todayInTz(DEFAULT_TZ);
    const amount = validated.amount;

    const result = await db.transaction(async (tx) => {
      // 1. Create maturity transfer transaction
      const [txn] = await tx
        .insert(finTransactions)
        .values({
          userId: user.id,
          accountId: fdAccount.id,
          toAccountId: targetAccount.id,
          type: 'transfer',
          amount,
          signedAmount: -amount,
          date: txDate,
          payee: 'FD Maturity Proceeds',
          note: validated.note || `Maturity proceeds transfer from ${fdAccount.name}`,
        })
        .returning();

      // 2. Archive FD account
      const meta = (fdAccount.metadata || {}) as Record<string, unknown>;
      const updatedMeta = {
        ...meta,
        closedAt: txDate,
        closedToAccountId: targetAccount.id,
        closedAmount: amount,
      };

      const [updatedAccount] = await tx
        .update(finAccounts)
        .set({
          isActive: false,
          metadata: updatedMeta,
          version: (fdAccount.version ?? 1) + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(finAccounts.id, fdAccount.id), eq(finAccounts.userId, user.id)))
        .returning();

      // 3. Deactivate any payout recurring rules associated with this FD
      await tx
        .update(finRecurringRules)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(finRecurringRules.userId, user.id),
            eq(finRecurringRules.subType, `fd_payout_${fdAccount.id}`)
          )
        );

      await incrementDataVersion(tx, user.id);

      return { transaction: txn, account: updatedAccount };
    });

    return jsonNoStore({
      success: true,
      transactionId: result.transaction.id,
      accountId: result.account.id,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
