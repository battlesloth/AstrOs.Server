import { Page } from "@playwright/test";

export async function clickAndFillInput(
    page: Page,
    selector: string,
    text: string
): Promise<void> {
    await page.getByTestId(selector).click();
    await page.getByTestId(selector).fill(text);
}