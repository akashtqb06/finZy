import { beforeEach, describe, expect, it } from 'vitest';
import { setupFinanceTestDb, USER_A, USER_B } from './test-helper';
import type { DbFinanceService } from '../../db-service';
import { getDataVersion } from '../../db-service/sync';
import { ConflictError } from '@src/lib/auth/policy';

describe('Cross-Device Freshness (dataVersion) & Concurrency Safety', () => {
  let service: DbFinanceService;

  beforeEach(async () => {
    service = await setupFinanceTestDb();
  });

  describe('dataVersion monotonic increment in writes', () => {
    it('increments dataVersion on account creation, update, and deletion', async () => {
      const v0 = await getDataVersion(USER_A);

      // Create account
      const account = await service.createAccount(USER_A, {
        name: 'HDFC Savings',
        kind: 'bank',
        currency: 'INR',
      });
      const v1 = await getDataVersion(USER_A);
      expect(v1).toBeGreaterThan(v0);

      // Update account
      await service.updateAccount(USER_A, account.id, {
        name: 'HDFC Salary Account',
      });
      const v2 = await getDataVersion(USER_A);
      expect(v2).toBeGreaterThan(v1);

      // Delete account
      await service.deleteAccount(USER_A, account.id);
      const v3 = await getDataVersion(USER_A);
      expect(v3).toBeGreaterThan(v2);
    });

    it('increments dataVersion on transaction creation, update, and deletion', async () => {
      const account = await service.createAccount(USER_A, {
        name: 'ICICI Bank',
        kind: 'bank',
      });
      const vStart = await getDataVersion(USER_A);

      // Create transaction
      const tx = await service.createTransaction(USER_A, {
        accountId: account.id,
        date: '2026-11-01',
        type: 'expense',
        amount: 50000,
        payee: 'Grocery Store',
      });
      const v1 = await getDataVersion(USER_A);
      expect(v1).toBeGreaterThan(vStart);

      // Update transaction
      await service.updateTransaction(USER_A, tx.id, {
        amount: 60000,
      });
      const v2 = await getDataVersion(USER_A);
      expect(v2).toBeGreaterThan(v1);

      // Delete transaction
      await service.deleteTransaction(USER_A, tx.id);
      const v3 = await getDataVersion(USER_A);
      expect(v3).toBeGreaterThan(v2);
    });

    it('increments dataVersion for valuations', async () => {
      const investment = await service.createAccount(USER_A, {
        name: 'Zerodha Kite',
        kind: 'stocks',
      });
      const vStart = await getDataVersion(USER_A);

      await service.createValuation(USER_A, {
        accountId: investment.id,
        date: '2026-11-01',
        value: 15000000,
      });
      const v1 = await getDataVersion(USER_A);
      expect(v1).toBeGreaterThan(vStart);
    });

    it('scopes dataVersion strictly per user tenant', async () => {
      const vA0 = await getDataVersion(USER_A);
      const vB0 = await getDataVersion(USER_B);

      // User A creates an account
      await service.createAccount(USER_A, {
        name: 'User A Wallet',
        kind: 'wallet',
      });

      const vA1 = await getDataVersion(USER_A);
      const vB1 = await getDataVersion(USER_B);

      expect(vA1).toBeGreaterThan(vA0);
      expect(vB1).toBe(vB0); // User B's dataVersion remains unchanged
    });
  });

  describe('Optimistic Concurrency Control (Conflict Safety)', () => {
    it('initializes records with version = 1', async () => {
      const account = await service.createAccount(USER_A, {
        name: 'Axis Bank',
        kind: 'bank',
      });
      expect(account.version).toBe(1);

      const tx = await service.createTransaction(USER_A, {
        accountId: account.id,
        date: '2026-11-01',
        type: 'income',
        amount: 1000000,
        payee: 'Salary',
      });
      expect(tx.version).toBe(1);
    });

    it('increments entity version on update', async () => {
      const account = await service.createAccount(USER_A, {
        name: 'SBI Bank',
        kind: 'bank',
      });
      expect(account.version).toBe(1);

      const updated = await service.updateAccount(USER_A, account.id, {
        name: 'SBI Main Branch',
        expectedVersion: 1,
      });
      expect(updated.version).toBe(2);

      const tx = await service.createTransaction(USER_A, {
        accountId: account.id,
        date: '2026-11-01',
        type: 'expense',
        amount: 25000,
      });
      expect(tx.version).toBe(1);

      const updatedTx = await service.updateTransaction(USER_A, tx.id, {
        amount: 30000,
        expectedVersion: 1,
      });
      expect(updatedTx.version).toBe(2);
    });

    it('throws ConflictError with 409 and currentRecord on expectedVersion mismatch during update', async () => {
      const account = await service.createAccount(USER_A, {
        name: 'Kotak Bank',
        kind: 'bank',
      });

      const tx = await service.createTransaction(USER_A, {
        accountId: account.id,
        date: '2026-11-01',
        type: 'expense',
        amount: 10000,
        note: 'Device A and B both open this record',
      });

      // Device A updates the transaction (version becomes 2)
      await service.updateTransaction(USER_A, tx.id, {
        note: 'Saved from Device A',
        expectedVersion: 1,
      });

      // Device B attempts to update with stale expectedVersion: 1
      try {
        await service.updateTransaction(USER_A, tx.id, {
          note: 'Saved from Device B',
          expectedVersion: 1,
        });
        expect.fail('Should have thrown ConflictError');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictError);
        const conflict = err as ConflictError;
        expect(conflict.statusCode).toBe(409);
        expect(conflict.currentRecord).toBeDefined();
        const cur = conflict.currentRecord as { version: number; note: string };
        expect(cur.version).toBe(2);
        expect(cur.note).toBe('Saved from Device A');
      }
    });

    it('throws ConflictError on delete with outdated expectedVersion', async () => {
      const account = await service.createAccount(USER_A, {
        name: 'Canara Bank',
        kind: 'bank',
      });

      const tx = await service.createTransaction(USER_A, {
        accountId: account.id,
        date: '2026-11-01',
        type: 'expense',
        amount: 10000,
      });

      // Someone modified it
      await service.updateTransaction(USER_A, tx.id, {
        amount: 12000,
        expectedVersion: 1,
      });

      // Attempt delete with stale version 1
      await expect(
        service.deleteTransaction(USER_A, tx.id, 1)
      ).rejects.toThrow(ConflictError);

      // Deleting with matching expectedVersion 2 succeeds
      await service.deleteTransaction(USER_A, tx.id, 2);
    });

    it('supports Overwrite flow by passing the newly returned conflict version', async () => {
      const account = await service.createAccount(USER_A, {
        name: 'IndusInd Bank',
        kind: 'bank',
      });

      const tx = await service.createTransaction(USER_A, {
        accountId: account.id,
        date: '2026-11-01',
        type: 'expense',
        amount: 10000,
      });

      // Device A updates it
      await service.updateTransaction(USER_A, tx.id, {
        amount: 15000,
        expectedVersion: 1,
      });

      // Device B hits 409 conflict
      let conflictRecord: { version: number } | null = null;
      try {
        await service.updateTransaction(USER_A, tx.id, {
          amount: 20000,
          expectedVersion: 1,
        });
      } catch (err) {
        if (err instanceof ConflictError) {
          conflictRecord = err.currentRecord as { version: number };
        }
      }

      expect(conflictRecord).not.toBeNull();
      expect(conflictRecord?.version).toBe(2);

      // Overwrite: Device B submits again with expectedVersion: conflictRecord.version (2)
      const overwritten = await service.updateTransaction(USER_A, tx.id, {
        amount: 20000,
        expectedVersion: conflictRecord!.version,
      });

      expect(overwritten.amount).toBe(20000);
      expect(overwritten.version).toBe(3);
    });
  });

  describe('Quick Add Idempotency via clientRequestId', () => {
    it('returns the existing record when same clientRequestId is used', async () => {
      const account = await service.createAccount(USER_A, {
        name: 'Yes Bank',
        kind: 'bank',
      });

      const clientRequestId = 'client-req-unique-12345';

      const first = await service.createTransaction(
        USER_A,
        {
          accountId: account.id,
          date: '2026-11-01',
          type: 'expense',
          amount: 7500,
          payee: 'Coffee Shop',
          clientRequestId,
        },
        { clientRequestId }
      );

      const second = await service.createTransaction(
        USER_A,
        {
          accountId: account.id,
          date: '2026-11-01',
          type: 'expense',
          amount: 7500,
          payee: 'Coffee Shop',
          clientRequestId,
        },
        { clientRequestId }
      );

      expect(first.id).toBe(second.id);
      expect(first.clientRequestId).toBe(clientRequestId);
    });
  });
});
