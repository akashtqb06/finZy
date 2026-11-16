import type { NextResponse } from 'next/server';

export type FinanceFeature =
  | 'overview'
  | 'transactions'
  | 'accounts'
  | 'setup'
  | 'budgets'
  | 'recurring'
  | 'import'
  | 'inbox';

export const ALL_FINANCE_FEATURES: readonly FinanceFeature[] = [
  'overview',
  'transactions',
  'accounts',
  'setup',
  'budgets',
  'recurring',
  'import',
  'inbox',
] as const;

export const DEFAULT_ENABLED_FEATURES = ALL_FINANCE_FEATURES;

export function enabledFeatures(): Set<FinanceFeature> {
  return new Set(ALL_FINANCE_FEATURES);
}

export function isFeatureEnabled(_feature: FinanceFeature): boolean {
  return true;
}

export const isFinanceFeatureEnabled = isFeatureEnabled;

export function isAnyFinanceFeatureEnabled(): boolean {
  return true;
}

export function checkFeatureGatedApi(_feature: FinanceFeature): NextResponse | null {
  return null;
}
