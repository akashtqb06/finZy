import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { Dialog } from '@/components/ui/dialog';
import { ConflictDialogContentBody } from '../conflict-dialog';
import { TimezoneNotice } from '../timezone-notice';
import { SyncStatusIndicator } from '../sync-status-indicator';
import { FinanceSyncProvider } from '../finance-sync-provider';
import { useFinanceStore } from '../finance-store';

describe('Sync & Conflict UI Components', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      timezone: 'Asia/Kolkata',
    });
  });

  describe('ConflictDialogContentBody', () => {
    it('renders conflict alert with Reload and Overwrite actions', () => {
      const onReload = vi.fn();
      const onOverwrite = vi.fn();

      const html = renderToString(
        <Dialog open={true}>
          <ConflictDialogContentBody
            onReload={onReload}
            onOverwrite={onOverwrite}
          />
        </Dialog>
      );

      expect(html).toContain('Changed on another device');
      expect(html).toContain('Reload');
      expect(html).toContain('Overwrite');
    });

    it('renders custom title and description when provided', () => {
      const html = renderToString(
        <Dialog open={true}>
          <ConflictDialogContentBody
            onReload={() => {}}
            onOverwrite={() => {}}
            title="Concurrent Transaction Modification"
            description="A newer version of this transaction exists on the server."
          />
        </Dialog>
      );

      expect(html).toContain('Concurrent Transaction Modification');
      expect(html).toContain('A newer version of this transaction exists on the server.');
    });
  });

  describe('TimezoneNotice', () => {
    it('does not render when browser and user timezone match', () => {
      useFinanceStore.setState({ timezone: 'Asia/Kolkata' });

      const originalDateTimeFormat = Intl.DateTimeFormat;
      Intl.DateTimeFormat = vi.fn().mockImplementation(() => ({
        resolvedOptions: () => ({
          timeZone: 'Asia/Kolkata',
          locale: 'en-US',
          calendar: 'gregory',
          numberingSystem: 'latn',
        }),
      })) as unknown as typeof Intl.DateTimeFormat;

      try {
        const html = renderToString(<TimezoneNotice />);
        expect(html).toBe('');
      } finally {
        Intl.DateTimeFormat = originalDateTimeFormat;
      }
    });

    it('renders a warning banner when browser timezone differs from configured timezone', () => {
      useFinanceStore.setState({ timezone: 'Asia/Kolkata' });

      const originalDateTimeFormat = Intl.DateTimeFormat;
      Intl.DateTimeFormat = vi.fn().mockImplementation(() => ({
        resolvedOptions: () => ({
          timeZone: 'America/New_York',
          locale: 'en-US',
          calendar: 'gregory',
          numberingSystem: 'latn',
        }),
      })) as unknown as typeof Intl.DateTimeFormat;

      try {
        const html = renderToString(<TimezoneNotice />);
        expect(html).toContain('America/New_York');
        expect(html).toContain('Asia/Kolkata');
        expect(html).toContain('Switch to America/New_York');
      } finally {
        Intl.DateTimeFormat = originalDateTimeFormat;
      }
    });
  });

  describe('SyncStatusIndicator', () => {
    it('renders quiet sync indicator with refresh button', () => {
      const html = renderToString(
        <FinanceSyncProvider userId="test_user">
          <SyncStatusIndicator />
        </FinanceSyncProvider>
      );

      expect(html).toContain('Refresh data');
      expect(html).toContain('Updated just now');
    });
  });
});
