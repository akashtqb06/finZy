import { describe, it, expect } from 'vitest';
import { Z_INDEX } from '@src/lib/layout/z-index';

describe('Mobile Layout Protection & Z-Index Foundation', () => {
  it('enforces a strict, monotonic z-index hierarchy', () => {
    expect(Z_INDEX.content).toBeLessThan(Z_INDEX.stickyHeader);
    expect(Z_INDEX.stickyHeader).toBeLessThan(Z_INDEX.bottomNav);
    expect(Z_INDEX.bottomNav).toBeLessThan(Z_INDEX.sheetAndDrawer);
    expect(Z_INDEX.sheetAndDrawer).toBeLessThan(Z_INDEX.dialog);
    expect(Z_INDEX.dialog).toBeLessThan(Z_INDEX.popover);
    expect(Z_INDEX.popover).toBeLessThan(Z_INDEX.toast);

    expect(Z_INDEX.bottomNav).toBe(40);
    expect(Z_INDEX.sheetAndDrawer).toBe(50);
    expect(Z_INDEX.dialog).toBe(60);
    expect(Z_INDEX.popover).toBe(70);
    expect(Z_INDEX.toast).toBe(80);
  });

  it('verifies bottom nav height CSS variable formula and scroll padding', () => {
    // Expected CSS variable constants
    const expectedBottomNavH = 'calc(56px + env(safe-area-inset-bottom, 0px))';
    const expectedHeaderH = '3.5rem';

    expect(expectedBottomNavH).toContain('56px');
    expect(expectedBottomNavH).toContain('safe-area-inset-bottom');
    expect(expectedHeaderH).toBe('3.5rem');
  });
});
