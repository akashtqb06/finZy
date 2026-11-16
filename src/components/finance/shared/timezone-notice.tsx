'use client';

import React, { useEffect, useState } from 'react';
import { GlobeIcon, XIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useFinanceStore } from './finance-store';

function getInitialTzState(userTz: string): { browserTz: string | null; dismissed: boolean } {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && detected !== userTz) {
        let isDismissed = false;
        if (typeof sessionStorage !== 'undefined') {
          try {
            isDismissed = Boolean(sessionStorage.getItem(`tz-notice-dismissed-${detected}`));
          } catch {}
        }
        return { browserTz: detected, dismissed: isDismissed };
      }
    }
  } catch {}
  return { browserTz: null, dismissed: true };
}

export function TimezoneNotice() {
  const { timezone, setTimezone } = useFinanceStore();
  const [tzState, setTzState] = useState(() => getInitialTzState(timezone));
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTzState(getInitialTzState(timezone));
  }, [timezone]);

  const { browserTz, dismissed } = tzState;

  if (dismissed || !browserTz || browserTz === timezone) {
    return null;
  }

  const handleDismiss = () => {
    setTzState((prev) => ({ ...prev, dismissed: true }));
    try {
      if (browserTz && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`tz-notice-dismissed-${browserTz}`, 'true');
      }
    } catch {
      // Ignore storage errors
    }
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/finance/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: browserTz }),
      });
      if (!res.ok) {
        throw new Error('Failed to update timezone setting');
      }
      setTimezone(browserTz);
      toast.success(`Timezone updated to ${browserTz}`);
      handleDismiss();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update timezone');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
    >
      <div className="flex items-center gap-2">
        <GlobeIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Your browser is in <strong className="font-semibold">{browserTz}</strong>, but financial
          records use <strong className="font-semibold">{timezone}</strong>.
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2 border-amber-500/30 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
          disabled={isUpdating}
          onClick={handleUpdate}
        >
          <CheckIcon className="size-3 mr-1" />
          {isUpdating ? 'Updating...' : `Switch to ${browserTz}`}
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-amber-700 hover:text-amber-950 dark:text-amber-400 dark:hover:text-amber-100 p-0.5 rounded-sm"
          title="Dismiss notice"
        >
          <XIcon className="size-3.5" />
          <span className="sr-only">Dismiss</span>
        </button>
      </div>
    </div>
  );
}
