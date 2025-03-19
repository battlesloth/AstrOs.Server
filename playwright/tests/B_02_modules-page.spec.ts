import { test, expect } from '@playwright/test';
import { clickAndFillInput } from '../utility/input_helper';

test.describe('Modules Page - Body', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('textbox', { name: 'Enter username' }).fill('admin');
        await page.getByRole('textbox', { name: 'Password' }).fill('password');
        await page.getByRole('button', { name: 'Sign in!' }).click();
        await page.locator('.navbutton').click();
        await page.goto('/modules/skip-controllers');
        await page.getByRole('button', { name: 'Close' }).click();
    });

    // populate all modules
    test('Populate all modules', async ({ page }) => {
        
        await setLocation(page, 'body');
        await setLocation(page, 'core');
        await setLocation(page, 'dome');

        await page.getByTestId('save_module_settings').click();
    });

    test('Validate all loaded modules', async ({ page }) => {
        await validateLocation(page, 'body');
        await validateLocation(page, 'core');
        await validateLocation(page, 'dome');
    });
});

async function setLocation(page, location) {
    await page.getByTestId(`${location}-module-header`).click();
    await page.getByTestId(`${location}-serial-header`).click();

    if (await page.getByTestId(`${location}-serial-101-name`).count() > 0) {
        expect(true).toBe(true);
        return;
    }

    await addSerialModule(page, location, '101');
    await setGenericSerialModuleValues(page, location, '101');
    // close generic serial header
    await page.getByTestId(`${location}-serial-101-header`).click(); 

    await addSerialModule(page, location, '102');
    await setKangarooModuleValues(page, location, '102');
    // close kangaroo header
    await page.getByTestId(`${location}-serial-102-header`).click();

    await addSerialModule(page, location, '103');
    await setHCRModuleValues(page, location, '103');
    // close hcr header
    await page.getByTestId(`${location}-serial-103-header`).click();

    await addSerialModule(page, location, '104');
    await setMaestroModuleValues(page, location, '104');
    // close maestro header
    await page.getByTestId(`${location}-serial-104-header`).click();

    // close serial section
    await page.getByTestId(`${location}-serial-header`).click();

    await page.getByTestId(`${location}-i2c-header`).click();
    await addI2cModule(page, location, '201');
    await setI2cModuleValues(page, location, '201');
    // close i2c section
    await page.getByTestId(`${location}-i2c-header`).click();

    await setGpioChannelValues(page, location);

    // close gpio section
    await page.getByTestId(`${location}-gpio-header`).click();

    // close location
    await page.getByTestId(`${location}-module-header`).click();
}

async function validateLocation(page, location) {
    await page.getByTestId(`${location}-module-header`).click();
    await page.getByTestId(`${location}-serial-header`).click();

    await validateGenericSerialModule(page, location, '101');
    // close generic serial header
    await page.getByTestId(`${location}-serial-101-header`).click();

    await validateKangarooModule(page, location, '102');
    // close kangaroo header
    await page.getByTestId(`${location}-serial-102-header`).click();
    
    await validateHCRModule(page, location, '103');
    // close hcr header
    await page.getByTestId(`${location}-serial-103-header`).click();
    
    await validateMaestroModule(page, location, '104');
    // close maestro header
    await page.getByTestId(`${location}-serial-104-header`).click();

    // close serial section
    await page.getByTestId(`${location}-serial-header`).click();

    await page.getByTestId(`${location}-i2c-header`).click();
    await validateI2cModule(page, location, '201');

    // close i2c section
    await page.getByTestId(`${location}-i2c-header`).click();

    await validateGpioChannel(page, location);

    // close gpio section
    await page.getByTestId(`${location}-gpio-header`).click();

    // close location
    await page.getByTestId(`${location}-module-header`).click();
}

async function addSerialModule(page, location, moduleId) {
    await page.getByTestId(`${location}-add-serial`).click();

    await page.getByTestId('modal-module-select').selectOption(moduleId);
    await page.getByTestId('modal-add-module').click();

    await page.getByTestId(`${location}-serial-${moduleId}-header`).click();
}

async function setGenericSerialModuleValues(page, location, moduleId) {
    await page.getByTestId(`${location}-generic-serial-baud`).selectOption('19200');
    await clickAndFillInput(page, `${location}-serial-${moduleId}-name`, `${location} GSM`);
}

