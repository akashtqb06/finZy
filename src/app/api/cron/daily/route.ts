import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { assertCronAuthorized } from '@src/lib/finance/cron-auth';
import { db, profiles, finJobRuns, finUserSettings } from '@src/lib/db';
import { generateDueRecurringTransactions, getUserTimezone } from '@src/lib/finance/recurring';
import { recomputeDepositValuations } from '@src/lib/finance/db-service/valuations';
import { todayInTz } from '@src/lib/finance/timezone';
import { eq, sql } from 'drizzle-orm';

export const maxDuration = 60;

export async function handleDailyCron(request: Request) {
  try {
    assertCronAuthorized(request);

    const startedAt = new Date();
    let jobRunId: string | undefined;

    try {
      const [jobRun] = await db
        .insert(finJobRuns)
        .values({
          job: 'daily',
          startedAt,
          status: 'running',
          usersProcessed: 0,
          created: 0,
          errorCount: 0,
        })
        .returning();
      jobRunId = jobRun?.id;
    } catch (insertErr) {
      console.error('[cron/daily] Failed to create fin_job_runs row:', insertErr);
    }

    const startTime = Date.now();
    const TIME_BUDGET_MS = 50_000;

    const allProfiles = await db
      .select({ id: profiles.id })
      .from(profiles);

    let usersProcessed = 0;
    let totalCreated = 0;
    let errorCount = 0;

    const BATCH_SIZE = 20;
    for (let i = 0; i < allProfiles.length; i += BATCH_SIZE) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        console.warn(`[cron/daily] Time budget reached (${TIME_BUDGET_MS}ms). Stopping early.`);
        break;
      }

      const batch = allProfiles.slice(i, i + BATCH_SIZE);
      for (const profile of batch) {
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          break;
        }

        try {
          const userId = profile.id;
          const tz = await getUserTimezone(userId);
          const today = todayInTz(tz);

          // 1. Generate due recurring items
          const res = await generateDueRecurringTransactions({
            userId,
            asOfDate: today,
            backend: 'db',
          });
          totalCreated += res.created;

          // 2. Recompute valuation estimates (deposits, PF, etc.)
          try {
            await recomputeDepositValuations(userId);
          } catch (valErr) {
            console.error(`[cron/daily] Valuation recompute failed for user ${userId}:`, valErr);
          }

          // 3. Keepalive query
          await db.execute(sql`SELECT 1`);

          // 4. Update user settings with lastRecurringRunDate
          await db
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

          usersProcessed++;
        } catch (userErr) {
          errorCount++;
          console.error(`[cron/daily] Error processing user ${profile.id}:`, userErr);
        }
      }
    }

    const finishedAt = new Date();
    const status = errorCount === 0 || usersProcessed > 0 ? 'completed' : 'failed';

    if (jobRunId) {
      try {
        await db
          .update(finJobRuns)
          .set({
            finishedAt,
            status,
            usersProcessed,
            created: totalCreated,
            errorCount,
          })
          .where(eq(finJobRuns.id, jobRunId));
      } catch (updateErr) {
        console.error('[cron/daily] Failed to update fin_job_runs status:', updateErr);
      }
    }

    return NextResponse.json({
      success: true,
      jobId: jobRunId,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      timestamp: finishedAt.toISOString(),
      usersProcessed,
      processed: usersProcessed,
      created: totalCreated,
      generated: totalCreated,
      errorCount,
      status,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(request: NextRequest) {
  return handleDailyCron(request);
}

export async function POST(request: NextRequest) {
  return handleDailyCron(request);
}
