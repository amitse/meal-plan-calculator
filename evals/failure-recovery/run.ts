import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DailyPlan } from "../../src/index.js";
import { argValue, firstPositionalArg, hasToken } from "../infra/cli.js";
import { writeJsonReport } from "../infra/report-io.js";
import { failureRecoveryMessages, generateEditablePlan, generateEditablePlanResult, initialFormState, planEvaluation } from "../../site/src/editable-planner.js";

type EvalStatus = "pass" | "fail";

const args = process.argv.slice(2);
const outputPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_OUTPUT ?? firstPositionalArg(args, {
  flagsWithValues: ["--output"],
  ignoredAssignments: ["output"],
  ignoredBareTokens: ["no-exit-code"],
}) ?? join("eval-results", "failure-recovery-report.json");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";

const fatLimitedForm = { ...initialFormState, fat: { mode: "max" as const, value: "1" } };
const fatPlan = generateEditablePlan(fatLimitedForm, undefined, new Set(), 6);
const fatMessages = fatPlan ? failureRecoveryMessages(planEvaluation(fatPlan, fatLimitedForm)) : [];
const noCandidate = generateEditablePlanResult(fatLimitedForm, undefined, new Set(), 6);
const nonVegetarianPlan = generateEditablePlan({
  ...initialFormState,
  dietaryLevel: "nonVegetarian",
  preferredProteins: ["chicken-fish-100g"],
  avoidEggs: false,
  avoidChickenFish: false,
}, undefined, new Set(), 8);
const lockedDietConflict = generateEditablePlanResult(initialFormState, nonVegetarianPlan, new Set(["lunch-protein"]), 8);
const lockedPaneerPlan: DailyPlan = {
  id: "locked-paneer-plan",
  displayName: "Locked paneer plan",
  meals: [{
    id: "lunch",
    displayName: "Lunch",
    items: [{ kind: "exchange", id: "lunch-protein", exchangeGroupId: "protein-serving", exchangeOptionId: "paneer-50g", exchangeUnits: 1, roles: ["protein"] }],
  }],
};
const lockedAvoidConflict = generateEditablePlanResult({ ...initialFormState, avoidPaneer: true }, lockedPaneerPlan, new Set(["lunch-protein"]), 8);
const storySource = read("site\\src\\App.stories.tsx");
const appSource = read("site\\src\\main.tsx");

const checks = [
  check("failed-target-bounds-action-copy", fatMessages.some((message) => /Fat is over max/.test(message) && /Relax the fat max/.test(message) && /before regenerating/.test(message)), "Failed target bounds name the metric and recovery action.", fatMessages),
  check("no-candidate-blocker-copy", !noCandidate.plan && /Fat is over max/.test(noCandidate.blockers[0] ?? "") && /Relax the fat max/.test(noCandidate.blockers[0] ?? ""), "No-candidate generation returns blocker copy instead of a fake plan.", noCandidate.blockers),
  check("locked-diet-conflict-copy", !lockedDietConflict.plan && /Chicken \/ fish is locked/.test(lockedDietConflict.blockers[0] ?? "") && /vegetarian diet excludes it/.test(lockedDietConflict.blockers[0] ?? ""), "Locked diet conflict names the locked item and diet conflict.", lockedDietConflict.blockers),
  check("locked-avoid-conflict-copy", !lockedAvoidConflict.plan && /Paneer is locked/.test(lockedAvoidConflict.blockers[0] ?? "") && /avoid paneer excludes it/.test(lockedAvoidConflict.blockers[0] ?? ""), "Locked avoid-rule conflict names the avoid rule to relax.", lockedAvoidConflict.blockers),
  check("blocked-state-story-present", storySource.includes("AddMealBlocked") && storySource.includes("add-meal-blocked"), "Blocked add-meal Storybook state is present."),
  check("visible-ui-recovery-action", /Relax food rules before adding a meal/.test(appSource) || /blocked|recovery|Relax/.test(appSource), "Blocked UI source includes visible recovery/action copy."),
];
const report = {
  generatedAt: new Date().toISOString(),
  status: checks.some((entry) => entry.status === "fail") ? "fail" as const : "pass" as const,
  results: [{
    scenarioId: "failure-recovery-copy",
    status: checks.some((entry) => entry.status === "fail") ? "fail" as const : "pass" as const,
    deterministicScore: scoreChecks(checks),
    checks,
  }],
  checks,
};

await writeJsonReport(outputPath, report);
console.log(`Failure-recovery eval: ${report.status.toUpperCase()} (${checks.length} checks)`);
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
