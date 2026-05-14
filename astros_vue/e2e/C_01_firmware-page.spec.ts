import { test, expect, Page } from '@playwright/test';
import { authenticateUser } from './utility/auth_helper';

async function openFirmwarePage(page: Page): Promise<void> {
  await authenticateUser(page);
  await page.click('label[for="nav-menu-drawer"]');
  await page.getByRole('link', { name: /firmware/i }).click();
  await expect(page).toHaveURL(/\/firmware/);
  await expect(page.getByRole('heading', { name: /firmware/i })).toBeVisible();
}

test.describe('Firmware Page', () => {
  test.beforeEach(async ({ page }) => {
    await openFirmwarePage(page);
  });

  test('renders the page chrome with title and subtitle', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /firmware/i })).toBeVisible();
    // The subtitle is one of the four phase copy strings; in initial select
    // phase it mentions ESP-NOW.
    await expect(page.getByText(/ESP-NOW/i).first()).toBeVisible();
  });

  test('shows the source strip with GitHub/Upload toggle in select phase', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^github$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^upload$/i })).toBeVisible();
  });

  test('shows the controllers panel header with select-all/clear buttons', async ({ page }) => {
    // CONTROLLERS eyebrow.
    await expect(page.getByText(/^CONTROLLERS$/)).toBeVisible();
    // Action buttons only appear in select phase.
    await expect(page.getByRole('button', { name: /select all/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^clear$/i })).toBeVisible();
  });

  test('Flash button is disabled when no source or selection is chosen', async ({ page }) => {
    const flashBtn = page.getByRole('button', { name: /flash firmware/i });
    await expect(flashBtn).toBeVisible();
    await expect(flashBtn).toBeDisabled();
  });

  // NOTE: Driving a full flash flow (POST → WS-driven phase progression →
  // result bar) requires a WS-mock infrastructure that doesn't exist yet
  // in this codebase. Phase progression + apply* handlers are covered by
  // the firmware/composables/views vitest suites; the full operator flow
  // is covered by the manual QA plan at `.docs/qa/firmware-ota-flash-ui.md`.
});
