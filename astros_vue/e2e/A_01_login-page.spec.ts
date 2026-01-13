import { test, expect } from '@playwright/test';
import { authenticateUser } from './utility/auth_helper';

test.describe('Login Page', () => {
  test('has title', async ({ page }) => {
    await page.goto('/');

    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/AstrOs/);
  });

  test('authentication', async ({ page }) => {
    await page.goto('/');

    await authenticateUser(page);

    expect(page.url()).toBe('http://localhost:5173/');
    await expect(page).toHaveTitle('AstrOs');
    await expect(page.locator('[data-v-app]')).toBeVisible();
  });
});
