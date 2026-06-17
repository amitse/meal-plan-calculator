import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { argValue, firstPositionalArg, hasToken } from "../infra/cli.js";
import { writeJsonReport } from "../infra/report-io.js";
import { uiEaseHardGates } from "../ui-ease/hard-gates.js";
import { uiTraceScenarios } from "../ui-ease/trace-scenarios.js";

type EvalStatus = "pass" | "fail";

const args = process.argv.slice(2);
const outputPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_OUTPUT ?? firstPositionalArg(args, {
  flagsWithValues: ["--output"],
  ignoredAssignments: ["output"],
  ignoredBareTokens: ["no-exit-code"],
}) ?? join("eval-results", "accessibility-report.json");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";

const mainSource = read("site\\src\\main.tsx");
const hardGateIds = new Set(uiEaseHardGates.map((gate) => gate.id));
const scenarioIds = new Set(uiTraceScenarios.map((scenario) => scenario.id));
const checks = [
  check("contrast-gate-implemented", hardGateIds.has("wcag-aa-contrast"), "WCAG AA contrast hard gate is implemented in UI hard gates."),
  check("focus-gate-implemented", hardGateIds.has("visible-focus-states"), "Visible keyboard focus hard gate is implemented."),
  check("dialog-label-gate-implemented", hardGateIds.has("dialogs-labelled"), "Dialog accessible-label hard gate is implemented."),
  check("forms-name-gate-implemented", hardGateIds.has("forms-accessible-names"), "Form accessible-name hard gate is implemented."),
  check("touch-target-gate-implemented", hardGateIds.has("touch-targets-44px"), "Touch-target hard gate is implemented."),
  check("first-run-trace-covered", scenarioIds.has("first-run-generate"), "First-run form accessibility has task trace coverage."),
  check("generated-plan-trace-covered", scenarioIds.has("first-run-generate") && scenarioIds.has("swap-edit-serving"), "Generated plan navigation/editing has trace coverage."),
  check("drawer-traces-covered", scenarioIds.has("adjust-regenerate") && scenarioIds.has("share-url-roundtrip") && scenarioIds.has("swap-edit-serving"), "Adjust, share, and swap drawers have trace coverage."),
  check("blocked-state-trace-covered", scenarioIds.has("blocked-plan-recovery"), "Blocked state recovery has trace coverage."),
  check("theme-trace-covered", scenarioIds.has("theme-switch"), "Theme accessibility has trace coverage."),
  check("status-or-live-region-present", /aria-live|role=["']status["']|role=["']alert["']/.test(mainSource), "Status/recovery messages expose an ARIA live/status channel in UI source."),
  check("reduced-motion-source-present", /prefers-reduced-motion|reduced-motion/i.test(mainSource), "UI source accounts for reduced motion or motion-free state changes."),
];

const report = {
  generatedAt: new Date().toISOString(),
  status: checks.some((entry) => entry.status === "fail") ? "fail" as const : "pass" as const,
  source: {
    hardGates: "evals\\ui-ease\\hard-gates.ts",
    traces: "evals\\ui-ease\\trace-scenarios.ts",
    app: "site\\src\\main.tsx",
  },
  results: [{
    scenarioId: "accessibility-hard-gates",
    status: checks.some((entry) => entry.status === "fail") ? "fail" as const : "pass" as const,
    deterministicScore: scoreChecks(checks),
    checks,
  }],
  checks,
};

await writeJsonReport(outputPath, report);
console.log(`Accessibility eval: ${report.status.toUpperCase()} (${checks.length} checks)`);
for (const failed of checks.filter((entry) => entry.status === "fail")) console.log(`- ${failed.id}: ${failed.message}`);
console.log(`Report: ${outputPath}`);
if (report.status === "fail" && !noExitCode) process.exitCode = 1;

function read(path: string) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function check(id: string, pass: boolean, message: string, evidence?: unknown) {
  return { id, severity: "hard" as const, status: pass ? "pass" as EvalStatus : "fail" as EvalStatus, message, evidence };
}

function scoreChecks(checksToScore: Array<{ status: EvalStatus }>) {
  return checksToScore.length === 0 ? 0 : checksToScore.filter((check) => check.status === "pass").length / checksToScore.length;
}
