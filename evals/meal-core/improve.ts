import { join } from "node:path";
import { runImproveLoopCli, type ImproveLoopAdapter } from "../infra/improve.js";
import type { EvalCheckResult, MealCoreEvalReport, ScenarioEvalResult, ScenarioPlanOutput } from "./types.js";

const mealCoreImproveAdapter: ImproveLoopAdapter<MealCoreEvalReport> = {
  evalName: "meal-core",
  productName: "Meal Plan Calculator",
  defaultReportPath: join("eval-results", "meal-core-report.json"),
  defaultOutputPath: join("eval-results", "meal-core-improvement-plan.json"),
  productContext: [
    "The product generates practical Indian meal plans around calories, protein, dietary level, avoid flags, and meal structure.",
    "Vegetarian means Indian vegetarian: plant and dairy foods are allowed; eggs, meat, and fish are excluded.",
    "Generated plans should feel realistic to a user, not just numerically optimized.",
    "The product has deterministic tests/evals that remain the final authority; Copilot only proposes a fix plan.",
  ],
  suggestedFixScope: [
    "Prefer adapter-level or product-behavior fixes before changing strict eval criteria.",
    "Avoid broad search-depth increases unless performance impact is measured.",
    "Do not weaken serving realism, diet semantics, impossible-plan rejection, or target correctness.",
    "Try one small change, re-run unit tests, capture a candidate report, then hill-climb compare.",
  ],
  sanitizeReportForImprovement,
};

await runImproveLoopCli(mealCoreImproveAdapter);

function sanitizeReportForImprovement(report: MealCoreEvalReport) {
  return {
    status: report.status,
    scenarioCount: report.results.length,
    failingScenarioCount: report.results.filter((result) => result.status === "fail").length,
    passingScenarioCount: report.results.filter((result) => result.status === "pass").length,
    failingScenarios: report.results
      .filter((result) => result.status === "fail")
      .map(sanitizeScenarioResult),
    passingScenarioLabels: report.results
      .filter((result) => result.status === "pass")
      .map((result) => result.label),
  };
}

function sanitizeScenarioResult(result: ScenarioEvalResult) {
  const failingChecks = result.checks.filter((check) => check.status === "fail");

  return {
    label: result.label,
    status: result.status,
    approximateDeterministicScore: Math.round(result.deterministicScore * 100),
    failureSummaries: summarizeFailureMessages(failingChecks),
    symptomExamples: summarizeOutputs(result.outputs),
    varietySummary: result.variety ? {
      seedCount: result.variety.seedCount,
      uniqueDaySignatures: result.variety.uniqueDaySignatures,
      uniqueProteinOptionCount: result.variety.uniqueProteinOptions.length,
      uniqueGrainOptionCount: result.variety.uniqueGrainOptions.length,
      mostRepeatedFoodShare: Number(result.variety.mostRepeatedFoodShare.toFixed(2)),
    } : undefined,
  };
}

function summarizeFailureMessages(checks: EvalCheckResult[]) {
  const byMessage = new Map<string, number>();
  for (const check of checks) {
    byMessage.set(check.message, (byMessage.get(check.message) ?? 0) + 1);
  }

  return [...byMessage.entries()].map(([message, count]) => ({ message, count }));
}

function summarizeOutputs(outputs: ScenarioPlanOutput[]) {
  return outputs.slice(0, 4).map((output) => ({
    seed: output.seed,
    hasPlan: Boolean(output.plan),
    blockers: output.blockers,
    evaluationStatus: output.evaluation?.status,
    failedTargetMetrics: output.evaluation?.targetBounds
      .filter((bound) => bound.status === "fail")
      .map((bound) => bound.bound.metric),
    mealShapes: output.plan?.meals.map((meal) => ({
      mealId: meal.id,
      itemCount: meal.items.length,
      roles: [...new Set(meal.items.flatMap((item) => item.roles ?? []))],
      itemKinds: meal.items.map((item) => item.kind),
    })),
  }));
}
