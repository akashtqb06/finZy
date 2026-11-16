import { after } from 'next/server';
import { db, finUserSettings } from '@src/lib/db';
import { eq } from 'drizzle-orm';
import { todayInTz, DEFAULT_TZ } from '../timezone';
import { generateDueRecurringTransactions } from './generator';
import { incrementDataVersion } from '../db-service/sync';

/**
 * Checks if recurring generation has already run today for this user in their timezone.
 * If not, schedules `generateDueRecurringTransactions` via `after()` to run in the
 * background after the response is sent, updates `lastRecurringRunDate` and bumps `dataVersion`.
 */
export async function triggerLazyRecurringGeneration(userId: string): Promise<void> {
  try {
    const [settings] = await db
      .select({
        timezone: finUserSettings.timezone,
        lastRecurringRunDate: finUserSettings.lastRecurringRunDate,
      })
      .from(finUserSettings)
      .where(eq(finUserSettings.userId, userId))
      .limit(1);

    const tz = settings?.timezone || DEFAULT_TZ;
    const today = todayInTz(tz);

    if (settings?.lastRecurringRunDate === today) {
      return;
    }

    after(async () => {
      try {
        await generateDueRecurringTransactions({
          userId,
          asOfDate: today,
          backend: 'db',
        });

        await db.transaction(async (tx) => {
          await tx
            .insert(finUserSettings)
            .values({
              userId,
              lastRecurringRunDate: today,
            })
            .onConflictDoUpdate({
              target: [finUserSettings.userId],
              set: {
                lastRecurringRunDate: today,
                updatedAt: new Date(),
              },
            });

          await incrementDataVersion(tx, userId);
        });
      } catch (err) {
        console.error('[recurring/lazy] Error running lazy background generation:', err);
      }
    });
  } catch (err) {
    console.error('[recurring/lazy] Error checking lazy generation eligibility:', err);
  }
}

/** Backward-compatibility alias for route handlers */
export const catchUpRecurringRulesIfDue = triggerLazyRecurringGeneration;

