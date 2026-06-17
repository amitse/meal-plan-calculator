import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DailyPlan } from "../../src/index.js";
import { argValue, firstPositionalArg, hasToken } from "../infra/cli.js";
import { writeJsonReport } from "../infra/report-io.js";
import { decodeShareState, encodeShareState, initialFormState, shareUrlForState } from "../../site/src/editable-planner.js";
import { planExportCsv, planExportExcelHtml, planExportTsv, planShareText, type PlanExportTargetSummary } from "../../site/src/export-plan.js";

type EvalStatus = "pass" | "fail";

const args = process.argv.slice(2);
const outputPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_OUTPUT ?? firstPositionalArg(args, {
  flagsWithValues: ["--output"],
  ignoredAssignments: ["output"],
  ignoredBareTokens: ["no-exit-code"],
}) ?? join("eval-results", "sharing-export-report.json");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";
const sampleDir = join("eval-results", "sharing-export-samples");
mkdirSync(sampleDir, { recursive: true });

const plan: DailyPlan = {
  id: "sharing-export-eval",
  displayName: "Share, export eval",
  meals: [{
    id: "breakfast",
    displayName: "Breakfast, hot",
    items: [
      { kind: "food", id: "snack-nuts", foodItemId: "nuts", quantity: { amount: 15, unit: "g" } },
      { kind: "exchange", id: "breakfast-carb", exchangeGroupId: "grain", exchangeOptionId: "cooked-rice", exchangeUnits: 2 },
      { kind: "exchange", id: "breakfast-eggs", exchangeGroupId: "protein-serving", exchangeOptionId: "two-whole-eggs", exchangeUnits: 1 },
    ],
  }],
};
const targetSummary: PlanExportTargetSummary = {
  calories: 2000,
  protein: 75,
  diet: "Vegetarian",
  macroRules: ["Carbs min 100gm", "Fat max 60gm"],
  targetStatus: "Needs adjustment",
};
const csv = planExportCsv(plan, { targetSummary });
const tsv = planExportTsv(plan, { targetSummary });
const html = planExportExcelHtml(plan, { targetSummary });
const text = planShareText(plan, { targetSummary });
const encoded = encodeShareState({ form: initialFormState, plan, lockedItemIds: ["breakfast-carb"], mealTargets: { breakfast: { protein: "25" } } });
const decoded = decodeShareState(encoded);
const shareUrl = shareUrlForState({ form: initialFormState, plan, lockedItemIds: ["breakfast-carb"], mealTargets: { breakfast: { protein: "25" } } }, "https://example.test/app");

writeSample("sample.csv", csv);
writeSample("sample.tsv", tsv);
writeSample("sample.html", html);
writeSample("share.txt", text);

const checks = [
  check("csv-escaping-and-totals", csv.includes("\"Breakfast, hot\"") && csv.includes("Meal total") && csv.includes("Daily total"), "CSV includes escaped meal names, meal totals, and daily totals."),
  check("tsv-paste-friendly", tsv.includes("Meal\tItem\tAmount\tUnit") && tsv.includes("Cooked rice\t300\tgm"), "TSV remains paste-friendly with practical units."),
  check("excel-html-compatible", html.includes("urn:schemas-microsoft-com:office:excel") && html.includes("<table>"), "Spreadsheet HTML includes Excel-compatible document and table."),
  check("phone-share-text", text.includes("Daily total:") && text.includes("Meal total:") && text.includes("Share, export eval"), "Share text is phone-readable and includes totals."),
  check("practical-export-units", text.includes("Whole eggs: 2 eggs") && tsv.includes("Whole eggs\t2\teggs"), "Whole-unit exports use eggs instead of raw counts."),
  check("target-context-included", [csv, tsv, html, text].every((value) => value.includes("Target status") && value.includes("Protein target")), "All export formats include target context."),
  check("share-state-round-trip", decoded?.lockedItemIds.includes("breakfast-carb") === true && decoded.mealTargets.breakfast?.protein === "25" && decoded.plan?.id === plan.id, "Encoded share state preserves plan, locks, form, and meal targets."),
  check("share-url-contains-state", new URL(shareUrl).searchParams.has("s"), "Share URL includes encoded state parameter."),
  check("image-export-fallback-declared", text.length > 0, "Share-text fallback artifact is available for image/share failures.", { sample: join(sampleDir, "share.txt") }),
];
const report = {
  generatedAt: new Date().toISOString(),
  status: checks.some((entry) => entry.status === "fail") ? "fail" as const : "pass" as const,
  sampleDir,
  results: [{
    scenarioId: "sharing-export-formats",
    status: checks.some((entry) => entry.status === "fail") ? "fail" as const : "pass" as const,
    deterministicScore: scoreChecks(checks),
    checks,
  }],
  checks,
};

await writeJsonReport(outputPath, report);
console.log(`Sharing/export eval: ${report.status.toUpperCase()} (${checks.length} checks)`);
for (const failed of checks.filter((entry) => entry.status === "fail")) console.log(`- ${failed.id}: ${failed.message}`);
console.log(`Report: ${outputPath}`);
if (report.status === "fail" && !noExitCode) process.exitCode = 1;

function writeSample(name: string, content: string) {
  writeFileSync(join(sampleDir, name), content);
}

function check(id: string, pass: boolean, message: string, evidence?: unknown) {
  return { id, severity: "hard" as const, status: pass ? "pass" as EvalStatus : "fail" as EvalStatus, message, evidence };
}

function scoreChecks(checksToScore: Array<{ status: EvalStatus }>) {
  return checksToScore.length === 0 ? 0 : checksToScore.filter((check) => check.status === "pass").length / checksToScore.length;
}
