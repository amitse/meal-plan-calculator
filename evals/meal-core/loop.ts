import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { argValue, hasToken, positionalArgs } from "../infra/cli.js";

const args = process.argv.slice(2);
const positional = positionalArgs(args, {
  flagsWithValues: ["--baseline", "--candidate", "--output", "--passes"],
  ignoredBareTokens: ["judge", "no-judge", "no-exit-code", "baseline", "capture-baseline"],
  ignoredAssignments: ["baseline", "candidate", "output", "passes"],
});
const baselinePath = argValue(args, "--baseline") ?? process.env.COPILOT_EVAL_BASELINE ?? positional[0] ?? join("eval-results", "meal-core-baseline.json");
const candidatePath = argValue(args, "--candidate") ?? process.env.COPILOT_EVAL_CANDIDATE ?? positional[1] ?? join("eval-results", "meal-core-candidate.json");
const hillClimbPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_HILL_CLIMB_OUTPUT ?? join("eval-results", "meal-core-hill-climb-report.json");
const passes = argValue(args, "--passes") ?? process.env.COPILOT_EVAL_HILL_CLIMB_PASSES ?? "4";
const judgeEnabled = !hasToken(args, "--no-judge") && (hasToken(args, "--judge") || process.env.COPILOT_EVAL_ENABLE_LLM === "1");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";
const captureBaselineOnly = hasToken(args, "--baseline-only") || hasToken(args, "--capture-baseline") || hasToken(args, "baseline");

if (captureBaselineOnly) {
  console.log(`Capturing meal-core baseline: ${baselinePath}`);
  runEval([baselinePath, "no-exit-code", ...(judgeEnabled ? ["judge"] : [])]);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.log(`No baseline found at ${baselinePath}; capturing current state as baseline first.`);
  runEval([baselinePath, "no-exit-code", ...(judgeEnabled ? ["judge"] : [])]);
}

console.log(`Capturing meal-core candidate: ${candidatePath}${judgeEnabled ? " with Copilot judge" : ""}`);
runEval([candidatePath, "no-exit-code", ...(judgeEnabled ? ["judge"] : [])]);

console.log(`Running meal-core hill climb: ${baselinePath} -> ${candidatePath}`);
runEval([
  "hill-climb",
  baselinePath,
  candidatePath,
  "output=" + hillClimbPath,
  "passes=" + passes,
  ...(noExitCode ? ["no-exit-code"] : []),
  ...(judgeEnabled ? ["judge"] : []),
]);

function runEval(scriptArgs: string[]) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "eval", "--", "meal-core", ...scriptArgs], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status && result.status !== 0) {
    process.exit(result.status);
  }
}
