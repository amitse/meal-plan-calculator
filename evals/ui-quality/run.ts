import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { argValue, firstPositionalArg, hasToken } from "../infra/cli.js";
import { writeJsonReport } from "../infra/report-io.js";
import { runUiEaseCopilotJudge, type UiEaseHardGateCheck, type UiEaseScreenshotInput } from "../ui-ease/judge.js";

type EvalStatus = "pass" | "fail" | "skip";

interface UiQualityScenario {
  id: string;
  title: string;
  storyId: string;
  snapshotFile: string;
  dimensions: string[];
}

interface UiQualityCheck {
  id: string;
  severity: "hard" | "judge";
  status: EvalStatus;
  message: string;
  evidence?: unknown;
}

interface UiQualityScenarioResult {
  scenarioId: string;
  title: string;
  status: EvalStatus;
  deterministicScore: number;
  checks: UiQualityCheck[];
  screenshotPath?: string;
  judge?: unknown;
}

const scenarios: UiQualityScenario[] = [
  scenario("first-run", "First run", "app-screens--first-run", ["mobile-visual-hierarchy", "premium-polish"]),
  scenario("first-run-with-active-settings", "First run with active settings", "app-screens--first-run-with-active-settings", ["mobile-visual-hierarchy"]),
  scenario("manual-plan", "Manual plan", "app-screens--manual-plan", ["mobile-visual-hierarchy"]),
  scenario("generated-plan", "Generated plan", "app-screens--generated-plan", ["mobile-visual-hierarchy", "premium-polish"]),
  scenario("adjust-drawer", "Adjust drawer", "app-screens--adjust-drawer", ["mobile-visual-hierarchy"]),
  scenario("share-drawer", "Share drawer", "app-screens--share-drawer", ["mobile-visual-hierarchy"]),
  scenario("swap-drawer", "Swap drawer", "app-screens--swap-drawer", ["mobile-visual-hierarchy"]),
  scenario("add-meal-blocked", "Add meal blocked", "app-screens--add-meal-blocked", ["clear-recovery-state"]),
  scenario("light-theme", "Light theme", "app-screens--light-theme", ["premium-polish", "theme-consistency"]),
];

const args = process.argv.slice(2);
const outputPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_OUTPUT ?? firstPositionalArg(args, {
  flagsWithValues: ["--output"],
  ignoredAssignments: ["output"],
  ignoredBareTokens: ["judge", "no-exit-code"],
}) ?? join("eval-results", "ui-quality-report.json");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";
const judgeEnabled = hasToken(args, "--judge") || process.env.COPILOT_EVAL_ENABLE_LLM === "1";

const storySourcePath = join("site", "src", "App.stories.tsx");
const visualSpecPath = join("tests", "visual", "storybook-screenshots.spec.ts");
const snapshotDir = join("tests", "visual", "storybook-screenshots.spec.ts-snapshots");
const results = await Promise.all(scenarios.map(runScenario));

const report = {
  generatedAt: new Date().toISOString(),
  status: overallStatus(results),
  judgeEnabled,
  storySourcePath,
  visualSpecPath,
  snapshotDir,
  results,
};

await writeJsonReport(outputPath, report);
printReport(report, outputPath);

if (report.status === "fail" && !noExitCode) {
  process.exitCode = 1;
}

function scenario(id: string, title: string, storyId: string, dimensions: string[]): UiQualityScenario {
  return {
    id,
    title,
    storyId,
    snapshotFile: `${storyId}-chromium-mobile-win32.png`,
    dimensions,
  };
}

