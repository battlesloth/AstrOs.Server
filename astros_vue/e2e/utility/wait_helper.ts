import { Page } from '@playwright/test';

export async function waitForValue(page: Page, testId: string, expected: string, timeout = 5000) {
  await page.waitForFunction(
    (selector, expected) => {
      const el = document.querySelector(selector);
      return el && el.value === expected;
    },
    { timeout },
    `[data-testid='${testId}']`,
    expected
  );
}