async function validateGenericSerialModule(page, location, moduleId) {
    await page.getByTestId(`${location}-serial-${moduleId}-header`).click();
    await expect(page.getByTestId(`${location}-generic-serial-baud`)).toBeVisible();

    await expect(page.getByTestId(`${location}-generic-serial-baud`)).toHaveValue('19200');
    await expect(page.getByTestId(`${location}-serial-${moduleId}-name`)).toHaveValue(`${location} GSM`);
}

async function setKangarooModuleValues(page, location, moduleId) {

    await expect(page.getByTestId(`${location}-kangaroo-ch1Name`)).toBeVisible();

    await clickAndFillInput(page, `${location}-serial-${moduleId}-name`, `${location} Kx2`);
    await page.getByTestId(`${location}-kangaroo-baud`).selectOption('38400');
    await clickAndFillInput(page, `${location}-kangaroo-ch1Name`, `${location} Kx2 Ch1`);
    await clickAndFillInput(page, `${location}-kangaroo-ch2Name`, `${location} Kx2 Ch2`);
}

async function validateKangarooModule(page, location, moduleId) {
    await page.getByTestId(`${location}-serial-${moduleId}-header`).click();
    await expect(page.getByTestId(`${location}-kangaroo-baud`)).toBeVisible();

    await expect(page.getByTestId(`${location}-serial-${moduleId}-name`)).toHaveValue(`${location} Kx2`);
    await expect(page.getByTestId(`${location}-kangaroo-baud`)).toHaveValue('38400');
    await expect(page.getByTestId(`${location}-kangaroo-ch1Name`)).toHaveValue(`${location} Kx2 Ch1`);
    await expect(page.getByTestId(`${location}-kangaroo-ch2Name`)).toHaveValue(`${location} Kx2 Ch2`);
}

async function setHCRModuleValues(page, location, moduleId) {
    await clickAndFillInput(page, `${location}-serial-${moduleId}-name`, `${location} HCR`);
    await page.getByTestId(`${location}-hcr-serial-baud`).selectOption('57600');
}

async function validateHCRModule(page, location, moduleId) {
    await page.getByTestId(`${location}-serial-${moduleId}-header`).click();
    await expect(page.getByTestId(`${location}-hcr-serial-baud`)).toBeVisible();

    await expect(page.getByTestId(`${location}-serial-${moduleId}-name`)).toHaveValue(`${location} HCR`);
    await expect(page.getByTestId(`${location}-hcr-serial-baud`)).toHaveValue('57600');
}


async function setMaestroModuleValues(page, location, moduleId) {
    await clickAndFillInput(page, `${location}-serial-${moduleId}-name`, `${location} Maestro`);
    await page.getByTestId(`${location}-maestro-baud`).selectOption('115200');
    await page.getByTestId(`${location}-maestro-channel-count`).selectOption('12');

    // 1 - servo
    // 2 - digital
    for (let i = 1; i <= 12; i++) {
        const option = i % 2 === 0 ? '2' : '1';
        const invert = i % 3 === 0;

        await page.getByTestId(`${location}-maestro-ch-${i}-type`).selectOption(option);

        if (option === '1') {
            await clickAndFillInput(page, `${location}-maestro-ch-${i}-name`, `${location} MCHS ${i}`);
            await clickAndFillInput(page, `${location}-maestro-ch-${i}-minPulse`, (500 + i * 10).toString());
            await clickAndFillInput(page, `${location}-maestro-ch-${i}-maxPulse`, (2500 - i * 10).toString());
            await clickAndFillInput(page, `${location}-maestro-ch-${i}-homePosition`, (1250 + i * 5).toString());

            if (invert) {
                await page.getByTestId(`${location}-maestro-ch-${i}-invert-cbx`).getByRole('checkbox', { name: 'Inverted' }).check();
            }
        } else {
            await clickAndFillInput(page, `${location}-maestro-ch-${i}-name`, `${location} MCHO ${i}`);
            if (invert) {
                await page.getByTestId(`${location}-maestro-ch-${i}-invert-cbx`).getByRole('checkbox', { name: 'Default High' }).check();
            }
        }
    }
}