async function runScenario(item: UiQualityScenario): Promise<UiQualityScenarioResult> {
  const screenshotPath = join(snapshotDir, item.snapshotFile);
  const checks: UiQualityCheck[] = [
    check("story-source-exists", existsSync(storySourcePath), "Storybook App screen stories source exists.", { path: storySourcePath }),
    check("visual-spec-exists", existsSync(visualSpecPath), "Playwright visual screenshot spec exists.", { path: visualSpecPath }),
    check("story-declared-in-spec", sourceIncludes(visualSpecPath, item.storyId), "Story ID is enumerated in visual screenshot spec.", { storyId: item.storyId }),
    check("story-export-present", sourceIncludes(storySourcePath, storyExportName(item.id)), "Story export is present in App.stories.tsx.", { exportName: storyExportName(item.id) }),
    check("snapshot-baseline-present", existsSync(screenshotPath), "Mobile screenshot snapshot baseline exists.", { screenshotPath }),
    check("mobile-snapshot-count", snapshotCount() >= scenarios.length, "Snapshot directory contains a baseline for every expected mobile story.", { expected: scenarios.length, actual: snapshotCount() }),
  ];

  const hardGateChecks: UiEaseHardGateCheck[] = checks.map((entry) => ({
    id: entry.id,
    status: entry.status,
    message: entry.message,
    severity: "hard",
    evidence: entry.evidence,
  }));
  const judge = judgeEnabled
    ? await runUiEaseCopilotJudge({
      scenario: {
        id: item.id,
        label: item.title,
        task: "Review mobile Storybook screenshot quality and product polish.",
        expectedUserOutcome: "The screen should look like a compact, useful meal-plan calculator state with clear hierarchy.",
        notes: item.dimensions,
      },
      hardGateChecks,
      screenshots: screenshotInput(item, screenshotPath),
      traces: [],
    })
    : { status: "skip", summary: "UI quality judge skipped. Re-run with judge or COPILOT_EVAL_ENABLE_LLM=1." };

  return {
    scenarioId: item.id,
    title: item.title,
    status: checks.some((entry) => entry.status === "fail") || (judgeEnabled && (judge as { status?: EvalStatus }).status === "fail") ? "fail" : "pass",
    deterministicScore: scoreChecks(checks),
    checks,
    screenshotPath: existsSync(screenshotPath) ? screenshotPath : undefined,
    judge,
  };
}

function screenshotInput(item: UiQualityScenario, path: string): UiEaseScreenshotInput[] {
  if (!existsSync(path)) return [];
  return [{
    id: item.id,
    label: item.title,
    viewport: { width: 390, height: 844, isMobile: true },
    screenshotPath: path,
    imageBase64: readFileSync(path).toString("base64"),
    observations: [`Storybook story ${item.storyId}`, `Judge dimensions: ${item.dimensions.join(", ")}`],
  }];
}

function sourceIncludes(path: string, value: string) {
  return existsSync(path) && readFileSync(path, "utf8").includes(value);
}

function storyExportName(id: string) {
  return id.split("-").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join("");
}

function snapshotCount() {
  return existsSync(snapshotDir)
    ? readdirSync(snapshotDir).filter((file) => file.endsWith(".png")).length
    : 0;
}

function check(id: string, pass: boolean, message: string, evidence?: unknown): UiQualityCheck {
  return { id, severity: "hard", status: pass ? "pass" : "fail", message, evidence };
}

function overallStatus(results: UiQualityScenarioResult[]): EvalStatus {
  return results.some((result) => result.status === "fail") ? "fail" : "pass";
}

function scoreChecks(checks: UiQualityCheck[]) {
  return checks.length === 0 ? 0 : checks.filter((check) => check.status === "pass").length / checks.length;
}

function printReport(report: { status: EvalStatus; results: UiQualityScenarioResult[] }, path: string) {
  console.log(`UI-quality eval: ${report.status.toUpperCase()} (${report.results.length} scenarios)`);
  for (const result of report.results) {
    const failed = result.checks.filter((check) => check.status === "fail");
    console.log(`- ${result.status.toUpperCase()} ${result.scenarioId}: ${result.checks.length} checks, ${failed.length} failed`);
    for (const check of failed) console.log(`  - ${check.id}: ${check.message}`);
  }
  console.log(`Report: ${path}`);
}
