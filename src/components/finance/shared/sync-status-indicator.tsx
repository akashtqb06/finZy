'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFinanceSync } from './finance-sync-provider';
import { cn } from '@/lib/utils';

export function SyncStatusIndicator({ className }: { className?: string }) {
  const { lastSyncTime, isSyncing, manualRefresh } = useFinanceSync();
  const [timeAgo, setTimeAgo] = useState('Updated just now');

  useEffect(() => {
    const updateTimeAgo = () => {
      if (!lastSyncTime) {
        setTimeAgo('Not synced');
        return;
      }
      const diffMs = Date.now() - lastSyncTime.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 45) {
        setTimeAgo('Updated just now');
      } else if (diffSec < 90) {
        setTimeAgo('Updated 1m ago');
      } else if (diffSec < 3600) {
        const mins = Math.floor(diffSec / 60);
        setTimeAgo(`Updated ${mins}m ago`);
      } else {
        const hours = Math.floor(diffSec / 3600);
        setTimeAgo(`Updated ${hours}h ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 15_000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] text-muted-foreground select-none',
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-foreground p-0"
        title="Refresh data"
        disabled={isSyncing}
        onClick={() => void manualRefresh()}
      >
        <RefreshCwIcon
          className={cn('size-3', isSyncing && 'animate-spin text-primary')}
        />
        <span className="sr-only">Refresh data</span>
      </Button>
      <span className="hidden sm:inline-block truncate">
        {isSyncing ? 'Syncing...' : timeAgo}
      </span>
    </div>
  );
}
