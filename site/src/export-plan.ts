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

const exportHeaders = [
  "Meal",
  "Item",
  "Amount",
  "Unit",
  "Calories",
  "Protein (g)",
  "Carbs (g)",
  "Fat (g)",
  "Fiber (g)",
  "Saturated fat (g)",
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

export function planExportCsv(plan: DailyPlan) {
  return tableRows(plan).map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function planExportTsv(plan: DailyPlan) {
  return tableRows(plan).map((row) => row.join("\t")).join("\n");
}

export function planExportHtmlTable(plan: DailyPlan) {
  const rows = tableRows(plan);
  const [header, ...body] = rows;

  return `<table><thead><tr>${header?.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("") ?? ""}</tr></thead><tbody>${body
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export function planExportExcelHtml(plan: DailyPlan) {
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
<body>${planExportHtmlTable(plan)}</body>
</html>`;
}

function tableRows(plan: DailyPlan) {
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

  return rows;
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
  if (item.kind === "food") {
    return { amount: item.quantity.amount, unit: item.quantity.unit };
  }

  return { amount: item.exchangeUnits ?? 1, unit: "serving" };
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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
