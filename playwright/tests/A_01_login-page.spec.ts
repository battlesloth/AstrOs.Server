import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('has title', async ({ page }) => {
    await page.goto('/');

    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/AstrOs/);
  });

  test('authentication', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('textbox', { name: 'Enter username' }).click();
    await page.getByRole('textbox', { name: 'Enter username' }).fill('admin');
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('password');
    await page.getByRole('button', { name: 'Sign in!' }).click();
    await page.getByText('AstrOs').click();

    await expect(page.url()).toBe('http://localhost:4200/status');
    await expect(page).toHaveTitle('AstrOs - Status');
    await expect(page.locator('app-root')).toContainText('AstrOs');

  });

});