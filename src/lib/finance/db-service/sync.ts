import { sql, eq } from 'drizzle-orm';
import { db, finUserSettings } from '@src/lib/db';
import type { AppDb } from '@src/lib/db/client';

type TransactionContext = Parameters<Parameters<AppDb['transaction']>[0]>[0];

/**
 * Increments fin_user_settings.data_version inside the caller's transaction.
 * Uses ON CONFLICT to ensure the row exists and increments atomically.
 */
export async function incrementDataVersion(
  tx: TransactionContext,
  userId: string
): Promise<number> {
  const [row] = await tx
    .insert(finUserSettings)
    .values({
      userId,
      dataVersion: 2,
    })
    .onConflictDoUpdate({
      target: [finUserSettings.userId],
      set: {
        dataVersion: sql`${finUserSettings.dataVersion} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ dataVersion: finUserSettings.dataVersion });

  return Number(row?.dataVersion ?? 1);
}

/**
 * Fetches the current dataVersion for a user.
 */
export async function getDataVersion(userId: string): Promise<number> {
  const [row] = await db
    .select({ dataVersion: finUserSettings.dataVersion })
    .from(finUserSettings)
    .where(eq(finUserSettings.userId, userId))
    .limit(1);

  return Number(row?.dataVersion ?? 1);
}
