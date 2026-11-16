'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createClient } from '@src/lib/supabase/browser';
import { useFinanceStore } from './finance-store';

export interface FinanceSyncContextValue {
  lastSyncTime: Date | null;
  isSyncing: boolean;
  manualRefresh: () => Promise<void>;
  dataVersion: number | null;
}

const FinanceSyncContext = createContext<FinanceSyncContextValue>({
  lastSyncTime: null,
  isSyncing: false,
  manualRefresh: async () => {},
  dataVersion: null,
});

export function FinanceSyncProvider({
  userId,
  children,
}: {
  userId?: string | null;
  children: ReactNode;
}) {
  const storeUserId = useFinanceStore((s) => s.userId);
  const effectiveUserId = userId || storeUserId;

  const refreshAccounts = useFinanceStore((s) => s.refreshAccounts);
  const refreshTransactions = useFinanceStore((s) => s.refreshTransactions);
  const refreshOverviewStats = useFinanceStore((s) => s.refreshOverviewStats);
  const refreshBudgets = useFinanceStore((s) => s.refreshBudgets);
  const refreshNetWorthHistory = useFinanceStore((s) => s.refreshNetWorthHistory);
  const refreshCategories = useFinanceStore((s) => s.refreshCategories);

  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataVersion, setDataVersion] = useState<number | null>(null);

  const dataVersionRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);

  const triggerRefetch = useCallback(async (forced = false) => {
    if (isSyncingRef.current && !forced) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      // 1. Fetch current dataVersion from sync state API
      const res = await fetch('/api/finance/sync/state', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });

      let nextVersion: number | null = null;
      if (res.ok) {
        const body = await res.json();
        if (typeof body.dataVersion === 'number') {
          nextVersion = body.dataVersion;
        }
      }

      // If version hasn't changed and not forced, skip refetching heavy stores
      if (!forced && nextVersion !== null && dataVersionRef.current !== null && nextVersion === dataVersionRef.current) {
        return;
      }

      if (nextVersion !== null) {
        dataVersionRef.current = nextVersion;
        setDataVersion(nextVersion);
      }

      // 2. Refetch store slices
      await Promise.all([
        refreshAccounts(),
        refreshTransactions(),
        refreshOverviewStats(),
        refreshBudgets(),
        refreshNetWorthHistory(),
        refreshCategories(),
      ]);

      setLastSyncTime(new Date());
    } catch (err) {
      console.warn('[FinanceSyncProvider] Sync error:', err);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [
    refreshAccounts,
    refreshTransactions,
    refreshOverviewStats,
    refreshBudgets,
    refreshNetWorthHistory,
    refreshCategories,
  ]);

  const manualRefresh = useCallback(async () => {
    await triggerRefetch(true);
  }, [triggerRefetch]);

  // Initial dataVersion check
  useEffect(() => {
    void triggerRefetch();
  }, [triggerRefetch]);

  // Supabase Realtime subscription on fin_user_settings
  useEffect(() => {
    if (!effectiveUserId) return;

    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;
    try {
      const supabase = createClient();
      channel = supabase
        .channel(`user-sync-${effectiveUserId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'fin_user_settings',
            filter: `user_id=eq.${effectiveUserId}`,
          },
          (_payload: unknown) => {
            // Rule: Never rely on payload contents from Realtime.
            void triggerRefetch(true);
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('[FinanceSyncProvider] Realtime subscribe error:', err);
    }

    return () => {
      if (channel) {
        try {
          const supabase = createClient();
          void supabase.removeChannel(channel);
        } catch {
          // Ignore teardown errors
        }
      }
    };
  }, [effectiveUserId, triggerRefetch]);

  // Fallbacks: window focus, visibility change, online events
  useEffect(() => {
    const handleFocus = () => {
      void triggerRefetch();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void triggerRefetch();
      }
    };

    const handleOnline = () => {
      void triggerRefetch(true);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [triggerRefetch]);

  // Fallback: 60-second periodic poll while visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void triggerRefetch();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [triggerRefetch]);

  return (
    <FinanceSyncContext.Provider
      value={{
        lastSyncTime,
        isSyncing,
        manualRefresh,
        dataVersion,
      }}
    >
      {children}
    </FinanceSyncContext.Provider>
  );
}

export function useFinanceSync(): FinanceSyncContextValue {
  return useContext(FinanceSyncContext);
}
