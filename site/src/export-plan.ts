import {
  calculateDailyPlanItemNutrition,
  calculateDailyPlanTotals,
  calculateMealTotals,
  getExchangeOption,
  getFoodItem,
  type DailyPlan,
  type DailyPlanItem,
  type NutritionFacts,
} from "../../src/index.js";
import { planItemDisplayQuantity } from "./editable-planner.js";

const exportHeaders = [
  "Meal",
  "Item",
  "Amount",
  "Unit",
  "Calories",
  "Protein (gm)",
  "Carbs (gm)",
  "Fat (gm)",
  "Fiber (gm)",
  "Saturated fat (gm)",
] as const;

type ExportMetric = keyof NutritionFacts;

interface ExportRow {
  meal: string;
  item: string;
  amount?: number;
  unit?: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  saturatedFat?: number | null;
}

export interface PlanExportTargetSummary {
  calories: number | string;
  protein?: number | string;
  diet: string;
  macroRules?: string[];
  targetStatus: string;
}

export interface PlanExportOptions {
  targetSummary?: PlanExportTargetSummary;
}

export function planExportCsv(plan: DailyPlan, options?: PlanExportOptions) {
  return tableRows(plan, options).map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function planExportTsv(plan: DailyPlan, options?: PlanExportOptions) {
  return tableRows(plan, options).map((row) => row.join("\t")).join("\n");
}

export function planShareText(plan: DailyPlan, options?: PlanExportOptions) {
  const totals = calculateDailyPlanTotals(plan).values;
  const lines = [
    plan.displayName,
    `Daily total: ${formatNumber(totals.calories)} kcal · ${formatNumber(totals.protein)}gm protein`,
    ...targetSummaryTextLines(options?.targetSummary),
    "",
  ];

  for (const meal of plan.meals) {
    const mealTotals = calculateMealTotals(meal).values;
    lines.push(meal.displayName);

    for (const item of meal.items) {
      const amount = planItemAmount(item);
      const nutrition = calculateDailyPlanItemNutrition(item);
      lines.push(`- ${planItemLabel(item)}: ${formatNumber(amount.amount)}${amount.unit} · ${formatNumber(nutrition.calories)} kcal · ${formatNumber(nutrition.protein)}gm protein`);
    }

    lines.push(`Meal total: ${formatNumber(mealTotals.calories)} kcal · ${formatNumber(mealTotals.protein)}gm protein`, "");
  }

  return lines.join("\n").trim();
}

export function planExportHtmlTable(plan: DailyPlan, options?: PlanExportOptions) {
  const rows = tableRows(plan, options);
  const [header, ...body] = rows;

  return `<table><thead><tr>${header?.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("") ?? ""}</tr></thead><tbody>${body
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export function planExportExcelHtml(plan: DailyPlan, options?: PlanExportOptions) {
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
    th { background: #eee; font-weight: 700; }
  </style>
</head>
<body>${planExportHtmlTable(plan, options)}</body>
</html>`;
}

function tableRows(plan: DailyPlan, options?: PlanExportOptions) {
  const rows: string[][] = [[...exportHeaders]];

  for (const meal of plan.meals) {
    for (const item of meal.items) {
      rows.push(exportRowToCells({
        meal: meal.displayName,
        item: planItemLabel(item),
        ...planItemAmount(item),
        ...calculateDailyPlanItemNutrition(item),
      }));
    }

    rows.push(exportRowToCells({
      meal: meal.displayName,
      item: "Meal total",
      ...calculateMealTotals(meal).values,
    }));
  }

  rows.push(exportRowToCells({
    meal: "Daily total",
    item: plan.displayName,
    ...calculateDailyPlanTotals(plan).values,
  }));
  rows.push(...targetSummaryRows(options?.targetSummary));

  return rows;
}

function targetSummaryRows(summary: PlanExportTargetSummary | undefined) {
  if (!summary) {
    return [];
  }

  return [
    [],
    ["Target summary", ""],
    ["Target status", summary.targetStatus],
    ["Calorie target", formatTargetValue(summary.calories, "kcal")],
    ...(summary.protein !== undefined ? [["Protein target", formatTargetValue(summary.protein, "gm")]] : []),
    ["Diet", summary.diet],
    ["Macro rules", summary.macroRules && summary.macroRules.length > 0 ? summary.macroRules.join("; ") : "None"],
  ];
}

function targetSummaryTextLines(summary: PlanExportTargetSummary | undefined) {
  if (!summary) {
    return [];
  }

  return [
    `Target status: ${summary.targetStatus}`,
    `Calorie target: ${formatTargetValue(summary.calories, "kcal")}`,
    ...(summary.protein !== undefined ? [`Protein target: ${formatTargetValue(summary.protein, "gm")}`] : []),
    `Diet: ${summary.diet}`,
    `Macro rules: ${summary.macroRules && summary.macroRules.length > 0 ? summary.macroRules.join("; ") : "None"}`,
  ];
}

function exportRowToCells(row: ExportRow) {
  const metrics: ExportMetric[] = ["calories", "protein", "carbs", "fat", "fiber", "saturatedFat"];

  return [
    row.meal,
    row.item,
    formatNumber(row.amount),
    row.unit ?? "",
    ...metrics.map((metric) => formatNumber(row[metric])),
  ];
}

function planItemLabel(item: DailyPlanItem) {
  return item.kind === "food"
    ? getFoodItem(item.foodItemId).displayName
    : getExchangeOption(item.exchangeGroupId, item.exchangeOptionId).displayName;
}

function planItemAmount(item: DailyPlanItem) {
  const quantity = planItemDisplayQuantity(item);
  return { ...quantity, unit: "gm" };
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatTargetValue(value: number | string, suffix: string) {
  const formatted = typeof value === "number" ? formatNumber(value) : value.trim();
  return formatted === "" ? "" : `${formatted} ${suffix}`;
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
