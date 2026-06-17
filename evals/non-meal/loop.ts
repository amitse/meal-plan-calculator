import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { argValue, hasToken, positionalArgs } from "../infra/cli.js";
import { getNonMealSuiteDefinition } from "./adapters.js";

const [suiteId, ...args] = process.argv.slice(2);
const definition = getNonMealSuiteDefinition(suiteId);
const positional = positionalArgs(args, {
  flagsWithValues: ["--baseline", "--candidate", "--output", "--passes"],
  ignoredBareTokens: ["judge", "no-judge", "no-exit-code", "baseline", "capture-baseline"],
  ignoredAssignments: ["baseline", "candidate", "output", "passes"],
});
const baselinePath = argValue(args, "--baseline") ?? process.env.COPILOT_EVAL_BASELINE ?? positional[0] ?? definition.defaultBaselinePath;
const candidatePath = argValue(args, "--candidate") ?? process.env.COPILOT_EVAL_CANDIDATE ?? positional[1] ?? definition.defaultCandidatePath;
const hillClimbPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_HILL_CLIMB_OUTPUT ?? definition.defaultHillClimbPath;
const passes = argValue(args, "--passes") ?? process.env.COPILOT_EVAL_HILL_CLIMB_PASSES ?? "4";
const judgeEnabled = !hasToken(args, "--no-judge") && (hasToken(args, "--judge") || process.env.COPILOT_EVAL_ENABLE_LLM === "1");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";
const captureBaselineOnly = hasToken(args, "--baseline-only") || hasToken(args, "--capture-baseline") || hasToken(args, "baseline");

if (captureBaselineOnly) {
  console.log(`Capturing ${definition.evalName} baseline: ${baselinePath}`);
  captureReport(baselinePath, judgeEnabled);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.log(`No baseline found at ${baselinePath}; capturing current ${definition.evalName} state as baseline first.`);
  captureReport(baselinePath, judgeEnabled);
}

console.log(`Capturing ${definition.evalName} candidate: ${candidatePath}${judgeEnabled ? " with Copilot judge" : ""}`);
captureReport(candidatePath, judgeEnabled);

console.log(`Running ${definition.evalName} hill climb: ${baselinePath} -> ${candidatePath}`);
runEvalCommand([
  "hill-climb",
  baselinePath,
  candidatePath,
  `output=${hillClimbPath}`,
  `passes=${passes}`,
  ...(noExitCode ? ["no-exit-code"] : []),
  ...(judgeEnabled ? ["judge"] : []),
]);

function captureReport(outputPath: string, judge: boolean) {
  runEvalCommand([
    outputPath,
    "no-exit-code",
    ...(judge && definition.runnerSupportsJudge ? ["judge"] : []),
  ]);
}

function runEvalCommand(scriptArgs: string[]) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "eval", "--", definition.suiteId, ...scriptArgs], {
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
