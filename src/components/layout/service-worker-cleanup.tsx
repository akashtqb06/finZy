'use client';

import { useEffect } from 'react';

/**
 * Clean up legacy service workers and caches from previous PWA installations/dev origins.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration.unregister().catch(() => {});
          }
        })
        .catch(() => {});
    }

    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => {
          for (const key of keys) {
            caches.delete(key).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, []);

  return null;
}