async function validateMaestroModule(page, location, moduleId) {
    await page.getByTestId(`${location}-serial-${moduleId}-header`).click();
    await expect(page.getByTestId(`${location}-maestro-baud`)).toBeVisible();

    await expect(page.getByTestId(`${location}-serial-${moduleId}-name`)).toHaveValue(`${location} Maestro`);
    await expect(page.getByTestId(`${location}-maestro-baud`)).toHaveValue('115200');
    await expect(page.getByTestId(`${location}-maestro-channel-count`)).toHaveValue('12');

    // 1 - servo
    // 2 - digital
    for (let i = 1; i <= 12; i++) {
        const option = i % 2 === 0 ? '2' : '1';
        const invert = i % 3 === 0;

        await expect(page.getByTestId(`${location}-maestro-ch-${i}-type`)).toHaveValue(option);

        if (option === '1') {
            await expect(page.getByTestId(`${location}-maestro-ch-${i}-name`)).toHaveValue(`${location} MCHS ${i}`);
            await expect(page.getByTestId(`${location}-maestro-ch-${i}-minPulse`)).toHaveValue((500 + i * 10).toString());
            await expect(page.getByTestId(`${location}-maestro-ch-${i}-maxPulse`)).toHaveValue((2500 - i * 10).toString());
            await expect(page.getByTestId(`${location}-maestro-ch-${i}-homePosition`)).toHaveValue((1250 + i * 5).toString());
            if (invert) {
                await expect(page.getByTestId(`${location}-maestro-ch-${i}-invert-cbx`).getByRole('checkbox', { name: 'Inverted' })).toBeChecked();
            } else {
                await expect(page.getByTestId(`${location}-maestro-ch-${i}-invert-cbx`).getByRole('checkbox', { name: 'Inverted' })).not.toBeChecked();
            }
        } else {
            await expect(page.getByTestId(`${location}-maestro-ch-${i}-name`)).toHaveValue(`${location} MCHO ${i}`);
            if (invert) {
                await expect(page.getByTestId(`${location}-maestro-ch-${i}-invert-cbx`).getByRole('checkbox', { name: 'Default High' })).toBeChecked();
            } else {
                await expect(page.getByTestId(`${location}-maestro-ch-${i}-invert-cbx`).getByRole('checkbox', { name: 'Default High' })).not.toBeChecked();
            }
        }
    }
}

async function addI2cModule(page, location, moduleId) {

    await page.getByTestId(`${location}-add-i2c`).click();

    await page.getByTestId('modal-module-select').selectOption(moduleId);
    await page.getByTestId('modal-add-module').click();

    await page.getByTestId(`${location}-i2c-${moduleId}-header`).click();
}

async function setI2cModuleValues(page, location, moduleId) {
    await clickAndFillInput(page, `${location}-i2c-${moduleId}-name`, `${location} I2C`);
    await page.getByTestId(`${location}-i2c-${moduleId}-address`).selectOption('42'); 
}

async function validateI2cModule(page, location, moduleId) {
    //await page.getByTestId(`${location}-i2c-${moduleId}-header`).click();

    await expect(page.getByTestId(`${location}-i2c-${moduleId}-name`)).toHaveValue(`${location} I2C`);
    await expect(page.getByTestId(`${location}-i2c-${moduleId}-address`)).toHaveValue('42');
}

async function setGpioChannelValues(page, location) {
    await page.getByTestId(`${location}-gpio-header`).click();

    for (let i = 0; i < 10; i++) {

        const even = i % 2 === 0;

        await clickAndFillInput(page, `${location}-gpio-ch-${i}-name`, `${location} GPIO ${i}`);
        await page.getByTestId(`${location}-gpio-ch-${i}-enabled`).getByRole('checkbox', { name: 'Enabled' }).check();

        if (even) {
            await page.getByTestId(`${location}-gpio-ch-${i}-default-high`).getByRole('checkbox', { name: 'Default High?' }).check();
        }
    }
}

async function validateGpioChannel(page, location) {
    await page.getByTestId(`${location}-gpio-header`).click();

    for (let i = 0; i < 10; i++) {

        const even = i % 2 === 0;

        await expect(page.getByTestId(`${location}-gpio-ch-${i}-name`)).toHaveValue(`${location} GPIO ${i}`);
        await expect(page.getByTestId(`${location}-gpio-ch-${i}-enabled`).getByRole('checkbox', { name: 'Enabled' })).toBeChecked();

        if (even) {
            await expect(page.getByTestId(`${location}-gpio-ch-${i}-default-high`).getByRole('checkbox', { name: 'Default High?' })).toBeChecked();
        } else {
            await expect(page.getByTestId(`${location}-gpio-ch-${i}-default-high`).getByRole('checkbox', { name: 'Default High?' })).not.toBeChecked
        }
    }
}
