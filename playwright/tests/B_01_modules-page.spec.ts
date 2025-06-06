import { test, expect } from '@playwright/test';

test.describe('Modules Page - Body', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('textbox', { name: 'Enter username' }).fill('admin');
        await page.getByRole('textbox', { name: 'Password' }).fill('password');
        await page.getByRole('button', { name: 'Sign in!' }).click();
        await page.locator('.navbutton').click();
        await page.goto('/modules/skip-controllers');
        await page.getByTestId(`loading-modal-close`).click();
    });

    // Body tests
    test('Add Generic Serial Module to Body', async ({ page }) => {
        await addSerialModule(page, 'body', '101');

        await validateGenericSerialModule(page, 'body', '101', '2');
    });

    test('Add Kangaroo X2 Module to Body', async ({ page }) => {
        await addSerialModule(page, 'body', '102');

        await validateKangarooModule(page, 'body', '102', '2');
    });

    test('Add Human Cyborg Relations Module to Body', async ({ page }) => {
        await addSerialModule(page, 'body', '103');

        await validateHcrSerialModule(page, 'body', '103', '2');
    });

    test('Add Maestro Module to Body', async ({ page }) => {
        await addSerialModule(page, 'body', '104');

        // 1 - servo
        // 2 - digital
        for (let i = 1; i <= 24; i++) {
            const option = i % 2 === 0 ? '2' : '1';
            await page.getByTestId(`body-maestro-ch-${i}-type`).selectOption(option);

            if (i % 2 === 0) {
                validateMaestroDigitalCH(page, 'body', i.toString());
            } else {
                validateMaestroServoCH(page, 'body', i.toString());
            }
        }

        await validateMaestroModule(page, 'body', '104', '2');
    });

    test('Add generic I2C Module to Body', async ({ page }) => {
        await addI2cModule(page, 'body', '201');

        await validateI2cModule(page, 'body', '201');
    });

    test('Check GPIO render on Body', async ({ page }) => {
        await page.getByTestId('body-module-header').click();
        await page.getByTestId('body-gpio-header').click();

        for (let i = 0; i < 10; i++) {
            await validateGpioChannel(page, 'body', i);
        }
    });
});

test.describe('Modules Page - Core', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('textbox', { name: 'Enter username' }).fill('admin');
        await page.getByRole('textbox', { name: 'Password' }).fill('password');
        await page.getByRole('button', { name: 'Sign in!' }).click();
        await page.locator('.navbutton').click();
        await page.goto('/modules/skip-controllers');
        await page.getByRole('button', { name: 'Close' }).click();
    });

    test('Add Generic Serial Module to Core', async ({ page }) => {
        await addSerialModule(page, 'core', '101');

        await validateGenericSerialModule(page, 'core', '101', '1');
    });

    test('Add Kangaroo X2 Module to Core', async ({ page }) => {
        await addSerialModule(page, 'core', '102');

        await validateKangarooModule(page, 'core', '102', '1');
    });

    test('Add Human Cyborg Relations Module to Core', async ({ page }) => {
        await addSerialModule(page, 'core', '103');

        await validateHcrSerialModule(page, 'core', '103', '1');
    });

    test('Add Maestro Module to Core', async ({ page }) => {
        await addSerialModule(page, 'core', '104');

        // 1 - servo
        // 2 - digital
        for (let i = 1; i <= 24; i++) {
            const option = i % 2 === 0 ? '2' : '1';
            await page.getByTestId(`core-maestro-ch-${i}-type`).selectOption(option);

            if (i % 2 === 0) {
                validateMaestroDigitalCH(page, 'core', i.toString());
            } else {
                validateMaestroServoCH(page, 'core', i.toString());
            }
        }

        await validateMaestroModule(page, 'core', '104', '1');
    });

    test('Add generic I2C Module to Core', async ({ page }) => {
        await addI2cModule(page, 'core', '201');

        await validateI2cModule(page, 'core', '201');
    });

    test('Check GPIO render on Core', async ({ page }) => {
        await page.getByTestId('core-module-header').click();
        await page.getByTestId('core-gpio-header').click();

        for (let i = 0; i < 10; i++) {
            await validateGpioChannel(page, 'core', i);
        }
    });
});

test.describe('Modules Page - Dome', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('textbox', { name: 'Enter username' }).fill('admin');
        await page.getByRole('textbox', { name: 'Password' }).fill('password');
        await page.getByRole('button', { name: 'Sign in!' }).click();
        await page.locator('.navbutton').click();
        await page.goto('/modules/skip-controllers');
        await page.getByRole('button', { name: 'Close' }).click();
    });

    test('Add Generic Serial Module to Dome', async ({ page }) => {
        await addSerialModule(page, 'dome', '101');

        await validateGenericSerialModule(page, 'dome', '101', '1');
    });

    test('Add Kangaroo X2 Module to Dome', async ({ page }) => {
        await addSerialModule(page, 'dome', '102');

        await validateKangarooModule(page, 'dome', '102', '1');
    });

    test('Add Human Cyborg Relations Module to Dome', async ({ page }) => {
        await addSerialModule(page, 'dome', '103');

        await validateHcrSerialModule(page, 'dome', '103', '1');
    });

    test('Add Maestro Module to Dome', async ({ page }) => {
        await addSerialModule(page, 'dome', '104');

        // 1 - servo
        // 2 - digital
        for (let i = 1; i <= 24; i++) {
            const option = i % 2 === 0 ? '2' : '1';
            await page.getByTestId(`dome-maestro-ch-${i}-type`).selectOption(option);

            if (i % 2 === 0) {
                validateMaestroDigitalCH(page, 'dome', i.toString());
            } else {
                validateMaestroServoCH(page, 'dome', i.toString());
            }
        }

        await validateMaestroModule(page, 'dome', '104', '1');
    });

    test('Add generic I2C Module to Dome', async ({ page }) => {
        await addI2cModule(page, 'dome', '201');

        await validateI2cModule(page, 'dome', '201');
    });

    test('Check GPIO render on Dome', async ({ page }) => {
        await page.getByTestId('dome-module-header').click();
        await page.getByTestId('dome-gpio-header').click();

        for (let i = 0; i < 10; i++) {
            await validateGpioChannel(page, 'dome', i);
        }
    });
});


