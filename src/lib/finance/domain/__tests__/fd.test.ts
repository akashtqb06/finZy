import { describe, it, expect } from 'vitest';
import {
  calculateFDValue,
  calculateEffectiveYield,
  periodBoundaries,
  simulateDayByDayFD,
  calibrateFDRate,
  deriveFDMaturityDate,
  type FDConfig,
} from '../fd';

describe('Fixed Deposit Domain Engine (src/lib/finance/domain/fd.ts)', () => {
  const ONE_LAKH_PAISE = 10000000; // ₹1,00,000 in paise

  describe('Standard 1-Year FD (₹1,00,000 at 7.1% quarterly compounding)', () => {
    const config: FDConfig = {
      principal: ONE_LAKH_PAISE,
      ratePercent: 7.1,
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
      fdType: 'cumulative',
      compounding: 'quarterly',
      accrualMode: 'bank',
      dayCount: 'act_365',
    };

    it('calculates value at start date equal to principal', () => {
      const res = calculateFDValue(config, '2026-01-01');
      expect(res.currentValue).toBe(ONE_LAKH_PAISE);
      expect(res.interestAccrued).toBe(0);
    });

    it('calculates value after 6 months (2 quarters) within ₹0.50 of ₹1,03,581.51', () => {
      const res = calculateFDValue(config, '2026-07-01');
      const rupees = res.currentValue / 100;
      expect(rupees).toBeCloseTo(103581.51, 1);
    });

    it('calculates value after 1 year (maturity) within ₹0.50 of ₹1,07,291.28', () => {
      const res = calculateFDValue(config, '2027-01-01');
      const rupees = res.currentValue / 100;
      expect(rupees).toBeCloseTo(107291.28, 1);
      expect(res.projectedMaturityValue / 100).toBeCloseTo(107291.28, 1);
      expect(res.daysToMaturity).toBe(0);
    });

    it('calculates effective yield around 7.29%', () => {
      const yieldPct = calculateEffectiveYield(7.1, 'quarterly');
      expect(yieldPct).toBeCloseTo(7.29, 2);
      const res = calculateFDValue(config, '2026-01-01');
      expect(res.effectiveYieldPercent).toBeCloseTo(7.29, 2);
    });

    it('calculates 2-year value around ₹1,15,114 cross-checked against day-by-day simulation', () => {
      const twoYearConfig: FDConfig = {
        ...config,
        maturityDate: '2028-01-01',
      };
      const res = calculateFDValue(twoYearConfig, '2028-01-01');
      const rupees = res.currentValue / 100;
      expect(rupees).toBeCloseTo(115114, 0);

      const simValue = simulateDayByDayFD(twoYearConfig, '2028-01-01');
      expect(Math.abs(res.currentValue - simValue) / 100).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Compounding Frequencies against Simulation', () => {
    it('monthly compounding cross-checks against simulation within ₹1', () => {
      const cfg: FDConfig = {
        principal: ONE_LAKH_PAISE,
        ratePercent: 7.5,
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        compounding: 'monthly',
        accrualMode: 'bank',
      };
      const res = calculateFDValue(cfg, '2027-01-01');
      const sim = simulateDayByDayFD(cfg, '2027-01-01');
      expect(Math.abs(res.currentValue - sim) / 100).toBeLessThanOrEqual(1.0);
    });

    it('half-yearly compounding cross-checks against simulation within ₹1', () => {
      const cfg: FDConfig = {
        principal: ONE_LAKH_PAISE,
        ratePercent: 7.2,
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        compounding: 'half_yearly',
        accrualMode: 'bank',
      };
      const res = calculateFDValue(cfg, '2027-01-01');
      const sim = simulateDayByDayFD(cfg, '2027-01-01');
      expect(Math.abs(res.currentValue - sim) / 100).toBeLessThanOrEqual(1.0);
    });

    it('yearly compounding cross-checks against simulation within ₹1', () => {
      const cfg: FDConfig = {
        principal: ONE_LAKH_PAISE,
        ratePercent: 7.0,
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        compounding: 'yearly',
        accrualMode: 'bank',
      };
      const res = calculateFDValue(cfg, '2027-01-01');
      const sim = simulateDayByDayFD(cfg, '2027-01-01');
      expect(Math.abs(res.currentValue - sim) / 100).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Partial Periods & Accrual Modes (135 days)', () => {
    const config135: FDConfig = {
      principal: ONE_LAKH_PAISE,
      ratePercent: 7.1,
      startDate: '2026-01-01',
      maturityDate: '2026-05-16', // 135 days (Q1 90 days + 45 days)
      compounding: 'quarterly',
      accrualMode: 'bank',
    };

    it('calculates 135-day bank mode discrete accrual accurately', () => {
      const res = calculateFDValue(config135, '2026-05-16');
      // Q1 balance = 100000 * (1 + 0.071/4) = 101775
      // 45 days simple interest = 101775 * 0.071 * 45 / 365 = 890.87
      // Total = 102665.87
      expect(res.currentValue / 100).toBeCloseTo(102665.87, 1);
    });

    it('calculates 135-day smooth mode value', () => {
      const smoothConfig: FDConfig = {
        ...config135,
        accrualMode: 'smooth',
      };
      const res = calculateFDValue(smoothConfig, '2026-05-16');
      expect(res.currentValue).toBeGreaterThan(ONE_LAKH_PAISE);
      // P * (1 + r / (100 * n))^(n * 135 / 365) = 100000 * (1.01775)^(540/365) = 102637.17
      expect(res.currentValue / 100).toBeCloseTo(102637.17, 1);
    });
  });

  describe('Edge Cases', () => {
    it('handles zero rate without NaN or division by zero', () => {
      const zeroCfg: FDConfig = {
        principal: ONE_LAKH_PAISE,
        ratePercent: 0,
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
      };
      const res = calculateFDValue(zeroCfg, '2026-06-01');
      expect(res.currentValue).toBe(ONE_LAKH_PAISE);
      expect(res.interestAccrued).toBe(0);
      expect(res.dailyAccrual).toBe(0);
      expect(res.effectiveYieldPercent).toBe(0);
    });

    it('respects leap year day counts (2024 leap year spanning Feb 29)', () => {
      const leapCfg: FDConfig = {
        principal: ONE_LAKH_PAISE,
        ratePercent: 7.0,
        startDate: '2024-01-01',
        maturityDate: '2025-01-01',
        compounding: 'quarterly',
      };
      const bounds = periodBoundaries(leapCfg);
      // Period 1 spans 2024-01-01 to 2024-04-01 (91 days because of Feb 29)
      expect(bounds[0].days).toBe(91);
      expect(bounds[0].basis).toBe(366);
    });

    it('clamps month-end for start date on the 31st', () => {
      const clampCfg: FDConfig = {
        principal: ONE_LAKH_PAISE,
        ratePercent: 7.0,
        startDate: '2026-01-31',
        maturityDate: '2027-01-31',
        compounding: 'quarterly',
      };
      const bounds = periodBoundaries(clampCfg);
      expect(bounds[0].from).toBe('2026-01-31');
      expect(bounds[0].to).toBe('2026-04-30'); // April has 30 days
      expect(bounds[1].to).toBe('2026-07-31');
      expect(bounds[2].to).toBe('2026-10-31');
      expect(bounds[3].to).toBe('2027-01-31');
    });

    it('derives maturity date from tenure in years, months and days', () => {
      const mDate = deriveFDMaturityDate('2026-01-01', { years: 1, months: 2, days: 15 });
      expect(mDate).toBe('2027-03-16');
    });

    it('respects manual anchor mid-term and compounds forward without overwriting anchor', () => {
      const anchorCfg: FDConfig = {
        principal: ONE_LAKH_PAISE,
        ratePercent: 7.1,
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        manualAnchor: {
          date: '2026-07-01',
          value: 10400000, // manual bank balance of ₹1,04,000
        },
      };
      const atAnchor = calculateFDValue(anchorCfg, '2026-07-01');
      expect(atAnchor.currentValue).toBe(10400000);

      const afterAnchor = calculateFDValue(anchorCfg, '2026-10-01');
      expect(afterAnchor.currentValue).toBeGreaterThan(10400000);
    });
  });

  describe('Receipt Calibration (Bisection Solver)', () => {
    it('solves for implied annual rate that reproduces receipt amount to the paisa', () => {
      const receiptPaise = 10735000; // Bank printed ₹1,07,350.00
      const cfg: FDConfig = {
        principal: ONE_LAKH_PAISE,
        ratePercent: 7.1,
        startDate: '2026-01-01',
        maturityDate: '2027-01-01',
        maturityAmountPerReceipt: receiptPaise,
        compounding: 'quarterly',
      };

      const solvedRate = calibrateFDRate(cfg, receiptPaise);
      expect(solvedRate).toBeGreaterThan(7.1);

      const res = calculateFDValue(cfg, '2027-01-01');
      expect(res.currentValue).toBe(receiptPaise);
      expect(res.projectedMaturityValue).toBe(receiptPaise);
      expect(res.differenceFromReceiptPaise).toBe(receiptPaise - 10729128);
      expect(res.differenceFromReceiptText).toContain('differs by');
    });
  });

  describe('Payout Fixed Deposits', () => {
    const payoutCfg: FDConfig = {
      principal: ONE_LAKH_PAISE,
      ratePercent: 7.2,
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
      fdType: 'payout',
      payoutFrequency: 'quarterly',
      payoutAccountId: 'acc_bank_123',
    };

    it('keeps value equal to principal', () => {
      const resMid = calculateFDValue(payoutCfg, '2026-07-01');
      expect(resMid.currentValue).toBe(ONE_LAKH_PAISE);

      const resEnd = calculateFDValue(payoutCfg, '2027-01-01');
      expect(resEnd.currentValue).toBe(ONE_LAKH_PAISE);
    });

    it('generates quarterly payout schedule with correct periodic interest', () => {
      const res = calculateFDValue(payoutCfg, '2026-07-02');
      // Interest per quarter = 100000 * 7.2 / (100 * 4) = 1800 Rs = 180000 paise
      expect(res.payoutSchedule?.length).toBe(4);
      expect(res.payoutSchedule?.[0].amount).toBe(180000);
      expect(res.totalInterestPaidOut).toBe(360000); // 2 quarters paid out
      expect(res.nextPayoutDate).toBe('2026-10-01');
    });
  });
});
