import { expect, test } from "@playwright/test";

const stories = [
  "app-screens--first-run",
  "app-screens--first-run-with-active-settings",
  "app-screens--generated-plan",
  "app-screens--adjust-drawer",
  "app-screens--share-drawer",
  "app-screens--swap-drawer",
  "app-screens--add-meal-blocked",
  "app-screens--light-theme",
] as const;

for (const storyId of stories) {
  test(`${storyId} screenshot`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
    await page.waitForSelector("main.app-shell");
    await page.waitForSelector('body[data-story-ready="true"]');
    await page.evaluate(() => document.fonts?.ready);

    await expect(page).toHaveScreenshot(`${storyId}.png`, {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
}
