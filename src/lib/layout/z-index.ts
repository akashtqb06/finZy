/**
 * Unified Z-Index scale for the application.
 * Hierarchy:
 * content (0-1) < sticky headers (10) < bottom nav (40) < sheets and drawers (50) < dialogs (60) < popovers/selects (70) < toasts (80)
 */

export const Z_INDEX = {
  content: 0,
  stickyHeader: 10,
  bottomNav: 40,
  sheetAndDrawer: 50,
  dialog: 60,
  popover: 70,
  toast: 80,
} as const;

export const Z_INDEX_CLASSES = {
  content: 'z-0',
  stickyHeader: 'z-10',
  bottomNav: 'z-40',
  sheetAndDrawer: 'z-50',
  dialog: 'z-60',
  popover: 'z-70',
  toast: 'z-80',
} as const;
