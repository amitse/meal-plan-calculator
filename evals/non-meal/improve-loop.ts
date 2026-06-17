import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { argValue, hasToken } from "../infra/cli.js";
import type { HillClimbReport } from "../infra/hill-climb.js";
import { readJsonReport, writeJsonReport } from "../infra/report-io.js";
import { getNonMealSuiteDefinition } from "./adapters.js";

type ImproveLoopStopReason = "accepted" | "waiting-for-apply" | "max-iterations" | "apply-failed";

interface ImproveLoopIteration {
  iteration: number;
  candidatePath: string;
  hillClimbPath: string;
  improvePlanPath: string;
  recommendation: HillClimbReport["recommendation"];
  fixedHardFailures: number;
  newHardFailures: number;
  baselineHardFailures: number;
  candidateHardFailures: number;
  promotedToBaseline: boolean;
  improvementPlanWritten: boolean;
  applyCommandRun: boolean;
  applyExitCode?: number;
}

interface ImproveLoopReport {
  generatedAt: string;
  evalName: string;
  stopReason: ImproveLoopStopReason;
  baselinePath: string;
  maxIterations: number;
  judgeEnabled: boolean;
  applyCommandConfigured: boolean;
  iterations: ImproveLoopIteration[];
}

const [suiteId, ...args] = process.argv.slice(2);
const definition = getNonMealSuiteDefinition(suiteId);
const maxIterations = positiveInteger(argValue(args, "--max-iterations") ?? process.env.COPILOT_EVAL_IMPROVE_LOOP_MAX_ITERATIONS, 3);
const baselinePath = argValue(args, "--baseline") ?? process.env.COPILOT_EVAL_BASELINE ?? definition.defaultBaselinePath;
const workDir = argValue(args, "--work-dir") ?? process.env.COPILOT_EVAL_IMPROVE_LOOP_DIR ?? join("eval-results", `${definition.evalName}-improve-loop`);
const outputPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_IMPROVE_LOOP_OUTPUT ?? join(workDir, "report.json");
const passes = argValue(args, "--passes") ?? process.env.COPILOT_EVAL_HILL_CLIMB_PASSES ?? "4";
const useBuiltInAutoApply = hasToken(args, "--auto-apply");
const applyCommand = argValue(args, "--apply-command")
  ?? process.env.COPILOT_EVAL_APPLY_COMMAND
  ?? (useBuiltInAutoApply ? "npm run eval -- meal-core apply-plan" : undefined);
const judgeEnabled = !hasToken(args, "--no-judge") && (hasToken(args, "--judge") || process.env.COPILOT_EVAL_ENABLE_LLM === "1");
const dryRunImprove = hasToken(args, "--dry-run") || process.env.COPILOT_EVAL_IMPROVE_DRY_RUN === "1";
const promoteProgress = !hasToken(args, "--no-promote-progress");

mkdirSync(workDir, { recursive: true });

if (applyCommand?.includes("your-apply-script")) {
  console.error("apply-command=\"npm run your-apply-script\" is a placeholder. Use auto-apply or apply-command=\"npm run eval -- meal-core apply-plan\".");
  process.exit(1);
}

if (!existsSync(baselinePath)) {
  console.log(`No baseline found at ${baselinePath}; capturing current ${definition.evalName} state as baseline first.`);
  runEval([
    baselinePath,
    "no-exit-code",
    ...(judgeEnabled && definition.runnerSupportsJudge ? ["judge"] : []),
  ]);
}

const iterations: ImproveLoopIteration[] = [];
let stopReason: ImproveLoopStopReason = "max-iterations";

