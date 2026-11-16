import { addMonthsToDate } from './deposits';

export type FDType = 'cumulative' | 'payout';
export type FDCompounding = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
export type FDAccrualMode = 'bank' | 'smooth';
export type FDDayCount = 'act_365';
export type FDPayoutFrequency = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'at_maturity';

export interface FDConfig {
  principal: number; // in integer paise (e.g. 10000000 for ₹1,00,000)
  ratePercent: number; // annual nominal percent (e.g. 7.1 for 7.1%)
  startDate: string; // YYYY-MM-DD
  maturityDate: string; // YYYY-MM-DD
  fdType?: FDType; // default 'cumulative'
  compounding?: FDCompounding; // default 'quarterly' (cumulative only)
  accrualMode?: FDAccrualMode; // default 'bank'
  dayCount?: FDDayCount; // default 'act_365'
  maturityAmountPerReceipt?: number; // optional, paise
  manualAnchor?: {
    date: string; // YYYY-MM-DD
    value: number; // in paise
  };
  payoutFrequency?: FDPayoutFrequency; // for payout FDs
  payoutAccountId?: string | null;
  renewal?: string | null;
  notes?: string | null;
}

export interface FDScheduleItem {
  period: number;
  from: string;
  to: string;
  openingBalance: number; // paise
  interest: number; // paise
  closingBalance: number; // paise
  days: number;
  isPartial: boolean;
}

export interface FDPayoutScheduleItem {
  period: number;
  date: string;
  amount: number; // paise
  isPaid: boolean;
}

export interface FDValuationResult {
  currentValue: number; // paise
  interestAccrued: number; // currentValue - principal (paise)
  dailyAccrual: number; // value tomorrow - value today (paise)
  effectiveYieldPercent: number; // ((1 + r / (100 * n))^n - 1) * 100
  projectedMaturityValue: number; // paise
  maturityDate: string;
  daysToMaturity: number;
  nextCompoundingDate: string | null;
  nextPayoutDate?: string | null;
  totalInterestPaidOut?: number; // paise (payout FDs)
  impliedAnnualRatePercent?: number; // calibrated rate
  differenceFromReceiptPaise?: number; // receipt - formula
  differenceFromReceiptText?: string;
  schedule: FDScheduleItem[];
  payoutSchedule?: FDPayoutScheduleItem[];
}

/**
 * Returns number of compounding periods per year n.
 */
export function getCompoundingCount(compounding: FDCompounding = 'quarterly'): number {
  switch (compounding) {
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'half_yearly':
      return 2;
    case 'yearly':
      return 1;
    default:
      return 4;
  }
}

/**
 * Returns number of payouts per year for payout FDs.
 */
export function getPayoutFrequencyCount(freq: FDPayoutFrequency = 'quarterly'): number {
  switch (freq) {
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'half_yearly':
      return 2;
    case 'yearly':
      return 1;
    case 'at_maturity':
      return 1;
    default:
      return 4;
  }
}

/**
 * Computes calendar difference in days between two YYYY-MM-DD strings.
 */
export function diffDays(startDate: string, endDate: string): number {
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const utcA = Date.UTC(y1, m1 - 1, d1);
  const utcB = Date.UTC(y2, m2 - 1, d2);
  return Math.round((utcB - utcA) / (86400 * 1000));
}

/**
 * Adds exact days to a YYYY-MM-DD date.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d) + days * 86400 * 1000;
  const res = new Date(utc);
  return res.toISOString().slice(0, 10);
}

/**
 * Checks whether the period between two dates contains a leap day (Feb 29)
 * or if a 1-year period spans 366 days.
 */
export function getPeriodDayBasis(from: string, to: string): number {
  const [y1] = from.split('-').map(Number);
  const [y2] = to.split('-').map(Number);
  // Check if any leap day (Feb 29) falls in the interval [from, to]
  for (let year = y1; year <= y2; year++) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (isLeap) {
      const feb29 = `${year}-02-29`;
      if (feb29 >= from && feb29 <= to) {
        return 366;
      }
    }
  }
  return 365;
}

/**
 * Derives a maturity date given a start date and tenure components.
 */
export function deriveFDMaturityDate(
  startDate: string,
  tenure: { years?: number; months?: number; days?: number }
): string {
  const totalMonths = (tenure.years || 0) * 12 + (tenure.months || 0);
  let cur = totalMonths > 0 ? addMonthsToDate(startDate, totalMonths) : startDate;
  if (tenure.days && tenure.days > 0) {
    cur = addDays(cur, tenure.days);
  }
  return cur;
}

