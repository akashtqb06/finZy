'use client';

import * as React from 'react';
import { useFinanceStore } from '@src/components/finance/shared/finance-store';

/**
 * Detects whether an on-screen virtual keyboard is currently visible on mobile.
 * Uses window.visualViewport to determine if height is significantly reduced.
 */
export function useKeyboardVisible(): boolean {
  const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const handleResize = () => {
      // Typically on phones (iOS/Android), the keyboard takes at least 150px
      const diff = window.innerHeight - viewport.height;
      setIsKeyboardVisible(diff > 150);
    };

    viewport.addEventListener('resize', handleResize);
    return () => {
      viewport.removeEventListener('resize', handleResize);
    };
  }, []);

  return isKeyboardVisible;
}

/**
 * Detects whether any modal dialog, sheet, or drawer is currently open.
 * Also locks body scroll while any modal layer is active on mobile.
 */
export function useIsDialogOpen(): boolean {
  const [isDomDialogOpen, setIsDomDialogOpen] = React.useState(false);
  const quickAddOpen = useFinanceStore((s) => s.quickAddOpen);
  const payBillOpen = useFinanceStore((s) => s.payBillOpen);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const checkDialog = () => {
      const dialog = document.querySelector(
        '[role="dialog"], [data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="drawer-content"], [data-slot="drawer-popup"], [aria-modal="true"]'
      );
      setIsDomDialogOpen(Boolean(dialog));
    };

    checkDialog();

    const observer = new MutationObserver(() => {
      checkDialog();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'data-state', 'data-slot', 'aria-modal'],
    });

    return () => observer.disconnect();
  }, []);

  const isOpen = isDomDialogOpen || quickAddOpen || payBillOpen;

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  return isOpen;
}
