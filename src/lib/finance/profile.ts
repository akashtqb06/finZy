import { eq, or } from 'drizzle-orm';
import { db } from '../db';
import { finCategories, finUserSettings, profiles } from '../db/schema';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from './constants';
import { getDeterministicCategoryColor } from './colors';
import { newId } from '../db/id';

export interface AuthUser {
  id: string;
  email?: string | null;
  displayName?: string | null;
  user_metadata?: {
    name?: string;
    full_name?: string;
    display_name?: string;
  } | null;
}

/**
 * Idempotent lazy provisioning on the first authenticated request:
 * - profile row
 * - fin_user_settings defaults (baseCurrency: INR, timezone: Asia/Kolkata, dataVersion: 1)
 * - default categories with colors
 */
export async function ensureProfile(authUser: AuthUser): Promise<void> {
  const now = new Date();
  const displayName =
    authUser.displayName ||
    authUser.user_metadata?.full_name ||
    authUser.user_metadata?.name ||
    authUser.user_metadata?.display_name ||
    (authUser.email ? authUser.email.split('@')[0] : 'User');

  // 1. Ensure profiles row exists
  await db
    .insert(profiles)
    .values({
      id: authUser.id,
      displayName,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  // 2. Ensure fin_user_settings defaults exist
  await db
    .insert(finUserSettings)
    .values({
      userId: authUser.id,
      baseCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      weekStartsOn: 1,
      includeEpsInNetWorth: false,
      includeAccruedInterestInNetWorth: false,
      setupStep: 1,
      dataVersion: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  // 3. Ensure default categories with colors exist for this user
  const userCategories = await db
    .select({ name: finCategories.name })
    .from(finCategories)
    .where(or(eq(finCategories.userId, authUser.id), eq(finCategories.isSystem, true)));

  const existingNames = new Set(userCategories.map((c) => c.name));

  const missingExpenses = DEFAULT_EXPENSE_CATEGORIES.filter((name) => !existingNames.has(name)).map(
    (name) => ({
      id: newId(),
      userId: authUser.id,
      name,
      type: 'expense' as const,
      color: getDeterministicCategoryColor(name),
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    })
  );

  const missingIncomes = DEFAULT_INCOME_CATEGORIES.filter((name) => !existingNames.has(name)).map(
    (name) => ({
      id: newId(),
      userId: authUser.id,
      name,
      type: 'income' as const,
      color: getDeterministicCategoryColor(name),
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    })
  );

  const allMissing = [...missingExpenses, ...missingIncomes];
  if (allMissing.length > 0) {
    await db.insert(finCategories).values(allMissing).onConflictDoNothing();
  }
}