async function addSerialModule(page, location, moduleId) {
    await page.getByTestId(`${location}-module-header`).click();
    await page.getByTestId(`${location}-serial-header`).click();
    await page.getByTestId(`${location}-add-serial`).click();

    await page.getByTestId('modal-module-select').selectOption(moduleId);
    await page.getByTestId('modal-add-module').click();

    await page.getByTestId(`${location}-serial-${moduleId}-header`).click();
}

async function validateGenericSerialModule(page, location, moduleId, uartChannel) {
    await expect(page.getByTestId(`${location}-generic-serial-baud`)).toHaveValue('9600');
    await expect(page.getByTestId(`${location}-generic-serial-uart-channel`)).toHaveValue(uartChannel);
    await expect(page.getByTestId(`${location}-serial-${moduleId}-name`)).toHaveValue('New Serial Module');
}

async function validateKangarooModule(page, location, moduleId, uartChannel) {
    await expect(page.getByTestId(`${location}-serial-${moduleId}-name`)).toHaveValue('New Serial Module');
    await expect(page.getByTestId(`${location}-kangaroo-uart-channel`)).toHaveValue(uartChannel);
    await expect(page.getByTestId(`${location}-kangaroo-baud`)).toHaveValue('9600');
    await expect(page.getByTestId(`${location}-kangaroo-ch1Name`)).toHaveValue('Channel 1');
    await expect(page.getByTestId(`${location}-kangaroo-ch2Name`)).toHaveValue('Channel 2');
}

async function validateHcrSerialModule(page, location, moduleId, uartChannel) {
    await expect(page.getByTestId(`${location}-hcr-serial-baud`)).toHaveValue('9600');
    await expect(page.getByTestId(`${location}-hcr-serial-uart-channel`)).toHaveValue(uartChannel);
    await expect(page.getByTestId(`${location}-serial-${moduleId}-name`)).toHaveValue('New Serial Module');
}

async function validateMaestroModule(page, location, moduleId, uartChannel) {
    await expect(page.getByTestId(`${location}-serial-${moduleId}-name`)).toHaveValue('New Serial Module');
    await expect(page.getByTestId(`${location}-maestro-uart-channel`)).toHaveValue(uartChannel);
    await expect(page.getByTestId(`${location}-maestro-baud`)).toHaveValue('9600');
    await expect(page.getByTestId(`${location}-maestro-channel-count`)).toHaveValue('24');
}

async function validateMaestroServoCH(page, location, ch) {
    await expect(page.getByTestId(`${location}-maestro-ch-${ch}-type`)).toHaveValue('1');
    await expect(page.getByTestId(`${location}-maestro-ch-${ch}-name`)).toHaveValue(`Channel ${ch}`);
    await expect(page.getByTestId(`${location}-maestro-ch-${ch}-invert-cbx`).getByRole('checkbox', { name: 'Inverted' })).not.toBeChecked();
    await expect(page.getByTestId(`${location}-maestro-ch-${ch}-minPulse`)).toHaveValue('500');
    await expect(page.getByTestId(`${location}-maestro-ch-${ch}-maxPulse`)).toHaveValue('2500');
    await expect(page.getByTestId(`${location}-maestro-ch-${ch}-homePosition`)).toHaveValue('1250');
}

async function validateMaestroDigitalCH(page, location, ch) {
    await expect(page.getByTestId(`${location}-maestro-ch-${ch}-type`)).toHaveValue('2');
    await expect(page.getByTestId(`${location}-maestro-ch-${ch}-name`)).toHaveValue(`Channel ${ch}`);
    await expect(page.getByTestId(`${location}-maestro-ch-${ch}-invert-cbx`).getByRole('checkbox', { name: 'Default High' })).not.toBeChecked();
}

async function addI2cModule(page, location, moduleId) {
    await page.getByTestId(`${location}-module-header`).click();
    await page.getByTestId(`${location}-i2c-header`).click();
    await page.getByTestId(`${location}-add-i2c`).click();

    await page.getByTestId('modal-module-select').selectOption(moduleId);
    await page.getByTestId('modal-add-module').click();

    await page.getByTestId(`${location}-i2c-${moduleId}-header`).click();
}

async function validateI2cModule(page, location, moduleId) {
    await expect(page.getByTestId(`${location}-i2c-${moduleId}-name`)).toHaveValue('New I2C Module');
    await expect(page.getByTestId(`${location}-i2c-${moduleId}-address`)).toHaveValue('0');
}

async function validateGpioChannel(page, location, ch) {
    await expect(page.getByTestId(`${location}-gpio-ch-${ch}-name`)).toHaveValue('unassigned');
    await expect(page.getByTestId(`${location}-gpio-ch-${ch}-enabled`).getByRole('checkbox', { name: 'Enabled' })).not.toBeChecked();
    await expect(page.getByTestId(`${location}-gpio-ch-${ch}-default-high`).getByRole('checkbox', { name: 'Default High?' })).not.toBeChecked();
}
