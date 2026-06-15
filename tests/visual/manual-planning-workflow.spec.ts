import { expect, test } from "@playwright/test";

test("manual planning starts without generation and supports adding foods", async ({ page }) => {
  await page.goto("/iframe.html?id=app-screens--first-run&viewMode=story");
  await page.waitForSelector("main.app-shell");
  await page.waitForSelector('body[data-story-ready="true"]');

  await page.getByRole("button", { name: "Start manually" }).click();

  await expect(page.getByRole("heading", { name: "Daily plan" })).toBeVisible();
  await expect(page.getByText("Manual plan.")).toBeVisible();
  await expect(page.getByText("No foods in this meal.")).toBeVisible();

  await page.locator(".meal-tools > summary").click();
  await page.getByRole("button", { name: "Add protein to Meal 1" }).click();
  await page.getByRole("button", { name: "Add grain to Meal 1" }).click();

  await expect(page.getByText("No foods in this meal.")).toBeHidden();
  await expect(page.getByText("2 items")).toBeVisible();
  await expect(page.getByLabel("Meal 1 meal total")).toContainText(/kcal/);
});