/**
 * Calculates effective annual yield percent:
 * ((1 + r / (100 * n))^n - 1) * 100
 */
export function calculateEffectiveYield(nominalRatePercent: number, compounding: FDCompounding = 'quarterly'): number {
  if (nominalRatePercent <= 0) return 0;
  const n = getCompoundingCount(compounding);
  const effective = (Math.pow(1 + nominalRatePercent / (100 * n), n) - 1) * 100;
  return Number(effective.toFixed(4));
}

/**
 * Computes compounding period boundaries from startDate up to maturityDate.
 * Boundaries are anchored at startDate + k * (12 / n) months with day-of-month clamping.
 * If maturityDate is after the last whole boundary, it forms the final (partial) period.
 */
export function periodBoundaries(config: {
  startDate: string;
  maturityDate: string;
  compounding?: FDCompounding;
}): Array<{ period: number; from: string; to: string; days: number; basis: number; isPartial: boolean }> {
  const { startDate, maturityDate } = config;
  if (maturityDate <= startDate) {
    return [];
  }

  const compounding = config.compounding || 'quarterly';
  const n = getCompoundingCount(compounding);
  const stepMonths = 12 / n;

  const boundaries: string[] = [startDate];
  let k = 1;
  while (true) {
    const nextDate = addMonthsToDate(startDate, k * stepMonths);
    if (nextDate >= maturityDate) {
      if (boundaries[boundaries.length - 1] !== maturityDate) {
        boundaries.push(maturityDate);
      }
      break;
    }
    boundaries.push(nextDate);
    k++;
  }

  const result: Array<{ period: number; from: string; to: string; days: number; basis: number; isPartial: boolean }> = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i];
    const to = boundaries[i + 1];
    const days = diffDays(from, to);
    const expectedStepEnd = addMonthsToDate(from, stepMonths);
    const isPartial = to !== expectedStepEnd;
    const basis = getPeriodDayBasis(from, to);
    result.push({
      period: i + 1,
      from,
      to,
      days,
      basis,
      isPartial,
    });
  }

  return result;
}

/**
 * Solves for the annual nominal interest rate percent that yields targetMaturityAmount
 * using bisection search with 0.01 rupee (1 paisa) tolerance.
 */
