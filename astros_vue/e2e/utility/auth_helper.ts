import { Page } from "@playwright/test";

export async function authenticateUser(page: Page): Promise<void> {
  await page.goto('/auth');
  await page.getByRole('textbox', { name: 'username' }).click();
  await page.getByRole('textbox', { name: 'username' }).fill('admin');
  await page.getByRole('textbox', { name: 'password' }).click();
  await page.getByRole('textbox', { name: 'password' }).fill('password');
  await page.getByRole('button', { name: 'login' }).click();
  await page.waitForLoadState('networkidle');
}