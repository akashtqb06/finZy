import { test, expect, devices } from '@playwright/test';

const FINANCE_PAGES = [
  '/finance/overview',
  '/finance/transactions',
  '/finance/accounts',
  '/finance/budgets',
  '/finance/recurring',
  '/finance/inbox',
  '/finance/categories',
  '/finance/import',
];

const MOBILE_DEVICES = [
  { name: 'iPhone 13', ...devices['iPhone 13'] },
  { name: 'Pixel 7', ...devices['Pixel 7'] },
];

for (const device of MOBILE_DEVICES) {
  test.describe(`Mobile Layout & Bottom Nav Clearance (${device.name})`, () => {
    test.use({ ...device });

    for (const pagePath of FINANCE_PAGES) {
      test(`verifies bottom nav does not obstruct interactive elements on ${pagePath}`, async ({ page }) => {
        await page.goto(pagePath);
        await page.waitForLoadState('networkidle');

        // Verify bottom nav exists on mobile phone
        const bottomNav = page.locator('nav[aria-label="Mobile Navigation"], [data-slot="bottom-nav"]');
        await expect(bottomNav).toBeVisible();

        const bottomNavBox = await bottomNav.boundingBox();
        expect(bottomNavBox).not.toBeNull();
        const navTop = bottomNavBox!.y;

        // Scroll to the very bottom
        await page.evaluate(() => {
          const main = document.querySelector('main') || document.documentElement;
          main.scrollTo({ top: main.scrollHeight, behavior: 'instant' });
        });
        await page.waitForTimeout(200);

        // Find primary buttons and interactive elements at the bottom of the page
        const lastInteractive = page.locator('main button:visible, main a:visible, main input:visible').last();
        if (await lastInteractive.count() > 0) {
          const box = await lastInteractive.boundingBox();
          if (box) {
            // Check elementFromPoint at center of the button
            const pointElement = await page.evaluate(({ x, y }) => {
              const el = document.elementFromPoint(x, y);
              return el?.closest('nav[aria-label="Mobile Navigation"], [data-slot="bottom-nav"]') ? 'nav' : 'content';
            }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

            expect(pointElement).toBe('content');
            expect(box.y + box.height).toBeLessThanOrEqual(navTop + 1);
          }
        }
      });
    }

    test('verifies bottom nav is hidden and inert when Quick Add drawer is open', async ({ page }) => {
      await page.goto('/finance/overview');
      await page.waitForLoadState('networkidle');

      const bottomNav = page.locator('nav[aria-label="Mobile Navigation"], [data-slot="bottom-nav"]');
      await expect(bottomNav).toBeVisible();

      // Tap centered Quick Add '+' button on phone
      const quickAddTrigger = bottomNav.locator('button[aria-label*="Quick Add"], button:has-text("+")');
      await quickAddTrigger.click();

      // Drawer opens
      const drawer = page.locator('[data-slot="drawer-content"], [data-slot="sheet-content"], [role="dialog"]');
      await expect(drawer).toBeVisible();

      // Bottom nav is hidden or inert
      const isNavHiddenOrInert = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Mobile Navigation"], [data-slot="bottom-nav"]');
        if (!nav) return true;
        const style = window.getComputedStyle(nav);
        return style.display === 'none' || style.visibility === 'hidden' || nav.hasAttribute('inert') || nav.classList.contains('hidden');
      });
      expect(isNavHiddenOrInert).toBe(true);
    });
  });
}
