import { test, expect } from '@playwright/test';

test.describe('Modules Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('textbox', { name: 'Enter username' }).fill('admin');
        await page.getByRole('textbox', { name: 'Password' }).fill('password');
        await page.getByRole('button', { name: 'Sign in!' }).click();
        await page.locator('.navbutton').click();
        await page.goto('/modules/skip-controllers');
        await page.getByRole('button', { name: 'Close' }).click();
    });

    test('Add Generic Serial Module to Body', async ({ page }) => {
        await page.getByTestId('body-module-header').click();
        await page.getByTestId('body-serial-header').click();
        await page.getByTestId('body-add-serial').click();

        await page.getByTestId('modal-module-select').selectOption('101');
        await page.getByTestId('modal-add-module').click();

        await page.getByTestId('body-serial-101-header').click();
        await expect(page.getByRole('combobox').nth(2)).toHaveValue('9600');
        await expect(page.getByRole('combobox').nth(1)).toHaveValue('2');
        await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('New Serial Module');
    });
});