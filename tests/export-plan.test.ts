import { describe, expect, it } from "vitest";
import type { DailyPlan } from "../src/index.js";
import { planExportCsv, planExportExcelHtml, planExportTsv } from "../site/src/export-plan.js";

describe("plan export formatting", () => {
  const plan: DailyPlan = {
    id: "export-test",
    displayName: "A \"quoted\" plan",
    meals: [
      {
        id: "breakfast",
        displayName: "Breakfast, hot",
        items: [
          {
            kind: "food",
            id: "snack-nuts",
            foodItemId: "nuts",
            quantity: { amount: 15, unit: "g" },
          },
        ],
      },
    ],
  };

  it("exports CSV with item rows, meal totals, daily totals, and escaped cells", () => {
    const csv = planExportCsv(plan);

    expect(csv).toContain("Meal,Item,Amount,Unit,Calories,Protein (g),Carbs (g),Fat (g),Fiber (g),Saturated fat (g)");
    expect(csv).toContain("\"Breakfast, hot\"");
    expect(csv).toContain("Meal total");
    expect(csv).toContain("Daily total,\"A \"\"quoted\"\" plan\"");
  });

  it("exports paste-friendly tabular text", () => {
    const tsv = planExportTsv(plan);

    expect(tsv).toContain("Meal\tItem\tAmount\tUnit");
    expect(tsv).toContain("Breakfast, hot\tNuts\t15\tg");
  });

  it("exports an Excel-compatible HTML workbook", () => {
    const workbook = planExportExcelHtml(plan);

    expect(workbook).toContain("urn:schemas-microsoft-com:office:excel");
    expect(workbook).toContain("<table>");
    expect(workbook).toContain("A &quot;quoted&quot; plan");
  });
});
