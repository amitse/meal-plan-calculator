import { join } from "node:path";
import { firstPositionalArg, hasToken, argValue } from "../infra/cli.js";
import { isJudgeEnabled } from "../infra/copilot.js";
import { writeJsonReport } from "../infra/report-io.js";
import { evaluateDeterministicScenario, scenarioScore, summarizeVariety } from "./deterministic.js";
import { runCopilotJudge } from "./judge.js";
import { mealCoreScenarios, runScenario } from "./scenarios.js";
import type { MealCoreEvalReport, ScenarioEvalResult } from "./types.js";

const threshold = 9;
const args = process.argv.slice(2);
const judgeEnabled = isJudgeEnabled(args);
const outputPath = argValue(args, "--output") ?? process.env.COPILOT_EVAL_OUTPUT ?? firstPositionalArg(args, { flagsWithValues: ["--output"], ignoredAssignments: ["output"], ignoredBareTokens: ["no-exit-code"] }) ?? join("eval-results", "meal-core-report.json");
const noExitCode = hasToken(args, "--no-exit-code") || process.env.COPILOT_EVAL_NO_EXIT_CODE === "1";

const results: ScenarioEvalResult[] = [];

for (const scenario of mealCoreScenarios) {
  const outputs = runScenario(scenario);
  const checks = evaluateDeterministicScenario(scenario, outputs);
  const plans = outputs.flatMap((output) => output.plan ? [output.plan] : []);
  const variety = scenario.kind === "generation" ? summarizeVariety(plans) : undefined;
  const deterministicScore = scenarioScore(checks);
  const deterministicStatus = checks.some((check) => check.status === "fail") ? "fail" : "pass";
  const judge = judgeEnabled ? await runCopilotJudge({ scenario, outputs, checks, variety }) : {
    status: "skip" as const,
    score: undefined,
    summary: "LLM judge skipped. Re-run with --judge or COPILOT_EVAL_ENABLE_LLM=1.",
  };

  results.push({
    scenarioId: scenario.id,
    label: scenario.label,
    status: deterministicStatus === "pass" && (judge.status === "pass" || judge.status === "skip") ? "pass" : "fail",
    deterministicScore,
    checks,
    outputs,
    variety,
    judge,
  });
}

const report: MealCoreEvalReport = {
  generatedAt: new Date().toISOString(),
  threshold,
  judgeEnabled,
  status: results.every((result) => result.status === "pass") ? "pass" : "fail",
  results,
};

await writeJsonReport(outputPath, report);
printReport(report, outputPath);

if (report.status === "fail" && !noExitCode) {
  process.exitCode = 1;
}

function printReport(report: MealCoreEvalReport, path: string) {
  console.log(`Meal-core eval: ${report.status.toUpperCase()} (${report.results.length} scenarios, judge ${report.judgeEnabled ? "enabled" : "skipped"})`);
  for (const result of report.results) {
    const failed = result.checks.filter((check) => check.status === "fail");
    const judgeSummary = result.judge?.status === "skip" ? "judge skipped" : `judge ${result.judge?.score ?? "unscored"}/10`;
    console.log(`- ${result.status.toUpperCase()} ${result.scenarioId}: ${(result.deterministicScore * 100).toFixed(0)}% deterministic, ${judgeSummary}`);
    for (const check of failed) {
      console.log(`  - ${check.id}: ${check.message}`);
    }
  }
  console.log(`Report: ${path}`);
}
