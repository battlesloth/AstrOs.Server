import { Page } from "@playwright/test";

export async function clickAndFillInput(
    page: Page,
    selector: string,
    text: string
): Promise<void> {
    const input = page.getByTestId(selector);

    await input.scrollIntoViewIfNeeded();
    await input.fill(text);
}