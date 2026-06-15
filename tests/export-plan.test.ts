import { describe, expect, it } from "vitest";
import type { DailyPlan } from "../src/index.js";
import {
  planExportCsv,
  planExportExcelHtml,
  planExportTsv,
  planShareText,
  type PlanExportTargetSummary,
} from "../site/src/export-plan.js";

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
          {
            kind: "exchange",
            id: "breakfast-carb",
            exchangeGroupId: "grain",
            exchangeOptionId: "cooked-rice",
            exchangeUnits: 2,
          },
        ],
      },
    ],
  };
  const targetSummary: PlanExportTargetSummary = {
    calories: 2000,
    protein: 75,
    diet: "Vegetarian",
    macroRules: ["Carbs min 100gm", "Fat max 60gm"],
    targetStatus: "Needs adjustment",
  };

  it("exports CSV with item rows, meal totals, daily totals, and escaped cells", () => {
    const csv = planExportCsv(plan);

    expect(csv).toContain("Meal,Item,Amount,Unit,Calories,Protein (gm),Carbs (gm),Fat (gm),Fiber (gm),Saturated fat (gm)");
    expect(csv).toContain("\"Breakfast, hot\"");
    expect(csv).toContain("Meal total");
    expect(csv).toContain("Daily total,\"A \"\"quoted\"\" plan\"");
  });

  it("exports paste-friendly tabular text", () => {
    const tsv = planExportTsv(plan);

    expect(tsv).toContain("Meal\tItem\tAmount\tUnit");
    expect(tsv).toContain("Breakfast, hot\tNuts\t15\tgm");
    expect(tsv).toContain("Breakfast, hot\tCooked rice\t300\tgm");
  });

  it("exports an Excel-compatible HTML workbook", () => {
    const workbook = planExportExcelHtml(plan);

    expect(workbook).toContain("urn:schemas-microsoft-com:office:excel");
    expect(workbook).toContain("<table>");
    expect(workbook).toContain("A &quot;quoted&quot; plan");
  });

  it("exports phone-friendly share text", () => {
    const text = planShareText(plan);

    expect(text).toContain("A \"quoted\" plan");
    expect(text).toContain("Daily total:");
    expect(text).toContain("Breakfast, hot");
    expect(text).toContain("- Nuts: 15gm");
    expect(text).toContain("Meal total:");
  });

  it("includes target context in CSV, spreadsheet, and paste-friendly exports", () => {
    const options = { targetSummary };
    const csv = planExportCsv(plan, options);
    const tsv = planExportTsv(plan, options);
    const workbook = planExportExcelHtml(plan, options);
    const text = planShareText(plan, options);

    expect(csv).toContain("Target status,Needs adjustment");
    expect(csv).toContain("Calorie target,2000 kcal");
    expect(csv).toContain("Protein target,75 gm");
    expect(csv).toContain("Diet,Vegetarian");
    expect(csv).toContain("Macro rules,Carbs min 100gm; Fat max 60gm");
    expect(tsv).toContain("Target status\tNeeds adjustment");
    expect(workbook).toContain("<td>Target summary</td>");
    expect(workbook).toContain("<td>Carbs min 100gm; Fat max 60gm</td>");
    expect(text).toContain("Target status: Needs adjustment");
    expect(text).toContain("Calorie target: 2000 kcal");
    expect(text).toContain("Protein target: 75 gm");
    expect(text).toContain("Diet: Vegetarian");
    expect(text).toContain("Macro rules: Carbs min 100gm; Fat max 60gm");
  });
});
