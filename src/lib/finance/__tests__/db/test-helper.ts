import { sql } from 'drizzle-orm';
import { db, finCategories, profiles, resetConnection } from '@src/lib/db';
import { runMigrations } from '@src/lib/db/migrate';
import { newId } from '@src/lib/db/id';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../constants';
import { DbFinanceService } from '../../db-service';
import { ensureProfile } from '../../profile';

export const USER_A = 'a0000000-0000-4000-a000-000000000001';
export const USER_B = 'b0000000-0000-4000-b000-000000000002';

export async function setupFinanceTestDb(): Promise<DbFinanceService> {
  // Ensure isolated PGlite instance
  resetConnection();
  await runMigrations();

  // Seed auth.users if auth schema exists
  try {
    await db.execute(sql`
      INSERT INTO auth.users (id, email)
      VALUES 
        (${USER_A}::uuid, 'user_a@example.com'),
        (${USER_B}::uuid, 'user_b@example.com')
      ON CONFLICT DO NOTHING;
    `);
  } catch {}

  // Seed default system categories first
  const expenseValues = DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
    id: newId(),
    name,
    type: 'expense' as const,
    isSystem: true,
    userId: null,
  }));

  const incomeValues = DEFAULT_INCOME_CATEGORIES.map((name) => ({
    id: newId(),
    name,
    type: 'income' as const,
    isSystem: true,
    userId: null,
  }));

  await db
    .insert(finCategories)
    .values([...expenseValues, ...incomeValues])
    .onConflictDoNothing();

  // Seed test profiles and lazy defaults
  await db
    .insert(profiles)
    .values([
      {
        id: USER_A,
        displayName: 'User A',
      },
      {
        id: USER_B,
        displayName: 'User B',
      },
    ])
    .onConflictDoNothing();

  await ensureProfile({ id: USER_A, email: 'user_a@example.com' });
  await ensureProfile({ id: USER_B, email: 'user_b@example.com' });

  return new DbFinanceService();
}
