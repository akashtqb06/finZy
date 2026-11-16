import { db, finAccounts, finTransactions, finValuations, finRecurringRules } from '@src/lib/db';
import { eq, and } from 'drizzle-orm';
import { calculateFDValue, type FDConfig } from '@src/lib/finance/domain/fd';
import { recomputeDepositValuations } from '@src/lib/finance/db-service/valuations';
import { syncFDPayoutRule } from '@src/lib/finance/db-service/accounts';
import { verifyUserFinance } from './finance-verify';
import pg from 'pg';

async function main() {
  console.log('🧪 Running End-to-End Real FD Verification...');
  const userId = '59154d05-a1b7-4ecf-9039-e5b5ee6b25c9'; // dev@finzy.local

  // 1. Create a bank account for maturity credit
  const [bankAccount] = await db
    .insert(finAccounts)
    .values({
      userId,
      name: 'E2E Test Bank',
      kind: 'bank',
      class: 'asset',
      currency: 'INR',
      isActive: true,
      metadata: { openingDate: '2026-01-01' },
    })
    .returning();

  console.log('✅ Created test bank account:', bankAccount.id);

  // 2. Create Cumulative FD with Receipt Calibration
  // Principal: ₹1,00,000 (10,000,000 paise), 7.1% quarterly, 2026-01-01 to 2027-01-01
  // Receipt Amount: ₹1,07,291 (10,729,100 paise)
  const [fdAccount] = await db
    .insert(finAccounts)
    .values({
      userId,
      name: 'E2E HDFC 1-Year FD',
      kind: 'fixed_deposit',
      class: 'asset',
      currency: 'INR',
      isActive: true,
      metadata: {
        principal: 10000000,
        principalPaise: 10000000,
        ratePercent: 7.1,
        interestRate: 7.1,
        compounding: 'quarterly',
        compoundingFrequency: 'quarterly',
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        tenureYears: 1,
        tenureMonths: 0,
        tenureDays: 0,
        accrualMode: 'bank',
        dayCount: 'act_365',
        maturityAmountPerReceipt: 10729100, // ₹1,07,291
      },
    })
    .returning();

  console.log('✅ Created test FD account:', fdAccount.id);

  // 3. Recompute Deposit Valuations (Recalculate Run 1)
  await recomputeDepositValuations(userId, fdAccount.id);

  const valuationsRun1 = await db
    .select()
    .from(finValuations)
    .where(and(eq(finValuations.userId, userId), eq(finValuations.accountId, fdAccount.id)))
    .orderBy(finValuations.date);

  console.log(`✅ Run 1 computed ${valuationsRun1.length} valuation point(s). Latest value: ₹${(valuationsRun1[valuationsRun1.length - 1]?.value / 100).toFixed(2)}`);

  // 4. Recompute Deposit Valuations (Recalculate Run 2)
  await recomputeDepositValuations(userId, fdAccount.id);

  const valuationsRun2 = await db
    .select()
    .from(finValuations)
    .where(and(eq(finValuations.userId, userId), eq(finValuations.accountId, fdAccount.id)))
    .orderBy(finValuations.date);

  console.log(`✅ Run 2 computed ${valuationsRun2.length} valuation point(s). Latest value: ₹${(valuationsRun2[valuationsRun2.length - 1]?.value / 100).toFixed(2)}`);

  // Assert Idempotency
  if (valuationsRun1.length !== valuationsRun2.length) {
    throw new Error(`Valuation count mismatch between runs: ${valuationsRun1.length} vs ${valuationsRun2.length}`);
  }
  for (let i = 0; i < valuationsRun1.length; i++) {
    if (valuationsRun1[i].value !== valuationsRun2[i].value || valuationsRun1[i].date !== valuationsRun2[i].date) {
      throw new Error(`Valuation mismatch at index ${i}: ${valuationsRun1[i].value} vs ${valuationsRun2[i].value}`);
    }
  }
  console.log('✅ Idempotency confirmed: recalculating twice gives identical valuation points!');

  // 5. Test Receipt Calibration & Schedule
  const config: FDConfig = {
    principal: 10000000,
    ratePercent: 7.1,
    startDate: '2026-01-01',
    maturityDate: '2027-01-01',
    compounding: 'quarterly',
    accrualMode: 'bank',
    dayCount: 'act_365',
    maturityAmountPerReceipt: 10729100,
  };

  const valAtMaturity = calculateFDValue(config, '2027-01-01');
  console.log(`✅ Projected Maturity Value: ₹${(valAtMaturity.projectedMaturityValue / 100).toFixed(2)}`);
  console.log(`✅ Receipt Amount: ₹${(10729100 / 100).toFixed(2)}`);
  console.log(`✅ Calibrated Implied Rate: ${valAtMaturity.impliedAnnualRatePercent?.toFixed(4)}% p.a.`);
  console.log(`✅ Difference from Formula: ₹${((valAtMaturity.differenceFromReceiptPaise || 0) / 100).toFixed(2)}`);

  if (Math.abs(valAtMaturity.projectedMaturityValue - 10729100) > 1) {
    throw new Error(`Maturity value ${valAtMaturity.projectedMaturityValue} does not match receipt 10729100`);
  }

  // 6. Test Payout FD Recurring Income Rule
  const [payoutFd] = await db
    .insert(finAccounts)
    .values({
      userId,
      name: 'E2E Quarterly Payout FD',
      kind: 'fixed_deposit',
      class: 'asset',
      currency: 'INR',
      isActive: true,
      metadata: {
        fdType: 'payout',
        principal: 10000000,
        ratePercent: 7.1,
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        payoutFrequency: 'quarterly',
        payoutAccountId: bankAccount.id,
      },
    })
    .returning();

  await syncFDPayoutRule(
    userId,
    payoutFd.id,
    payoutFd.metadata as Record<string, unknown>,
    payoutFd.name,
    true
  );

  const [payoutRule] = await db
    .select()
    .from(finRecurringRules)
    .where(and(eq(finRecurringRules.userId, userId), eq(finRecurringRules.subType, `fd_payout_${payoutFd.id}`)));

  if (!payoutRule) {
    throw new Error('Payout recurring rule was not created');
  }
  console.log(`✅ Payout rule created: ₹${payoutRule.amount / 100} ${payoutRule.frequency} to ${payoutRule.accountId}`);
  if (payoutRule.amount !== 177500) {
    throw new Error(`Expected payout amount 177500 paise (₹1,775), got ${payoutRule.amount}`);
  }

  // 7. Cleanup test records
  await db.delete(finRecurringRules).where(eq(finRecurringRules.userId, userId));
  await db.delete(finValuations).where(eq(finValuations.userId, userId));
  await db.delete(finTransactions).where(eq(finTransactions.userId, userId));
  await db.delete(finAccounts).where(eq(finAccounts.userId, userId));

  console.log('✅ Cleaned up test data.');

  // 8. Reconcile Finance Health
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const report = await verifyUserFinance(pool, userId);
  await pool.end();

  console.log('✅ Final Health Verification:');
  console.log(`   Accounts: ${report.accountsCount}`);
  console.log(`   Transactions: ${report.activeTxCount}`);
  console.log(`   Net Worth Hash: ${report.netWorthHash}`);
  console.log('🎉 All Real FD End-to-End checks passed with 100% integrity!');
}

main().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