export function calibrateFDRate(config: FDConfig, targetMaturityAmount: number): number {
  if (targetMaturityAmount <= config.principal || config.maturityDate <= config.startDate) {
    return config.ratePercent;
  }

  const baseConfig = { ...config, maturityAmountPerReceipt: undefined };
  let low = 0.001;
  let high = 100.0;
  const tolerancePaise = 0.1; // Sub-paisa precision

  // Ensure high bound is high enough
  let highVal = computeFDRawValue({ ...baseConfig, ratePercent: high }, config.maturityDate);
  while (highVal < targetMaturityAmount && high < 500) {
    high *= 2;
    highVal = computeFDRawValue({ ...baseConfig, ratePercent: high }, config.maturityDate);
  }

  for (let iter = 0; iter < 80; iter++) {
    const mid = (low + high) / 2;
    const val = computeFDRawValue({ ...baseConfig, ratePercent: mid }, config.maturityDate);
    const diff = val - targetMaturityAmount;

    if (Math.abs(diff) <= tolerancePaise || (high - low) < 1e-9) {
      return Number(mid.toFixed(6));
    }

    if (val < targetMaturityAmount) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return Number(((low + high) / 2).toFixed(6));
}

/**
 * Internal raw value calculator at date d (returns precise float in paise).
 */
function computeFDRawValue(config: FDConfig, asOfDate: string): number {
  const { principal, ratePercent, startDate, maturityDate } = config;
  const accrualMode = config.accrualMode || 'bank';
  const compounding = config.compounding || 'quarterly';
  const n = getCompoundingCount(compounding);

  const effectiveAsOf = asOfDate < startDate ? startDate : asOfDate > maturityDate ? maturityDate : asOfDate;
  if (effectiveAsOf <= startDate) {
    return principal;
  }

  if (ratePercent <= 0) {
    return principal;
  }

  // Smooth mode
  if (accrualMode === 'smooth') {
    const totalDays = diffDays(startDate, effectiveAsOf);
    return principal * Math.pow(1 + ratePercent / (100 * n), n * totalDays / 365.0);
  }

  // Bank mode: discrete periods + simple interest on in-progress period
  const periods = periodBoundaries({ startDate, maturityDate, compounding });
  let balance = principal;

  for (const p of periods) {
    if (effectiveAsOf <= p.from) {
      break;
    }

    if (effectiveAsOf >= p.to) {
      // Whole period completed
      if (p.isPartial) {
        // Partial final period earns simple interest in bank mode
        const periodInterest = balance * (ratePercent / 100) * (p.days / p.basis);
        balance += periodInterest;
      } else {
        // Full compounding period
        balance = balance * (1 + ratePercent / (100 * n));
      }
    } else {
      // In-progress period: simple interest for elapsed days
      const elapsedDays = diffDays(p.from, effectiveAsOf);
      const inProgressInterest = balance * (ratePercent / 100) * (elapsedDays / p.basis);
      return balance + inProgressInterest;
    }
  }

  return balance;
}

/**
 * Pure domain function to evaluate a Fixed Deposit at a given date.
 */
export function calculateFDValue(config: FDConfig, asOfDate?: string): FDValuationResult {
  const fdType = config.fdType || 'cumulative';
  const today = asOfDate || config.startDate;
  const ratePercent = Number(config.ratePercent) || 0;
  const principal = Math.round(config.principal);
  const compounding = config.compounding || 'quarterly';
  const n = getCompoundingCount(compounding);
  const effectiveYieldPercent = calculateEffectiveYield(ratePercent, compounding);

  const maturityDate = config.maturityDate;
  const daysToMaturity = Math.max(0, diffDays(today, maturityDate));

  // --------------------------------------------------------------------------
  // PAYOUT FD HANDLING
  // --------------------------------------------------------------------------
  if (fdType === 'payout') {
    const payoutFreq = config.payoutFrequency || 'quarterly';
    const nPayout = getPayoutFrequencyCount(payoutFreq);
    const stepMonths = payoutFreq === 'at_maturity' ? 12 : Math.max(1, Math.floor(12 / nPayout));

    // Payout dates
    const payoutSchedule: FDPayoutScheduleItem[] = [];
    let curDate = addMonthsToDate(config.startDate, stepMonths);
    let pIdx = 1;
    let totalInterestPaidOut = 0;
    let nextPayoutDate: string | null = null;

    const interestPerPayout =
      payoutFreq === 'at_maturity'
        ? Math.round(principal * (ratePercent / 100) * (diffDays(config.startDate, maturityDate) / 365))
        : Math.round(principal * (ratePercent / (100 * nPayout)));

    while (curDate <= maturityDate) {
      const isPaid = curDate <= today;
      if (isPaid) {
        totalInterestPaidOut += interestPerPayout;
      } else if (!nextPayoutDate && curDate > today) {
        nextPayoutDate = curDate;
      }

      payoutSchedule.push({
        period: pIdx++,
        date: curDate,
        amount: interestPerPayout,
        isPaid,
      });

      if (curDate === maturityDate) break;
      const next = addMonthsToDate(config.startDate, pIdx * stepMonths);
      curDate = next > maturityDate ? maturityDate : next;
    }

    // Daily accrual rate for payout FD
    const dailyAccrual = Math.round((principal * (ratePercent / 100)) / 365);

    return {
      currentValue: principal, // Value stays equal to principal
      interestAccrued: totalInterestPaidOut,
      dailyAccrual,
      effectiveYieldPercent: Number(ratePercent.toFixed(2)),
      projectedMaturityValue: principal,
      maturityDate,
      daysToMaturity,
      nextCompoundingDate: null,
      nextPayoutDate,
      totalInterestPaidOut,
      schedule: [],
      payoutSchedule,
    };
  }

  // --------------------------------------------------------------------------
  // CUMULATIVE FD HANDLING
  // --------------------------------------------------------------------------

  // Check receipt calibration
  let effectiveRate = ratePercent;
  let impliedAnnualRatePercent: number | undefined;
  let differenceFromReceiptPaise: number | undefined;
  let differenceFromReceiptText: string | undefined;

  const formulaMaturity = Math.round(computeFDRawValue(config, maturityDate));

  if (config.maturityAmountPerReceipt && config.maturityAmountPerReceipt > 0) {
    impliedAnnualRatePercent = calibrateFDRate(config, config.maturityAmountPerReceipt);
    effectiveRate = impliedAnnualRatePercent;
    differenceFromReceiptPaise = config.maturityAmountPerReceipt - formulaMaturity;

    const diffRupees = (Math.abs(differenceFromReceiptPaise) / 100).toFixed(2);
    if (Math.abs(differenceFromReceiptPaise) > 0) {
      differenceFromReceiptText = `Your bank's amount differs by ₹${diffRupees} from the formula`;
    }
  }

  const activeConfig: FDConfig = {
    ...config,
    ratePercent: effectiveRate,
  };

  // Build compounding schedule
  const periods = periodBoundaries(activeConfig);
  const schedule: FDScheduleItem[] = [];
  let runningBal = principal;
  let nextCompoundingDate: string | null = null;

  for (const p of periods) {
    const openingBalance = Math.round(runningBal);
    let interest: number;
    let closingBalance: number;

    if (p.isPartial) {
      interest = Math.round(openingBalance * (effectiveRate / 100) * (p.days / p.basis));
      closingBalance = openingBalance + interest;
    } else {
      closingBalance = Math.round(openingBalance * (1 + effectiveRate / (100 * n)));
      interest = closingBalance - openingBalance;
    }

    if (!nextCompoundingDate && p.to > today) {
      nextCompoundingDate = p.to;
    }

    schedule.push({
      period: p.period,
      from: p.from,
      to: p.to,
      openingBalance,
      interest,
      closingBalance,
      days: p.days,
      isPartial: p.isPartial,
    });

    runningBal = closingBalance;
  }

  // Handle manual anchor
  let currentValueRaw: number;
  if (config.maturityAmountPerReceipt && config.maturityAmountPerReceipt > 0 && today >= maturityDate) {
    currentValueRaw = config.maturityAmountPerReceipt;
  } else if (config.manualAnchor && config.manualAnchor.date <= today && config.manualAnchor.date >= config.startDate) {
    if (today === config.manualAnchor.date) {
      currentValueRaw = config.manualAnchor.value;
    } else {
      // Accrue forward from anchor date treating anchor as principal
      const anchorConfig: FDConfig = {
        ...activeConfig,
        principal: config.manualAnchor.value,
        startDate: config.manualAnchor.date,
      };
      currentValueRaw = computeFDRawValue(anchorConfig, today);
    }
  } else {
    currentValueRaw = computeFDRawValue(activeConfig, today);
  }

  const currentValue = Math.round(currentValueRaw);
  const interestAccrued = Math.max(0, currentValue - principal);

  // Projected maturity
  const projectedMaturityValue = config.maturityAmountPerReceipt && config.maturityAmountPerReceipt > 0
    ? config.maturityAmountPerReceipt
    : formulaMaturity;

  // Daily accrual: value tomorrow - value today
  const tomorrow = addDays(today, 1);
  const tomorrowValue = Math.round(computeFDRawValue(activeConfig, tomorrow));
  const dailyAccrual = Math.max(0, tomorrowValue - currentValue);

  return {
    currentValue,
    interestAccrued,
    dailyAccrual,
    effectiveYieldPercent,
    projectedMaturityValue,
    maturityDate,
    daysToMaturity,
    nextCompoundingDate,
    impliedAnnualRatePercent,
    differenceFromReceiptPaise,
    differenceFromReceiptText,
    schedule,
  };
}

/**
 * Day-by-day simulation helper to cross-check discrete compounding within ₹1.
 */
export function simulateDayByDayFD(config: FDConfig, targetDate: string): number {
  const { principal, ratePercent, startDate, maturityDate } = config;
  if (targetDate <= startDate) return principal;

  const capDate = targetDate > maturityDate ? maturityDate : targetDate;
  const periods = periodBoundaries(config);
  const boundaryDates = new Set(periods.map((p) => p.to));

  let runningBalance = principal;
  let accruedInterest = 0;

  const totalDays = diffDays(startDate, capDate);
  for (let day = 1; day <= totalDays; day++) {
    const curDate = addDays(startDate, day);
    const prevDate = addDays(startDate, day - 1);
    const basis = getPeriodDayBasis(prevDate, curDate);

    // Daily interest
    const dailyInterest = (runningBalance * (ratePercent / 100)) / basis;
    accruedInterest += dailyInterest;

    // Check if curDate is a compounding boundary
    if (boundaryDates.has(curDate)) {
      runningBalance += accruedInterest;
      accruedInterest = 0;
    }
  }

  return Math.round(runningBalance + accruedInterest);
}
