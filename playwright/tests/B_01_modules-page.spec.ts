import { test, expect } from '@playwright/test';

test.describe('Modules Page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('textbox', { name: 'Enter username' }).fill('admin');
        await page.getByRole('textbox', { name: 'Password' }).fill('password');
        await page.getByRole('button', { name: 'Sign in!' }).click();
        await page.locator('.navbutton').click();
        await page.getByRole('link', { name: 'Modules' }).click();
        await page.getByRole('button', { name: 'Close' }).click();
    });

    test('Add Generic Serial Module to Body', async ({ page }) => {
        await page.getByRole('button', { name: 'Body Module' }).click();
        await page.getByRole('button', { name: 'Serial Modules' }).click();
        await page.getByRole('button', { name: 'Serial Modules' }).getByRole('button').click();
        await page.locator('#module-select').selectOption('101');
        await page.getByRole('button', { name: 'Add' }).click();
        await page.getByRole('button', { name: 'New Serial Module Generic' }).click();
        await expect(page.getByRole('combobox').nth(2)).toHaveValue('9600');
        await expect(page.getByRole('combobox').nth(1)).toHaveValue('2');
        await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('New Serial Module');
    });
});