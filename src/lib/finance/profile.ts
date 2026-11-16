import { eq } from 'drizzle-orm';
import { db } from '../db';
import { finCategories, finUserSettings } from '../db/schema/finance';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from './constants';
import { getDeterministicCategoryColor } from './colors';
import { newId } from '../db/id';

export interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata?: {
    name?: string;
    full_name?: string;
    display_name?: string;
  } | null;
}

/**
 * Idempotent lazy provisioning on authenticated request:
 * - ensures profile row
 * - ensures fin_user_settings defaults
 * - ensures default categories with colors
 */
export async function ensureProfile(authUser: AuthUser): Promise<void> {
  const now = new Date();

  // 1. Ensure user settings exist
  const existingSettings = await db
    .select({ userId: finUserSettings.userId })
    .from(finUserSettings)
    .where(eq(finUserSettings.userId, authUser.id))
    .limit(1);

  if (existingSettings.length === 0) {
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
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  // 2. Ensure default categories with deterministic colors exist for this user
  const userCategories = await db
    .select({ name: finCategories.name })
    .from(finCategories)
    .where(eq(finCategories.userId, authUser.id));

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
