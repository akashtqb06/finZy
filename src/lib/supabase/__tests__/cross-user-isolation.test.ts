import { describe, it, expect, beforeEach } from 'vitest';
import { setupFinanceTestDb, USER_A, USER_B } from '@src/lib/finance/__tests__/db/test-helper';
import { db, finAccounts, finTransactions, finBudgets, finRecurringRules, finCategories } from '@src/lib/db';
import { eq } from 'drizzle-orm';
import type { DbFinanceService } from '@src/lib/finance/db-service';

describe('Cross-user isolation security test', () => {
    let service: DbFinanceService;

    beforeEach(async () => {
        service = await setupFinanceTestDb();
        // Clean up test data for User A and User B
        await db.delete(finTransactions).where(eq(finTransactions.userId, USER_A));
        await db.delete(finTransactions).where(eq(finTransactions.userId, USER_B));
        await db.delete(finRecurringRules).where(eq(finRecurringRules.userId, USER_A));
        await db.delete(finRecurringRules).where(eq(finRecurringRules.userId, USER_B));
        await db.delete(finBudgets).where(eq(finBudgets.userId, USER_A));
        await db.delete(finBudgets).where(eq(finBudgets.userId, USER_B));
        await db.delete(finAccounts).where(eq(finAccounts.userId, USER_A));
        await db.delete(finAccounts).where(eq(finAccounts.userId, USER_B));
    });

    it('strictly isolates accounts between User A and User B', async () => {
        const accountA = await service.createAccount(USER_A, {
            name: 'User A Secret Savings',
            kind: 'bank',
            currency: 'INR',
        });

        // User B cannot see User A's account in list
        const userBAccounts = await service.listAccounts(USER_B);
        expect(userBAccounts.find((a) => a.id === accountA.id)).toBeUndefined();

        // User B cannot fetch User A's account directly (throws NotFoundError)
        await expect(service.getAccount(USER_B, accountA.id)).rejects.toThrow();

        // User B cannot update User A's account
        await expect(
            service.updateAccount(USER_B, accountA.id, { name: 'Hacked Name' })
        ).rejects.toThrow();

        // User B cannot delete User A's account
        await expect(service.deleteAccount(USER_B, accountA.id)).rejects.toThrow();

        // Verify User A's account is completely unchanged
        const verified = await service.getAccount(USER_A, accountA.id);
        expect(verified?.name).toBe('User A Secret Savings');
    });

    it('strictly isolates transactions and net worth between User A and User B', async () => {
        const accountA = await service.createAccount(USER_A, {
            name: 'User A Bank',
            kind: 'bank',
            currency: 'INR',
        });

        const txA = await service.createTransaction(USER_A, {
            accountId: accountA.id,
            amount: 5000000, // ₹50,000
            type: 'income',
            date: '2026-11-01',
            note: 'Confidential Salary',
        });

        // User B cannot list User A's transactions
        const userBTxList = await service.listTransactions(USER_B, {});
        expect(userBTxList.transactions.find((t) => t.id === txA.id)).toBeUndefined();

        // User B overview stats reflect zero
        const statsB = await service.getOverviewStats(USER_B);
        expect(statsB.netWorth).toBe(0);
        expect(statsB.totalAssets).toBe(0);

        // User A overview stats reflect User A's data
        const statsA = await service.getOverviewStats(USER_A);
        expect(statsA.netWorth).toBe(5000000);
    });

    it('strictly isolates budgets between User A and User B', async () => {
        const [categoryA] = await db
            .select()
            .from(finCategories)
            .where(eq(finCategories.userId, USER_A))
            .limit(1);

        if (!categoryA) {
            // Provision a category if none exists
            await service.createCategory(USER_A, { name: 'Groceries', type: 'expense' });
        }
        const categories = await service.listCategories(USER_A);
        const catId = categories[0].id;

        const budgetA = await service.createBudget(USER_A, {
            period: 'monthly',
            startDate: '2026-11-01',
            categoryId: catId,
            amount: 2500000, // ₹25,000
        });

        // User B cannot list User A's budgets
        const resultB = await service.listBudgets(USER_B, { period: 'monthly' });
        expect(resultB.budgets.find((b) => b.id === budgetA.id)).toBeUndefined();

        // User B cannot update User A's budget
        await expect(
            service.updateBudget(USER_B, budgetA.id, { amount: 100 })
        ).rejects.toThrow();

        // User B cannot delete User A's budget
        await expect(service.deleteBudget(USER_B, budgetA.id)).rejects.toThrow();
    });
});