for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
  const candidatePath = join(workDir, `iteration-${iteration}-candidate.json`);
  const hillClimbPath = join(workDir, `iteration-${iteration}-hill-climb.json`);
  const improvePlanPath = join(workDir, `iteration-${iteration}-improvement-plan.json`);

  console.log(`${definition.printLabel} improve loop iteration ${iteration}/${maxIterations}`);
  runEval([
    "loop",
    `baseline=${baselinePath}`,
    `candidate=${candidatePath}`,
    `output=${hillClimbPath}`,
    `passes=${passes}`,
    "no-exit-code",
    ...(judgeEnabled ? ["judge"] : []),
  ]);

  const hillClimb = await readJsonReport<HillClimbReport>(hillClimbPath);
  const shouldPromote = shouldPromoteCandidate(hillClimb, promoteProgress);
  if (shouldPromote) {
    copyFileSync(candidatePath, baselinePath);
  }

  const iterationReport: ImproveLoopIteration = {
    iteration,
    candidatePath,
    hillClimbPath,
    improvePlanPath,
    recommendation: hillClimb.recommendation,
    fixedHardFailures: hillClimb.deterministic.fixedHardFailures,
    newHardFailures: hillClimb.deterministic.newHardFailures,
    baselineHardFailures: hillClimb.deterministic.baselineHardFailures,
    candidateHardFailures: hillClimb.deterministic.candidateHardFailures,
    promotedToBaseline: shouldPromote,
    improvementPlanWritten: false,
    applyCommandRun: false,
  };
  iterations.push(iterationReport);

  if (hillClimb.recommendation === "accept") {
    stopReason = "accepted";
    break;
  }

  runEval([
    "improve",
    candidatePath,
    `output=${improvePlanPath}`,
    ...(dryRunImprove ? ["dry-run"] : []),
  ]);
  iterationReport.improvementPlanWritten = true;

  if (!applyCommand) {
    stopReason = "waiting-for-apply";
    break;
  }

  const applyResult = runApplyCommand(applyCommand, {
    COPILOT_EVAL_ITERATION: String(iteration),
    COPILOT_EVAL_IMPROVEMENT_PLAN: improvePlanPath,
    ...(dryRunImprove ? { COPILOT_EVAL_APPLY_DRY_RUN: "1" } : {}),
    ...(useBuiltInAutoApply ? {} : {
      COPILOT_EVAL_CANDIDATE_REPORT: candidatePath,
      COPILOT_EVAL_HILL_CLIMB_REPORT: hillClimbPath,
    }),
  });
  iterationReport.applyCommandRun = true;
  iterationReport.applyExitCode = applyResult.status ?? undefined;

  if (applyResult.status !== 0) {
    stopReason = "apply-failed";
    break;
  }
}

const report: ImproveLoopReport = {
  generatedAt: new Date().toISOString(),
  evalName: definition.evalName,
  stopReason,
  baselinePath,
  maxIterations,
  judgeEnabled,
  applyCommandConfigured: Boolean(applyCommand),
  iterations,
};

await writeJsonReport(outputPath, report);
printReport(report, outputPath);

if (stopReason === "apply-failed") {
  process.exitCode = 1;
}

function shouldPromoteCandidate(report: HillClimbReport, promoteProgressEnabled: boolean) {
  if (report.recommendation === "accept") return true;
  if (!promoteProgressEnabled || report.recommendation !== "keep-climbing") return false;
  return report.deterministic.fixedHardFailures > 0
    && report.deterministic.newHardFailures === 0
    && report.deterministic.candidateHardFailures <= report.deterministic.baselineHardFailures;
}

function runEval(scriptArgs: string[]) {
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

function runApplyCommand(command: string, extraEnv: NodeJS.ProcessEnv) {
  console.log(`Running apply command for next improvement iteration: ${command}`);
  return spawnSync(command, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true,
    env: scrubbedApplyCommandEnv(extraEnv),
  });
}

function scrubbedApplyCommandEnv(extraEnv: NodeJS.ProcessEnv) {
  const allowedPrefixes = ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA"];
  const allowed = new Set([
    ...allowedPrefixes,
    "CI",
  ]);
  const env: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && allowed.has(key.toUpperCase())) {
      env[key] = value;
    }
  }

  return { ...env, ...extraEnv };
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function printReport(report: ImproveLoopReport, path: string) {
  console.log(`${report.evalName} improve loop: ${report.stopReason}`);
  for (const iteration of report.iterations) {
    console.log(
      `- iteration ${iteration.iteration}: ${iteration.recommendation}, hard failures ${iteration.baselineHardFailures} -> ${iteration.candidateHardFailures}, fixed ${iteration.fixedHardFailures}, new ${iteration.newHardFailures}`,
    );
    if (iteration.promotedToBaseline) {
      console.log(`  - promoted candidate report to baseline: ${report.baselinePath}`);
    }
    if (iteration.improvementPlanWritten && !iteration.applyCommandRun) {
      console.log(`  - improvement plan: ${iteration.improvePlanPath}`);
    }
  }
  if (report.stopReason === "waiting-for-apply") {
    console.log("- No apply command configured; apply the improvement plan, then rerun the loop.");
  }
  console.log(`Report: ${path}`);
}
