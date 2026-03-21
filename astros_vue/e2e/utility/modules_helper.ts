import { expect, Page } from '@playwright/test';
import { authenticateUser } from './auth_helper';

export async function openModulesPage(page: Page): Promise<void> {
  await authenticateUser(page);

  await page.click('label[for="nav-menu-drawer"]');
  await page.getByRole('link', { name: /modules/i }).click();

  await expect(page).toHaveURL(/\/modules/);
  await expect(page.getByRole('heading', { name: /modules/i })).toBeVisible();
  await expect(page.getByTestId('loading-modal-close')).toBeVisible();
  await page.getByTestId('loading-modal-close').click();
}
